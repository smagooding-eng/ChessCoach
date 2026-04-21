import { Chess } from "chess.js";
import { logger } from "./logger";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";

const IS_PROD = process.env.NODE_ENV === "production";
const ANALYSIS_DEPTH = IS_PROD ? 15 : 20;
const ENGINE_TIMEOUT_MS = IS_PROD ? 15000 : 30000;

export type EngineClassification =
  | "checkmate"
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "missed_win";

export interface StockfishEval {
  cp: number;
  bestMoveUci: string;
  secondBestUci: string;
  depth: number;
}

export interface PositionEval {
  cpWhite: number;
  bestMoveUci: string;
  secondBestUci: string;
  bestMoveSan: string | null;
  depth: number;
}

function uciToSan(fen: string, uci: string): string | null {
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

export { uciToSan };

export const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

class StockfishProcess {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private resolveFunc: ((lines: string[]) => void) | null = null;
  private rejectFunc: ((err: Error) => void) | null = null;
  private collectedLines: string[] = [];
  private waitForToken = "";
  private pendingTimers: ReturnType<typeof setTimeout>[] = [];
  private dead = false;

  private clearTimers(): void {
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers = [];
  }

  private doResolve(): void {
    if (this.resolveFunc) {
      this.clearTimers();
      this.resolveFunc(this.collectedLines);
      this.resolveFunc = null;
      this.rejectFunc = null;
      this.collectedLines = [];
    }
  }

  private doReject(err: Error): void {
    if (this.rejectFunc) {
      this.clearTimers();
      this.rejectFunc(err);
      this.resolveFunc = null;
      this.rejectFunc = null;
      this.collectedLines = [];
    }
  }

  async init(): Promise<void> {
    const hashMB = IS_PROD ? 64 : 256;
    const threads = IS_PROD ? 1 : 2;

    this.proc = spawn("stockfish", [], { stdio: ["pipe", "pipe", "pipe"] });

    this.proc.on("exit", (code, signal) => {
      logger.warn({ code, signal }, "Stockfish process exited");
      this.dead = true;
      this.proc = null;
      globalEngine = null;
      engineInitPromise = null;
      this.doReject(new Error(`Stockfish exited: code=${code} signal=${signal}`));
    });

    this.proc.on("error", (err) => {
      logger.error({ err }, "Stockfish process error");
      this.dead = true;
      this.proc = null;
      globalEngine = null;
      engineInitPromise = null;
      this.doReject(err);
    });

    this.proc.stdout.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        this.collectedLines.push(line);
        if (this.waitForToken && line.includes(this.waitForToken)) {
          this.doResolve();
        }
      }
    });
    this.proc.stderr.on("data", (data: Buffer) => {
      logger.debug({ stderr: data.toString() }, "Stockfish stderr");
    });

    await this.sendAndWait("uci", "uciok");
    await this.sendAndWait(`setoption name Hash value ${hashMB}`, "");
    await this.sendAndWait(`setoption name Threads value ${threads}`, "");
    await this.sendAndWait("setoption name MultiPV value 2", "");
    await this.sendAndWait("isready", "readyok");
    logger.info({ hashMB, threads, depth: ANALYSIS_DEPTH, env: IS_PROD ? "production" : "development" }, "Stockfish engine initialized");
  }

  async newGame(): Promise<void> {
    await this.sendAndWait("ucinewgame", "");
    await this.sendAndWait("isready", "readyok");
  }

  private sendAndWait(command: string, token: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!this.proc || this.dead) { reject(new Error("Stockfish not started or dead")); return; }
      this.collectedLines = [];
      this.waitForToken = token;
      this.resolveFunc = resolve;
      this.rejectFunc = reject;
      this.proc.stdin.write(command + "\n");

      if (!token) {
        this.pendingTimers.push(setTimeout(() => this.doResolve(), 50));
      }

      this.pendingTimers.push(setTimeout(() => {
        logger.warn({ command, token }, "Stockfish command timed out");
        if (token === "bestmove" && this.proc) {
          this.proc.stdin.write("stop\n");
          setTimeout(() => this.doResolve(), 500);
        } else {
          this.doResolve();
        }
      }, ENGINE_TIMEOUT_MS));
    });
  }

  async evaluate(fen: string, depth: number = ANALYSIS_DEPTH): Promise<PositionEval> {
    if (!this.proc || this.dead) throw new Error("Stockfish not started or dead");

    await this.sendAndWait(`position fen ${fen}`, "");
    await this.sendAndWait("isready", "readyok");

    const lines = await this.sendAndWait(`go depth ${depth}`, "bestmove");

    let bestCp = 0;
    let bestMoveUci = "";
    let secondBestUci = "";
    let bestDepth = 0;
    let secondBestDepth = 0;

    const isBlackToMove = fen.includes(" b ");

    for (const line of lines) {
      if (!line.startsWith("info") || !line.includes("score")) continue;
      if (line.includes("upperbound") || line.includes("lowerbound")) continue;

      const depthMatch = line.match(/\bdepth (\d+)/);
      const pvMatch = line.match(/\bmultipv (\d+)/);
      const pvNum = pvMatch ? parseInt(pvMatch[1]) : 1;
      const lineDepth = depthMatch ? parseInt(depthMatch[1]) : 0;

      const cpMatch = line.match(/\bscore cp (-?\d+)/);
      const mateMatch = line.match(/\bscore mate (-?\d+)/);

      let cpValue = 0;
      if (cpMatch) {
        cpValue = parseInt(cpMatch[1]);
      } else if (mateMatch) {
        const mateIn = parseInt(mateMatch[1]);
        cpValue = mateIn > 0 ? 10000 - mateIn : -10000 - mateIn;
      } else {
        continue;
      }

      const pvLine = line.match(/ pv (.+)$/);
      const firstMove = pvLine ? pvLine[1].split(" ")[0] : "";

      if (pvNum === 1 && lineDepth >= bestDepth) {
        bestCp = isBlackToMove ? -cpValue : cpValue;
        bestMoveUci = firstMove;
        bestDepth = lineDepth;
      } else if (pvNum === 2 && lineDepth >= secondBestDepth) {
        secondBestUci = firstMove;
        secondBestDepth = lineDepth;
      }
    }

    const bestmoveLine = lines.find(l => l.startsWith("bestmove"));
    if (bestmoveLine && !bestMoveUci) {
      bestMoveUci = bestmoveLine.split(" ")[1] ?? "";
    }

    const bestMoveSan = bestMoveUci ? uciToSan(fen, bestMoveUci) : null;

    return { cpWhite: bestCp, bestMoveUci, secondBestUci, bestMoveSan, depth: bestDepth };
  }

  destroy(): void {
    if (this.proc) {
      this.proc.stdin.write("quit\n");
      this.proc.kill();
      this.proc = null;
    }
  }
}

let globalEngine: StockfishProcess | null = null;
let engineInitPromise: Promise<void> | null = null;

async function getEngine(): Promise<StockfishProcess> {
  if (globalEngine && !globalEngine["dead"]) return globalEngine;
  if (globalEngine?.["dead"]) {
    globalEngine = null;
    engineInitPromise = null;
  }
  if (engineInitPromise) { await engineInitPromise; return globalEngine!; }

  globalEngine = new StockfishProcess();
  engineInitPromise = globalEngine.init().catch((err) => {
    logger.error({ err }, "Failed to initialize Stockfish");
    globalEngine = null;
    engineInitPromise = null;
    throw err;
  });
  await engineInitPromise;
  return globalEngine!;
}

export async function evaluateAllPositions(
  fens: string[],
  depth: number = ANALYSIS_DEPTH,
  onProgress?: (done: number, total: number) => void,
): Promise<PositionEval[]> {
  let engine = await getEngine();
  const results: PositionEval[] = [];

  try {
    await engine.newGame();
  } catch (err) {
    logger.warn({ err }, "Engine newGame failed, reinitializing");
    globalEngine = null;
    engineInitPromise = null;
    engine = await getEngine();
    await engine.newGame();
  }

  for (let i = 0; i < fens.length; i++) {
    try {
      const ev = await engine.evaluate(fens[i], depth);
      results.push(ev);
    } catch (err) {
      logger.warn({ err, fen: fens[i], idx: i }, "Engine eval failed for position");
      results.push({ cpWhite: 0, bestMoveUci: "", secondBestUci: "", bestMoveSan: null, depth: 0 });
    }
    if (onProgress && i % 5 === 0) onProgress(i + 1, fens.length);
  }
  if (onProgress) onProgress(fens.length, fens.length);

  return results;
}

export function classifyFromWinPctLoss(
  winPctLoss: number,
  isTopEngineMove: boolean,
  isSecondEngineMove: boolean,
  isOpeningRange: boolean,
  _wasBalanced: boolean,
  playerWinPctBefore: number = 50,
  isInBook: boolean = false,
  playerWinPctAfter: number = 50,
  legalMoveCount: number = 20,
  cpBefore: number = 0,
  cpAfter: number = 0,
  playerColor: "white" | "black" = "white",
): EngineClassification {
  // Book moves should only register during the opening phase. Once we've
  // left the opening, even if the position somehow matches a book entry,
  // we classify on engine merit (best/excellent/good/etc.) instead.
  if (isInBook && isOpeningRange) {
    return "book";
  }

  const wasWinning = playerWinPctBefore >= 70;
  const isNowLosing = playerWinPctAfter <= 40;
  const hadMateOrCrush = playerWinPctBefore >= 90;

  if (wasWinning && isNowLosing && winPctLoss > 25) {
    return "missed_win";
  }
  if (hadMateOrCrush && winPctLoss > 15) {
    return "missed_win";
  }

  const playerCpBefore = playerColor === "white" ? cpBefore : -cpBefore;
  const playerCpAfter = playerColor === "white" ? cpAfter : -cpAfter;
  const cpLossRaw = playerCpBefore - playerCpAfter;

  const alreadyDecided = playerWinPctBefore < 10 || playerWinPctBefore > 90;

  if (winPctLoss > 25) {
    if (alreadyDecided) return "mistake";
    return "blunder";
  }
  if (winPctLoss > 12) {
    if (alreadyDecided) return "inaccuracy";
    return "mistake";
  }
  if (winPctLoss > 5) {
    return "inaccuracy";
  }

  if (alreadyDecided && cpLossRaw > 0 && !isTopEngineMove) {
    if (cpLossRaw > 300) return "blunder";
    if (cpLossRaw > 150) return "mistake";
    if (cpLossRaw > 75) return "inaccuracy";
  }

  if (isTopEngineMove) {
    // Brilliant must be RARE: requires (a) the player was in a roughly
    // balanced or worse position, (b) a huge win-pct swing in their favor
    // (≥15 points) AND (c) the engine eval after the move shows a material
    // / positional gain on the order of a queen (≥600 cp). Downstream the
    // move must also pass `isSacrificialMove`. Anything weaker downgrades
    // to best/great/excellent.
    const playerCpSwing = -cpLossRaw; // positive when the player gained
    if (
      winPctLoss < -15 &&
      playerWinPctBefore >= 15 &&
      playerWinPctBefore <= 65 &&
      playerCpSwing >= 600
    ) {
      return "brilliant";
    }

    if (legalMoveCount <= 5 && winPctLoss <= 0) {
      return "great";
    }

    const evalSwing = playerWinPctAfter - playerWinPctBefore;
    if (evalSwing > 15 && playerWinPctBefore <= 55) {
      return "great";
    }

    return "best";
  }

  if (winPctLoss <= 1) return "excellent";
  if (winPctLoss <= 5) return "good";

  return "good";
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function isSacrificialMove(fenBefore: string, san: string): boolean {
  try {
    const chess = new Chess(fenBefore);
    const moveResult = chess.move(san);
    if (!moveResult) return false;

    const opponentMoves = chess.moves({ verbose: true });
    const movedPieceValue = PIECE_VALUES[moveResult.piece] || 0;

    const threatsToLandingSquare = opponentMoves.filter(
      (m: any) => m.to === moveResult.to
    );
    if (threatsToLandingSquare.length > 0 && movedPieceValue >= 3) {
      return true;
    }

    if (moveResult.captured) {
      const capturedValue = PIECE_VALUES[moveResult.captured] || 0;
      if (movedPieceValue > capturedValue + 1 && threatsToLandingSquare.length > 0) {
        return true;
      }
    }

    const opponentCaptures = opponentMoves.filter((m: any) => m.captured);
    for (const cap of opponentCaptures) {
      const victimValue = PIECE_VALUES[cap.captured!] || 0;
      if (victimValue >= 3) {
        const defenderPos = new Chess(chess.fen());
        defenderPos.move(cap.san);
        const recaptures = defenderPos.moves({ verbose: true }).filter(
          (m: any) => m.to === cap.to
        );
        if (recaptures.length === 0) {
          return true;
        }
        const bestRecaptureValue = Math.min(...recaptures.map((m: any) => PIECE_VALUES[m.piece] || 0));
        if (bestRecaptureValue > victimValue) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}
