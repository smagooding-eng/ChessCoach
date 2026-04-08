import { Chess } from "chess.js";
import { logger } from "./logger";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";

const ANALYSIS_DEPTH = 16;
const ENGINE_TIMEOUT_MS = 10000;

export type EngineClassification =
  | "brilliant"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder";

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

class StockfishProcess {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private resolveFunc: ((lines: string[]) => void) | null = null;
  private collectedLines: string[] = [];
  private waitForToken = "";

  async init(): Promise<void> {
    this.proc = spawn("stockfish", [], { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stdout.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        this.collectedLines.push(line);
        if (this.waitForToken && line.includes(this.waitForToken)) {
          if (this.resolveFunc) {
            this.resolveFunc(this.collectedLines);
            this.resolveFunc = null;
            this.collectedLines = [];
          }
        }
      }
    });
    this.proc.stderr.on("data", (data: Buffer) => {
      logger.debug({ stderr: data.toString() }, "Stockfish stderr");
    });

    await this.sendAndWait("uci", "uciok");
    await this.sendAndWait("setoption name Hash value 64", "");
    await this.sendAndWait("setoption name Threads value 1", "");
    await this.sendAndWait("isready", "readyok");
    logger.info("Stockfish 17 engine initialized");
  }

  private sendAndWait(command: string, token: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!this.proc) { reject(new Error("Stockfish not started")); return; }
      this.collectedLines = [];
      this.waitForToken = token;
      this.resolveFunc = resolve;
      this.proc.stdin.write(command + "\n");

      if (!token) {
        setTimeout(() => {
          if (this.resolveFunc) {
            this.resolveFunc(this.collectedLines);
            this.resolveFunc = null;
            this.collectedLines = [];
          }
        }, 50);
      }

      setTimeout(() => {
        if (this.resolveFunc) {
          this.resolveFunc(this.collectedLines);
          this.resolveFunc = null;
          this.collectedLines = [];
        }
      }, ENGINE_TIMEOUT_MS);
    });
  }

  async evaluate(fen: string, depth: number = ANALYSIS_DEPTH, multiPv: number = 2): Promise<PositionEval> {
    if (!this.proc) throw new Error("Stockfish not started");

    await this.sendAndWait("ucinewgame", "");
    await this.sendAndWait(`position fen ${fen}`, "");
    await this.sendAndWait("isready", "readyok");

    await this.sendAndWait(`setoption name MultiPV value ${multiPv}`, "");
    const lines = await this.sendAndWait(`go depth ${depth}`, "bestmove");

    let bestCp = 0;
    let bestMoveUci = "";
    let secondBestUci = "";
    let bestDepth = 0;

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
      } else if (pvNum === 2 && lineDepth >= bestDepth - 1) {
        secondBestUci = firstMove;
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
  if (globalEngine) return globalEngine;
  if (engineInitPromise) { await engineInitPromise; return globalEngine!; }

  globalEngine = new StockfishProcess();
  engineInitPromise = globalEngine.init();
  await engineInitPromise;
  return globalEngine!;
}

export async function evaluateAllPositions(
  fens: string[],
): Promise<PositionEval[]> {
  const engine = await getEngine();
  const results: PositionEval[] = [];

  for (let i = 0; i < fens.length; i++) {
    try {
      const ev = await engine.evaluate(fens[i], ANALYSIS_DEPTH, 2);
      results.push(ev);
    } catch (err) {
      logger.warn({ err, fen: fens[i], idx: i }, "Engine eval failed for position");
      results.push({ cpWhite: 0, bestMoveUci: "", secondBestUci: "", bestMoveSan: null, depth: 0 });
    }
  }

  return results;
}

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
