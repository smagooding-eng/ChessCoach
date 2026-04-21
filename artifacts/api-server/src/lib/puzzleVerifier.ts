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
      // Strict: every claimed tactical motif must appear in the detector
      // output. Categorical labels (blunder/mistake/opening/etc.) are not
      // motif claims and are ignored here.
      const tacticalClaimTokens = ["fork", "pin", "skewer", "discoveredattack", "sacrifice", "hangingpiece", "mate"];
      const norm = (s: string) => s.replace(/[^a-z0-9]/g, "");
      const claimedTactical = [...claimed].filter(t => tacticalClaimTokens.some(tc => norm(t).includes(tc)));
      for (const c of claimedTactical) {
        const cn = norm(c);
        const matched = [...detected].some(d => {
          const dn = norm(d);
          return dn === cn || dn.includes(cn) || cn.includes(dn);
        });
        if (!matched) {
          reasons.push(`claimed motif ${c} not detected in solution`);
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

      // Also evaluate the position AFTER the full solution so we can confirm
      // a real eval-delta (not just move agreement). We append it last; the
      // best-move check below only iterates `fens.length`.
      const replayForEnd = new Chess(fen);
      let endFen: string | null = null;
      for (const u of uciSolution) {
        const m = replayForEnd.move({
          from: u.slice(0, 2),
          to: u.slice(2, 4),
          promotion: u.length > 4 ? u[4] : undefined,
        });
        if (!m) { endFen = null; break; }
      }
      if (!replayForEnd.isGameOver() || replayForEnd.isCheckmate()) {
        endFen = replayForEnd.fen();
      }

      const fensToEval = endFen ? [...fens, endFen] : fens;
      const evals = await evaluateAllPositions(fensToEval, opts.engineDepth ?? DEFAULT_ENGINE_DEPTH);
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

      // Engine eval-delta reconciliation: confirm the solution actually
      // improves the position from the mover's perspective. Required so we
      // never persist a "puzzle" whose solution is, in fact, neutral or
      // losing per the engine.
      if (endFen) {
        const startCp = evals[0]?.cpWhite ?? null;
        const endCp = evals[evals.length - 1]?.cpWhite ?? null;
        const moverSign = parsed.turn() === "w" ? 1 : -1;
        // engineAnalysis encodes mate as |cp| ≈ 10000; treat that as a mate
        // signal regardless of sign on the absolute scale.
        const endIsMateForMover = endCp !== null && Math.abs(endCp) >= 9000 && Math.sign(endCp) === moverSign;
        const looksWinning =
          motif.mateIn !== null ||
          endIsMateForMover ||
          (startCp !== null && endCp !== null && (endCp - startCp) * moverSign >= 150);
        if (!looksWinning) {
          reasons.push(
            `engine eval-delta does not favor mover (start=${startCp}, end=${endCp})`,
          );
          engineMatched = false;
        }
      }
    } catch {
      // Engine failure when verification was requested is treated as a hard
      // fail — we will not save a puzzle we could not verify.
      reasons.push("engine verification failed");
      engineMatched = false;
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

/**
 * Engine check for a lesson drill: confirm the claimed expected move matches
 * Stockfish's top choice in the drill position. Used as an optional async
 * upgrade over `verifyLesson`'s synchronous legality check.
 */
export async function verifyLessonDrillEngine(
  drillFen: string,
  drillExpectedMove: string,
  depth = DEFAULT_ENGINE_DEPTH,
): Promise<LessonVerifyResult> {
  try {
    // Resolve SAN/UCI claim to a UCI string we can compare against engine output.
    const c = new Chess(drillFen);
    const m = drillExpectedMove.trim();
    let claimedUci: string | null = null;
    try {
      const applied = c.move(m);
      if (applied) claimedUci = `${applied.from}${applied.to}${applied.promotion ?? ""}`.toLowerCase();
    } catch {
      // fall through
    }
    if (!claimedUci && /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(m)) {
      claimedUci = m.toLowerCase();
    }
    if (!claimedUci) return { ok: false, reasons: ["unparseable expected move"] };

    const evals = await evaluateAllPositions([drillFen], depth);
    const top = (evals[0]?.bestMoveUci ?? "").toLowerCase();
    if (top && top === claimedUci) return { ok: true, reasons: [] };
    return { ok: false, reasons: [`engine prefers ${top || "(no move)"} over claimed ${claimedUci}`] };
  } catch {
    return { ok: false, reasons: ["engine verification failed"] };
  }
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
