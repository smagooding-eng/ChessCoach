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
  /** When true (default with useEngine), verify every mover-to-move puzzle move
   * matches the engine top choice — not just the first move. */
  verifyFullLine?: boolean;
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

  // A puzzle must demonstrably win — mate, material, or a sacrifice that
  // recovers material/positional value. Bare "sacrifice" with negative
  // material is a classic false positive and is explicitly disallowed.
  const isSacrifice = motif.themes.includes("sacrifice");
  const hasGain =
    motif.mateIn !== null ||
    motif.materialGain >= 2 ||
    (isSacrifice && motif.materialGain >= 0);
  if (!hasGain) {
    reasons.push(
      isSacrifice
        ? "sacrifice does not recover material"
        : "solution does not produce a meaningful gain",
    );
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
    const verifyFullLine = opts.verifyFullLine ?? true;
    try {
      // Build the list of FENs to evaluate: starting position plus every
      // position where it is the mover's turn (so engine top == solution
      // move). Limit to first 6 mover plies to keep cost bounded.
      const fens: string[] = [fen];
      const expectedMoves: string[] = [uciSolution[0].toLowerCase()];
      if (verifyFullLine && uciSolution.length > 1) {
        const replay = new Chess(fen);
        const startSide = replay.turn();
        for (let i = 0; i < uciSolution.length && expectedMoves.length < 6; i++) {
          const u = uciSolution[i];
          const m = replay.move({
            from: u.slice(0, 2),
            to: u.slice(2, 4),
            promotion: u.length > 4 ? u[4] : undefined,
          });
          if (!m) break;
          if (replay.turn() === startSide && i + 1 < uciSolution.length) {
            fens.push(replay.fen());
            expectedMoves.push(uciSolution[i + 1].toLowerCase());
          }
        }
      }

      const evals = await evaluateAllPositions(fens, opts.engineDepth ?? DEFAULT_ENGINE_DEPTH);
      let allMatched = true;
      for (let i = 0; i < fens.length; i++) {
        const top = (evals[i]?.bestMoveUci ?? "").toLowerCase();
        const want = expectedMoves[i];
        if (top !== want) {
          allMatched = false;
          reasons.push(`engine prefers ${top || "(no move)"} over ${want} at ply ${i}`);
        }
      }
      engineMatched = allMatched;
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
