import { db, lessonsTable } from "@workspace/db";
import { eq, isNotNull, and, or, isNull } from "drizzle-orm";

async function main() {
  const all = await db.select({ id: lessonsTable.id }).from(lessonsTable).where(eq(lessonsTable.archived, false));
  const withDrill = await db.select({ id: lessonsTable.id }).from(lessonsTable)
    .where(and(eq(lessonsTable.archived, false), isNotNull(lessonsTable.drillFen), isNotNull(lessonsTable.drillExpectedMove)));
  const missingExample = await db.select({ id: lessonsTable.id }).from(lessonsTable)
    .where(and(eq(lessonsTable.archived, false), or(isNull(lessonsTable.examplePgn), eq(lessonsTable.examplePgn, ""))));

  console.log(`Total lessons: ${all.length}`);
  console.log(`Has real drill (fen + expected move): ${withDrill.length}`);
  console.log(`Missing example pgn: ${missingExample.length}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
