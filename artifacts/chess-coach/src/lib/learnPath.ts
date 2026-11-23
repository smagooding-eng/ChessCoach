// The Learn Path: one level per practice bot, in the bots' order (each harder). A level is
// puzzles, a tactic, a lesson, an opening as White, an opening as Black and a trap, then a game
// against that level's bot. Your token is a pawn at level 1 and becomes a different piece each
// level. Progress is kept on this device and synced to the account.
//
// A step is started from the path (startStep); the page it opens reports what you did
// (pathEvent) and the step completes when the goal is reached.
import { BOTS, type BotConfig } from '@/lib/chess-bot';
import { MOTIFS } from '@/lib/tactics';
import { OPENINGS } from '@/lib/openings';
import { apiFetch } from '@/lib/api';

export type StepKind = 'puzzles' | 'tactic' | 'course' | 'opening' | 'trap' | 'bot';
export type Step = { key: string; kind: StepKind; title: string; sub: string; href: string; need: number; target?: string; icon: string };
export type Level = { n: number; bot: BotConfig; piece: string; pieceName: string; ring?: string; steps: Step[] };

// the token for each level (then the king, in bronze, silver, gold and emerald)
const TOKENS: { piece: string; name: string; ring?: string }[] = [
  { piece: 'P', name: 'Pawn' }, { piece: 'N', name: 'Knight' }, { piece: 'B', name: 'Bishop' }, { piece: 'R', name: 'Rook' },
  { piece: 'Q', name: 'Queen' }, { piece: 'K', name: 'King' }, { piece: 'K', name: 'Bronze King', ring: '#C7894B' },
  { piece: 'K', name: 'Silver King', ring: '#C9D1D3' }, { piece: 'K', name: 'Gold King', ring: '#F2B53A' }, { piece: 'K', name: 'Emerald King', ring: '#3CC3B0' },
];

// tactics from the basics outwards; openings alternate so each level has a new one per side
const TACTIC_ORDER = ['hanging', 'fork', 'mate-in-1', 'pin', 'skewer', 'back-rank', 'discovered', 'removing-defender', 'mate-in-2', 'deflection', 'sacrifice', 'double-check'];
const WHITE = OPENINGS.filter((o) => o.userColor === 'w');
const BLACK = OPENINGS.filter((o) => o.userColor === 'b');

export const LEVELS: Level[] = BOTS.map((bot, i) => {
  const n = i + 1;
  const tk = TOKENS[Math.min(i, TOKENS.length - 1)];
  const lo = Math.max(400, bot.rating - 200), hi = bot.rating + 150;
  const motif = MOTIFS.find((m) => m.id === TACTIC_ORDER[i % TACTIC_ORDER.length]) ?? MOTIFS[i % MOTIFS.length];
  const w = WHITE[i % Math.max(1, WHITE.length)], b = BLACK[i % Math.max(1, BLACK.length)];
  const trapLevel = bot.rating < 1000 ? 'beginner' : bot.rating < 1800 ? 'intermediate' : 'advanced';
  const k = (s: string) => `L${n}-${s}`;
  const steps: Step[] = [
    { key: k('puzzles'), kind: 'puzzles', title: 'Puzzles', sub: `Solve 5 rated ${lo}–${hi}`, href: `/puzzles?minRating=${lo}&maxRating=${hi}`, need: 5, icon: 'puzzles' },
    { key: k('tactic'), kind: 'tactic', title: motif?.name ?? 'Tactic', sub: 'Solve 3 of this tactic', href: `/tactics/${motif?.id ?? ''}`, need: 3, target: motif?.id, icon: 'tactics' },
    { key: k('course'), kind: 'course', title: 'Lesson', sub: bot.rating <= 1000 ? 'The next lesson in Learn to Play' : 'A lesson from your courses', href: bot.rating <= 1000 ? '/beginner' : '/courses', need: 1, icon: 'courses' },
    ...(w ? [{ key: k('white'), kind: 'opening' as const, title: w.name.split(' (')[0], sub: 'Opening as White: play the line', href: `/practice?tab=openings&eco=${encodeURIComponent(w.eco)}`, need: 1, target: w.id, icon: 'openings' }] : []),
    ...(b ? [{ key: k('black'), kind: 'opening' as const, title: b.name.split(' — ')[0], sub: 'Opening as Black: play the line', href: `/practice?tab=openings&eco=${encodeURIComponent(b.eco)}`, need: 1, target: b.id, icon: 'openings' }] : []),
    { key: k('trap'), kind: 'trap', title: 'A trap', sub: `Learn a ${trapLevel} trap`, href: `/traps?level=${trapLevel}`, need: 1, icon: 'traps' },
    { key: k('bot'), kind: 'bot', title: `Beat ${bot.name}`, sub: `Rated about ${bot.rating}`, href: `/practice?bot=${encodeURIComponent(bot.name)}`, need: 1, target: bot.name, icon: 'bots' },
  ];
  return { n, bot, piece: tk.piece, pieceName: tk.name, ring: tk.ring, steps };
});

// ── progress ─────────────────────────────────────────────────────────────────
const KEY = 'cs_learn_path_v1';
const ACTIVE = 'cs_path_active';
const EVT = 'cs:learn-path';
export type PathState = { done: Record<string, number> };
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

type Active = { key: string; kind: StepKind; target?: string; need: number; count: number };
export function startStep(step: Step) {
  try { sessionStorage.setItem(ACTIVE, JSON.stringify({ key: step.key, kind: step.kind, target: step.target, need: step.need, count: 0 } satisfies Active)); } catch { /* */ }
}
export function activeStep(): Active | null { try { return JSON.parse(sessionStorage.getItem(ACTIVE) || 'null'); } catch { return null; } }

/** Pages call this when the member does something a path step may be waiting for. */
export function pathEvent(kind: StepKind, target?: string) {
  const a = activeStep();
  if (!a || a.kind !== kind) return;
  if (a.target && target && a.target !== target) return;
  a.count++;
  if (a.count < a.need) { try { sessionStorage.setItem(ACTIVE, JSON.stringify(a)); } catch { /* */ } window.dispatchEvent(new CustomEvent('cs:path-progress', { detail: a })); return; }
  try { sessionStorage.removeItem(ACTIVE); } catch { /* */ }
  const s = readPath();
  if (!s.done[a.key]) { s.done[a.key] = Date.now(); writePath(s); saveStep(a.key); }
  window.dispatchEvent(new CustomEvent('cs:path-step-done', { detail: a }));
}
