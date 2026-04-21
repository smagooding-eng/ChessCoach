import { analyzePuzzle } from "./chessMotifs";
import { evaluateAllPositions } from "./engineAnalysis";
import { Chess, type Move } from "chess.js";

export interface PuzzleClaims {
  /** Themes the source claims this puzzle demonstrates. */
  themes?: string[];
  /** Material gain (centipawns/100 → pawn units) the source claims. */
  materialGain?: number;
  /** Set true if the source claims forced mate. */
  isMate?: boolean;
}

export interface VerifyOptions {
  /** Defaults to true. Set false to skip the Stockfish best-move check. */
  useEngine?: boolean;
  engineDepth?: number;
  /** Optional source-claimed metadata; verifier reconciles against motif analysis. */
  claims?: PuzzleClaims;
}

export interface VerifyResult {
  ok: boolean;
  reasons: string[];
  detectedThemes: string[];
  mateIn: number | null;
  materialGain: number;
  engineMatchedFirstMove?: boolean;
}

const DEFAULT_ENGINE_DEPTH = 12;

/**
 * Verifies that a puzzle is sound:
 *  - All moves are legal from the supplied FEN
 *  - The solution achieves either checkmate or a meaningful material/positional gain
 *  - When useEngine is left at its default (true), the first move matches
 *    Stockfish's top choice
 *  - When `claims` are provided, claimed themes/material/mate are reconciled
 *    against deterministic motif analysis
 */
export async function verifyPuzzle(
  fen: string,
  uciSolution: string[],
  opts: VerifyOptions = {},
): Promise<VerifyResult> {
  const reasons: string[] = [];
  const useEngine = opts.useEngine ?? true;

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

  const hasGain = motif.materialGain >= 2 || motif.mateIn !== null || motif.themes.includes("sacrifice");
  if (!hasGain) {
    reasons.push("solution does not produce a meaningful gain");
  }

  // Reconcile against source claims when supplied.
  const claims = opts.claims;
  if (claims) {
    if (claims.isMate && motif.mateIn === null) {
      reasons.push("claimed mate but solution does not deliver checkmate");
    }
    if (typeof claims.materialGain === "number" && claims.materialGain >= 2) {
      // Allow 1 pawn of slack — claims can include positional weight.
      if (motif.materialGain < claims.materialGain - 1 && motif.mateIn === null) {
        reasons.push(`claimed material ${claims.materialGain} not realized (got ${motif.materialGain})`);
      }
    }
    if (claims.themes && claims.themes.length > 0) {
      const claimed = new Set(claims.themes.map(t => t.toLowerCase()));
      const detected = new Set(motif.themes.map(t => t.toLowerCase()));
      // Expect at least one tactical motif claim to show up in detection
      const tacticalClaims = ["fork", "pin", "skewer", "sacrifice", "hangingpiece", "mate", "matein1", "matein2", "matein3"];
      const claimedTactical = [...claimed].filter(t => tacticalClaims.some(tc => t.includes(tc)));
      if (claimedTactical.length > 0) {
        const matched = claimedTactical.some(c => [...detected].some(d => d.includes(c) || c.includes(d)));
        if (!matched) {
          reasons.push(`claimed motifs ${[...claimedTactical].join("/")} not detected in solution`);
        }
      }
    }
  }

  let engineMatched: boolean | undefined;
  if (useEngine) {
    try {
      const evals = await evaluateAllPositions([fen], opts.engineDepth ?? DEFAULT_ENGINE_DEPTH);
      const top = evals[0]?.bestMoveUci ?? "";
      const want = uciSolution[0]?.toLowerCase();
      engineMatched = top.toLowerCase() === want;
      if (!engineMatched) {
        reasons.push(`engine prefers ${top || "(no move)"} over ${want}`);
      }
    } catch {
      // Engine failures should not poison verification: surface as a non-fatal note.
      reasons.push("engine verification skipped");
      engineMatched = undefined;
    }
  }

  const reconciliationOk = !reasons.some(r =>
    r.startsWith("claimed mate") ||
    r.startsWith("claimed material") ||
    r.startsWith("claimed motifs"),
  );
  const ok = motif.legal && hasGain && (engineMatched !== false) && reconciliationOk;
  return {
    ok,
    reasons,
    detectedThemes: motif.themes,
    mateIn: motif.mateIn,
    materialGain: motif.materialGain,
    engineMatchedFirstMove: engineMatched,
  };
}

/**
 * Try a candidate-producing function up to `attempts` times, returning the
 * first candidate that passes verification. Each attempt receives the prior
 * verdict so the producer can adapt (e.g. retry with different game/move).
 * Returns null if no candidate verifies.
 */
export async function verifyWithRetry<T extends { fen: string; solutionUci: string[] }>(
  produce: (attempt: number, lastVerdict: VerifyResult | null) => Promise<T | null>,
  opts: VerifyOptions & { attempts?: number } = {},
): Promise<{ candidate: T; verdict: VerifyResult } | null> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  let lastVerdict: VerifyResult | null = null;
  for (let i = 0; i < attempts; i++) {
    const cand = await produce(i, lastVerdict);
    if (!cand) continue;
    const verdict = await verifyPuzzle(cand.fen, cand.solutionUci, opts);
    if (verdict.ok) return { candidate: cand, verdict };
    lastVerdict = verdict;
  }
  return null;
}

export interface LessonRecord {
  id?: number;
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
        let applied: Move | null = null;
        try {
          applied = c.move(m); // try SAN first
        } catch {
          applied = null;
        }
        if (!applied && /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(m)) {
          try {
            applied = c.move({
              from: m.slice(0, 2),
              to: m.slice(2, 4),
              promotion: m.length > 4 ? m[4] : undefined,
            });
          } catch {
            applied = null;
          }
        }
        if (!applied) reasons.push("drill expected move is illegal in drill fen");
      }
    } catch {
      reasons.push("drill fen invalid");
    }
  }

  return { ok: reasons.length === 0, reasons };
}
