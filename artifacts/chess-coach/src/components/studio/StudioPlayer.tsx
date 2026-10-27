import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Chess } from 'chess.js';
import { X, Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Shuffle, Video, Square, Eye, EyeOff, FlipVertical2, Trash2, Copy, SkipForward, SkipBack, Mic, Image as ImageIcon, Music } from 'lucide-react';
import { ChessBoard, type MoveQuality } from '@/components/ChessBoard';
import { LookOverride, randomLook, lookLabel, playMoveSound, BOARD_THEMES, type BoardLook } from '@/context/SettingsContext';
import { apiFetch } from '@/lib/api';
import { normalizeFen } from '@/lib/utils';
import { StudioBadge, Medallion, Rays, CountdownRing, EvalSwing, rankColor, shade } from './StudioBadge';
import { StudioMusic, MUSIC_STYLES, bpmOf, type MusicStyle } from './studioMusic';

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
export interface StudioPuzzle { id: number; fen: string; moves: string; rating: number; themes: string | null; explanation: string | null; source: string; gameId: number | null }
export interface StudioReview {
  id: number; opening: string | null; white: string | null; black: string | null; whiteRating: number | null; blackRating: number | null;
  result: string | null; platform: string | null; playedAt: string | null; whiteAccuracy: number | null; blackAccuracy: number | null;
  moments: number; brilliant: number; blunders: number; mate: number; lastFen: string | null;
}
export type StudioSource =
  | { kind: 'game'; moment: StudioMoment } | { kind: 'trap'; trap: StudioTrap }
  | { kind: 'puzzle'; puzzle: StudioPuzzle } | { kind: 'review'; review: StudioReview };

interface ReviewMove { moveIndex?: number; san: string; color?: 'white' | 'black'; classification?: string; explanation?: string; betterMove?: string | null; evalAfterCp?: number; fen?: string; bestLineSan?: string[] }
interface StudioGame { id: number; pgn: string; opening: string | null; white: string; black: string; whiteRating: number | null; blackRating: number | null; moves: ReviewMove[]; whiteAccuracy?: number | null; blackAccuracy?: number | null; overview?: string | null; result?: string | null }
interface Ply { san: string; from: string; to: string; fen: string; fenBefore: string; color: 'w' | 'b'; review?: ReviewMove }
interface Sticker { id: number; text: string; x: number; y: number; size: number; kind: 'emoji' | 'text' | 'badge'; tone?: number }
interface Clip {
  plies: Ply[]; key: number; tags: string[]; hook: string; sub: string; names: { w: string | null; b: string | null };
  ratings: { w: number | null; b: number | null }; fileBase: string; label: string; isTrap: boolean; opening: string | null;
  /** A puzzle: the opponent's move, then the solution (played to the end). */
  isPuzzle?: boolean; puzzleRating?: number;
  /** A whole game review: every move (or the highlights) and a summary card. */
  isReview?: boolean; accuracy?: { w: number | null; b: number | null }; overview?: string | null; result?: string | null;
}
type Frame =
  | { kind: 'intro'; fen: string }
  | { kind: 'move'; ply: number }
  | { kind: 'countdown'; n: number; fen: string; last: { from: string; to: string } | null }
  | { kind: 'better'; fen: string; last: { from: string; to: string } | null; arrow: { from: string; to: string } | null; text: string }
  | { kind: 'reveal'; fen: string }
  | { kind: 'split'; played: { fen: string; last: { from: string; to: string } }; better: { fen: string; last: { from: string; to: string } }; playedSan: string; betterSan: string }
  | { kind: 'title'; fen: string }
  | { kind: 'summary'; fen: string }
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
const TONES = [{ bg: '#F0605D', fg: '#fff' }, { bg: '#FFD84D', fg: '#141414' }, { bg: '#81B64C', fg: '#fff' }, { bg: '#FFFFFF', fg: '#141414' }, { bg: '#141414', fg: '#fff' }, { bg: '#1BACA6', fg: '#fff' }];
const BADGE_STICKERS = ['brilliant', 'great', 'best', 'excellent', 'book', 'inaccuracy', 'mistake', 'blunder', 'missed_win', 'checkmate'];
const TEXT_STICKERS = ['BRILLIANT!!', 'BLUNDER??', 'WAIT FOR IT…', 'NO WAY', 'GG', 'FIND THE MOVE', 'TRAP!', 'MATE', 'PAUSE NOW', 'COMMENT YOUR MOVE'];

// ── Preferences that carry over between clips (this browser only) ─────────
const PREF_KEY = 'cs_studio_prefs_v1';
const DEFAULT_PREFS = {
  before: 8, after: 5, speed: 1.2, guess: true, remix: true, captions: true, effects: true, arrow: true, sound: true, watermark: true,
  bg: 'green', betterLine: true, guessRating: false, outro: true, progress: true, intro: true, safeArea: true, showNames: false,
  handle: '@chessscout.net3', outroLine: 'Review your games free',
  split: true, voice: false, voiceName: 'onyx', compTitle: 'Top moments this week',
  music: 'off' as MusicStyle, musicVol: 0.5, beatSync: true, musicFx: true, subs: true, pieceFx: true, reviewMode: 'highlights' as 'highlights' | 'full',
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

const THEME_LABEL: Record<string, string> = {
  fork: 'Fork', pin: 'Pin', skewer: 'Skewer', discoveredAttack: 'Discovered attack', sacrifice: 'Sacrifice', mate: 'Checkmate', mateIn1: 'Mate in 1', mateIn2: 'Mate in 2',
  mateIn3: 'Mate in 3', mateIn4: 'Mate in 4', backRankMate: 'Back-rank mate', smotheredMate: 'Smothered mate', endgame: 'Endgame', middlegame: 'Middlegame', opening: 'Opening',
  hangingPiece: 'Hanging piece', trappedPiece: 'Trapped piece', promotion: 'Promotion', deflection: 'Deflection', attraction: 'Attraction', zugzwang: 'Zugzwang',
  crushing: 'Crushing', advantage: 'Winning', equality: 'Save the game', defensiveMove: 'Defend', quietMove: 'Quiet move', xRayAttack: 'X-ray', clearance: 'Clearance',
  interference: 'Interference', intermezzo: 'In-between move', doubleCheck: 'Double check', kingsideAttack: 'Kingside attack', queensideAttack: 'Queenside attack',
};
export const themeLabel = (t: string) => THEME_LABEL[t] ?? t.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

function puzzleClip(p: StudioPuzzle): Clip {
  const themes = (p.themes ?? '').split(' ').filter(Boolean);
  const c = new Chess(p.fen);
  const plies: Ply[] = [];
  for (const [k, u] of p.moves.split(' ').filter(Boolean).entries()) {
    const fenBefore = c.fen();
    let mv;
    try { mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; }
    if (!mv) break;
    // Move 0 is the opponent's move that sets the puzzle; the solver's moves are all best.
    const review: ReviewMove | undefined = k % 2 === 1 ? { san: mv.san, classification: k === 1 && themes.some((t) => ['sacrifice', 'quietMove', 'clearance', 'deflection'].includes(t)) ? 'brilliant' : 'best', explanation: k === 1 ? p.explanation ?? undefined : undefined } : undefined;
    plies.push({ san: mv.san, from: mv.from, to: mv.to, fen: c.fen(), fenBefore, color: mv.color as 'w' | 'b', review });
  }
  const mateIn = themes.find((t) => /^mateIn\d$/.test(t));
  const tactic = themes.find((t) => ['fork', 'pin', 'skewer', 'discoveredAttack', 'sacrifice', 'smotheredMate', 'backRankMate', 'deflection', 'doubleCheck', 'zugzwang'].includes(t));
  const side = plies[1]?.color === 'b' ? 'Black' : 'White';
  const hook = mateIn ? `${side} to move: ${themeLabel(mateIn)} 🧩` : tactic ? `Find the ${themeLabel(tactic).toLowerCase()} 🧩` : themes.includes('equality') ? `${side} to move and save it 🧩` : `${side} to move. Can you solve it? 🧩`;
  const tags = ['puzzle', ...(themes.some((t) => t.startsWith('mate')) ? ['checkmate'] : []), ...(themes.some((t) => ['fork', 'pin', 'skewer', 'discoveredAttack', 'sacrifice'].includes(t)) ? ['fork'] : []), ...(themes.includes('endgame') ? ['endgame'] : [])];
  return {
    plies, key: Math.min(1, plies.length - 1), tags, hook, sub: `Puzzle rated ${p.rating}${tactic && mateIn ? ` · ${themeLabel(tactic)}` : ''}`,
    names: { w: null, b: null }, ratings: { w: null, b: null }, fileBase: `chessscout-puzzle-${p.id}`, label: `Puzzle #${p.id} · ${p.rating}`,
    isTrap: false, opening: null, isPuzzle: true, puzzleRating: p.rating,
  };
}

const NOTABLE = new Set(['brilliant', 'great', 'blunder', 'mistake', 'missed_win']);
function reviewClip(g: StudioGame): Clip {
  const base = gameClip(g, { gameId: g.id, moveIndex: 0, tags: [], classification: null, san: '', trapName: null, opening: g.opening, white: g.white, black: g.black, whiteRating: g.whiteRating, blackRating: g.blackRating, platform: null });
  const plies = base.plies;
  const count = (c: string) => plies.filter((p) => p.review?.classification === c).length;
  const bril = count('brilliant'), blun = count('blunder') + count('missed_win'), great = count('great');
  const mated = plies[plies.length - 1]?.san.includes('#');
  // The cover / key move: the first brilliant move, else the biggest blunder, else the last move.
  let key = plies.findIndex((p) => p.review?.classification === 'brilliant');
  if (key < 0) key = plies.findIndex((p) => p.review?.classification === 'great');
  if (key < 0) key = plies.findIndex((p) => p.review?.classification === 'blunder' || p.review?.classification === 'missed_win');
  if (key < 0) key = Math.max(0, plies.length - 1);
  const hook = bril ? `${bril} brilliant move${bril > 1 ? 's' : ''} in one game 🔥` : blun >= 3 ? `${blun} blunders in one game 💀` : great ? 'The full game review 📊' : mated ? 'Every move, all the way to mate ♟️' : 'Full game review 📊';
  const tags = ['review', ...(bril ? ['brilliant'] : []), ...(blun ? ['blunder'] : []), ...(mated ? ['checkmate'] : [])];
  return {
    ...base, key, tags, hook, sub: g.opening ?? '', fileBase: `chessscout-review-${g.id}`, label: `Game review #${g.id} · ${plies.length} plies`,
    isReview: true, accuracy: { w: g.whiteAccuracy ?? null, b: g.blackAccuracy ?? null }, overview: g.overview ?? null, result: g.result ?? null,
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
  if (clip.isPuzzle) { t.add('#chesspuzzle'); t.add('#puzzle'); }
  if (clip.isReview) { t.add('#gamereview'); t.add('#chessanalysis'); }
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
function drawCover(opts: { fen: string; flipped: boolean; hook: string; sub: string; bg: string; badge: { glyph: string; text: string; color: string } | null; colors: { light: string; dark: string } }): string {
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
    // The Studio badge: a glossy medallion with the glyph and a ribbon with the word.
    const { glyph, text, color } = opts.badge;
    const light = shade(color, 0.32), dark = shade(color, -0.4);
    ctx.font = '900 76px system-ui, sans-serif';
    const R = 100, ribH = 128, tw = ctx.measureText(text.toUpperCase()).width;
    const ribW = tw + 215, total = R * 2 + ribW - 70;
    ctx.save(); ctx.translate(W / 2 - total / 2, y0 + size / 2); ctx.rotate(-0.06);
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
    const rg = ctx.createLinearGradient(0, -ribH / 2, 0, ribH / 2); rg.addColorStop(0, light); rg.addColorStop(0.52, color); rg.addColorStop(1, dark);
    ctx.fillStyle = rg; ctx.strokeStyle = '#fff'; ctx.lineWidth = 12;
    ctx.beginPath(); (ctx as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number[]) => void }).roundRect(R * 2 - 90, -ribH / 2, ribW, ribH, [0, 34, 34, 0]); ctx.fill(); ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = dark; ctx.fillText(text.toUpperCase(), R * 2 + 38, 9);
    ctx.fillStyle = '#fff'; ctx.fillText(text.toUpperCase(), R * 2 + 38, 4);
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    const mg = ctx.createRadialGradient(R * 0.7, -R * 0.45, 8, R, 0, R * 1.05); mg.addColorStop(0, light); mg.addColorStop(0.55, color); mg.addColorStop(1, dark);
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(R, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.lineWidth = 13; ctx.strokeStyle = '#fff'; ctx.stroke();
    const hg = ctx.createLinearGradient(0, -R, 0, 0); hg.addColorStop(0, 'rgba(255,255,255,.4)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(R, 0, R * 0.84, Math.PI, 0); ctx.fill();
    ctx.textAlign = 'center'; ctx.font = '900 92px system-ui, sans-serif';
    ctx.fillStyle = dark; ctx.fillText(glyph, R, 10); ctx.fillStyle = '#fff'; ctx.fillText(glyph, R, 4);
    ctx.restore(); ctx.textAlign = 'center';
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

export function StudioPlayer({ source, queue, title, onClose, onNext, onPrev }: {
  source: StudioSource;
  /** A ready-made compilation title (auto Top 5); otherwise the remembered one. */
  title?: string;
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
  // Games are fetched once; in a compilation the next one is fetched while this one plays, so clips run on without a gap.
  const games = useRef(new Map<number, Promise<StudioGame>>());
  const getGame = (id: number) => {
    let p = games.current.get(id);
    if (!p) {
      p = apiFetch(`/api/admin/studio/game/${id}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Game not found'))));
      p.catch(() => games.current.delete(id));
      games.current.set(id, p);
    }
    return p;
  };
  useEffect(() => {
    setErr(null);
    const slot = q;
    const nx = isComp ? queue![slot + 1] : undefined;
    if (nx?.kind === 'game') void getGame(nx.moment.gameId).catch(() => {});
    if (nx?.kind === 'review') void getGame(nx.review.id).catch(() => {});
    if (current.kind === 'trap') { setClip(trapClip(current.trap)); setClipQ(slot); return; }
    if (current.kind === 'puzzle') {
      try { setClip(puzzleClip(current.puzzle)); setClipQ(slot); } catch { setErr("This puzzle doesn't load."); }
      return;
    }
    if (current.kind === 'review') {
      getGame(current.review.id).then((g) => { setClip(reviewClip(g)); setClipQ(slot); }).catch((e) => setErr(String(e?.message ?? e)));
      return;
    }
    const m = current.moment;
    getGame(m.gameId).then((g) => { setClip(gameClip(g, m)); setClipQ(slot); }).catch((e) => setErr(String(e?.message ?? e)));
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Settings (remembered between clips) ─────────────────────────────────
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => { const n = { ...p, [k]: v }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const [hook, setHook] = useState('');
  const [sub, setSub] = useState('');
  const [fixedLook, setFixedLook] = useState<BoardLook | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [clean, setClean] = useState(false);
  // Clean view: an Exit button shows for a few seconds on entering and whenever the screen is tapped;
  // the phone's back button (or Esc) also just leaves clean view, never the Studio.
  const [exitHint, setExitHint] = useState(0);
  const showExit = () => setExitHint(Date.now());
  useEffect(() => { if (!exitHint) return; const t = setTimeout(() => setExitHint(0), 3500); return () => clearTimeout(t); }, [exitHint]);
  const enterClean = () => { setClean(true); showExit(); try { window.history.pushState({ csClean: 1 }, ''); } catch { /* ignore */ } };
  const exitClean = () => { setClean(false); setExitHint(0); try { if (window.history.state?.csClean) { ignorePop.current = true; window.history.back(); } } catch { /* ignore */ } };
  // Back button: leaves clean view if it's on, otherwise closes the player (back to the Studio list, picks kept).
  const cleanRef = useRef(false); cleanRef.current = clean;
  const ignorePop = useRef(false);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    try { window.history.pushState({ csPlayer: 1 }, ''); } catch { /* ignore */ }
    const h = () => {
      if (ignorePop.current) { ignorePop.current = false; return; }
      if (cleanRef.current) { setClean(false); setExitHint(0); return; }
      closeRef.current();
    };
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, []);
  const close = () => {
    try { if (window.history.state?.csPlayer || window.history.state?.csClean) { ignorePop.current = true; window.history.go(window.history.state?.csClean ? -2 : -1); } } catch { /* ignore */ }
    onClose();
  };
  const [compTitle, setCompTitleState] = useState(() => title ?? loadPrefs().compTitle);
  const setCompTitle = (v: string) => { setCompTitleState(v); if (!title) set('compTitle', v); };
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
    const endPly = clip.isPuzzle ? plies.length : Math.min(plies.length, keyPly + prefs.after);
    const fenAt = (p: number) => (p <= 0 ? plies[0].fenBefore : plies[p - 1].fen);
    const lastAt = (p: number) => (p <= 0 ? null : { from: plies[p - 1].from, to: plies[p - 1].to });
    const out: Frame[] = [];
    if (clip.isReview) {
      if (isComp && isFirst) out.push({ kind: 'title', fen: fenAt(0) });
      if (prefs.intro) out.push({ kind: 'intro', fen: fenAt(0) });
      const notable = (p: number) => { const m = plies[p - 1]; return !!m && (m.san.includes('#') || NOTABLE.has(m.review?.classification ?? '')); };
      let list: number[];
      if (prefs.reviewMode === 'highlights') {
        const set = new Set<number>();
        for (let p = 1; p <= plies.length; p++) if (notable(p)) for (let q = Math.max(1, p - 2); q <= p; q++) set.add(q);
        set.add(plies.length);
        list = [...set].sort((a, b) => a - b);
      } else list = plies.map((_, k) => k + 1);
      for (const p of list) out.push({ kind: 'move', ply: p });
      out.push({ kind: 'summary', fen: fenAt(plies.length) });
      if (prefs.outro && isLast) out.push({ kind: 'outro', fen: fenAt(plies.length) });
      return out;
    }
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
  }, [clip, prefs.before, prefs.after, prefs.intro, prefs.guess, prefs.betterLine, prefs.guessRating, prefs.outro, prefs.split, prefs.reviewMode, isComp, isFirst, isLast]);

  const dur = (f: Frame) => {
    const base = baseDur(f);
    const said = prefs.voice ? narration(f) : null;
    const len = said ? voiceLen.current.get(said) : undefined;
    const d = len ? Math.max(base, len * 1000 + 300) : base;
    // On the beat: every frame lasts a whole number of beats, so moves land on the music.
    const bpm = bpmOf(prefs.music);
    if (bpm && prefs.beatSync) { const beat = 60000 / bpm; return Math.max(1, Math.round(d / beat)) * beat; }
    return d;
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
      case 'summary': return 4200;
      case 'outro': return 2800;
      default: {
        if (clip?.isReview) {
          const m = clip.plies[f.ply - 1];
          return m && (m.san.includes('#') || NOTABLE.has(m.review?.classification ?? '')) ? Math.max(s, 2200) : Math.max(220, s * 0.55);
        }
        return clip && f.ply === clip.key + 1 ? Math.max(s, 2400) : s;
      }
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
      if (prefs.effects && cls && (isKey || ['brilliant', 'great', 'blunder', 'missed_win', 'checkmate', ...(clip?.isReview ? ['mistake'] : [])].includes(cls))) {
        setPop({ cls, at: Date.now() });
        if (cls === 'brilliant' || cls === 'great' || cls === 'checkmate') setConfetti(Date.now());
        if (cls === 'blunder' || cls === 'missed_win') setShake(Date.now());
      }
    }
    if (frame.kind === 'better' && frame.last && prefs.sound) playMoveSound('move');
    if (frame.kind === 'countdown' && prefs.sound && frame.n === 3) playMoveSound('check');
    // Sound design on top of the music.
    if (prefs.musicFx && playing) {
      const m = mus();
      if (frame.kind === 'countdown' && frame.n === 3) m.accent('riser');
      if (frame.kind === 'countdown') m.accent('tick');
      if (frame.kind === 'title' || frame.kind === 'outro' || frame.kind === 'split' || frame.kind === 'intro') m.accent('whoosh');
      if (isKey && cur) {
        m.accent('impact');
        if (cls === 'brilliant' || cls === 'great' || cls === 'checkmate') m.accent('chime');
      }
    }
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // Frames are timed from when the previous one was due (not when its timer fired), so a long clip doesn't drift off the beat.
  const dueAt = useRef<number | null>(null);
  const nextClipAt = useRef<number | null>(null);
  const [frameStart, setFrameStart] = useState(0);
  useEffect(() => {
    if (!playing || !frame) { dueAt.current = null; nextClipAt.current = null; return; }
    // Wait for the next clip of a compilation to reset to its first frame.
    if (nextClipAt.current != null && i !== 0) return;
    const now = performance.now();
    const start = nextClipAt.current ?? dueAt.current ?? now;
    nextClipAt.current = null; dueAt.current = null;
    setFrameStart(start);
    const end = start + dur(frame);
    const t = setTimeout(() => {
      if (i >= frames.length - 1) {
        if (isComp && !isLast) { nextClipAt.current = end; autoNext.current = true; setQ((x) => x + 1); } else setPlaying(false);
      } else { dueAt.current = end; setI((x) => x + 1); }
    }, Math.max(0, end - now));
    return () => clearTimeout(t);
  }, [playing, i, frames.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Music ───────────────────────────────────────────────────────────────
  const music = useRef<StudioMusic | null>(null);
  const mus = () => (music.current ??= new StudioMusic());
  useEffect(() => () => music.current?.dispose(), []);
  useEffect(() => { music.current?.setVolume(prefs.musicVol); }, [prefs.musicVol]);
  useEffect(() => {
    if (playing && prefs.music !== 'off') { const m = mus(); m.setVolume(prefs.musicVol); m.start(prefs.music); }
    else music.current?.stop();
  }, [playing, prefs.music]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voiceover: the coach voice reads the hook, the key move and the end card ─
  const voiceLen = useRef(new Map<string, number>());
  const voiceUrl = useRef(new Map<string, string>());
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [, setVoiceTick] = useState(0);
  const narration = (f: Frame | undefined): string | null => {
    if (!f || !clip) return null;
    switch (f.kind) {
      case 'title': return stripEmoji(compTitle);
      case 'intro': return stripEmoji(hook.replace(/^#\d+ · /, ''));
      case 'countdown': return f.n === 3 ? (clip.isTrap ? 'Can you spot the winning move?' : 'Can you find the move?') : null;
      case 'move': {
        if (clip.isReview) {
          const r = clip.plies[f.ply - 1]; const rc = r?.san.includes('#') ? 'checkmate' : r?.review?.classification;
          if (!r || !rc || !(NOTABLE.has(rc) || rc === 'checkmate')) return null;
          return `${rc !== 'checkmate' ? `${LABEL[rc].text.toLowerCase()}! ` : ''}${spokenSan(r.san)}.`;
        }
        if (f.ply !== clip.key + 1) return null;
        const m = clip.plies[clip.key]; const c = m.san.includes('#') ? 'checkmate' : m.review?.classification;
        const word = c && LABEL[c] && c !== 'checkmate' ? `${LABEL[c].text.toLowerCase()}! ` : '';
        const cap = prefs.captions && m.review?.explanation ? ` ${m.review.explanation}` : '';
        return `${word}${spokenSan(m.san)}.${cap}`.slice(0, 400);
      }
      case 'split': return `${spokenSan(f.playedSan)} was played. ${spokenSan(f.betterSan)} was better.`;
      case 'better': return f.arrow ? `Better was ${spokenSan(f.text.replace(/^Better was /, ''))}.` : null;
      case 'reveal': return clip.ratings.w && clip.ratings.b ? `They were rated ${clip.ratings.w} and ${clip.ratings.b}.` : null;
      case 'summary': {
        const a = clip.accuracy;
        const acc = a?.w != null && a?.b != null ? `White played with ${Math.round(a.w)} percent accuracy, Black with ${Math.round(a.b)}.` : 'Here is how both sides did.';
        return `${acc}${clip.overview ? ` ${clip.overview.split(/(?<=[.!?])\s/)[0]}` : ''}`.slice(0, 300);
      }
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
  }, [prefs.voice, prefs.voiceName, frames, hook, prefs.outroLine, compTitle, prefs.captions]); // eslint-disable-line react-hooks/exhaustive-deps
  const voiceAudio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { if (!playing) { voiceAudio.current?.pause(); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } }, [playing]);
  useEffect(() => {
    if (!prefs.voice || !playing) return;
    const said = narration(frame);
    if (!said) return;
    voiceAudio.current?.pause();
    const url = voiceUrl.current.get(said);
    if (url) voiceAudio.current = mus().playVoice(url);
    else if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(said)); }
  }, [i, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Word-by-word subtitles of the voiceover (burned into the frame, so they're in the recording) ─
  const [, setSubTick] = useState(0);
  const subsOn = prefs.voice && prefs.subs && playing;
  useEffect(() => {
    if (!subsOn) return;
    const t = setInterval(() => setSubTick((x) => x + 1), 70);
    return () => clearInterval(t);
  }, [subsOn]);

  const restart = () => {
    looks.current.clear();
    dueAt.current = null; nextClipAt.current = null;
    if (playing && prefs.music !== 'off') mus().start(prefs.music);
    if (isComp && q !== 0) { autoNext.current = true; setQ(0); return; }
    setI(0); setPlaying(true);
  };

  // ── Stickers ────────────────────────────────────────────────────────────
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const addSticker = (text: string, kind: Sticker['kind'], tone?: number) => {
    const id = Date.now();
    setStickers((s) => [...s, { id, text, kind, tone, x: 50, y: kind === 'emoji' ? 30 : 22, size: kind === 'emoji' ? 12 : kind === 'badge' ? 7 : 6 }]);
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
      // No tab audio shared: record the music and voice straight from the mix.
      if (!stream.getAudioTracks().length && (prefs.music !== 'off' || prefs.voice || prefs.musicFx)) mus().stream.getAudioTracks().forEach((t) => stream.addTrack(t.clone()));
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
      if (e.key === 'Escape') { if (clean) exitClean(); else close(); }
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
    const url = drawCover({ fen, flipped, hook: stripEmoji(hook) || hook, sub, bg: prefs.bg, badge: prefs.guess ? { glyph: '?', text: 'Find it', color: '#81B64C' } : c && LABEL[c] ? LABEL[c] : null, colors });
    const a = document.createElement('a'); a.href = url; a.download = `${clip.fileBase}-cover.png`; a.click();
  };

  // ── Post kit ────────────────────────────────────────────────────────────
  const postText = clip ? `${isComp ? stripEmoji(compTitle) : hook}\n\n${clip.isTrap ? 'Would you fall for it? 👇' : clip.isPuzzle ? 'Did you solve it? Drop the first move in the comments 👇' : clip.isReview ? 'Which move would you have played differently? 👇' : 'Would you have found it? Comment your move 👇'}\nReview your own games free at chessscout.net\n\n${hashtagsFor(clip)}` : '';
  const [copied, setCopied] = useState(false);
  const copyPost = () => { navigator.clipboard?.writeText(postText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };

  if (err) return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-6 text-white" onClick={close}><p>{err}</p></div>;
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
  const moveNo = cur ? `${Number(cur.fenBefore.split(' ')[5]) || Math.floor((view.ply - 1) / 2) + 1}${cur.color === 'w' ? '.' : '...'}` : '';
  const label = cls ? LABEL[cls] : null;
  // Arrows: the better move on a mistake (key frame), the engine line's first move, nothing otherwise.
  const arrows: { from: string; to: string; color?: string }[] = [];
  if (frame?.kind === 'better' && frame.arrow) arrows.push({ ...frame.arrow, color: 'rgba(129,182,76,0.95)' });
  if (prefs.arrow && isKey && rev?.betterMove && cls && BAD.has(cls)) {
    try { const c = new Chess(plies[keyPly - 1].fenBefore); const mv = c.move(rev.betterMove); if (mv) arrows.push({ from: mv.from, to: mv.to, color: 'rgba(129,182,76,0.9)' }); } catch { /* ignore */ }
  }
  let subWords: { words: string[]; hi: number } | null = null;
  const said = subsOn && frame && ['move', 'split', 'better', 'reveal'].includes(frame.kind) ? narration(frame) : null;
  if (said) {
    const words = said.split(/\s+/).filter(Boolean);
    const len = Math.max(400, (voiceLen.current.get(said) ?? words.length * 0.36) * 1000);
    const k = Math.max(0, Math.min(words.length - 1, Math.floor(((performance.now() - frameStart) / len) * words.length)));
    const c0 = Math.floor(k / 4) * 4;
    subWords = { words: words.slice(c0, c0 + 4), hi: k - c0 };
  }
  const caption = frame?.kind === 'better' ? frame.text : prefs.captions && cur && !subWords ? rev?.explanation : null;
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
      <div className={`flex min-h-0 flex-1 items-center justify-center ${clean ? 'p-0' : 'p-3'}`} onClick={() => { setSelected(null); if (clean) showExit(); }}>
        <div ref={frameRef} className="relative overflow-hidden"
          style={{ aspectRatio: '9 / 16', height: clean ? '100dvh' : 'min(100%, 92dvh)', maxWidth: '100%', containerType: 'size', ...BACKGROUNDS[prefs.bg]?.css } as React.CSSProperties}>
          <motion.div key={shake} animate={shake ? { x: [0, -14, 12, -8, 6, 0] } : {}} transition={{ duration: 0.45 }} className="absolute inset-0">
            {prefs.progress && <div className="absolute inset-x-0 top-0 z-20 h-[0.6cqh] bg-white/15"><div className="h-full bg-[#81B64C] transition-all duration-300" style={{ width: `${progress * 100}%` }} /></div>}
            {/* Hook: pops in big on the intro, then sits at the top */}
            <motion.div key={frame?.kind === 'intro' ? 'intro' : 'top'} initial={frame?.kind === 'intro' ? { scale: 0.6, opacity: 0, y: '18cqh' } : false}
              animate={{ scale: 1, opacity: pop || frame?.kind === 'countdown' ? 0 : 1, y: frame?.kind === 'intro' ? '18cqh' : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="absolute inset-x-0 top-[6.5%] z-10 px-[6%] text-center">
              {isComp && frame?.kind === 'intro' && (
                <motion.div key={`rank${clipQ}`} initial={{ scale: 3, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.15 }}
                  className="relative mx-auto mb-[1.5cqh] w-fit" style={{ fontSize: 'clamp(28px,5cqh,54px)' }}>
                  <Rays color={rankColor(queue!.length - clipQ)} size={5} /><Medallion glyph={`#${queue!.length - clipQ}`} color={rankColor(queue!.length - clipQ)} size={2} />
                </motion.div>
              )}
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
                      arrows={arrows} maxWidthOverride="100%" animationMs={Math.min(450, prefs.speed * 300)} suppressConfirmMoves
                      moveFx={prefs.pieceFx ? Math.round(Math.max(260, Math.min(560, prefs.speed * 450))) : undefined} />
                  )}
                </LookOverride>
              </motion.div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#2B2B2B]"><div className="h-full rounded-full bg-[#F2F2F2] transition-all duration-500" style={{ width: `${evPct}%` }} /></div>
              <p className="mt-1 truncate text-[clamp(11px,1.6cqh,16px)] font-bold text-white/85">{name(top === 'w' ? 'b' : 'w')}</p>
            </div>
            {/* Move + caption */}
            {(showBottomMove || caption) && !subWords && frame?.kind !== 'outro' && frame?.kind !== 'reveal' && (
              <div className="absolute inset-x-[5%] bottom-[9%] z-10">
                {showBottomMove && cur && (
                  <div className="flex items-center gap-2">
                    {label && <span className="shrink-0" style={{ fontSize: 'clamp(11px,1.45cqh,15px)' }}><Medallion glyph={label.glyph} color={label.color} size={2.1} /></span>}
                    <p className="truncate text-[clamp(14px,2.4cqh,24px)] font-black text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,.6)' }}>
                      {moveNo}{figurine(cur.san, cur.color === 'w')}{label && cls !== 'book' && cls !== 'good' ? <span style={{ color: label.color }}> {label.text.toLowerCase()}</span> : null}
                    </p>
                  </div>
                )}
                {caption && <p className={`mt-1 line-clamp-3 text-[clamp(12px,1.9cqh,19px)] font-semibold leading-snug ${frame?.kind === 'better' ? 'text-[#B8E08C]' : 'text-white/90'}`} style={{ textShadow: '0 2px 8px rgba(0,0,0,.6)' }}>{caption}</p>}
              </div>
            )}
            {subWords && (
              <div className="pointer-events-none absolute inset-x-[5%] bottom-[12.5%] z-[25] text-center">
                <p className="font-black uppercase leading-[1.1]" style={{ fontSize: 'clamp(16px,3.3cqh,34px)', textShadow: '0 0 4px #000, 0 0 10px #000, 0 4px 0 #000', WebkitTextStroke: '1.5px #000' }}>
                  {subWords.words.map((w, k) => (
                    <motion.span key={`${w}-${k}`} initial={k === subWords!.hi ? { scale: 1.25 } : false} animate={{ scale: 1 }} className="inline-block" style={{ color: k === subWords!.hi ? '#FFD84D' : '#fff', marginRight: '0.28em' }}>{w}</motion.span>
                  ))}
                </p>
              </div>
            )}
            {prefs.watermark && frame?.kind !== 'outro' && <p className="absolute inset-x-0 bottom-[3%] z-10 flex items-center justify-center gap-[0.4em] text-[clamp(10px,1.5cqh,15px)] font-black tracking-wide text-white/80"><img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="" style={{ width: '1.5em', height: '1.5em' }} />chessscout.net</p>}
            {/* Countdown */}
            <AnimatePresence>
              {frame?.kind === 'countdown' && (
                <motion.div key={frame.n} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.35 }}
                  className="absolute inset-x-0 top-[6%] z-20 flex h-[15%] items-center justify-center gap-[2.2cqh] px-[5%]">
                  <div style={{ fontSize: 'clamp(36px,7.6cqh,82px)' }}><CountdownRing n={frame.n} seconds={dur(frame) / 1000} color={frame.n === 1 ? '#F0605D' : frame.n === 2 ? '#E8B447' : '#81B64C'} /></div>
                  <p className="rounded-full bg-[#81B64C] px-[1em] py-[0.35em] font-black uppercase leading-tight text-white shadow-xl ring-2 ring-white" style={{ fontSize: 'clamp(14px,2.6cqh,28px)', textShadow: '0 1px 0 #3E6420' }}>{clip.isTrap ? 'Spot the winning move' : 'Can you find it?'}</p>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Edge flash in the badge's colour */}
            <AnimatePresence>
              {pop && LABEL[pop.cls] && prefs.effects && (
                <motion.div key={`f${pop.at}`} initial={{ opacity: 0.95 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }}
                  className="pointer-events-none absolute inset-0 z-[19]" style={{ boxShadow: `inset 0 0 14cqh ${LABEL[pop.cls].color}` }} />
              )}
            </AnimatePresence>
            {/* Badge pop + eval swing */}
            <AnimatePresence>
              {pop && LABEL[pop.cls] && (
                <motion.div key={pop.at} initial={{ scale: 0, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }} exit={{ scale: 1.3, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 14 }} onAnimationComplete={() => setTimeout(() => setPop((p) => (p && p.at === pop.at ? null : p)), 1100)}
                  className="pointer-events-none absolute left-1/2 top-[13.5%] z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center">
                  <div style={{ fontSize: 'clamp(20px,4cqh,42px)' }}>
                    <StudioBadge {...LABEL[pop.cls]} rays={['brilliant', 'great', 'checkmate'].includes(pop.cls)} />
                  </div>
                  {isKey && prevEval != null && rev?.evalAfterCp != null && Math.abs(rev.evalAfterCp - prevEval) >= 150 && (
                    <div style={{ fontSize: 'clamp(13px,2.3cqh,24px)' }}><EvalSwing from={fmtEval(prevEval)} to={fmtEval(rev.evalAfterCp)} color={LABEL[pop.cls].color} /></div>
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
            {/* Game review summary: accuracy and how many of each kind of move, both sides */}
            <AnimatePresence>
              {frame?.kind === 'summary' && (() => {
                const rows = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'blunder', 'missed_win']
                  .map((c) => ({ c, w: plies.filter((p) => p.color === 'w' && p.review?.classification === c).length, b: plies.filter((p) => p.color === 'b' && p.review?.classification === c).length }))
                  .filter((r) => r.w || r.b);
                const acc = clip.accuracy ?? { w: null, b: null };
                const who = (side: 'w' | 'b') => (prefs.showNames && clip.names[side] ? clip.names[side]! : side === 'w' ? 'White' : 'Black');
                return (
                  <motion.div initial={{ opacity: 0, y: 30, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    className="absolute inset-x-[5%] top-[21%] z-30 rounded-[3cqh] bg-[#0B1112]/92 p-[2.4cqh] text-white shadow-2xl ring-2 ring-white/70 backdrop-blur" style={{ fontSize: 'clamp(11px,1.9cqh,20px)' }}>
                    <p className="text-center font-black uppercase tracking-wide text-[#B8E08C]" style={{ fontSize: '1.15em' }}>Game review{clip.result ? ` · ${clip.result}` : ''}</p>
                    <div className="mt-[1.4cqh] grid grid-cols-[1fr_auto_auto] items-center gap-x-[1.6cqh] gap-y-[0.9cqh]">
                      <span />
                      {(['w', 'b'] as const).map((side) => (
                        <div key={side} className="min-w-[4.6em] text-center">
                          <p className="truncate font-bold text-white/70" style={{ fontSize: '0.8em' }}>{who(side)}{clip.ratings[side] ? ` (${clip.ratings[side]})` : ''}</p>
                          <motion.p initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 380, damping: 14 }}
                            className="mt-[0.3em] rounded-[0.4em] px-[0.4em] py-[0.15em] font-black tabular-nums"
                            style={{ fontSize: '1.7em', background: side === 'w' ? '#F2F2F2' : '#2B2B2B', color: side === 'w' ? '#141414' : '#fff', border: '2px solid rgba(255,255,255,.6)' }}>
                            {acc[side] != null ? acc[side]!.toFixed(1) : '—'}
                          </motion.p>
                        </div>
                      ))}
                      {rows.map((r, k) => (
                        <React.Fragment key={r.c}>
                          <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 + k * 0.08 }} className="flex items-center gap-[0.55em] font-bold">
                            <span style={{ fontSize: '0.62em' }}><Medallion glyph={LABEL[r.c].glyph} color={LABEL[r.c].color} size={2.2} /></span>
                            <span style={{ color: shade(LABEL[r.c].color, 0.35) }}>{LABEL[r.c].text.charAt(0) + LABEL[r.c].text.slice(1).toLowerCase()}</span>
                          </motion.div>
                          {(['w', 'b'] as const).map((side) => (
                            <motion.span key={side} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 + k * 0.08 }}
                              className="text-center font-black tabular-nums" style={{ color: r[side] ? '#fff' : 'rgba(255,255,255,.3)', fontSize: '1.1em' }}>{r[side]}</motion.span>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>
            {/* Compilation title */}
            <AnimatePresence>
              {frame?.kind === 'title' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur-sm">
                  <motion.div initial={{ scale: 0.6, rotate: -4 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="px-[8%] text-center">
                    <p className="font-black leading-[1.05] text-white" style={{ fontSize: 'clamp(28px,6.6cqh,66px)', textShadow: '0 4px 20px rgba(0,0,0,.6)' }}>{compTitle}</p>
                    <div className="mt-[3cqh] flex flex-wrap justify-center gap-[1.4cqh]" style={{ fontSize: 'clamp(18px,3.4cqh,36px)' }}>
                      {Array.from({ length: queue?.length ?? 0 }, (_, k) => (queue?.length ?? 0) - k).map((n, k) => (
                        <motion.div key={n} initial={{ y: 30, opacity: 0, scale: 0.5 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ delay: 0.35 + k * 0.12, type: 'spring', stiffness: 380, damping: 14 }}>
                          <Medallion glyph={`#${n}`} color={rankColor(n)} size={2.2} />
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* End card */}
            <AnimatePresence>
              {frame?.kind === 'outro' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center bg-black/75 backdrop-blur-sm">
                  <motion.div initial={{ scale: 0.7, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 16 }} className="px-[8%] text-center">
                    <motion.img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="" initial={{ rotate: -25, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.1 }}
                      className="mx-auto mb-[2cqh] drop-shadow-2xl" style={{ width: '16cqh', height: '16cqh' }} />
                    <p className="font-black text-white" style={{ fontSize: 'clamp(26px,6cqh,60px)' }}>Chess<span className="text-[#81B64C]">Scout</span><span className="text-white/70">.net</span></p>
                    <p className="mt-2 font-bold text-white/90" style={{ fontSize: 'clamp(15px,2.8cqh,28px)' }}>{prefs.outroLine}</p>
                    {prefs.handle && <motion.p animate={{ scale: [1, 1.07, 1] }} transition={{ duration: 1.1, repeat: Infinity, delay: 0.6 }} className="mt-4 inline-block rounded-full px-[1.1em] py-[0.4em] font-black text-white ring-2 ring-white" style={{ fontSize: 'clamp(14px,2.4cqh,24px)', background: 'linear-gradient(180deg,#9BCB62,#81B64C 55%,#5F8F36)', boxShadow: '0 0.2em 0 #3E6420, 0 0.5em 1.4em rgba(0,0,0,.45)' }}>Follow {prefs.handle}</motion.p>}
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
                  : st.kind === 'badge' && LABEL[st.text]
                  ? <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }} style={{ fontSize: `${st.size * 0.45}cqh`, transform: 'rotate(-4deg)' }}><StudioBadge {...LABEL[st.text]} /></motion.div>
                  : <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }} className="block whitespace-nowrap font-black"
                      style={{ fontSize: `${st.size * 0.4}cqh`, padding: '0.2em 0.6em', borderRadius: '0.45em', background: `linear-gradient(180deg, ${shade(TONES[st.tone ?? 0].bg, 0.18)}, ${TONES[st.tone ?? 0].bg} 55%, ${shade(TONES[st.tone ?? 0].bg, -0.15)})`, color: TONES[st.tone ?? 0].fg, border: '0.14em solid #fff', transform: 'rotate(-6deg)', boxShadow: '0 0.18em 0 rgba(0,0,0,.35), 0 0.35em 1em rgba(0,0,0,.4)', letterSpacing: '0.01em' }}>{st.text}</motion.span>}
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
          {clean && (
            <button onClick={(e) => { e.stopPropagation(); exitClean(); }} aria-label="Exit clean view"
              className="absolute left-3 top-3 z-[60] flex items-center gap-1.5 rounded-full bg-black/75 px-3.5 py-2 text-[13px] font-black text-white ring-1 ring-white/30 transition-opacity duration-300"
              style={{ opacity: exitHint ? 1 : 0 }}>
              <X size={15} />Exit clean view
            </button>
          )}
        </div>
      </div>

      {/* ── Controls ── */}
      {!clean && (
        <div className="max-h-[46dvh] w-full shrink-0 overflow-y-auto border-t border-white/10 bg-[#0B1112] p-4 lg:max-h-none lg:w-[400px] lg:border-l lg:border-t-0">
          <div className="mb-3 flex items-center gap-1.5">
            <p className="flex-1 truncate text-[15px] font-black">{clip.label}</p>
            {onPrev && <button onClick={onPrev} className={ctl} title="Previous moment (P)"><SkipBack size={14} /></button>}
            {onNext && <button onClick={onNext} className={ctl} title="Next moment (N)"><SkipForward size={14} /></button>}
            <button onClick={close} aria-label="Close" className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"><X size={18} /></button>
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
            <button onClick={enterClean} className={ctl}><EyeOff size={14} className="mr-1 inline" />Clean view</button>
            <button onClick={saveCover} className={ctl} title="Download a cover image for the post"><ImageIcon size={14} className="mr-1 inline" />Cover image</button>
          </div>
          {isComp && (
            <div className="mb-3">
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-white/50">Compilation title · clip {clipQ + 1} of {queue!.length}</label>
              <input value={compTitle} onChange={(e) => setCompTitle(e.target.value)} className="w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white outline-none ring-1 ring-white/10 focus:ring-[#81B64C]" />
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
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50"><Music size={11} className="mr-1 inline" />Music &amp; sound</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {MUSIC_STYLES.map((m) => (
              <button key={m.id} onClick={() => set('music', m.id)} className="rounded-full px-2.5 py-1 text-[12px] font-bold"
                style={{ background: prefs.music === m.id ? 'rgba(129,182,76,.25)' : 'rgba(255,255,255,.06)', color: prefs.music === m.id ? '#B8E08C' : '#C9CFCD', border: `1px solid ${prefs.music === m.id ? 'rgba(129,182,76,.5)' : 'rgba(255,255,255,.1)'}` }}>
                {m.label}{m.bpm ? <span className="ml-1 opacity-60">{m.bpm}</span> : null}
              </button>
            ))}
          </div>
          {prefs.music !== 'off' && (
            <div className="mb-2 flex items-center gap-2 text-[12px] text-white/70">
              Volume
              <input type="range" min={0.05} max={1} step={0.05} value={prefs.musicVol} onChange={(e) => set('musicVol', Number(e.target.value))} className="flex-1" />
              {toggle('beatSync', 'Moves on the beat')}
            </div>
          )}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {toggle('musicFx', 'Sound effects')}
            {prefs.voice && toggle('subs', 'Word-by-word subtitles')}
          </div>
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

          {clip.isReview && (
            <div className="mb-3">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Game review</p>
              <div className="inline-flex rounded-lg bg-white/5 p-0.5">
                {([['highlights', 'Highlights'], ['full', 'Every move']] as const).map(([k, t]) => (
                  <button key={k} onClick={() => set('reviewMode', k)} className="rounded-md px-3 py-1 text-[12px] font-bold" style={{ background: prefs.reviewMode === k ? '#81B64C' : 'transparent', color: prefs.reviewMode === k ? '#fff' : '#C9CFCD' }}>{t}</button>
                ))}
              </div>
              <p className="mt-1 text-[11.5px] text-white/45">Highlights plays the two moves before each brilliant, great, mistake and blunder, then the summary card.</p>
            </div>
          )}
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
            {toggle('pieceFx', 'Animated pieces')}
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
            {TEXT_STICKERS.map((t, k) => <button key={t} onClick={() => addSticker(t, 'text', k % TONES.length)} className="rounded-md px-2 py-1 text-[11px] font-black ring-1 ring-white/30" style={{ background: TONES[k % TONES.length].bg, color: TONES[k % TONES.length].fg }}>{t}</button>)}
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {BADGE_STICKERS.map((c) => <button key={c} onClick={() => addSticker(c, 'badge')} className="rounded-lg bg-white/5 px-1.5 py-1 hover:bg-white/10" style={{ fontSize: 9 }} title={LABEL[c].text}><StudioBadge {...LABEL[c]} /></button>)}
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
            Music is made live in the browser (original, no copyright claims); it starts on the beat when you press Play. Space plays, arrows step, R restarts, N / P next and previous moment, Esc leaves clean view. "Record clip" saves just the frame (Chrome on a computer: pick this tab and turn on tab audio for move sounds).
            On a phone, open Clean view and use the screen recorder; tap the screen (or press back) to get the Exit button. Settings are remembered for the next clip.
          </p>
          <p className="mt-2 text-[11px] text-white/35"><Eye size={12} className="mr-1 inline" />{clip.label}</p>
        </div>
      )}
    </div>
  );
}
