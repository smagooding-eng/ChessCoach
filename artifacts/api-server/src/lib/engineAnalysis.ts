import { Chess } from "chess.js";
import { logger } from "./logger";
import { evalPosition } from "./stockfishLocal";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ─── Lichess Cloud Eval ───────────────────────────────────────────────────────

interface LichessPv {
  moves: string;   // space-separated UCI moves
  cp?: number;     // centipawns from WHITE's perspective (positive = white winning)
  mate?: number;   // moves to mate (positive = white wins)
}

interface LichessCloudEval {
  fen: string;
  knodes: number;
  depth: number;
  pvs: LichessPv[];
}

/** Fetch Stockfish evaluation from Lichess Cloud Eval API,
 *  falling back to the local Stockfish 18 WASM engine for positions not in the cache. */
export async function fetchLichessEval(fen: string, multiPv = 2): Promise<LichessCloudEval | null> {
  try {
    const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "ChessCoach/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 404) {
      return localStockfishFallback(fen, multiPv);
    }
    if (!res.ok) {
      logger.warn({ status: res.status, fen }, "Lichess cloud eval non-OK");
      return localStockfishFallback(fen, multiPv);
    }
    return (await res.json()) as LichessCloudEval;
  } catch (err) {
    logger.warn({ err }, "Lichess cloud eval fetch failed, using local Stockfish");
    return localStockfishFallback(fen, multiPv);
  }
}

async function localStockfishFallback(fen: string, multiPv: number): Promise<LichessCloudEval | null> {
  try {
    const result = await evalPosition(fen, 18, multiPv);
    if (!result) return null;

    const pvs: LichessPv[] = (result.multiPv || [{ cp: result.cp, mate: result.mate, moves: result.pv }])
      .map(pv => ({
        moves: pv.moves,
        ...(pv.mate !== null ? { mate: pv.mate } : { cp: pv.cp }),
      }));

    return {
      fen,
      knodes: 0,
      depth: result.depth,
      pvs,
    };
  } catch (err) {
    logger.warn({ err }, "Local Stockfish fallback also failed");
    return null;
  }
}

/** Convert a Lichess PV centipawn/mate value to a normalized number from WHITE's perspective.
 *  Mate in N for white → +10000 − N; mate in N for black → −10000 + N. */
export function pvToWhiteCp(pv: LichessPv): number {
  if (pv.mate !== undefined) {
    return pv.mate > 0 ? 10000 - pv.mate : -10000 - pv.mate;
  }
  return pv.cp ?? 0;
}

/** Convert a UCI move string (e.g. "e2e4" or "e7e8q") to SAN using a given FEN. */
export function uciToSan(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length === 5 ? uci[4] as "q" | "r" | "b" | "n" : undefined;
    const result = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
    return result?.san ?? null;
  } catch {
    return null;
  }
}

// ─── Classification thresholds ────────────────────────────────────────────────

export type EngineClassification =
  | "brilliant"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder";

/** Classify a move from centipawn loss (always ≥ 0, from the PLAYER'S perspective).
 *  Also needs to know if the move was the engine's top choice (for brilliant detection),
 *  and whether we're still in the opening (for book detection). */
export function classifyFromCpLoss(
  cpLoss: number,
  isTopEngineMove: boolean,
  isSecondEngineMove: boolean,
  isOpeningRange: boolean,
  wasBalanced: boolean, // |evalBefore| < 150
): EngineClassification {
  // Book: early game, balanced position, move matches engine's top or second choice
  if (isOpeningRange && wasBalanced && (isTopEngineMove || isSecondEngineMove) && cpLoss <= 15) {
    return "book";
  }

  if (cpLoss < 0) {
    // The move actually improved the engine evaluation
    // Brilliant: not the engine's first choice, yet the position improved significantly
    if (!isTopEngineMove && cpLoss < -20) return "brilliant";
    return "excellent";
  }

  if (cpLoss <= 10) return "excellent";
  if (cpLoss <= 25) return "good";
  if (cpLoss <= 50) return "inaccuracy";
  if (cpLoss <= 100) return "mistake";
  return "blunder";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface EngineEvalResult {
  classification: EngineClassification;
  cpLoss: number;              // centipawns lost by the player (clamped to 0 if position improved)
  cpLossRaw: number;           // unclamped (negative = improved)
  engineCpBefore: number | null;
  engineCpAfter: number | null;
  engineBestMoveSan: string | null;  // engine's top move BEFORE the position (for "better move" hints)
  isEngineTopChoice: boolean;
  depth: number;
  available: boolean;          // false if cloud eval had no data
}

export async function engineEvalMove(params: {
  fenBefore: string;
  fenAfter: string;
  playedFrom: string;          // e.g. "e2"
  playedTo: string;            // e.g. "e4"
  playerColor: "white" | "black";
  moveIndex: number;           // 0-based half-move index
}): Promise<EngineEvalResult> {
  const { fenBefore, fenAfter, playedFrom, playedTo, playerColor, moveIndex } = params;

  const isOpeningRange = moveIndex < 30; // first 15 full moves

  // Parallel fetch for both positions
  const [evalBefore, evalAfter] = await Promise.all([
    fetchLichessEval(fenBefore, 2),
    fetchLichessEval(fenAfter, 1),
  ]);

  if (!evalBefore || evalBefore.pvs.length === 0) {
    logger.debug({ fen: fenBefore }, "No engine eval available (cloud + local Stockfish both failed)");
    return {
      classification: isOpeningRange ? "book" : "good",
      cpLoss: 0,
      cpLossRaw: 0,
      engineCpBefore: null,
      engineCpAfter: null,
      engineBestMoveSan: null,
      isEngineTopChoice: false,
      depth: 0,
      available: false,
    };
  }

  const cpBefore = pvToWhiteCp(evalBefore.pvs[0]);

  if (!evalAfter || evalAfter.pvs.length === 0) {
    logger.debug({ fen: fenAfter }, "No engine eval for position after move (cloud + local both failed)");
    return {
      classification: isOpeningRange ? "book" : "good",
      cpLoss: 0,
      cpLossRaw: 0,
      engineCpBefore: cpBefore,
      engineCpAfter: null,
      engineBestMoveSan: null,
      isEngineTopChoice: false,
      depth: evalBefore.depth,
      available: false,
    };
  }

  const cpAfter = pvToWhiteCp(evalAfter.pvs[0]);

  // cpLossRaw: positive = player lost centipawns, negative = player gained
  const cpLossRaw =
    playerColor === "white" ? cpBefore - cpAfter : cpAfter - cpBefore;

  const cpLoss = Math.max(0, cpLossRaw);

  // Determine if played move matches engine top or second choice
  const playedUci = `${playedFrom}${playedTo}`;
  const topUci = evalBefore.pvs[0]?.moves?.split(" ")[0] ?? "";
  const secondUci = evalBefore.pvs[1]?.moves?.split(" ")[0] ?? "";
  const isTopEngineMove = topUci.startsWith(playedUci);
  const isSecondEngineMove = secondUci.startsWith(playedUci);

  // Engine best move SAN (top choice BEFORE the move, useful for showing "better was X")
  const engineBestMoveSan = topUci ? uciToSan(fenBefore, topUci) : null;

  const wasBalanced = Math.abs(cpBefore) < 150;

  const classification = classifyFromCpLoss(
    cpLossRaw,
    isTopEngineMove,
    isSecondEngineMove,
    isOpeningRange,
    wasBalanced,
  );

  return {
    classification,
    cpLoss,
    cpLossRaw,
    engineCpBefore: cpBefore,
    engineCpAfter: cpAfter,
    engineBestMoveSan: !isTopEngineMove && cpLoss > 25 ? engineBestMoveSan : null,
    isEngineTopChoice: isTopEngineMove,
    depth: evalBefore.depth,
    available: true,
  };
}
