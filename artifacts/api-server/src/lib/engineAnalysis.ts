import { Chess } from "chess.js";
import { logger } from "./logger";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ─── Lichess Cloud Eval ───────────────────────────────────────────────────────

interface LichessPv {
  moves: string;
  cp?: number;
  mate?: number;
}

interface LichessCloudEval {
  fen: string;
  knodes: number;
  depth: number;
  pvs: LichessPv[];
}

const LICHESS_MIN_DELAY_MS = 350;
let lastLichessCallTime = 0;

const evalCache = new Map<string, LichessCloudEval | null>();
const MAX_CACHE_SIZE = 500;

async function rateLimitedDelay(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastLichessCallTime;
  if (elapsed < LICHESS_MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, LICHESS_MIN_DELAY_MS - elapsed));
  }
  lastLichessCallTime = Date.now();
}

export async function fetchLichessEval(fen: string, multiPv = 2): Promise<LichessCloudEval | null> {
  const cacheKey = `${fen}:${multiPv}`;
  if (evalCache.has(cacheKey)) {
    return evalCache.get(cacheKey) ?? null;
  }
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await rateLimitedDelay();

    try {
      const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "ChessCoach/1.0" },
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 404) {
        cacheResult(cacheKey, null);
        return null;
      }

      if (res.status === 429) {
        const backoff = Math.min(2000 * (attempt + 1), 8000);
        logger.warn({ attempt, fen, backoff }, "Lichess 429 rate limit, backing off");
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      if (!res.ok) {
        logger.warn({ status: res.status, fen }, "Lichess cloud eval non-OK");
        return null;
      }

      const result = (await res.json()) as LichessCloudEval;
      cacheResult(cacheKey, result);
      return result;
    } catch (err) {
      logger.warn({ err, attempt }, "Lichess cloud eval fetch failed");
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }

  return null;
}

function cacheResult(key: string, value: LichessCloudEval | null): void {
  if (evalCache.size >= MAX_CACHE_SIZE) {
    const firstKey = evalCache.keys().next().value;
    if (firstKey) evalCache.delete(firstKey);
  }
  evalCache.set(key, value);
}

export function pvToWhiteCp(pv: LichessPv): number {
  if (pv.mate !== undefined) {
    return pv.mate > 0 ? 10000 - pv.mate : -10000 - pv.mate;
  }
  return pv.cp ?? 0;
}

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

export function classifyFromCpLoss(
  cpLoss: number,
  isTopEngineMove: boolean,
  isSecondEngineMove: boolean,
  isOpeningRange: boolean,
  wasBalanced: boolean,
): EngineClassification {
  if (isOpeningRange && wasBalanced && (isTopEngineMove || isSecondEngineMove) && cpLoss <= 15) {
    return "book";
  }

  if (cpLoss < 0) {
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
  cpLoss: number;
  cpLossRaw: number;
  engineCpBefore: number | null;
  engineCpAfter: number | null;
  engineBestMoveSan: string | null;
  isEngineTopChoice: boolean;
  depth: number;
  available: boolean;
}

export async function engineEvalMove(params: {
  fenBefore: string;
  fenAfter: string;
  playedFrom: string;
  playedTo: string;
  playerColor: "white" | "black";
  moveIndex: number;
}): Promise<EngineEvalResult> {
  const { fenBefore, fenAfter, playedFrom, playedTo, playerColor, moveIndex } = params;

  const isOpeningRange = moveIndex < 30;

  const evalBefore = await fetchLichessEval(fenBefore, 2);
  const evalAfter = await fetchLichessEval(fenAfter, 1);

  if (!evalBefore || evalBefore.pvs.length === 0) {
    logger.debug({ fen: fenBefore }, "No engine eval for position before move");
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
    const topUci = evalBefore.pvs[0]?.moves?.split(" ")[0] ?? "";
    const secondUci = evalBefore.pvs[1]?.moves?.split(" ")[0] ?? "";
    const playedUci = `${playedFrom}${playedTo}`;
    const isTopEngineMove = topUci.startsWith(playedUci);
    const isSecondEngineMove = secondUci.startsWith(playedUci);
    const engineBestMoveSan = topUci ? uciToSan(fenBefore, topUci) : null;

    if (isTopEngineMove) {
      return {
        classification: isOpeningRange ? "book" : "excellent",
        cpLoss: 0,
        cpLossRaw: 0,
        engineCpBefore: cpBefore,
        engineCpAfter: null,
        engineBestMoveSan: null,
        isEngineTopChoice: true,
        depth: evalBefore.depth,
        available: true,
      };
    }
    if (isSecondEngineMove) {
      return {
        classification: isOpeningRange ? "book" : "good",
        cpLoss: 0,
        cpLossRaw: 0,
        engineCpBefore: cpBefore,
        engineCpAfter: null,
        engineBestMoveSan: engineBestMoveSan,
        isEngineTopChoice: false,
        depth: evalBefore.depth,
        available: true,
      };
    }

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

  const cpLossRaw =
    playerColor === "white" ? cpBefore - cpAfter : cpAfter - cpBefore;

  const cpLoss = Math.max(0, cpLossRaw);

  const playedUci = `${playedFrom}${playedTo}`;
  const topUci = evalBefore.pvs[0]?.moves?.split(" ")[0] ?? "";
  const secondUci = evalBefore.pvs[1]?.moves?.split(" ")[0] ?? "";
  const isTopEngineMove = topUci.startsWith(playedUci);
  const isSecondEngineMove = secondUci.startsWith(playedUci);

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
