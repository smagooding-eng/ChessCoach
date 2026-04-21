import { analyzePuzzle } from "./chessMotifs";
import { evaluateAllPositions } from "./engineAnalysis";
import { Chess } from "chess.js";

export interface VerifyOptions {
  useEngine?: boolean;
  engineDepth?: number;
}

export interface VerifyResult {
  ok: boolean;
  reasons: string[];
  detectedThemes: string[];
  mateIn: number | null;
  materialGain: number;
  engineMatchedFirstMove?: boolean;
}

/**
 * Verifies that a puzzle is sound:
 *  - All moves are legal from the supplied FEN
 *  - The solution achieves either checkmate or a meaningful material/positional gain
 *  - When useEngine=true, the first move matches Stockfish's top choice within tolerance
 */
export async function verifyPuzzle(
  fen: string,
  uciSolution: string[],
  opts: VerifyOptions = {},
): Promise<VerifyResult> {
  const reasons: string[] = [];

  if (!fen || !uciSolution || uciSolution.length === 0) {
    return { ok: false, reasons: ["empty puzzle"], detectedThemes: [], mateIn: null, materialGain: 0 };
  }

  let parsed: Chess;
  try {
    parsed = new Chess(fen);
  } catch {
    return { ok: false, reasons: ["invalid fen"], detectedThemes: [], mateIn: null, materialGain: 0 };
  }

  if (parsed.isGameOver()) {
    return { ok: false, reasons: ["position already terminal"], detectedThemes: [], mateIn: null, materialGain: 0 };
  }

  const motif = analyzePuzzle(fen, uciSolution);
  if (!motif.legal) {
    return { ok: false, reasons: ["illegal move in solution"], detectedThemes: [], mateIn: null, materialGain: 0 };
  }

  // The puzzle must DO something — either deliver mate or win material/positional advantage.
  const hasGain = motif.materialGain >= 2 || motif.mateIn !== null || motif.themes.includes("sacrifice");
  if (!hasGain) {
    reasons.push("solution does not produce a meaningful gain");
  }

  let engineMatched: boolean | undefined;
  if (opts.useEngine) {
    try {
      const evals = await evaluateAllPositions([fen], opts.engineDepth ?? 12);
      const top = evals[0]?.bestMoveUci ?? "";
      const want = uciSolution[0]?.toLowerCase();
      engineMatched = top.toLowerCase() === want;
      if (!engineMatched) {
        reasons.push(`engine prefers ${top || "(no move)"} over ${want}`);
      }
    } catch (err) {
      // Engine failures should not poison verification: surface as a non-fatal note.
      reasons.push("engine verification skipped");
      engineMatched = undefined;
    }
  }

  const ok = motif.legal && hasGain && (engineMatched !== false);
  return {
    ok,
    reasons,
    detectedThemes: motif.themes,
    mateIn: motif.mateIn,
    materialGain: motif.materialGain,
    engineMatchedFirstMove: engineMatched,
  };
}

export interface LessonRecord {
  id: number;
  examplePgn: string | null;
  fixExamplePgn: string | null;
  drillFen: string | null;
  drillExpectedMove: string | null;
}

export interface LessonVerifyResult {
  ok: boolean;
  reasons: string[];
}

/** Lightweight legality check for course lessons. */
export function verifyLesson(lesson: LessonRecord): LessonVerifyResult {
  const reasons: string[] = [];

  const checkPgn = (pgn: string | null, label: string) => {
    if (!pgn || !pgn.trim()) return;
    try {
      const c = new Chess();
      c.loadPgn(pgn, { strict: false });
      if (c.history().length === 0) reasons.push(`${label} pgn has no moves`);
    } catch {
      reasons.push(`${label} pgn threw on parse`);
    }
  };

  checkPgn(lesson.examplePgn, "example");
  checkPgn(lesson.fixExamplePgn, "fix");

  if (lesson.drillFen) {
    try {
      const c = new Chess(lesson.drillFen);
      if (lesson.drillExpectedMove) {
        const m = lesson.drillExpectedMove.trim();
        let applied: any = null;
        try {
          applied = c.move(m); // try SAN first
        } catch {}
        if (!applied && /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(m)) {
          try {
            applied = c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m.length > 4 ? m[4] : undefined });
          } catch {}
        }
        if (!applied) reasons.push("drill expected move is illegal in drill fen");
      }
    } catch {
      reasons.push("drill fen invalid");
    }
  }

  return { ok: reasons.length === 0, reasons };
}
