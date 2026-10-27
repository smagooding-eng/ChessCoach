import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Chess } from 'chess.js';
import { X, Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Shuffle, Video, Square, Eye, EyeOff, FlipVertical2, Trash2, Copy, SkipForward, SkipBack, Mic, Image as ImageIcon } from 'lucide-react';
import { ChessBoard, type MoveQuality } from '@/components/ChessBoard';
import { LookOverride, randomLook, lookLabel, playMoveSound, BOARD_THEMES, type BoardLook } from '@/context/SettingsContext';
import { apiFetch } from '@/lib/api';
import { normalizeFen } from '@/lib/utils';

// Content Studio player: a game moment or a trap lesson as a 9:16 clip for
// TikTok, Reels and Shorts. The clip is a script of frames: an intro with the
// hook, the moves leading up, a "can you find it?" countdown, the key move
// (badge pop, eval swing, confetti or shake), optionally the engine's better
// line, the moves after, a rating reveal and an end card. Every frame can get
// a new random board and piece set. Stickers drag anywhere. "Record clip"
// captures just the frame (Chrome on a computer); on a phone, "Clean view"
// hides everything but the frame for the screen recorder.

export interface StudioMoment {
  gameId: number; moveIndex: number; tags: string[]; classification: string | null; san: string;
  trapName: string | null; opening: string | null; white: string | null; black: string | null;
  whiteRating: number | null; blackRating: number | null; platform: string | null;
}
export interface StudioTrap {
  id: number; name: string; category: string; difficulty: string; trapSide: string; summary: string;
  startingFen: string; moves: string[]; notes: string[]; critical: number;
}
export type StudioSource = { kind: 'game'; moment: StudioMoment } | { kind: 'trap'; trap: StudioTrap };

interface ReviewMove { moveIndex?: number; san: string; color?: 'white' | 'black'; classification?: string; explanation?: string; betterMove?: string | null; evalAfterCp?: number; fen?: string; bestLineSan?: string[] }
interface StudioGame { id: number; pgn: string; opening: string | null; white: string; black: string; whiteRating: number | null; blackRating: number | null; moves: ReviewMove[] }
interface Ply { san: string; from: string; to: string; fen: string; fenBefore: string; color: 'w' | 'b'; review?: ReviewMove }
interface Sticker { id: number; text: string; x: number; y: number; size: number; kind: 'emoji' | 'text' }
interface Clip {
  plies: Ply[]; key: number; tags: string[]; hook: string; sub: string; names: { w: string | null; b: string | null };
  ratings: { w: number | null; b: number | null }; fileBase: string; label: string; isTrap: boolean; opening: string | null;
}
type Frame =
  | { kind: 'intro'; fen: string }
  | { kind: 'move'; ply: number }
  | { kind: 'countdown'; n: number; fen: string; last: { from: string; to: string } | null }
  | { kind: 'better'; fen: string; last: { from: string; to: string } | null; arrow: { from: string; to: string } | null; text: string }
  | { kind: 'reveal'; fen: string }
  | { kind: 'split'; played: { fen: string; last: { from: string; to: string } }; better: { fen: string; last: { from: string; to: string } }; playedSan: string; betterSan: string }
  | { kind: 'title'; fen: string }
  | { kind: 'outro'; fen: string };

const LABEL: Record<string, { text: string; color: string; glyph: string }> = {
  brilliant: { text: 'BRILLIANT', color: '#1BACA6', glyph: '!!' }, great: { text: 'GREAT MOVE', color: '#4A8BD6', glyph: '!' },
  best: { text: 'BEST', color: '#5FA83A', glyph: '★' }, excellent: { text: 'EXCELLENT', color: '#7DB94A', glyph: '!' },
  good: { text: 'GOOD', color: '#8AA86E', glyph: '✓' }, book: { text: 'BOOK', color: '#A88865', glyph: '📖' },
  inaccuracy: { text: 'INACCURACY', color: '#E3AE2A', glyph: '?!' }, mistake: { text: 'MISTAKE', color: '#E5822A', glyph: '?' },
  blunder: { text: 'BLUNDER', color: '#CA3431', glyph: '??' }, missed_win: { text: 'MISSED WIN', color: '#B8343E', glyph: '✗' },
  checkmate: { text: 'CHECKMATE', color: '#E8B447', glyph: '#' },
};
const BAD = new Set(['inaccuracy', 'mistake', 'blunder', 'missed_win']);
const BACKGROUNDS: Record<string, { label: string; css: React.CSSProperties }> = {
  green: { label: 'ChessScout', css: { background: 'radial-gradient(120% 80% at 50% 0%, #2E4A1E 0%, #0E1A0C 60%, #070B06 100%)' } },
  dark: { label: 'Dark', css: { background: '#0B1112' } },
  purple: { label: 'Purple', css: { background: 'linear-gradient(160deg, #2A1446 0%, #0F0A1F 100%)' } },
  sunset: { label: 'Sunset', css: { background: 'linear-gradient(170deg, #4A1E14 0%, #1A0B10 70%)' } },
  ocean: { label: 'Ocean', css: { background: 'linear-gradient(170deg, #0F3B57 0%, #06131D 75%)' } },
  gold: { label: 'Gold', css: { background: 'radial-gradient(120% 80% at 50% 0%, #5A4410 0%, #1A1406 65%, #0B0903 100%)' } },
  screen: { label: 'Green screen', css: { background: '#00FF00' } },
};
const EMOJIS = ['🔥', '😱', '🤯', '🧠', '👀', '💀', '🏆', '♟️', '⚡', '🎯', '😂', '🤔', '🍿', '😤', '👑', '💥'];
const TEXT_STICKERS = ['BRILLIANT!!', 'BLUNDER??', 'WAIT FOR IT…', 'NO WAY', 'GG', 'FIND THE MOVE', 'TRAP!', 'MATE', 'PAUSE NOW', 'COMMENT YOUR MOVE'];

// ── Preferences that carry over between clips (this browser only) ─────────
const PREF_KEY = 'cs_studio_prefs_v1';
const DEFAULT_PREFS = {
  before: 8, after: 5, speed: 1.2, guess: true, remix: true, captions: true, effects: true, arrow: true, sound: true, watermark: true,
  bg: 'green', betterLine: true, guessRating: false, outro: true, progress: true, intro: true, safeArea: true, showNames: false,
  handle: '@chessscout.net3', outroLine: 'Review your games free',
  split: true, voice: false, voiceName: 'onyx', compTitle: 'Top moments this week',
};
type Prefs = typeof DEFAULT_PREFS;
function loadPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return DEFAULT_PREFS; }
}

function hookForTags(tags: string[], trapName: string | null): string {
  if (tags.includes('trap') && trapName) return `The ${trapName} 🪤`;
  if (tags.includes('brilliant')) return 'Find the brilliant move 🔥';
  if (tags.includes('checkmate')) return 'How fast can you see the mate? ♟️';
  if (tags.includes('sacrifice')) return 'Would you give this up? 😳';
  if (tags.includes('fork')) return 'The fork nobody saw coming 🍴';
  if (tags.includes('skewer') || tags.includes('pin')) return 'Pinned and punished 📌';
  if (tags.includes('missed_win')) return 'One move from winning… 😩';
  if (tags.includes('blunder')) return 'One move ruined everything 😱';
  return 'Watch this 👀';
}

function playSans(startFen: string | undefined, sans: string[], reviews: (ReviewMove | undefined)[]): Ply[] {
  const out: Ply[] = [];
  try {
    const c = startFen ? new Chess(startFen) : new Chess();
    sans.forEach((san, i) => {
      const fenBefore = c.fen();
      const m = c.move(san);
      if (!m) throw new Error('bad move');
      out.push({ san: m.san, from: m.from, to: m.to, fen: c.fen(), fenBefore, color: m.color as 'w' | 'b', review: reviews[i] });
    });
  } catch { /* keep the moves that played */ }
  return out;
}

function gameClip(g: StudioGame, m: StudioMoment): Clip {
  const fenTag = g.pgn?.match(/\[FEN "([^"]+)"\]/)?.[1];
  const startFen = g.moves[0]?.fen ?? (fenTag ? normalizeFen(fenTag) : undefined);
  const sans = g.moves.length
    ? g.moves.map((x) => x.san)
    : (g.pgn ?? '').replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').split(/\s+/)
        .map((t) => t.replace(/^\d+\.+/, '')).filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  return {
    plies: playSans(startFen, sans, g.moves), key: m.moveIndex, tags: m.tags, hook: hookForTags(m.tags, m.trapName), sub: m.opening ?? '',
    names: { w: m.white, b: m.black }, ratings: { w: m.whiteRating, b: m.blackRating }, fileBase: `chessscout-${m.gameId}-${m.moveIndex}`,
    label: `Game #${m.gameId} · move ${m.moveIndex + 1}`, isTrap: false, opening: m.opening,
  };
}

function trapClip(t: StudioTrap): Clip {
  // The punishing move after the victim's mistake is the one to find.
  const key = Math.min(t.moves.length - 1, t.critical + 1);
  const reviews: ReviewMove[] = t.moves.map((san, i) => ({
    san, explanation: t.notes[i] ?? '',
    classification: san.includes('#') ? 'checkmate' : i === t.critical ? 'blunder' : i === key ? 'great' : i < t.critical ? 'book' : 'best',
  }));
  const start = t.startingFen && t.startingFen !== 'startpos' ? t.startingFen : undefined;
  return {
    plies: playSans(start, t.moves, reviews), key, tags: ['trap', ...(t.moves.some((s) => s.includes('#')) ? ['checkmate'] : [])],
    hook: `The ${t.name} 🪤`, sub: t.summary, names: { w: null, b: null }, ratings: { w: null, b: null },
    fileBase: `chessscout-trap-${t.id}`, label: `Trap lesson · ${t.name}`, isTrap: true, opening: t.category,
  };
}

function figurine(san: string, white: boolean): string {
  const map: Record<string, string> = white ? { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' } : { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' };
  return san.replace(/^[KQRBN]/, (p) => map[p] ?? p);
}
const fmtEval = (cp: number | null | undefined) => cp == null ? '' : Math.abs(cp) >= 9000 ? `${cp > 0 ? '+' : '−'}M${Math.max(1, 10000 - Math.abs(cp))}` : `${cp >= 0 ? '+' : '−'}${Math.abs(cp / 100).toFixed(1)}`;

function hashtagsFor(clip: Clip): string {
  const t = new Set(['#chess', '#chesstok', '#chessscout']);
  if (clip.tags.includes('brilliant')) { t.add('#brilliantmove'); t.add('#chesspuzzle'); }
  if (clip.tags.includes('trap')) { t.add('#chesstrap'); t.add('#chessopenings'); }
  if (clip.tags.includes('checkmate')) t.add('#checkmate');
  if (clip.tags.some((x) => ['fork', 'pin', 'skewer', 'discovered', 'sacrifice'].includes(x))) t.add('#chesstactics');
  if (clip.tags.includes('blunder') || clip.tags.includes('missed_win')) t.add('#chessblunder');
  if (clip.tags.includes('endgame')) t.add('#chessendgame');
  const op = (clip.opening ?? '').split(/[:,]/)[0].replace(/[^A-Za-z ]/g, '').trim();
  if (op) t.add('#' + op.replace(/\s+/g, '').toLowerCase());
  t.add('#chessgame');
  return [...t].join(' ');
}

const PIECE_WORD: Record<string, string> = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' };
/** "Nxe5+" -> "Knight takes e5, check". */
function spokenSan(san: string): string {
  if (san.startsWith('O-O-O')) return 'castles queenside';
  if (san.startsWith('O-O')) return 'castles';
  const m = san.match(/^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(=([QRBN]))?([+#])?/);
  if (!m) return san;
  const piece = m[1] ? PIECE_WORD[m[1]] : m[4] && m[2] ? `${m[2]} pawn` : 'Pawn';
  let out = `${piece} ${m[4] ? 'takes ' : 'to '}${m[5]}`;
  if (m[7]) out += `, promotes to a ${PIECE_WORD[m[7]].toLowerCase()}`;
  if (m[8] === '#') out += ', checkmate!'; else if (m[8] === '+') out += ', check';
  return out;
}
const stripEmoji = (t: string) => t.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();

/** A 1080×1920 cover image (board drawn with piece glyphs) for the post's thumbnail. */
function drawCover(opts: { fen: string; flipped: boolean; hook: string; sub: string; bg: string; badge: { text: string; color: string } | null; colors: { light: string; dark: string } }): string {
  const W = 1080, H = 1920;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const BG: Record<string, [string, string]> = { green: ['#2E4A1E', '#070B06'], dark: ['#0B1112', '#0B1112'], purple: ['#2A1446', '#0F0A1F'], sunset: ['#4A1E14', '#1A0B10'], ocean: ['#0F3B57', '#06131D'], gold: ['#5A4410', '#0B0903'], screen: ['#00FF00', '#00FF00'] };
  const [a, b] = BG[opts.bg] ?? BG.green;
  g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.font = '900 92px system-ui, -apple-system, Segoe UI, sans-serif';
  const words = opts.hook.split(' '); const lines: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > W - 140 && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  lines.slice(0, 3).forEach((l, k) => { ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 24; ctx.fillText(l, W / 2, 230 + k * 104); });
  ctx.shadowBlur = 0;
  if (opts.sub) { ctx.font = '700 44px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(opts.sub.slice(0, 48), W / 2, 230 + Math.min(3, lines.length) * 104 + 20); }
  const size = 960, x0 = 60, y0 = 640, sq = size / 8;
  const rows = opts.fen.split(' ')[0].split('/');
  const GL: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟', K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    ctx.fillStyle = (r + f) % 2 === 0 ? opts.colors.light : opts.colors.dark;
    ctx.fillRect(x0 + f * sq, y0 + r * sq, sq, sq);
  }
  ctx.textBaseline = 'middle';
  rows.forEach((row, ri) => {
    let fi = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { fi += Number(ch); continue; }
      const r = opts.flipped ? 7 - ri : ri, f = opts.flipped ? 7 - fi : fi;
      const white = ch === ch.toUpperCase();
      ctx.font = `${sq * 0.86}px "Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", serif`;
      ctx.lineWidth = 6; ctx.strokeStyle = white ? '#1a1a1a' : '#f5f5f5';
      ctx.strokeText(GL[ch], x0 + f * sq + sq / 2, y0 + r * sq + sq / 2 + 4);
      ctx.fillStyle = white ? '#FAFAFA' : '#151515';
      ctx.fillText(GL[ch], x0 + f * sq + sq / 2, y0 + r * sq + sq / 2 + 4);
      fi++;
    }
  });
  if (opts.badge) {
    ctx.font = '900 84px system-ui, sans-serif';
    const tw = ctx.measureText(opts.badge.text).width + 80;
    ctx.save(); ctx.translate(W / 2, y0 + size / 2); ctx.rotate(-0.07);
    ctx.fillStyle = opts.badge.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 10;
    ctx.beginPath(); (ctx as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(-tw / 2, -70, tw, 140, 28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(opts.badge.text, 0, 6); ctx.restore();
  }
  ctx.textBaseline = 'alphabetic'; ctx.font = '900 46px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillText('chessscout.net', W / 2, H - 90);
  return cv.toDataURL('image/png');
}

function Confetti({ fire }: { fire: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!fire) return;
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const W = (cv.width = cv.offsetWidth * 2), H = (cv.height = cv.offsetHeight * 2);
    const colors = ['#81B64C', '#E8B447', '#1BACA6', '#FFFFFF', '#F0605D', '#4A8BD6'];
    const parts = Array.from({ length: 170 }, () => ({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.45, vx: (Math.random() - 0.5) * 26, vy: -Math.random() * 30 - 10, r: Math.random() * 10 + 6, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6 }));
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) { p.vy += 1.1; p.x += p.vx; p.y += p.vy; p.a += 0.15; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }
      if (t - t0 < 2600) raf = requestAnimationFrame(step); else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [fire]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 z-30 h-full w-full" />;
}

export function StudioPlayer({ source, queue, onClose, onNext, onPrev }: {
  source: StudioSource;
  /** A compilation: these clips play back to back (one recording), with a title card first and the end card last. */
  queue?: StudioSource[];
  onClose: () => void; onNext?: () => void; onPrev?: () => void;
}) {
  const isComp = !!queue && queue.length > 1;
  const [q, setQ] = useState(0);
  const current = isComp ? queue![q] : source;
  // Which queue slot the loaded clip belongs to (it changes only once that clip has loaded).
  const [clipQ, setClipQ] = useState(0);
  const isFirst = !isComp || clipQ === 0, isLast = !isComp || clipQ === queue!.length - 1;
  const autoNext = useRef(false);
  // ── Load the clip ───────────────────────────────────────────────────────
  const [clip, setClip] = useState<Clip | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setErr(null);
    const slot = q;
    if (current.kind === 'trap') { setClip(trapClip(current.trap)); setClipQ(slot); return; }
    const m = current.moment;
    apiFetch(`/api/admin/studio/game/${m.gameId}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Game not found'))))
      .then((g: StudioGame) => { setClip(gameClip(g, m)); setClipQ(slot); }).catch((e) => setErr(String(e?.message ?? e)));
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Settings (remembered between clips) ─────────────────────────────────
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => { const n = { ...p, [k]: v }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const [hook, setHook] = useState('');
  const [sub, setSub] = useState('');
  const [fixedLook, setFixedLook] = useState<BoardLook | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [clean, setClean] = useState(false);
  useEffect(() => {
    if (!clip) return;
    setHook(isComp ? `#${queue!.length - clipQ} · ${stripEmoji(clip.hook)}` : clip.hook); setSub(clip.sub);
    setFlipped(clip.plies[clip.key]?.color === 'b');
  }, [clip, clipQ]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The script ──────────────────────────────────────────────────────────
  const frames = useMemo<Frame[]>(() => {
    if (!clip || !clip.plies.length) return [];
    const { plies, key } = clip;
    const keyPly = key + 1;
    const startPly = Math.max(0, keyPly - 1 - prefs.before);
    const endPly = Math.min(plies.length, keyPly + prefs.after);
    const fenAt = (p: number) => (p <= 0 ? plies[0].fenBefore : plies[p - 1].fen);
    const lastAt = (p: number) => (p <= 0 ? null : { from: plies[p - 1].from, to: plies[p - 1].to });
    const out: Frame[] = [];
    if (isComp && isFirst) out.push({ kind: 'title', fen: fenAt(startPly) });
    if (prefs.intro) out.push({ kind: 'intro', fen: fenAt(startPly) });
    else out.push({ kind: 'move', ply: startPly });
    for (let p = startPly + 1; p < keyPly; p++) out.push({ kind: 'move', ply: p });
    if (prefs.guess) for (const n of [3, 2, 1]) out.push({ kind: 'countdown', n, fen: fenAt(keyPly - 1), last: lastAt(keyPly - 1) });
    out.push({ kind: 'move', ply: keyPly });
    // The engine's better line after a mistake.
    const kr = plies[key]?.review;
    // Side by side: the move played and the better move.
    if (prefs.split && kr?.classification && BAD.has(kr.classification) && kr.betterMove) {
      try {
        const c = new Chess(plies[key].fenBefore); const bm = c.move(kr.betterMove);
        if (bm) out.push({ kind: 'split', played: { fen: plies[key].fen, last: { from: plies[key].from, to: plies[key].to } }, better: { fen: c.fen(), last: { from: bm.from, to: bm.to } }, playedSan: plies[key].san, betterSan: bm.san });
      } catch { /* skip */ }
    }
    if (prefs.betterLine && kr?.classification && BAD.has(kr.classification)) {
      const line = kr.bestLineSan?.length ? kr.bestLineSan : kr.betterMove ? [kr.betterMove] : [];
      if (line.length) {
        try {
          const c = new Chess(plies[key].fenBefore);
          const first = new Chess(plies[key].fenBefore).move(line[0]);
          out.push({ kind: 'better', fen: c.fen(), last: null, arrow: first ? { from: first.from, to: first.to } : null, text: `Better was ${line[0]}` });
          for (const san of line.slice(0, 4)) {
            const mv = c.move(san); if (!mv) break;
            out.push({ kind: 'better', fen: c.fen(), last: { from: mv.from, to: mv.to }, arrow: null, text: `Engine line · ${san}` });
          }
        } catch { /* skip a line that doesn't play */ }
      }
    }
    for (let p = keyPly + 1; p <= endPly; p++) out.push({ kind: 'move', ply: p });
    const lastFen = fenAt(endPly);
    if (prefs.guessRating && !clip.isTrap && (clip.ratings.w || clip.ratings.b)) out.push({ kind: 'reveal', fen: lastFen });
    if (prefs.outro && isLast) out.push({ kind: 'outro', fen: lastFen });
    return out;
  }, [clip, prefs.before, prefs.after, prefs.intro, prefs.guess, prefs.betterLine, prefs.guessRating, prefs.outro, prefs.split, isComp, isFirst, isLast]);

  const dur = (f: Frame) => {
    const base = baseDur(f);
    const said = prefs.voice ? narration(f) : null;
    const len = said ? voiceLen.current.get(said) : undefined;
    return len ? Math.max(base, len * 1000 + 300) : base;
  };
  const baseDur = (f: Frame) => {
    const s = prefs.speed * 1000;
    switch (f.kind) {
      case 'intro': return 1600;
      case 'countdown': return 1000;
      case 'better': return Math.max(s, 1300);
      case 'reveal': return 2400;
      case 'split': return 3200;
      case 'title': return 2200;
      case 'outro': return 2800;
      default: return clip && f.ply === clip.key + 1 ? Math.max(s, 2400) : s;
    }
  };

  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pop, setPop] = useState<{ cls: string; at: number } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [shake, setShake] = useState(0);
  const looks = useRef(new Map<number, BoardLook>());
  useEffect(() => { setI(0); looks.current.clear(); if (autoNext.current) { autoNext.current = false; setPlaying(true); } else setPlaying(false); }, [frames]);

  const frame: Frame | undefined = frames[i];
  const plies = clip?.plies ?? [];
  const keyPly = (clip?.key ?? 0) + 1;
  // What the board shows for this frame.
  const view = useMemo(() => {
    if (!frame || !plies.length) return null;
    if (frame.kind === 'move') {
      const p = frame.ply; const m = p > 0 ? plies[p - 1] : null;
      return { fen: m ? m.fen : plies[0].fenBefore, last: m ? { from: m.from, to: m.to } : null, ply: p, move: m };
    }
    if (frame.kind === 'split') return { fen: frame.played.fen, last: frame.played.last, ply: -3, move: null as Ply | null };
    const fen = frame.fen;
    const last = frame.kind === 'countdown' || frame.kind === 'better' ? frame.last : null;
    const ply = frame.kind === 'countdown' ? keyPly - 1 : frame.kind === 'intro' ? -1 : -2;
    return { fen, last, ply, move: null as Ply | null };
  }, [frame, plies, keyPly]);

  const look: BoardLook | null = prefs.remix ? (looks.current.get(i) ?? (() => { const l = randomLook(); looks.current.set(i, l); return l; })()) : fixedLook;
  const cur = view?.move ?? null;
  const rev = cur?.review;
  const cls = cur ? ((cur.san.includes('#') ? 'checkmate' : rev?.classification) ?? null) : null;
  const isKey = frame?.kind === 'move' && frame.ply === keyPly;
  const prevEval = isKey && keyPly >= 2 ? plies[keyPly - 2]?.review?.evalAfterCp : null;

  // Effects when a frame starts.
  useEffect(() => {
    if (!frame) return;
    // A badge only stays up for its own move.
    setPop(null);
    if (frame.kind === 'move' && cur && i > 0) {
      if (prefs.sound) playMoveSound(cur.san.includes('#') || cur.san.includes('+') ? 'check' : cur.san.startsWith('O-O') ? 'castle' : cur.san.includes('=') ? 'promote' : cur.san.includes('x') ? 'capture' : 'move');
      if (prefs.effects && cls && (isKey || ['brilliant', 'great', 'blunder', 'missed_win', 'checkmate'].includes(cls))) {
        setPop({ cls, at: Date.now() });
        if (cls === 'brilliant' || cls === 'great' || cls === 'checkmate') setConfetti(Date.now());
        if (cls === 'blunder' || cls === 'missed_win') setShake(Date.now());
      }
    }
    if (frame.kind === 'better' && frame.last && prefs.sound) playMoveSound('move');
    if (frame.kind === 'countdown' && prefs.sound && frame.n === 3) playMoveSound('check');
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing || !frame) return;
    if (i >= frames.length - 1) {
      const t = setTimeout(() => {
        if (isComp && !isLast) { autoNext.current = true; setQ((x) => x + 1); } else setPlaying(false);
      }, dur(frame));
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setI((x) => x + 1), dur(frame));
    return () => clearTimeout(t);
  }, [playing, i, frames.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voiceover: the coach voice reads the hook, the key move and the end card ─
  const voiceLen = useRef(new Map<string, number>());
  const voiceUrl = useRef(new Map<string, string>());
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [, setVoiceTick] = useState(0);
  const narration = (f: Frame | undefined): string | null => {
    if (!f || !clip) return null;
    switch (f.kind) {
      case 'title': return stripEmoji(prefs.compTitle);
      case 'intro': return stripEmoji(hook.replace(/^#\d+ · /, ''));
      case 'countdown': return f.n === 3 ? (clip.isTrap ? 'Can you spot the winning move?' : 'Can you find the move?') : null;
      case 'move': {
        if (f.ply !== clip.key + 1) return null;
        const m = clip.plies[clip.key]; const c = m.san.includes('#') ? 'checkmate' : m.review?.classification;
        const word = c && LABEL[c] && c !== 'checkmate' ? `${LABEL[c].text.toLowerCase()}! ` : '';
        const cap = prefs.captions && m.review?.explanation ? ` ${m.review.explanation}` : '';
        return `${word}${spokenSan(m.san)}.${cap}`.slice(0, 400);
      }
      case 'split': return `${spokenSan(f.playedSan)} was played. ${spokenSan(f.betterSan)} was better.`;
      case 'better': return f.arrow ? `Better was ${spokenSan(f.text.replace(/^Better was /, ''))}.` : null;
      case 'reveal': return clip.ratings.w && clip.ratings.b ? `They were rated ${clip.ratings.w} and ${clip.ratings.b}.` : null;
      case 'outro': return `${stripEmoji(prefs.outroLine)}. Follow for more.`;
      default: return null;
    }
  };
  // Fetch every line of the script once, ahead of playback.
  useEffect(() => {
    if (!prefs.voice || !frames.length) return;
    let live = true;
    const lines = [...new Set(frames.map(narration).filter((x): x is string => !!x))];
    Promise.all(lines.filter((t) => !voiceUrl.current.has(t)).map(async (t) => {
      const r = await apiFetch('/api/tts/speak', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, voice: prefs.voiceName }) });
      if (!r.ok) throw new Error('tts');
      const url = URL.createObjectURL(await r.blob());
      voiceUrl.current.set(t, url);
      await new Promise<void>((res) => { const a = new Audio(url); a.onloadedmetadata = () => { voiceLen.current.set(t, a.duration || 0); res(); }; a.onerror = () => res(); });
    })).then(() => { if (live) { setVoiceNote(null); setVoiceTick((x) => x + 1); } })
      .catch(() => { if (live) setVoiceNote("The coach voice isn't available right now (it uses OpenAI). Previews use your browser's voice, which won't be in the recording."); });
    return () => { live = false; };
  }, [prefs.voice, prefs.voiceName, frames, hook, prefs.outroLine, prefs.compTitle, prefs.captions]); // eslint-disable-line react-hooks/exhaustive-deps
  const voiceAudio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!prefs.voice || !playing) return;
    const said = narration(frame);
    if (!said) return;
    voiceAudio.current?.pause();
    const url = voiceUrl.current.get(said);
    if (url) { const a = new Audio(url); voiceAudio.current = a; a.play().catch(() => {}); }
    else if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(said)); }
  }, [i, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const restart = () => {
    looks.current.clear();
    if (isComp && q !== 0) { autoNext.current = true; setQ(0); return; }
    setI(0); setPlaying(true);
  };

  // ── Stickers ────────────────────────────────────────────────────────────
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const addSticker = (text: string, kind: Sticker['kind']) => {
    const id = Date.now();
    setStickers((s) => [...s, { id, text, kind, x: 50, y: kind === 'emoji' ? 30 : 22, size: kind === 'emoji' ? 12 : 6 }]);
    setSelected(id);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; const fr = frameRef.current?.getBoundingClientRect();
    if (!d || !fr) return;
    const x = ((e.clientX - fr.left) / fr.width) * 100 - d.dx, y = ((e.clientY - fr.top) / fr.height) * 100 - d.dy;
    setStickers((s) => s.map((st) => (st.id === d.id ? { ...st, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) } : st)));
  };

  // ── Recording (Chrome on a computer: just the frame) ────────────────────
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const [recNote, setRecNote] = useState<string | null>(null);
  const record = async () => {
    if (recording) { recRef.current?.stop(); return; }
    setRecNote(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include' } as DisplayMediaStreamOptions);
      const [track] = stream.getVideoTracks();
      const CT = (window as unknown as { CropTarget?: { fromElement: (el: Element) => Promise<unknown> } }).CropTarget;
      if (CT && frameRef.current && 'cropTo' in track) await (track as unknown as { cropTo: (t: unknown) => Promise<void> }).cropTo(await CT.fromElement(frameRef.current));
      else setRecNote('This browser records the whole tab; crop to the frame when you edit.');
      const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 12_000_000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: type || 'video/webm' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${clip?.fileBase ?? 'chessscout-clip'}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      };
      track.addEventListener('ended', () => { if (rec.state !== 'inactive') rec.stop(); });
      recRef.current = rec;
      setSelected(null);
      rec.start(250);
      setRecording(true);
      setTimeout(restart, 600);
    } catch {
      setRecNote('Recording needs Chrome on a computer. On a phone, use "Clean view" and your screen recorder.');
    }
  };
  // Stop a recording when the clip ends.
  useEffect(() => {
    if (!recording || playing || i < frames.length - 1 || !isLast) return;
    const t = setTimeout(() => recRef.current?.state === 'recording' && recRef.current.stop(), 400);
    return () => clearTimeout(t);
  }, [recording, playing, i, frames.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') { if (clean) setClean(false); else onClose(); }
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === 'ArrowRight') setI((x) => Math.min(frames.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
      if (e.key.toLowerCase() === 'n' && onNext) onNext();
      if (e.key.toLowerCase() === 'p' && onPrev) onPrev();
      if (e.key.toLowerCase() === 'r') restart();
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) setStickers((s) => s.filter((x) => x.id !== selected));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [clean, onClose, onNext, onPrev, frames.length, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Presets ─────────────────────────────────────────────────────────────
  const PRESETS: { label: string; v: Partial<Prefs> }[] = [
    { label: 'Find the move', v: { before: 6, after: 3, speed: 1.1, guess: true, betterLine: true, split: false, intro: true, captions: true } },
    { label: 'Blunder fail', v: { before: 5, after: 2, speed: 1.0, guess: false, betterLine: true, split: true, effects: true, intro: true } },
    { label: 'Trap tutorial', v: { before: 30, after: 4, speed: 1.6, guess: true, captions: true, betterLine: false, split: false, intro: true } },
    { label: 'Speedrun', v: { before: 400, after: 400, speed: 0.35, guess: false, captions: false, betterLine: false, split: false, intro: true } },
    { label: 'Guess the rating', v: { before: 10, after: 6, speed: 0.9, guess: false, guessRating: true, captions: false } },
  ];
  const applyPreset = (v: Partial<Prefs>) => setPrefs((p) => { const n = { ...p, ...v }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const saveCover = () => {
    if (!clip) return;
    const kp = clip.plies[clip.key];
    const c = kp ? (kp.san.includes('#') ? 'checkmate' : kp.review?.classification) : null;
    // The position before the key move (the puzzle), unless it's a trap lesson's final position.
    const fen = kp ? kp.fenBefore : clip.plies[0]?.fenBefore;
    const colors = look ? (BOARD_THEMES[look.boardTheme] ?? { light: '#EEEED2', dark: '#769656' }) : { light: '#EEEED2', dark: '#769656' };
    const url = drawCover({ fen, flipped, hook: stripEmoji(hook) || hook, sub, bg: prefs.bg, badge: prefs.guess ? { text: '?? FIND IT', color: '#81B64C' } : c && LABEL[c] ? { text: `${LABEL[c].glyph} ${LABEL[c].text}`, color: LABEL[c].color } : null, colors });
    const a = document.createElement('a'); a.href = url; a.download = `${clip.fileBase}-cover.png`; a.click();
  };

  // ── Post kit ────────────────────────────────────────────────────────────
  const postText = clip ? `${hook}\n\n${clip.isTrap ? 'Would you fall for it? 👇' : 'Would you have found it? Comment your move 👇'}\nReview your own games free at chessscout.net\n\n${hashtagsFor(clip)}` : '';
  const [copied, setCopied] = useState(false);
  const copyPost = () => { navigator.clipboard?.writeText(postText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };

  if (err) return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-6 text-white" onClick={onClose}><p>{err}</p></div>;
  if (!clip || !view) return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/85 text-white/70">Loading clip…</div>;

  const evCp = cur?.review?.evalAfterCp ?? (view.ply === -1 || view.ply === -2 ? null : null);
  const evPct = evCp == null ? 50 : Math.abs(evCp) >= 9000 ? (evCp > 0 ? 100 : 0) : Math.max(4, Math.min(96, 50 + 50 * (2 / (1 + Math.exp(-evCp / 400)) - 1)));
  const revealed = frame?.kind === 'reveal' || frame?.kind === 'outro';
  const name = (side: 'w' | 'b') => {
    const n = clip.names[side]; const r = clip.ratings[side];
    const who = clip.isTrap ? (side === 'w' ? 'White' : 'Black') : prefs.showNames && n ? n : side === 'w' ? 'White' : 'Black';
    const rating = r ? (prefs.guessRating && !revealed ? ' (???)' : ` (${r})`) : '';
    return `${who}${rating}`;
  };
  const top = flipped ? 'w' : 'b';
  const moveNo = cur ? `${Math.floor((view.ply - 1) / 2) + 1}${cur.color === 'w' ? '.' : '...'}` : '';
  const label = cls ? LABEL[cls] : null;
  // Arrows: the better move on a mistake (key frame), the engine line's first move, nothing otherwise.
  const arrows: { from: string; to: string; color?: string }[] = [];
  if (frame?.kind === 'better' && frame.arrow) arrows.push({ ...frame.arrow, color: 'rgba(129,182,76,0.95)' });
  if (prefs.arrow && isKey && rev?.betterMove && cls && BAD.has(cls)) {
    try { const c = new Chess(plies[keyPly - 1].fenBefore); const mv = c.move(rev.betterMove); if (mv) arrows.push({ from: mv.from, to: mv.to, color: 'rgba(129,182,76,0.9)' }); } catch { /* ignore */ }
  }
  const caption = frame?.kind === 'better' ? frame.text : prefs.captions && cur ? rev?.explanation : null;
  const showBottomMove = frame?.kind === 'move' && cur;

  const ctl = 'rounded-lg bg-white/10 px-2.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-white/15';
  const toggle = (k: keyof Prefs, text: string) => {
    const on = !!prefs[k];
    return (
      <button key={k} onClick={() => { if (k === 'remix') looks.current.clear(); set(k, !on as never); }} className="rounded-full px-2.5 py-1 text-[12px] font-bold"
        style={{ background: on ? 'rgba(129,182,76,.25)' : 'rgba(255,255,255,.06)', color: on ? '#B8E08C' : '#C9CFCD', border: `1px solid ${on ? 'rgba(129,182,76,.5)' : 'rgba(255,255,255,.1)'}` }}>{text}</button>
    );
  };
  const progress = frames.length > 1 ? i / (frames.length - 1) : 0;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#05080A] text-white lg:flex-row" onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }}>
      {/* ── The 9:16 frame ── */}
      <div className={`flex min-h-0 flex-1 items-center justify-center ${clean ? 'p-0' : 'p-3'}`} onClick={() => setSelected(null)}>
        <div ref={frameRef} className="relative overflow-hidden"
          style={{ aspectRatio: '9 / 16', height: clean ? '100dvh' : 'min(100%, 92dvh)', maxWidth: '100%', containerType: 'size', ...BACKGROUNDS[prefs.bg]?.css } as React.CSSProperties}>
          <motion.div key={shake} animate={shake ? { x: [0, -14, 12, -8, 6, 0] } : {}} transition={{ duration: 0.45 }} className="absolute inset-0">
            {prefs.progress && <div className="absolute inset-x-0 top-0 z-20 h-[0.6cqh] bg-white/15"><div className="h-full bg-[#81B64C] transition-all duration-300" style={{ width: `${progress * 100}%` }} /></div>}
            {/* Hook: pops in big on the intro, then sits at the top */}
            <motion.div key={frame?.kind === 'intro' ? 'intro' : 'top'} initial={frame?.kind === 'intro' ? { scale: 0.6, opacity: 0, y: '18cqh' } : false}
              animate={{ scale: 1, opacity: 1, y: frame?.kind === 'intro' ? '18cqh' : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="absolute inset-x-0 top-[6.5%] z-10 px-[6%] text-center">
              <p className="font-black leading-[1.08] text-white" style={{ fontSize: frame?.kind === 'intro' ? 'clamp(24px, 6.4cqh, 64px)' : 'clamp(18px, 4.4cqh, 44px)', textShadow: '0 3px 14px rgba(0,0,0,.6)' }}>{hook}</p>
              {sub && <p className="mt-1.5 line-clamp-2 text-[clamp(11px,1.8cqh,18px)] font-bold text-white/70">{sub}</p>}
            </motion.div>
            {/* Board block */}
            <div className="absolute inset-x-[4%] top-[22%]" style={{ opacity: frame?.kind === 'intro' ? 0.35 : 1, transition: 'opacity .4s' }}>
              <p className="mb-1 truncate text-[clamp(11px,1.6cqh,16px)] font-bold text-white/85">{name(top)}</p>
              <motion.div animate={prefs.effects && isKey ? { scale: [1, 1.045, 1] } : { scale: 1 }} transition={{ duration: 0.6 }}>
                <LookOverride look={look}>
                  {frame?.kind === 'split' ? (
                    <div className="grid grid-cols-2 gap-[3%]">
                      {([['Played', frame.played, frame.playedSan, '#CA3431'], ['Better', frame.better, frame.betterSan, '#81B64C']] as const).map(([t, b, san, col]) => (
                        <motion.div key={t} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: t === 'Better' ? 0.5 : 0 }}>
                          <p className="mb-1 text-center font-black" style={{ color: col, fontSize: 'clamp(12px,2.2cqh,22px)' }}>{t} · {figurine(san, b.fen.split(' ')[1] === 'b')}</p>
                          <div className="rounded-md p-[3%]" style={{ background: col }}>
                            <ChessBoard fen={b.fen} flipped={flipped} lastMove={b.last} maxWidthOverride="100%" animationMs={0} suppressConfirmMoves />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <ChessBoard fen={view.fen} flipped={flipped} lastMove={view.last} moveQuality={frame?.kind === 'move' ? ((cls as MoveQuality) ?? null) : null}
                      arrows={arrows} maxWidthOverride="100%" animationMs={Math.min(450, prefs.speed * 300)} suppressConfirmMoves />
                  )}
                </LookOverride>
              </motion.div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#2B2B2B]"><div className="h-full rounded-full bg-[#F2F2F2] transition-all duration-500" style={{ width: `${evPct}%` }} /></div>
              <p className="mt-1 truncate text-[clamp(11px,1.6cqh,16px)] font-bold text-white/85">{name(top === 'w' ? 'b' : 'w')}</p>
            </div>
            {/* Move + caption */}
            {(showBottomMove || caption) && frame?.kind !== 'outro' && frame?.kind !== 'reveal' && (
              <div className="absolute inset-x-[5%] bottom-[9%] z-10">
                {showBottomMove && cur && (
                  <div className="flex items-center gap-2">
                    {label && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-black text-white" style={{ background: label.color }}>{label.glyph}</span>}
                    <p className="truncate text-[clamp(14px,2.4cqh,24px)] font-black text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,.6)' }}>
                      {moveNo}{figurine(cur.san, cur.color === 'w')}{label && cls !== 'book' && cls !== 'good' ? <span style={{ color: label.color }}> {label.text.toLowerCase()}</span> : null}
                    </p>
                  </div>
                )}
                {caption && <p className={`mt-1 line-clamp-3 text-[clamp(12px,1.9cqh,19px)] font-semibold leading-snug ${frame?.kind === 'better' ? 'text-[#B8E08C]' : 'text-white/90'}`} style={{ textShadow: '0 2px 8px rgba(0,0,0,.6)' }}>{caption}</p>}
              </div>
            )}
            {prefs.watermark && frame?.kind !== 'outro' && <p className="absolute inset-x-0 bottom-[3%] z-10 text-center text-[clamp(10px,1.5cqh,15px)] font-black tracking-wide text-white/75">chessscout.net</p>}
            {/* Countdown */}
            <AnimatePresence>
              {frame?.kind === 'countdown' && (
                <motion.div key={frame.n} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.35 }}
                  className="absolute inset-0 z-20 grid place-items-center">
                  <div className="text-center">
                    <p className="text-[clamp(16px,2.8cqh,28px)] font-black text-white" style={{ textShadow: '0 2px 10px rgba(0,0,0,.7)' }}>{clip.isTrap ? 'Spot the winning move' : 'Can you find it?'}</p>
                    <p className="font-black text-white" style={{ fontSize: 'clamp(60px,14cqh,150px)', textShadow: '0 4px 20px rgba(0,0,0,.7)' }}>{frame.n}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Badge pop + eval swing */}
            <AnimatePresence>
              {pop && LABEL[pop.cls] && (
                <motion.div key={pop.at} initial={{ scale: 0, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }} exit={{ scale: 1.3, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 14 }} onAnimationComplete={() => setTimeout(() => setPop((p) => (p && p.at === pop.at ? null : p)), 1100)}
                  className="pointer-events-none absolute left-1/2 top-[44%] z-20 -translate-x-1/2 -translate-y-1/2 text-center">
                  <div className="rounded-2xl px-5 py-2.5 font-black text-white shadow-2xl" style={{ background: LABEL[pop.cls].color, fontSize: 'clamp(22px,4.4cqh,46px)', border: '3px solid rgba(255,255,255,.9)' }}>
                    {LABEL[pop.cls].glyph} {LABEL[pop.cls].text}
                  </div>
                  {isKey && prevEval != null && rev?.evalAfterCp != null && Math.abs(rev.evalAfterCp - prevEval) >= 150 && (
                    <div className="mx-auto mt-2 w-fit rounded-full bg-black/70 px-3 py-1 text-[clamp(13px,2.2cqh,22px)] font-black tabular-nums text-white">
                      {fmtEval(prevEval)} → <span style={{ color: LABEL[pop.cls].color }}>{fmtEval(rev.evalAfterCp)}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {/* Rating reveal */}
            <AnimatePresence>
              {frame?.kind === 'reveal' && (
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }}
                  className="absolute inset-x-[8%] top-[40%] z-20 rounded-2xl bg-black/80 p-4 text-center ring-2 ring-white/80">
                  <p className="text-[clamp(13px,2.2cqh,22px)] font-bold text-white/80">Their ratings</p>
                  <p className="mt-1 font-black text-white" style={{ fontSize: 'clamp(22px,4.6cqh,48px)' }}>{clip.ratings.w ?? '?'} <span className="text-white/50">vs</span> {clip.ratings.b ?? '?'}</p>
                  <p className="mt-1 text-[clamp(12px,1.9cqh,19px)] font-bold text-[#B8E08C]">Did you guess right?</p>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Compilation title */}
            <AnimatePresence>
              {frame?.kind === 'title' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur-sm">
                  <motion.div initial={{ scale: 0.6, rotate: -4 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="px-[8%] text-center">
                    <p className="font-black leading-[1.05] text-white" style={{ fontSize: 'clamp(28px,6.6cqh,66px)', textShadow: '0 4px 20px rgba(0,0,0,.6)' }}>{prefs.compTitle}</p>
                    <p className="mt-3 inline-block rounded-full bg-[#81B64C] px-4 py-1 font-black text-white" style={{ fontSize: 'clamp(13px,2.2cqh,22px)' }}>{queue?.length} moments</p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* End card */}
            <AnimatePresence>
              {frame?.kind === 'outro' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center bg-black/75 backdrop-blur-sm">
                  <motion.div initial={{ scale: 0.7, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 16 }} className="px-[8%] text-center">
                    <p className="font-black text-white" style={{ fontSize: 'clamp(26px,6cqh,60px)' }}>Chess<span className="text-[#81B64C]">Scout</span><span className="text-white/70">.net</span></p>
                    <p className="mt-2 font-bold text-white/90" style={{ fontSize: 'clamp(15px,2.8cqh,28px)' }}>{prefs.outroLine}</p>
                    {prefs.handle && <p className="mt-4 inline-block rounded-full bg-[#81B64C] px-4 py-1.5 font-black text-white" style={{ fontSize: 'clamp(14px,2.4cqh,24px)' }}>Follow {prefs.handle}</p>}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            {prefs.effects && <Confetti fire={confetti} />}
            {/* Stickers */}
            {stickers.map((st) => (
              <div key={st.id} onPointerDown={(e) => { e.stopPropagation(); const fr = frameRef.current!.getBoundingClientRect(); drag.current = { id: st.id, dx: ((e.clientX - fr.left) / fr.width) * 100 - st.x, dy: ((e.clientY - fr.top) / fr.height) * 100 - st.y }; setSelected(st.id); }}
                onDoubleClick={() => setStickers((s) => s.filter((x) => x.id !== st.id))}
                className="absolute z-40 -translate-x-1/2 -translate-y-1/2 cursor-grab select-none touch-none"
                style={{ left: `${st.x}%`, top: `${st.y}%`, outline: selected === st.id && !clean && !recording ? '2px dashed rgba(255,255,255,.7)' : 'none', outlineOffset: 4 }}>
                {st.kind === 'emoji'
                  ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }} className="block" style={{ fontSize: `${st.size * 0.5}cqh`, lineHeight: 1 }}>{st.text}</motion.span>
                  : <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }} className="block whitespace-nowrap rounded-xl px-3 py-1 font-black text-white" style={{ fontSize: `${st.size * 0.4}cqh`, background: '#F0605D', border: '3px solid #fff', transform: 'rotate(-6deg)', boxShadow: '0 6px 20px rgba(0,0,0,.4)' }}>{st.text}</motion.span>}
              </div>
            ))}
          </motion.div>
          {/* Where TikTok / Reels put their buttons and caption (never recorded) */}
          {prefs.safeArea && !clean && !recording && (
            <div className="pointer-events-none absolute inset-0 z-50">
              <div className="absolute right-0 top-[38%] h-[45%] w-[15%] border-2 border-dashed border-white/35 bg-white/5" />
              <div className="absolute inset-x-0 bottom-0 h-[16%] border-t-2 border-dashed border-white/35 bg-white/5" />
              <div className="absolute inset-x-0 top-0 h-[6%] border-b-2 border-dashed border-white/35 bg-white/5" />
            </div>
          )}
          {clean && <button onClick={() => setClean(false)} aria-label="Show controls" className="absolute left-0 top-0 z-50 h-16 w-16 opacity-0" />}
        </div>
      </div>

      {/* ── Controls ── */}
      {!clean && (
        <div className="max-h-[46dvh] w-full shrink-0 overflow-y-auto border-t border-white/10 bg-[#0B1112] p-4 lg:max-h-none lg:w-[400px] lg:border-l lg:border-t-0">
          <div className="mb-3 flex items-center gap-1.5">
            <p className="flex-1 truncate text-[15px] font-black">{clip.label}</p>
            {onPrev && <button onClick={onPrev} className={ctl} title="Previous moment (P)"><SkipBack size={14} /></button>}
            {onNext && <button onClick={onNext} className={ctl} title="Next moment (N)"><SkipForward size={14} /></button>}
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"><X size={18} /></button>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <button onClick={() => (i >= frames.length - 1 ? restart() : setPlaying((p) => !p))} className="flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[13px] font-black text-white">{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pause' : 'Play'}</button>
            <button onClick={restart} className={ctl}><RotateCcw size={14} className="mr-1 inline" />From start</button>
            <button onClick={() => setI((x) => Math.max(0, x - 1))} className={ctl} aria-label="Back"><ChevronLeft size={15} /></button>
            <button onClick={() => setI((x) => Math.min(frames.length - 1, x + 1))} className={ctl} aria-label="Forward"><ChevronRight size={15} /></button>
            <button onClick={() => setFlipped((f) => !f)} className={ctl} aria-label="Flip"><FlipVertical2 size={14} /></button>
            <span className="text-[11.5px] tabular-nums text-white/45">{i + 1}/{frames.length} · ~{Math.round(frames.reduce((s, f) => s + dur(f), 0) / 1000)}s</span>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button onClick={record} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-black text-white" style={{ background: recording ? '#CA3431' : '#2A3335' }}>
              {recording ? <Square size={14} /> : <Video size={14} />}{recording ? 'Stop recording' : 'Record clip'}
            </button>
            <button onClick={() => setClean(true)} className={ctl}><EyeOff size={14} className="mr-1 inline" />Clean view</button>
            <button onClick={saveCover} className={ctl} title="Download a cover image for the post"><ImageIcon size={14} className="mr-1 inline" />Cover image</button>
          </div>
          {isComp && (
            <div className="mb-3">
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-white/50">Compilation title · clip {clipQ + 1} of {queue!.length}</label>
              <input value={prefs.compTitle} onChange={(e) => set('compTitle', e.target.value)} className="w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white outline-none ring-1 ring-white/10 focus:ring-[#81B64C]" />
            </div>
          )}
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Presets</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => <button key={p.label} onClick={() => applyPreset(p.v)} className="rounded-full bg-[#2A3335] px-2.5 py-1 text-[12px] font-bold text-white hover:bg-[#34403F]">{p.label}</button>)}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {toggle('voice', 'Coach voiceover')}
            {prefs.voice && (
              <select value={prefs.voiceName} onChange={(e) => set('voiceName', e.target.value)} className="rounded-lg bg-white/5 px-2 py-1 text-[12px] text-white ring-1 ring-white/10">
                {['onyx', 'nova', 'echo', 'fable', 'alloy', 'shimmer', 'coral', 'sage'].map((v) => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
              </select>
            )}
            {prefs.voice && <Mic size={14} className="text-[#B8E08C]" />}
          </div>
          {prefs.voice && voiceNote && <p className="-mt-1 mb-3 text-[12px] text-[#E8B447]">{voiceNote}</p>}
          {recNote && <p className="mb-3 text-[12px] text-[#E8B447]">{recNote}</p>}

          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-white/50">Hook</label>
          <input value={hook} onChange={(e) => setHook(e.target.value)} className="mb-2 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white outline-none ring-1 ring-white/10 focus:ring-[#81B64C]" />
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-white/50">Subtitle</label>
          <input value={sub} onChange={(e) => setSub(e.target.value)} className="mb-3 w-full rounded-lg bg-white/5 px-3 py-2 text-[13px] text-white outline-none ring-1 ring-white/10 focus:ring-[#81B64C]" />

          <div className="mb-3 grid grid-cols-3 gap-2 text-[12px]">
            <label className="text-white/60">Moves before<input type="number" min={0} max={30} value={prefs.before} onChange={(e) => set('before', Number(e.target.value))} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" /></label>
            <label className="text-white/60">Moves after<input type="number" min={0} max={30} value={prefs.after} onChange={(e) => set('after', Number(e.target.value))} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" /></label>
            <label className="text-white/60">Sec / move<input type="number" min={0.4} max={4} step={0.1} value={prefs.speed} onChange={(e) => set('speed', Number(e.target.value))} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" /></label>
          </div>

          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Story</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {toggle('intro', 'Hook intro')}
            {toggle('guess', 'Find-the-move countdown')}
            {toggle('betterLine', 'Show the better line')}
            {toggle('split', 'Played vs better (side by side)')}
            {!clip.isTrap && toggle('guessRating', 'Guess the rating')}
            {toggle('outro', 'End card')}
          </div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Look</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {toggle('remix', 'Remix board every move')}
            {toggle('effects', 'Pop, confetti, shake')}
            {toggle('captions', 'Coach caption')}
            {toggle('arrow', 'Best-move arrow')}
            {toggle('progress', 'Progress bar')}
            {!clip.isTrap && toggle('showNames', 'Player names')}
            {toggle('sound', 'Move sounds')}
            {toggle('watermark', 'Watermark')}
            {toggle('safeArea', 'App safe zones')}
          </div>
          {!prefs.remix && (
            <div className="mb-3 flex items-center gap-2">
              <button onClick={() => setFixedLook(randomLook())} className={ctl}><Shuffle size={14} className="mr-1 inline" />Random look</button>
              <button onClick={() => setFixedLook(null)} className={ctl}>My board</button>
            </div>
          )}
          {look && <p className="-mt-1 mb-3 text-[11.5px] text-white/50">{lookLabel(look)}</p>}

          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Background</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {Object.keys(BACKGROUNDS).map((k) => (
              <button key={k} onClick={() => set('bg', k)} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ border: `1px solid ${prefs.bg === k ? '#81B64C' : 'rgba(255,255,255,.12)'}`, color: prefs.bg === k ? '#fff' : '#C9CFCD' }}>
                <span className="h-3.5 w-3.5 rounded-full" style={BACKGROUNDS[k].css} />{BACKGROUNDS[k].label}
              </button>
            ))}
          </div>

          {prefs.outro && (
            <div className="mb-3 grid grid-cols-2 gap-2 text-[12px]">
              <label className="text-white/60">End card line<input value={prefs.outroLine} onChange={(e) => set('outroLine', e.target.value)} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" /></label>
              <label className="text-white/60">Handle<input value={prefs.handle} onChange={(e) => set('handle', e.target.value)} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" /></label>
            </div>
          )}

          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Stickers <span className="normal-case text-white/40">· drag to move, double-click to remove</span></p>
          <div className="mb-2 flex flex-wrap gap-1">
            {EMOJIS.map((e) => <button key={e} onClick={() => addSticker(e, 'emoji')} className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-[20px] hover:bg-white/10">{e}</button>)}
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {TEXT_STICKERS.map((t) => <button key={t} onClick={() => addSticker(t, 'text')} className="rounded-md bg-[#F0605D] px-2 py-1 text-[11px] font-black text-white">{t}</button>)}
          </div>
          {selected && stickers.some((s) => s.id === selected) && (
            <div className="mb-3 flex items-center gap-2 text-[12px] text-white/70">
              Size
              <input type="range" min={3} max={30} value={stickers.find((s) => s.id === selected)!.size}
                onChange={(e) => setStickers((s) => s.map((x) => (x.id === selected ? { ...x, size: Number(e.target.value) } : x)))} className="flex-1" />
              <button onClick={() => setStickers((s) => s.filter((x) => x.id !== selected))} className="rounded p-1 text-white/70 hover:bg-white/10" aria-label="Remove sticker"><Trash2 size={15} /></button>
            </div>
          )}

          <p className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide text-white/50">Post caption</p>
          <textarea readOnly value={postText} rows={6} className="w-full resize-none rounded-lg bg-white/5 p-2.5 text-[12.5px] text-white/85 ring-1 ring-white/10" />
          <button onClick={copyPost} className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-bold"><Copy size={13} />{copied ? 'Copied' : 'Copy caption'}</button>

          <p className="mt-3 text-[11.5px] leading-snug text-white/45">
            Space plays, arrows step, R restarts, N / P next and previous moment, Esc leaves clean view. "Record clip" saves just the frame (Chrome on a computer: pick this tab and turn on tab audio for move sounds).
            On a phone, open Clean view and use the screen recorder; tap the top-left corner to bring the controls back. Settings are remembered for the next clip.
          </p>
          <p className="mt-2 text-[11px] text-white/35"><Eye size={12} className="mr-1 inline" />{clip.label}</p>
        </div>
      )}
    </div>
  );
}
