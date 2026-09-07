// One-time migration: converts every existing lesson's free-text
// `content` (plus its examplePgn/drillFen/etc. columns) into the new
// unified `beats` column from the courses redesign. See
// src/lib/lessonContentParser.ts for the actual conversion logic and
// courses-redesign-spec.md for the design rationale.
//
// SAFE BY DEFAULT: running this with no flags does a dry run only --
// it reads lessons, converts them, prints a summary, and writes a
// preview file, but never touches the database. Nothing is written
// until you explicitly pass --commit, and even then it only fills in
// the new `beats` column (nullable, additive) -- it never modifies or
// deletes `content` or any other existing column, so the current UI
// keeps working unchanged throughout.
//
// Usage:
//   DATABASE_URL="..." npx tsx scripts/migrate-lesson-beats.ts                 # dry run (default)
//   DATABASE_URL="..." npx tsx scripts/migrate-lesson-beats.ts --sample=10     # dry run, preview N lessons (default 5)
//   DATABASE_URL="..." npx tsx scripts/migrate-lesson-beats.ts --commit        # actually write beats[] for every lesson
//
// Idempotent: --commit skips any lesson that already has `beats` set, so
// it's safe to interrupt and re-run, or run again later after new
// lessons are generated in the old format.

import { db, lessonsTable } from "@workspace/db";
import { isNull, eq } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import { convertLessonToBeats } from "../src/lib/lessonContentParser";

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const sampleArg = args.find((a) => a.startsWith("--sample="));
  const sampleSize = sampleArg ? parseInt(sampleArg.split("=")[1], 10) : 5;

  const lessons = await db.select().from(lessonsTable).where(eq(lessonsTable.archived, false));
  console.log(`Found ${lessons.length} non-archived lessons.`);

  let converted = 0;
  let alreadyDone = 0;
  let zeroWarnings = 0;
  const allWarnings: string[] = [];
  const preview: unknown[] = [];

  for (const lesson of lessons) {
    if (lesson.beats && lesson.beats.length > 0) {
      alreadyDone++;
      continue;
    }

    const { beats, warnings } = convertLessonToBeats(lesson);
    allWarnings.push(...warnings);
    if (warnings.length === 0) zeroWarnings++;

    if (preview.length < sampleSize) {
      preview.push({
        lessonId: lesson.id,
        title: lesson.title,
        beatCount: beats.length,
        beats,
        warnings,
      });
    }

    if (commit) {
      await db.update(lessonsTable).set({ beats }).where(eq(lessonsTable.id, lesson.id));
    }
    converted++;
  }

  console.log(`\n${commit ? "Committed" : "Would commit"}: ${converted} lessons`);
  console.log(`Already had beats set (skipped): ${alreadyDone}`);
  console.log(`Converted cleanly, no warnings: ${zeroWarnings} / ${converted}`);
  console.log(`Total warnings: ${allWarnings.length}`);

  const previewPath = "./migration-preview.json";
  writeFileSync(previewPath, JSON.stringify({ preview, allWarnings }, null, 2));
  console.log(`\nWrote ${preview.length}-lesson sample + full warning list to ${previewPath}`);

  if (!commit) {
    console.log("\nThis was a DRY RUN -- nothing was written to the database.");
    console.log("Review migration-preview.json, then re-run with --commit when satisfied.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
