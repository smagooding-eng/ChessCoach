import { Chess } from "chess.js";
import type { Lesson, LessonBeat, LessonChallenge } from "@workspace/db";

// ── Ported verbatim from artifacts/chess-coach/src/pages/CourseDetail.tsx ──
// These three functions only ever operated on plain strings (no DOM/React
// dependency), so they're safe to run here unchanged. Keeping the exact
// same heading-detection logic means the migration groups content into
// steps exactly the way the current UI already does, rather than
// re-deriving a new interpretation of the same lesson text.

function splitIntoSections(content: string): { heading: string | null; body: string }[] {
  const parts = content.split(/\n(?=#{1,3}\s)/);
  return parts.map((part) => {
    const headingMatch = part.match(/^#{1,3}\s*(.+?)\s*\n([\s\S]*)$/);
    if (headingMatch) {
      return { heading: headingMatch[1].trim(), body: headingMatch[2].trim() };
    }
    return { heading: null, body: part.trim() };
  }).filter((s) => s.body.length > 0 || s.heading);
}

function splitIntoSteps(content: string): { heading: string | null; text: string }[] {
  const sections = splitIntoSections(content).filter((s) => !/^The Concept$/i.test(s.heading ?? ""));
  return sections.map((s) => ({ heading: s.heading, text: s.body }));
}

function extractConceptText(content: string): string | null {
  const section = splitIntoSections(content).find((s) => /^The Concept$/i.test(s.heading ?? ""));
  return section?.body || null;
}

// ── New: reconstructing the "correct move + what follows" sequence ────────
// Same underlying data the old buildFrontendFixPgn() reconstructed via
// regex surgery on a PGN string at render time -- this computes it once,
// directly, as a plain move list. If fixExamplePgn exists and actually
// continues past the fix move, its later moves are appended as the
// follow-up continuation; otherwise the array is just the one corrected
// move, which is still strictly more useful than nothing and never wrong.
function computeFollowUpSan(fen: string, expectedMove: string, fixExamplePgn: string | null): string[] {
  try {
    const chess = new Chess(fen);
    const first = chess.move(expectedMove);
    if (!first) return [];
    const followUp = [first.san];

    if (fixExamplePgn) {
      try {
        const fixChess = new Chess();
        fixChess.loadPgn(fixExamplePgn);
        const allMoves = fixChess.history();
        const idx = allMoves.findIndex((m) => m.replace(/[+#]$/, "") === first.san.replace(/[+#]$/, ""));
        if (idx >= 0) {
          followUp.push(...allMoves.slice(idx + 1, idx + 4)); // up to 3 more plies of continuation
        }
      } catch {
        // fixExamplePgn didn't parse cleanly (e.g. it's a partial/annotated
        // fragment, not a full replayable PGN) -- the single corrected
        // move above is still valid and gets kept.
      }
    }
    return followUp;
  } catch {
    return [];
  }
}

export interface LessonBeatsConversionResult {
  beats: LessonBeat[];
  warnings: string[];
}

// Only the fields the conversion actually reads -- deliberately narrower
// than the full Lesson row type, since this also gets called on
// newly-generated lessons at insert time (courses.ts, opponents.ts),
// before they have a real id/courseId/completed/etc. Requiring the full
// row shape there would force call sites to fabricate placeholder values
// for columns this function never looks at.
export interface LessonBeatsSourceData {
  id?: number;
  content: string | null;
  examplePgn?: string | null;
  fixExamplePgn?: string | null;
  drillFen?: string | null;
  drillExpectedMove?: string | null;
  drillHint?: string | null;
  extraChallenges?: LessonChallenge[] | null;
  conceptTitle?: string | null;
}

// Converts one existing lesson's free-text `content` (plus its separate
// examplePgn/drillFen/etc. columns) into the unified beats[] sequence. Does
// not mutate the lesson or touch the database -- pure function, safe to
// run against the same lesson repeatedly while reviewing output.
export function convertLessonToBeats(lesson: LessonBeatsSourceData): LessonBeatsConversionResult {
  const warnings: string[] = [];
  const beats: LessonBeat[] = [];
  const content = lesson.content ?? "";

  const conceptText = extractConceptText(content);
  if (conceptText) {
    beats.push({ kind: "concept", title: lesson.conceptTitle ?? "The Idea", text: conceptText });
  } else if (lesson.conceptTitle) {
    warnings.push(`Lesson ${lesson.id ?? "(new)"}: has a conceptTitle but no "## The Concept" section was found in content.`);
  }

  const steps = splitIntoSteps(content);
  const fixStepIdx = steps.findIndex((s) => /fix/i.test(s.heading ?? ""));

  steps.forEach((s, idx) => {
    const heading = s.heading ? `## ${s.heading}\n` : "";
    const text = `${heading}${s.text}`.trim();
    if (!text) return;

    const isFixStep = idx === fixStepIdx || (fixStepIdx === -1 && idx === steps.length - 1 && !!lesson.drillExpectedMove);

    if (isFixStep && lesson.drillFen && lesson.drillExpectedMove) {
      beats.push({
        kind: "drill",
        text,
        fen: lesson.drillFen,
        expectedMove: lesson.drillExpectedMove,
        hint: lesson.drillHint ?? undefined,
        followUpSan: computeFollowUpSan(lesson.drillFen, lesson.drillExpectedMove, lesson.fixExamplePgn ?? null),
      });
    } else {
      beats.push({
        kind: "example",
        text,
        pgn: lesson.examplePgn ?? "",
        replayable: false,
      });
    }
  });

  // If no step matched a drill but drill data exists on the lesson row,
  // don't silently drop it -- append it as a final beat rather than
  // losing a real drill because the heading didn't say "fix".
  const hasDrillBeat = beats.some((b) => b.kind === "drill");
  if (!hasDrillBeat && lesson.drillFen && lesson.drillExpectedMove) {
    warnings.push(`Lesson ${lesson.id ?? "(new)"}: drill data existed but no step matched a "fix" heading -- appended as a final beat instead of dropping it.`);
    beats.push({
      kind: "drill",
      text: lesson.drillHint ? `**Your move.** ${lesson.drillHint}` : "**Your move.**",
      fen: lesson.drillFen,
      expectedMove: lesson.drillExpectedMove,
      hint: lesson.drillHint ?? undefined,
      followUpSan: computeFollowUpSan(lesson.drillFen, lesson.drillExpectedMove, lesson.fixExamplePgn ?? null),
    });
  }

  // Each extra challenge becomes its own drill beat, in order, after the
  // primary drill -- matching today's "Challenge 1/N, 2/N..." sequence.
  const extraChallenges = (lesson.extraChallenges ?? []) as LessonChallenge[];
  extraChallenges.forEach((c, i) => {
    beats.push({
      kind: "drill",
      text: c.hint ? `**Challenge ${i + 2}.** ${c.hint}` : `**Challenge ${i + 2}.**`,
      fen: c.fen,
      expectedMove: c.expectedMove,
      hint: c.hint ?? undefined,
      followUpSan: computeFollowUpSan(c.fen, c.expectedMove, c.contextPgn ?? null),
    });
  });

  if (beats.length === 0) {
    warnings.push(`Lesson ${lesson.id ?? "(new)"}: produced zero beats -- content may be empty or in an unexpected format. Needs manual review.`);
  }

  return { beats, warnings };
}
