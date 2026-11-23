// Stockfish on the player's own device (public/engine: Stockfish 19 "lite", single-threaded WASM,
// GPL — credited on the Credits page). One shared Web Worker; each new search replaces the last.
// Scores are from White's point of view. No server cost and no waiting on a queue.
import { Chess } from 'chess.js';

export type EngineLine = { multipv: number; depth: number; cp: number | null; mate: number | null; pv: string[] };
export type EngineResult = { depth: number; lines: EngineLine[]; bestmove: string | null };
type Job = { fen: string; depth: number; multiPv: number; onUpdate?: (r: EngineResult) => void; resolve: (r: EngineResult) => void };

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let current: (Job & { result: EngineResult; whiteToMove: boolean }) | null = null;
let queue: Job[] = [];
let stopping = false;
let multiPvNow = 1;

export function engineSupported() {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
}

function boot(): Promise<void> {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    try {
      worker = new Worker(ENGINE_URL);
    } catch (e) { ready = null; reject(e); return; }
    let gotReady = false;
    worker.onmessage = (e: MessageEvent) => {
      const line = String(e.data);
      if (!gotReady) {
        if (line === 'readyok') { gotReady = true; resolve(); }
        return;
      }
      onLine(line);
    };
    worker.onerror = () => { if (!gotReady) { ready = null; worker = null; reject(new Error('engine failed to load')); } };
    worker.postMessage('uci');
    worker.postMessage('setoption name Hash value 32');
    worker.postMessage('isready');
  });
  return ready;
}

function onLine(line: string) {
  if (!current) return;
  if (line.startsWith('info ') && line.includes(' pv ') && !stopping) {
    const t = line.split(' ');
    const at = (k: string) => { const i = t.indexOf(k); return i >= 0 ? t[i + 1] : undefined; };
    const depth = Number(at('depth') ?? 0);
    const mpv = Number(at('multipv') ?? 1);
    const si = t.indexOf('score');
    if (si < 0 || t.includes('lowerbound') || t.includes('upperbound')) return;
    const kind = t[si + 1], val = Number(t[si + 2]);
    const sign = current.whiteToMove ? 1 : -1; // engine scores are for the side to move
    const pv = t.slice(t.indexOf('pv') + 1);
    const ln: EngineLine = { multipv: mpv, depth, cp: kind === 'cp' ? val * sign : null, mate: kind === 'mate' ? val * sign : null, pv };
    const r = current.result;
    const lines = r.lines.filter((l) => l.multipv !== mpv).concat(ln).sort((a, b) => a.multipv - b.multipv);
    current.result = { depth: Math.max(r.depth, mpv === 1 ? depth : r.depth), lines, bestmove: r.bestmove };
    if (mpv === current.multiPv || current.multiPv === 1) current.onUpdate?.(current.result);
  } else if (line.startsWith('bestmove')) {
    const done = current;
    current = null;
    if (!stopping) {
      done.result = { ...done.result, bestmove: line.split(' ')[1] ?? null };
      done.onUpdate?.(done.result);
    }
    done.resolve(done.result);
    stopping = false;
    const next = queue.shift();
    if (next) start(next);
  }
}

function start(job: Job) {
  if (!worker) return;
  const whiteToMove = (job.fen.split(' ')[1] ?? 'w') === 'w';
  current = { ...job, result: { depth: 0, lines: [], bestmove: null }, whiteToMove };
  if (multiPvNow !== job.multiPv) { worker.postMessage(`setoption name MultiPV value ${job.multiPv}`); multiPvNow = job.multiPv; }
  worker.postMessage(`position fen ${job.fen}`);
  worker.postMessage(`go depth ${job.depth}`);
}

const EMPTY: EngineResult = { depth: 0, lines: [], bestmove: null };

/** Analyse a position. By default a newer call replaces everything older (those resolve with what
 *  they had); with queue: true it waits its turn instead (e.g. grading every move of a game).
 *  onUpdate streams deeper results as they arrive. */
export async function analyse(fen: string, opts: { depth?: number; multiPv?: number; queue?: boolean; onUpdate?: (r: EngineResult) => void } = {}): Promise<EngineResult> {
  await boot();
  return new Promise((resolve) => {
    const job: Job = { fen, depth: opts.depth ?? 18, multiPv: opts.multiPv ?? 1, onUpdate: opts.onUpdate, resolve };
    if (!opts.queue) {
      for (const j of queue) j.resolve(EMPTY);
      queue = [];
      if (current && !stopping) { stopping = true; worker!.postMessage('stop'); }
    }
    if (current) queue.push(job); else start(job);
  });
}

export function stopEngine() {
  for (const j of queue) j.resolve(EMPTY);
  queue = [];
  if (current && worker && !stopping) { stopping = true; worker.postMessage('stop'); }
}

const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
const whiteCp = (r: EngineResult) => { const l = r.lines[0]; return !l ? null : l.mate != null ? (l.mate > 0 ? 10000 - l.mate : -10000 - l.mate) : l.cp; };

export type DeviceGrade = { quality: 'checkmate' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'missed_win'; cpLoss: number; bestMoveSan: string | null; isTopMove: boolean };

/** Grade one move with the device engine (the server review's win-percentage thresholds).
 *  Queued behind other grading, so a whole game can be graded move by move. */
export async function gradeMove(fenBefore: string, san: string, depth = 13): Promise<DeviceGrade | null> {
  let after: string, uci: string, mate = false;
  try {
    const c = new Chess(fenBefore);
    const m = c.move(san);
    if (!m) return null;
    uci = m.from + m.to + (m.promotion ?? '');
    after = c.fen(); mate = c.isCheckmate();
  } catch { return null; }
  if (mate) return { quality: 'checkmate', cpLoss: 0, bestMoveSan: null, isTopMove: true };
  const [b, a] = [await analyse(fenBefore, { depth, queue: true }), await analyse(after, { depth, queue: true })];
  const cb = whiteCp(b), ca = whiteCp(a);
  if (cb == null || ca == null) return null;
  const white = fenBefore.split(' ')[1] === 'w';
  const pb = white ? cb : -cb, pa = white ? ca : -ca;
  const wb = winPct(pb), wa = winPct(pa), loss = wb - wa;
  const top = b.bestmove === uci;
  const bestMoveSan = b.bestmove ? pvToSan(fenBefore, [b.bestmove], 1)[0] ?? null : null;
  const cpLoss = Math.max(0, pb - pa);
  const decided = wb < 10 || wb > 90;
  let quality: DeviceGrade['quality'];
  if ((wb >= 70 && wa <= 40 && loss > 25) || (wb >= 90 && loss > 20)) quality = 'missed_win';
  else if (loss > 30) quality = decided ? 'mistake' : 'blunder';
  else if (loss > 15) quality = decided ? 'inaccuracy' : 'mistake';
  else if (loss > 6) quality = 'inaccuracy';
  else if (top) quality = 'best';
  else quality = loss <= 2 ? 'excellent' : 'good';
  return { quality, cpLoss: Math.round(cpLoss), bestMoveSan, isTopMove: top };
}

/** "+0.4", "-1.2", "M3", "-M2" (White's point of view) */
export function formatScore(l: Pick<EngineLine, 'cp' | 'mate'> | undefined | null): string {
  if (!l) return '';
  if (l.mate != null) return `${l.mate < 0 ? '-' : ''}M${Math.abs(l.mate)}`;
  if (l.cp == null) return '';
  const v = l.cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

/** A centipawn number for eval bars (EvalBar's convention: mate in N = ±(10000 - N)). */
export function scoreCp(l: Pick<EngineLine, 'cp' | 'mate'> | undefined | null): number | null {
  if (!l) return null;
  if (l.mate != null) return l.mate === 0 ? 0 : Math.sign(l.mate) * (10000 - Math.abs(l.mate));
  return l.cp;
}

/** UCI moves → SAN (stops at the first move that doesn't apply). */
export function pvToSan(fen: string, pv: string[], max = 8): string[] {
  const out: string[] = [];
  try {
    const c = new Chess(fen);
    for (const u of pv.slice(0, max)) {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
      if (!m) break;
      out.push(m.san);
    }
  } catch { /* bad fen */ }
  return out;
}

/** The same position with the other side to move ("what is the opponent threatening?"), or null
 *  when that isn't a legal position (e.g. the side to move is in check). */
export function threatFen(fen: string): string | null {
  const p = fen.split(' ');
  if (p.length < 4) return null;
  p[1] = p[1] === 'w' ? 'b' : 'w';
  p[3] = '-';
  const f = p.join(' ');
  try {
    const c = new Chess(fen);
    if (c.inCheck()) return null;
    new Chess(f);
    return f;
  } catch { return null; }
}
