import { logger } from "./logger";
import path from "path";

interface StockfishEngine {
  sendCommand: (cmd: string) => void;
  addMessageListener: (listener: (msg: string) => void) => void;
  removeMessageListener: (listener: (msg: string) => void) => void;
}

let engineInstance: StockfishEngine | null = null;
let engineReady = false;
let initPromise: Promise<void> | null = null;

async function initEngine(): Promise<void> {
  if (engineReady && engineInstance) return;
  if (initPromise) return initPromise;

  initPromise = new Promise<void>((resolve, reject) => {
    try {
      const initStockfish = require("stockfish");
      const enginePath = path.join(
        path.dirname(require.resolve("stockfish")),
        "bin",
        "stockfish-18-single.js"
      );
      initStockfish(enginePath).then((engine: any) => {
        engineInstance = engine;
        const listeners: Array<(msg: string) => void> = [];

        const origPrint = engine.print;
        engine.print = (msg: string) => {
          if (origPrint) origPrint(msg);
          for (const l of listeners) l(msg);
        };

        engine.addMessageListener = (fn: (msg: string) => void) => {
          listeners.push(fn);
        };
        engine.removeMessageListener = (fn: (msg: string) => void) => {
          const idx = listeners.indexOf(fn);
          if (idx >= 0) listeners.splice(idx, 1);
        };

        engine.sendCommand("uci");
        engine.sendCommand("setoption name Threads value 1");
        engine.sendCommand("setoption name Hash value 16");
        engine.sendCommand("isready");

        const readyListener = (msg: string) => {
          if (msg === "readyok") {
            engine.removeMessageListener(readyListener);
            engineReady = true;
            logger.info("Local Stockfish 18 engine initialized");
            resolve();
          }
        };
        engine.addMessageListener(readyListener);
      }).catch(reject);
    } catch (err) {
      reject(err);
    }
  });

  return initPromise;
}

export interface LocalEvalResult {
  cp: number;
  mate: number | null;
  bestMove: string;
  depth: number;
  pv: string;
  multiPv?: Array<{ cp: number; mate: number | null; moves: string }>;
}

export async function evalPosition(fen: string, depth = 18, multiPv = 2): Promise<LocalEvalResult | null> {
  try {
    await initEngine();
    if (!engineInstance) return null;

    return new Promise<LocalEvalResult | null>((resolve) => {
      const engine = engineInstance!;
      const pvResults: Array<{ cp: number; mate: number | null; moves: string; depth: number }> = [];
      let bestMove = "";
      let finalDepth = 0;

      const timeout = setTimeout(() => {
        engine.removeMessageListener(listener);
        resolve(null);
      }, 10000);

      const listener = (msg: string) => {
        if (msg.startsWith("info depth")) {
          const depthMatch = msg.match(/depth (\d+)/);
          const pvMatch = msg.match(/multipv (\d+)/);
          const cpMatch = msg.match(/score cp (-?\d+)/);
          const mateMatch = msg.match(/score mate (-?\d+)/);
          const pvMoves = msg.match(/ pv (.+)/);
          const currentDepth = depthMatch ? parseInt(depthMatch[1]) : 0;

          if (currentDepth >= depth - 2) {
            const pvIndex = pvMatch ? parseInt(pvMatch[1]) - 1 : 0;
            const entry = {
              cp: cpMatch ? parseInt(cpMatch[1]) : 0,
              mate: mateMatch ? parseInt(mateMatch[1]) : null,
              moves: pvMoves ? pvMoves[1] : "",
              depth: currentDepth,
            };
            pvResults[pvIndex] = entry;
            finalDepth = Math.max(finalDepth, currentDepth);
          }
        }

        if (msg.startsWith("bestmove")) {
          clearTimeout(timeout);
          engine.removeMessageListener(listener);
          bestMove = msg.split(" ")[1] || "";

          if (pvResults.length === 0) {
            resolve(null);
            return;
          }

          const primary = pvResults[0];
          resolve({
            cp: primary.cp,
            mate: primary.mate,
            bestMove,
            depth: finalDepth,
            pv: primary.moves,
            multiPv: pvResults.map(r => ({
              cp: r.cp,
              mate: r.mate,
              moves: r.moves,
            })),
          });
        }
      };

      engine.addMessageListener(listener);
      engine.sendCommand("ucinewgame");
      engine.sendCommand(`position fen ${fen}`);
      engine.sendCommand(`setoption name MultiPV value ${multiPv}`);
      engine.sendCommand(`go depth ${depth}`);
    });
  } catch (err) {
    logger.warn({ err }, "Local Stockfish eval failed");
    return null;
  }
}

export async function warmUp(): Promise<void> {
  try {
    await initEngine();
  } catch (err) {
    logger.warn({ err }, "Failed to warm up Stockfish");
  }
}
