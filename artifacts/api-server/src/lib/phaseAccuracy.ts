import { accuracyFromAvgLoss } from "./engineAnalysis";

type PhaseKey = "opening" | "middlegame" | "endgame";

const WIN_PCT_MAP: Record<string, number> = {
  checkmate: 0, brilliant: 0, great: 0, best: 0, excellent: 0.5, book: 0.7, good: 2,
  inaccuracy: 8, mistake: 16, blunder: 33, missed_win: 25,
};

export interface PhaseAccuracy {
  opening: { accuracy: number; moves: number; blunders: number; mistakes: number; inaccuracies: number; bestOrBetter: number };
  middlegame: { accuracy: number; moves: number; blunders: number; mistakes: number; inaccuracies: number; bestOrBetter: number };
  endgame: { accuracy: number; moves: number; blunders: number; mistakes: number; inaccuracies: number; bestOrBetter: number };
  gamesAnalyzed: number;
}

// Phases are bucketed by full-move number (moveIndex/2 + 1): opening = 1-15,
// middlegame = 16-32, endgame = 33+. Pulled out of /analysis/summary so the
// landing page's sample report can show the exact same real computation
// instead of a second, drifting copy of it.
export function computePhaseAccuracy(
  games: { whiteUsername: string; reviewData: unknown; playedAt: Date | string | null }[],
  username: string,
): PhaseAccuracy {
  const phaseBuckets: Record<PhaseKey, {
    moves: number; winPctLossSum: number;
    blunders: number; mistakes: number; inaccuracies: number; bestOrBetter: number;
  }> = {
    opening:    { moves: 0, winPctLossSum: 0, blunders: 0, mistakes: 0, inaccuracies: 0, bestOrBetter: 0 },
    middlegame: { moves: 0, winPctLossSum: 0, blunders: 0, mistakes: 0, inaccuracies: 0, bestOrBetter: 0 },
    endgame:    { moves: 0, winPctLossSum: 0, blunders: 0, mistakes: 0, inaccuracies: 0, bestOrBetter: 0 },
  };
  let gamesAnalyzed = 0;

  for (const g of games) {
    if (!g.reviewData || typeof g.reviewData !== "object") continue;
    const rd = g.reviewData as { moves?: unknown };
    const movesArr = Array.isArray(rd.moves) ? rd.moves : Array.isArray(g.reviewData) ? (g.reviewData as unknown[]) : null;
    if (!movesArr || movesArr.length === 0) continue;

    const userColor: "white" | "black" = g.whiteUsername.toLowerCase() === username.toLowerCase() ? "white" : "black";
    let contributedThisGame = false;

    for (const raw of movesArr) {
      if (!raw || typeof raw !== "object") continue;
      const m = raw as { moveIndex?: number; color?: string; classification?: string; cpLoss?: number | null; engineAvailable?: boolean };
      if (m.color !== userColor) continue;
      if (typeof m.classification !== "string") continue;

      const moveNumber = Math.floor((m.moveIndex ?? 0) / 2) + 1;
      const phase: PhaseKey = moveNumber <= 15 ? "opening" : moveNumber <= 32 ? "middlegame" : "endgame";
      const bucket = phaseBuckets[phase];
      bucket.moves++;
      contributedThisGame = true;

      const cls = m.classification;
      if (cls === "blunder") bucket.blunders++;
      else if (cls === "mistake" || cls === "missed_win") bucket.mistakes++;
      else if (cls === "inaccuracy") bucket.inaccuracies++;
      else if (["best", "great", "brilliant", "excellent"].includes(cls)) bucket.bestOrBetter++;

      const base = WIN_PCT_MAP[cls] ?? 2;
      const useEngine = m.cpLoss != null && m.engineAvailable === true;
      const sample = useEngine
        ? (m.cpLoss as number)
        : Math.max(base, ["good", "book", "excellent", "best", "great"].includes(cls) && !m.engineAvailable ? 3 : base);
      bucket.winPctLossSum += sample;
    }
    if (contributedThisGame) gamesAnalyzed++;
  }

  const phaseStat = (b: typeof phaseBuckets["opening"]) => ({
    accuracy: b.moves > 0 ? Math.round(accuracyFromAvgLoss(b.winPctLossSum / b.moves)) : 0,
    moves: b.moves,
    blunders: b.blunders,
    mistakes: b.mistakes,
    inaccuracies: b.inaccuracies,
    bestOrBetter: b.bestOrBetter,
  });

  return {
    opening: phaseStat(phaseBuckets.opening),
    middlegame: phaseStat(phaseBuckets.middlegame),
    endgame: phaseStat(phaseBuckets.endgame),
    gamesAnalyzed,
  };
}
