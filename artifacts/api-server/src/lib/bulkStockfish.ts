import { StockfishProcess, winPct, type PositionEval } from "./engineAnalysis";
import { logger } from "./logger";

// A second, independent Stockfish process, entirely separate from the
// one live user requests share (see engineAnalysis.ts). This exists so
// a long-running bulk job can't make real users wait behind a queue of
// a million positions. It still shares the same physical CPU as
// everything else on the host, so it's paced deliberately slow (see
// evaluateGameEngineOnly) rather than run flat-out.
let bulkEngine: StockfishProcess | null = null;
let bulkEngineInit: Promise<void> | null = null;

async function getBulkEngine(): Promise<StockfishProcess> {
  if (bulkEngine) return bulkEngine;
  if (bulkEngineInit) { await bulkEngineInit; return bulkEngine!; }
  bulkEngine = new StockfishProcess(() => { bulkEngine = null; bulkEngineInit = null; });
  bulkEngineInit = bulkEngine.init();
  await bulkEngineInit;
  return bulkEngine!;
}

export function destroyBulkEngine(): void {
  bulkEngine?.destroy();
  bulkEngine = null;
  bulkEngineInit = null;
}

export interface BulkMoveReview {
  moveIndex: number;
  color: "white" | "black";
  san: string;
  classification: string;
  cpLoss: number;
  engineAvailable: true;
}

// A deliberately simpler classifier than the paid per-user review's
// (which also folds in book-move and legal-move-count context) --
// this bulk job's whole purpose is filling out the landing page's
// real-numbers counters, not generating a per-user coaching report, so
// a straightforward win%-loss threshold is the right amount of
// complexity for what it's used for.
function classify(winPctLoss: number): string {
  if (winPctLoss <= 1) return "best";
  if (winPctLoss <= 3) return "excellent";
  if (winPctLoss <= 6) return "good";
  if (winPctLoss <= 12) return "inaccuracy";
  if (winPctLoss <= 22) return "mistake";
  return "blunder";
}

// Reviews one game with the isolated engine only -- no OpenAI call
// anywhere in this path. depth is intentionally much lower than the
// paid review's (18) by default; at bulk-job scale, search depth is the
// single biggest lever on how long this realistically takes to grind
// through a large number of games, and this job doesn't need
// tournament-grade precision, just a real engine opinion per move.
// delayMs adds a small pause between each position so this process
// doesn't spend every CPU slice it can get -- "quiet in the background"
// per how this was asked for, not "as fast as possible".
export async function reviewGameEngineOnly(
  fens: string[],
  colors: ("white" | "black")[],
  sans: string[],
  depth = 10,
  delayMs = 250,
): Promise<{ moves: BulkMoveReview[] }> {
  const engine = await getBulkEngine();
  try {
    await engine.newGame();
  } catch (err) {
    logger.warn({ err }, "Bulk engine newGame failed, reinitializing");
    destroyBulkEngine();
  }

  const evals: PositionEval[] = [];
  for (let i = 0; i < fens.length; i++) {
    const e = await getBulkEngine();
    try {
      evals.push(await e.evaluate(fens[i], depth));
    } catch (err) {
      logger.warn({ err, idx: i }, "Bulk engine eval failed for position");
      evals.push({ cpWhite: 0, bestMoveUci: "", secondBestUci: "", bestMoveSan: null, bestLineSan: [], depth: 0 });
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  const moves: BulkMoveReview[] = [];
  for (let i = 0; i < sans.length; i++) {
    const before = evals[i];
    const after = evals[i + 1];
    if (!before || !after) continue;
    const color = colors[i];

    // cp values are always from White's perspective; flip for Black so
    // "loss" always means "got worse for the player who just moved".
    const cpBeforeForPlayer = color === "white" ? before.cpWhite : -before.cpWhite;
    const cpAfterForPlayer = color === "white" ? after.cpWhite : -after.cpWhite;
    const winPctBefore = winPct(cpBeforeForPlayer);
    const winPctAfter = winPct(cpAfterForPlayer);
    const loss = Math.max(0, winPctBefore - winPctAfter);

    moves.push({
      moveIndex: i,
      color,
      san: sans[i],
      classification: classify(loss),
      cpLoss: Math.round(loss * 100) / 100,
      engineAvailable: true,
    });
  }

  return { moves };
}
