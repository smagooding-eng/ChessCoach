// The Learn Path: one level per practice bot, in the bots' order (each harder). A level is
// puzzles, a tactic, a lesson, an opening as White, an opening as Black and a trap, then a game
// against that level's bot. Your token is a pawn at level 1 and becomes a different piece each
// level. Progress is kept on this device and synced to the account.
//
// A step is started from the path (startStep); the page it opens reports what you did
// (pathEvent) and the step completes when the goal is reached.
import { BOTS, type BotConfig } from '@/lib/chess-bot';
import { MOTIFS, type Motif } from '@/lib/tactics';
import { LEVEL_CONTENT, type LevelContent } from '@/lib/learnPathContent';
import { OPENINGS, type OpeningLine } from '@/lib/openings';
import { apiFetch } from '@/lib/api';

export type StepKind = 'lesson' | 'puzzles' | 'tactic' | 'opening' | 'trap' | 'bot' | 'review' | 'recent' | 'course';
export type Step = { key: string; kind: StepKind; title: string; sub: string; href: string; need: number; target?: string; icon: string; optional?: 'games' };
export type Level = { n: number; bot: BotConfig; piece: string; pieceName: string; ring?: string; steps: Step[]; all: Step[]; content: LevelContent; motif: Motif; white?: OpeningLine; black?: OpeningLine };

// the token for each level (then the king, in bronze, silver, gold and emerald)
const TOKENS: { piece: string; name: string; ring?: string }[] = [
  { piece: 'P', name: 'Pawn' }, { piece: 'N', name: 'Knight' }, { piece: 'B', name: 'Bishop' }, { piece: 'R', name: 'Rook' },
  { piece: 'Q', name: 'Queen' }, { piece: 'K', name: 'King' }, { piece: 'K', name: 'Bronze King', ring: '#C7894B' },
  { piece: 'K', name: 'Silver King', ring: '#C9D1D3' }, { piece: 'K', name: 'Gold King', ring: '#F2B53A' }, { piece: 'K', name: 'Emerald King', ring: '#3CC3B0' },
];

// openings alternate so each level has a new one per side
const WHITE = OPENINGS.filter((o) => o.userColor === 'w');
const BLACK = OPENINGS.filter((o) => o.userColor === 'b');
const HAS_GAMES = 'cs_path_has_games';
/** Whether the member has imported games (the recent-game review step only shows then). */
export function hasGames() { try { return localStorage.getItem(HAS_GAMES) === '1'; } catch { return false; } }
export function setHasGames(v: boolean) { try { localStorage.setItem(HAS_GAMES, v ? '1' : '0'); } catch { /* */ } window.dispatchEvent(new Event(EVT)); }

export const LEVELS: Level[] = BOTS.map((bot, i) => {
  const n = i + 1;
  const tk = TOKENS[Math.min(i, TOKENS.length - 1)];
  const content = LEVEL_CONTENT[Math.min(i, LEVEL_CONTENT.length - 1)];
  const motif = MOTIFS.find((m) => m.id === content.motif) ?? MOTIFS[0];
  const w = WHITE[i % Math.max(1, WHITE.length)], b = BLACK[i % Math.max(1, BLACK.length)];
  const k = (s: string) => `L${n}-${s}`;
  const run = (s: string) => `/path/step/${k(s)}`;
  const all: Step[] = [
    { key: k('lesson'), kind: 'lesson', title: `Learn: ${motif.name}`, sub: 'A short walk-through', href: run('lesson'), need: 1, icon: 'courses' },
    { key: k('tactic'), kind: 'tactic', title: `Practice: ${motif.name}`, sub: `${content.tactic.length} puzzles`, href: run('tactic'), need: 1, icon: 'tactics' },
    { key: k('puzzles'), kind: 'puzzles', title: 'Puzzles', sub: `${content.puzzles.length} puzzles at about ${bot.rating}`, href: run('puzzles'), need: 1, icon: 'puzzles' },
    ...(w ? [{ key: k('white'), kind: 'opening' as const, title: w.name.split(' (')[0], sub: 'Opening as White: play the line', href: run('white'), need: 1, icon: 'openings' }] : []),
    ...(b ? [{ key: k('black'), kind: 'opening' as const, title: b.name.split(' — ')[0].split(' (')[0], sub: 'Opening as Black: play the line', href: run('black'), need: 1, icon: 'openings' }] : []),
    { key: k('trap'), kind: 'trap', title: content.trap.name, sub: `Trap: play it as ${content.trap.trapSide === 'white' ? 'White' : 'Black'}`, href: run('trap'), need: 1, icon: 'chess-traps' },
    { key: k('bot'), kind: 'bot', title: `Beat ${bot.name}`, sub: `Rated about ${bot.rating}`, href: `/practice?bot=${encodeURIComponent(bot.name)}`, need: 1, target: bot.name, icon: 'practice-bots' },
    { key: k('review'), kind: 'review', title: 'Review that game', sub: `Your biggest moments against ${bot.name}`, href: run('review'), need: 1, icon: 'analysis' },
    { key: k('recent'), kind: 'recent', title: 'Review a recent game', sub: 'One of your own games', href: run('recent'), need: 1, icon: 'recent-games', optional: 'games' },
  ];
  const level = { n, bot, piece: tk.piece, pieceName: tk.name, ring: tk.ring, all, content, motif, white: w, black: b } as Level;
  Object.defineProperty(level, 'steps', { get: () => all.filter((x) => !x.optional || hasGames()), enumerable: true });
  return level;
});
export const stepByKey = (key: string) => { for (const l of LEVELS) { const st = l.all.find((x) => x.key === key); if (st) return { level: l, step: st }; } return null; };

// ── progress ─────────────────────────────────────────────────────────────────
const KEY = 'cs_learn_path_v1';
const EVT = 'cs:learn-path';
export type PathState = { done: Record<string, number>; count?: Record<string, number> };
export function readPath(): PathState { try { return { done: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { done: {} }; } }
function writePath(s: PathState) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* */ } window.dispatchEvent(new Event(EVT)); }
export const onPathChange = (h: () => void) => { window.addEventListener(EVT, h); return () => window.removeEventListener(EVT, h); };

/** Merge the account's saved progress (other devices) into this device's. */
export async function syncPath() {
  try {
    const r = await apiFetch('/api/me/learn-path', { credentials: 'include' });
    if (!r.ok) return;
    const d = await r.json() as { done?: Record<string, number> };
    const s = readPath(); let changed = false;
    for (const [k, v] of Object.entries(d.done ?? {})) if (!s.done[k]) { s.done[k] = v; changed = true; }
    if (changed) writePath(s);
  } catch { /* offline, or an older server */ }
}
function saveStep(key: string) {
  apiFetch('/api/me/learn-path', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }).catch(() => {});
}

export function levelDone(s: PathState, l: Level) { return l.steps.every((x) => s.done[x.key]); }
/** The level you're on: the first one not finished. */
export function currentLevel(s: PathState) { return LEVELS.find((l) => !levelDone(s, l)) ?? LEVELS[LEVELS.length - 1]; }
/** Steps unlock in order; a level unlocks when the one before is done. */
export function stepOpen(s: PathState, l: Level, i: number) {
  const prev = LEVELS[l.n - 2];
  if (prev && !levelDone(s, prev)) return false;
  return l.steps.slice(0, i).every((x) => s.done[x.key]);
}

/** Kept for the pages that call it; the path now always works on the step you're on. */
export function startStep(step: Step) {
  markPathStarted();
  // a bot game counts for the path (and gets reviewed) only when it was started from the path
  if (step.kind === 'bot') { try { localStorage.setItem(PATH_BOT, JSON.stringify({ bot: step.target, at: Date.now() })); } catch { /* */ } }
}
const PATH_BOT = 'cs_path_bot_started';
export function clearPathBotGame() { try { localStorage.removeItem(PATH_BOT); } catch { /* */ } }
/** True when this bot game was started from the Learn Path (within the last day). */
export function pathBotGame(bot: string) { try { const v = JSON.parse(localStorage.getItem(PATH_BOT) || 'null'); return !!v && v.bot === bot && Date.now() - v.at < 86_400_000; } catch { return false; } }
const STARTED = 'cs_learn_path_started';
export function markPathStarted() { try { localStorage.setItem(STARTED, '1'); } catch { /* */ } }
function pathStarted() { try { return localStorage.getItem(STARTED) === '1' || Object.keys(readPath().done).length > 0; } catch { return false; } }

/** The step the member is on: the first one not done in the level they're on. */
export function nextStep(s: PathState) { const l = currentLevel(s); return l.steps.find((x) => !s.done[x.key]) ?? null; }

/** Pages call this when the member does something; it counts toward the step they're on. */
export function pathEvent(kind: StepKind, target?: string) {
  if (!pathStarted() || kind !== 'bot' || !target || !pathBotGame(target)) return; // every other step runs on its own screen (/path/step)
  const s = readPath();
  const step = nextStep(s);
  if (!step || step.kind !== kind) return;
  if (step.target && target && step.target !== target) return;
  const counts = { ...(s.count ?? {}) };
  const count = (counts[step.key] ?? 0) + 1;
  const detail = { key: step.key, kind, count, need: step.need, title: step.title };
  if (count < step.need) {
    counts[step.key] = count; writePath({ ...s, count: counts });
    window.dispatchEvent(new CustomEvent('cs:path-progress', { detail }));
    return;
  }
  delete counts[step.key];
  writePath({ ...s, count: counts, done: { ...s.done, [step.key]: Date.now() } });
  saveStep(step.key);
  window.dispatchEvent(new CustomEvent('cs:path-step-done', { detail }));
}

/** The step screens call this when a step is finished. */
export function completeStep(key: string) {
  const s = readPath();
  if (s.done[key]) return;
  writePath({ ...s, done: { ...s.done, [key]: Date.now() } });
  saveStep(key);
}

// The member's last game against each bot (for the review step), kept on this device.
const BOT_GAME = 'cs_path_bot_game';
export type SavedBotGame = { bot: string; pgn: string; color: 'w' | 'b'; result: string; at: number };
export function saveBotGame(g: SavedBotGame) { try { const all = JSON.parse(localStorage.getItem(BOT_GAME) || '{}'); all[g.bot] = g; localStorage.setItem(BOT_GAME, JSON.stringify(all)); } catch { /* */ } }
export function lastBotGame(bot: string): SavedBotGame | null { try { return JSON.parse(localStorage.getItem(BOT_GAME) || '{}')[bot] ?? null; } catch { return null; } }

// A review step opens the full Game Review for one game; this remembers which step that game is
// for, so the review page can finish the step and show the way back.
const PATH_REVIEW = 'cs_path_review';
export function setPathReview(gameId: number, key: string | null) { try { localStorage.setItem(PATH_REVIEW, JSON.stringify({ gameId, key, at: Date.now() })); } catch { /* */ } }
export function pathReviewFor(gameId: number): { key: string | null } | null {
  try { const v = JSON.parse(localStorage.getItem(PATH_REVIEW) || 'null'); return v && v.gameId === gameId && Date.now() - v.at < 86_400_000 ? { key: v.key } : null; } catch { return null; }
}
