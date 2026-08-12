import { Chess } from "chess.js";
import { evaluateAllPositions, winPct } from "./engineAnalysis";

export interface QuickWeakness {
  category: "Opening Preparation" | "Positional Play" | "Endgame Technique" | "Tactical Awareness";
  severity: "Critical" | "High" | "Medium" | "Low";
  description: string;
  frequency: number; // 0.0-1.0
}

interface FlatMove {
  san: string;
  phase: "opening" | "middlegame" | "endgame";
  winPctLoss: number;
  classification: "blunder" | "mistake" | "ok";
}

// Shallow depth and a hard cap on total positions — this trades some
// precision for speed, since this runs on a public landing page and needs
// to finish in a few seconds, not the minutes a full review takes.
const QUICK_DEPTH = 10;
const MAX_PLIES_PER_GAME = 40;
const OPENING_PLY_CUTOFF = 16; // ~8 full moves

function phaseForPly(ply: number, totalPlies: number): "opening" | "middlegame" | "endgame" {
  if (ply < OPENING_PLY_CUTOFF) return "opening";
  if (ply > totalPlies - 16) return "endgame";
  return "middlegame";
}

/**
 * Analyzes up to 5 games for one player at reduced depth, purely via the
 * engine (no GPT calls at all), and returns a small set of weakness
 * summaries. Designed for the public landing-page "quick scout" flow,
 * not for the authenticated app's full review pipeline.
 */
export async function quickAnalyzeGames(pgns: string[], username: string): Promise<QuickWeakness[]> {
  const usernameLower = username.toLowerCase();
  const allMoves: FlatMove[] = [];

  for (const pgn of pgns.slice(0, 5)) {
    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      const headers = chess.header();
      const isWhite = (headers.White ?? "").toLowerCase() === usernameLower;
      const playerColor: "w" | "b" = isWhite ? "w" : "b";

      const history = chess.history({ verbose: true }).slice(0, MAX_PLIES_PER_GAME);
      if (history.length < 4) continue;

      const replay = new Chess();
      const fens: string[] = [replay.fen()];
      for (const m of history) {
        replay.move(m.san);
        fens.push(replay.fen());
      }

      const evals = await evaluateAllPositions(fens, QUICK_DEPTH);

      for (let ply = 0; ply < history.length; ply++) {
        const m = history[ply];
        if (m.color !== playerColor) continue;
        const before = evals[ply];
        const after = evals[ply + 1];
        if (!before || !after) continue;

        const wpBefore = winPct(isWhite ? before.cpWhite : -before.cpWhite);
        const wpAfter = winPct(isWhite ? after.cpWhite : -after.cpWhite);
        const loss = Math.max(0, wpBefore - wpAfter);

        allMoves.push({
          san: m.san,
          phase: phaseForPly(ply, history.length),
          winPctLoss: loss,
          classification: loss > 20 ? "blunder" : loss > 10 ? "mistake" : "ok",
        });
      }
    } catch {
      continue; // skip any game that fails to parse — never let one bad game kill the whole teaser
    }
  }

  if (allMoves.length < 6) return [];

  const weaknesses: QuickWeakness[] = [];

  // Phase weakness
  const phases: Array<"opening" | "middlegame" | "endgame"> = ["opening", "middlegame", "endgame"];
  const phaseRate = (p: string) => {
    const inPhase = allMoves.filter((m) => m.phase === p);
    if (inPhase.length === 0) return 0;
    return inPhase.filter((m) => m.classification !== "ok").length / inPhase.length;
  };
  const rates = phases.map((p) => ({ p, rate: phaseRate(p) }));
  const worst = rates.reduce((a, b) => (b.rate > a.rate ? b : a));
  if (worst.rate > 0.15) {
    const label = worst.p === "opening" ? "Opening Preparation" : worst.p === "middlegame" ? "Positional Play" : "Endgame Technique";
    weaknesses.push({
      category: label,
      severity: worst.rate > 0.35 ? "Critical" : worst.rate > 0.22 ? "High" : "Medium",
      description: `${Math.round(worst.rate * 100)}% of ${worst.p} moves were below par across the games checked.`,
      frequency: worst.rate,
    });
  }

  // Tactical/blunder weakness
  const blunders = allMoves.filter((m) => m.classification === "blunder").length;
  const blunderRate = blunders / Math.max(1, pgns.length);
  if (blunders >= 2) {
    weaknesses.push({
      category: "Tactical Awareness",
      severity: blunderRate > 1.5 ? "Critical" : blunderRate > 0.8 ? "High" : "Medium",
      description: `${blunders} significant blunders found across the games checked — about ${blunderRate.toFixed(1)} per game.`,
      frequency: Math.min(1, blunderRate),
    });
  }

  return weaknesses.slice(0, 3);
}
