// Kids videos for the Content Studio, made from the Chess for Kids worlds in the app
// (lib/kids/levels.ts): the same buddies (Rocky the Rook, Bea the Bishop...), the same
// friendly board with stars, bushes and plum pieces, and the same levels. Each video is
// a hook for parents, "pause and try", a 3-2-1, then the answer played out on the board.
import { Chess } from 'chess.js';
import {
  WORLDS, findWorld, reach, attacks, whyNot, PIECE_NAMES,
  type World, type Level, type PieceType, type Occupant, type ShapeKind,
} from '@/lib/kids/levels';
import type { BoardItem } from '@/components/kids/KidsBoard';
import type { Arrow } from '@/lib/learn/explain';

export type KidsVideo =
  | { kind: 'level'; world: string; level: string }
  | { kind: 'meet'; world: string }
  /** A countdown of every level in one world (Checkmate Castle, Check Mountain...). */
  | { kind: 'series'; world: string };

export interface KidsScene {
  /** Spoken, and shown in the buddy's bubble (unless `show` is set). */
  say?: string;
  show?: string;
  items: BoardItem[];
  dots?: string[]; found?: string[]; hint?: string[]; danger?: string | null; bounce?: string | null; arrows?: Arrow[];
  buddy: PieceType; mood?: 'happy' | 'wow' | 'sad';
  /** A big word over the board ("3", "CHECK!", "Checkmate!"). */
  big?: { text: string; color: string };
  card?: 'title' | 'end';
  /** The level's title chip over the board ("Number 2 · Queen mate"). */
  chip?: string;
  confetti?: boolean;
  sfx?: 'chime' | 'tick' | 'whoosh' | 'impact' | 'riser';
  /** No voice: this long. With a voice line: at least this long. */
  ms?: number;
}

export interface KidsScript {
  title: string; hook: string; sub: string; world: World; scenes: KidsScene[];
  fileBase: string; caption: string;
}

const NUM = ['zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const GOT = ['Got it!', 'Yes!', 'Another one!', 'Nice!', 'Got that one too!'];
const first = (buddy: string) => buddy.replace(/ the .*$/, '');
const SITE_SAY = 'Play this level and lots more, free, at ChessScout dot net slash kids. Follow for a new kids chess challenge every day!';

// ── Board helpers ──────────────────────────────────────────────────────────
function levelItems(l: Level): BoardItem[] {
  const out: BoardItem[] = [];
  (l.pieces ?? []).forEach((p, i) => out.push({ id: `p${i}`, sq: p.sq, piece: p }));
  (l.shapes ?? []).forEach((s, i) => out.push({ id: `s${i}`, sq: s.sq, shape: s.kind }));
  (l.bushes ?? []).forEach((b, i) => out.push({ id: `b${i}`, sq: b, bush: true }));
  return out;
}
function fenItems(fen: string): BoardItem[] {
  const out: BoardItem[] = [];
  new Chess(fen).board().forEach((row) => row.forEach((c) => {
    if (c) out.push({ id: `f-${c.square}`, sq: c.square, piece: { type: c.type as PieceType, side: c.color, sq: c.square } });
  }));
  return out;
}
const occupantOf = (items: BoardItem[], moverId: string, pawn: boolean) => (sq: string): Occupant => {
  const it = items.find((x) => x.sq === sq && x.id !== moverId);
  if (!it) return 'empty';
  if (it.bush) return 'friend';
  if (it.shape) return pawn ? 'empty' : 'shape';
  return it.piece?.side === 'w' ? 'friend' : 'enemy';
};
/** Moves the item with this id to `to`, removing anything it lands on. */
function moveItem(items: BoardItem[], id: string, to: string): BoardItem[] {
  return items.filter((x) => x.id === id || x.sq !== to).map((x) => (x.id === id ? { ...x, sq: to, piece: x.piece ? { ...x.piece, sq: to } : x.piece } : x));
}
const pauseScenes = (base: KidsScene): KidsScene[] => [
  { ...base, say: 'Pause the video and try it! Ready?', sfx: 'riser' },
  ...[3, 2, 1].map((n) => ({ ...base, say: undefined, big: { text: String(n), color: '#FF9F1C' }, sfx: 'tick' as const, ms: 900 })),
];

// ── One level, as scenes (no title or end card) ─────────────────────────────
function levelScenes(w: World, l: Level, chip?: string): KidsScene[] {
  const buddy = w.piece;
  if (l.kind === 'mate' && l.fen) {
    const items = fenItems(l.fen);
    const c = new Chess(l.fen);
    const mv = c.moves({ verbose: true }).find((m) => { c.move(m); const ok = c.isCheckmate(); c.undo(); return ok; });
    if (!mv) return [];
    const after = moveItem(items, `f-${mv.from}`, mv.to);
    const king = new Chess(mv.after).board().flat().find((x) => x?.type === 'k' && x.color === 'b')?.square ?? null;
    const base: KidsScene = { items, buddy, chip };
    return [
      { ...base, say: l.say, bounce: mv.from },
      ...pauseScenes(base),
      { ...base, items: after, arrows: [{ from: mv.from, to: mv.to, color: 'good' }], say: `${PIECE_NAMES[mv.piece as PieceType]} to ${mv.to}!`, sfx: 'whoosh' },
      { ...base, items: after, danger: king, mood: 'wow', big: { text: 'Checkmate!', color: '#E8459B' }, confetti: true, sfx: 'chime',
        say: 'Checkmate! The plum King is in check and has nowhere to go. You win!' },
    ];
  }
  const items = levelItems(l);
  const me = items.find((x) => x.piece?.side === 'w');
  if (!me?.piece) return [];
  const type = me.piece.type;
  const base: KidsScene = { items, buddy, chip };
  if (l.kind === 'tapAll') {
    const at = occupantOf(items, me.id, false);
    const r = reach(type, 'w', me.sq, at);
    const answers = items.filter((x) => (x.shape || x.piece?.side === 'b') && r.captures.has(x.sq)).map((x) => x.sq);
    const trick = items.find((x) => (x.shape || x.piece?.side === 'b') && !r.captures.has(x.sq));
    const out: KidsScene[] = [
      { ...base, say: l.say.replace(/\bTap\b/g, 'Find').replace(/\btap\b/g, 'find'), bounce: me.sq },
      ...pauseScenes(base),
      { ...base, dots: [...r.moves], bounce: me.sq, say: `Let's see! Here's everywhere the ${PIECE_NAMES[type]} can go.`, sfx: 'whoosh' },
    ];
    answers.forEach((sq, n) => out.push({ ...base, dots: [...r.moves], found: answers.slice(0, n + 1), say: `${NUM[n + 1] ?? n + 1}!`, sfx: 'chime', ms: 700 }));
    if (trick) out.push({ ...base, dots: [...r.moves], found: answers, hint: [trick.sq], say: whyNot(type, 'w', me.sq, trick.sq, at) });
    out.push({ ...base, dots: [...r.moves], found: answers, mood: 'wow', confetti: true, sfx: 'chime',
      big: { text: `${answers.length}!`, color: '#2FBF71' }, say: `That's ${answers.length === 1 ? 'one' : (NUM[answers.length] ?? String(answers.length)).toLowerCase()}! Did you find them all?` });
    return out;
  }
  if (l.kind === 'collect') {
    // The shortest route to the nearest star (or plum piece), again and again until none are left.
    let cur = items; const hops: { from: string; to: string; caught: boolean }[] = [];
    for (let guard = 0; guard < 12; guard++) {
      const goals = new Set(cur.filter((x) => x.shape || x.piece?.side === 'b').map((x) => x.sq));
      if (!goals.size) break;
      const from = cur.find((x) => x.id === me.id)!.sq;
      const at = occupantOf(cur, me.id, type === 'p');
      const prev = new Map<string, string>([[from, '']]); const q = [from]; let hit: string | null = null;
      while (q.length && !hit) {
        const s = q.shift()!;
        const rr = reach(type, 'w', s, (x) => (x === from ? 'empty' : at(x)));
        for (const t of rr.moves) {
          if (prev.has(t)) continue;
          prev.set(t, s);
          if (goals.has(t)) { hit = t; break; }
          if (at(t) === 'empty') q.push(t);
        }
      }
      if (!hit) break;
      const path: string[] = []; for (let s = hit; s !== from; s = prev.get(s)!) path.unshift(s);
      let f = from;
      for (const t of path) { hops.push({ from: f, to: t, caught: goals.has(t) }); cur = moveItem(cur, me.id, t); f = t; }
    }
    const out: KidsScene[] = [{ ...base, say: l.say, bounce: me.sq }, ...pauseScenes(base)];
    let now = items; let caught = 0; const total = hops.filter((h) => h.caught).length;
    hops.forEach((h, n) => {
      now = moveItem(now, me.id, h.to);
      const last = n === hops.length - 1;
      if (h.caught) caught++;
      out.push(last
        ? { ...base, items: now, arrows: [{ from: h.from, to: h.to, color: 'good' }], mood: 'wow', confetti: true, sfx: 'chime', big: { text: 'All caught!', color: '#2FBF71' },
            say: `All caught${hops.length > 1 ? ` in ${hops.length} moves` : ''}! Great job!` }
        : h.caught
          ? { ...base, items: now, arrows: [{ from: h.from, to: h.to, color: 'good' }], say: total > 1 ? GOT[(caught - 1) % GOT.length] : 'Got it!', sfx: 'chime', ms: 800 }
          : { ...base, items: now, arrows: [{ from: h.from, to: h.to, color: 'info' }], sfx: 'whoosh', ms: 850 });
    });
    return out;
  }
  if (l.kind === 'check') {
    const king = items.find((x) => x.piece?.type === 'k' && x.piece.side === 'b');
    if (!king) return [];
    const at = (sq: string): Occupant => (sq === king.sq ? 'friend' : occupantOf(items, me.id, false)(sq));
    const to = [...reach(type, 'w', me.sq, at).moves].find((t) => attacks(type, 'w', t, (s) => (s === king.sq || (s !== me.sq && items.some((x) => x.sq === s && x.id !== me.id)) ? 'enemy' : 'empty')).has(king.sq));
    if (!to) return [];
    const after = moveItem(items, me.id, to);
    return [
      { ...base, say: l.say, bounce: me.sq },
      ...pauseScenes(base),
      { ...base, items: after, arrows: [{ from: me.sq, to, color: 'good' }], say: `${PIECE_NAMES[type]} to ${to}!`, sfx: 'whoosh' },
      { ...base, items: after, danger: king.sq, mood: 'wow', confetti: true, sfx: 'impact', big: { text: 'CHECK!', color: '#FF6B3D' },
        say: 'Check! The plum King is under attack!' },
    ];
  }
  return [];
}

// ── Whole videos ───────────────────────────────────────────────────────────
const TAGS = '#chessforkids #kidschess #learnchess #chess #homeschool #kidsactivities #parenting';
const hookFor = (w: World, l: Level) => l.kind === 'collect' ? `Can your kid help ${first(w.buddy)} catch them all? ⭐`
  : l.kind === 'tapAll' ? `How many can ${first(w.buddy)} catch? 🤔`
  : l.kind === 'check' ? 'Can your kid find the check? 👑' : 'Can your kid find checkmate? 🏆';
const hookSay = (w: World, l: Level) => l.kind === 'collect' ? `Can your kid help ${first(w.buddy)} catch them all? Let's play!`
  : l.kind === 'tapAll' ? `How many can ${first(w.buddy)} catch in one move? Count them with me!`
  : l.kind === 'check' ? 'Can your kid find the check? Let\'s play!' : 'Can your kid find checkmate in one move? Let\'s play!';

function bookends(w: World, hook: string, say: string, sub: string, body: KidsScene[], firstItems: BoardItem[]): KidsScene[] {
  const all: KidsScene[] = [
    { card: 'title', say, show: hook, items: firstItems, buddy: w.piece, sfx: 'whoosh', ms: 1800 },
    ...body,
    { card: 'end', say: SITE_SAY, show: 'Play free at chessscout.net/kids 🎮', items: body[body.length - 1]?.items ?? firstItems, buddy: w.piece, mood: 'wow', sfx: 'chime' },
  ];
  return all.map((s) => ({ ...s, chip: s.chip ?? (s.card ? undefined : sub) }));
}

export function kidsScript(v: KidsVideo): KidsScript | null {
  const w = findWorld(v.world); if (!w) return null;
  if (v.kind === 'level') {
    const l = w.levels.find((x) => x.id === v.level); if (!l) return null;
    const body = levelScenes(w, l); if (!body.length) return null;
    const hook = hookFor(w, l);
    return { title: `${w.name} · ${l.title}`, hook, sub: `${w.buddy} · ${w.name}`, world: w,
      scenes: bookends(w, hook, hookSay(w, l), l.title, body, body[0].items), fileBase: `chessscout-kids-${w.id}-${l.id}`,
      caption: `${hook}\n\nPause and try it together, then watch the answer. 🧒♟️\nFree chess games for kids at chessscout.net/kids\n\n${TAGS}` };
  }
  if (v.kind === 'meet') {
    // The buddy alone in the middle (a pawn starts on its first square), every square it can reach, then two of its levels.
    const sq = w.piece === 'p' ? 'e2' : 'd4';
    const solo: BoardItem[] = [{ id: 'solo', sq, piece: { type: w.piece, side: 'w', sq } }];
    const dots = [...reach(w.piece, 'w', sq, () => 'empty').moves];
    const tap = w.levels.find((l) => l.kind === 'tapAll'), grab = [...w.levels].reverse().find((l) => l.kind === 'collect');
    const body: KidsScene[] = [
      { items: solo, buddy: w.piece, bounce: sq, say: `Hi! I'm ${w.buddy}! ${w.intro}` },
      { items: solo, buddy: w.piece, bounce: sq, dots, sfx: 'whoosh', say: `Look at all the squares I can reach from here. That's ${NUM[dots.length]?.toLowerCase() ?? dots.length}!` },
      ...(tap ? levelScenes(w, tap, tap.title) : []),
      ...(grab ? levelScenes(w, grab, grab.title) : []),
    ];
    const hook = `Meet ${w.buddy}! How does the ${PIECE_NAMES[w.piece]} move? ♟️`;
    return { title: `Meet ${w.buddy}`, hook, sub: w.name, world: w,
      scenes: bookends(w, hook, `Meet ${w.buddy}! Here's how the ${PIECE_NAMES[w.piece]} moves, in one minute.`, w.name, body, solo), fileBase: `chessscout-kids-meet-${w.id}`,
      caption: `${hook}\n\nLearn how the ${PIECE_NAMES[w.piece].toLowerCase()} moves in one minute, then play along. 🧒\nFree chess games for kids at chessscout.net/kids\n\n${TAGS}` };
  }
  const levels = w.levels.filter((l) => levelScenes(w, l).length);
  const body = levels.flatMap((l, n) => {
    const s = levelScenes(w, l, `Number ${n + 1} · ${l.title}`);
    return [{ ...s[0], say: `Number ${NUM[n + 1]?.toLowerCase() ?? n + 1}! ${s[0].say ?? ''}`.trim(), sfx: 'whoosh' as const }, ...s.slice(1)];
  });
  if (!body.length) return null;
  const what = w.id === 'mate' ? 'checkmates' : w.id === 'check' ? 'checks' : 'challenges';
  const hook = `${levels.length} ${what} for kids. How many can your kid find? 🧒`;
  return { title: `${w.name}: all ${levels.length}`, hook, sub: w.name, world: w,
    scenes: bookends(w, hook, `Here are ${levels.length} ${what} for kids. How many can your kid find? Keep score!`, w.name, body, body[0].items),
    fileBase: `chessscout-kids-${w.id}-all`,
    caption: `${hook}\n\nKeep score and comment how many you got! 👇\nFree chess games for kids at chessscout.net/kids\n\n${TAGS}` };
}

/** Every video the kids tab offers, world by world. */
export const KIDS_WORLDS = WORLDS;
export type { ShapeKind };
