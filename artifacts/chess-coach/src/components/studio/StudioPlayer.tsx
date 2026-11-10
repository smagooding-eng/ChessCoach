import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Chess } from 'chess.js';
import { X, Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Shuffle, Video, Square, Eye, EyeOff, FlipVertical2, Trash2, Copy, SkipForward, SkipBack, Mic, Image as ImageIcon, Music, ArrowUp, ArrowDown } from 'lucide-react';
import { ChessBoard, type MoveQuality } from '@/components/ChessBoard';
import { LookOverride, randomLook, lookLabel, playMoveSound, BOARD_THEMES, type BoardLook } from '@/context/SettingsContext';
import { routeSoundsTo } from '@/lib/sounds';
import { apiFetch } from '@/lib/api';
import { normalizeFen } from '@/lib/utils';
import { StudioBadge, Medallion, Rays, CountdownRing, EvalSwing, rankColor, shade } from './StudioBadge';
import { StudioSplash } from './StudioSplash';
import { RenderMp4 } from './RenderMp4';
import { StudioMusic, MUSIC_STYLES, bpmOf, type MusicStyle } from './studioMusic';
import { mapTree, findEpisode, nextEpisode, partLabel, type MapEpisode } from './openingMap';
import { reelFrameSize } from './reelKit';

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
  /** Opening moves from move 1 to startingFen, when the trap starts mid-opening (found by the server). */
  leadIn?: string[];
}
export interface StudioPuzzle { id: number; fen: string; moves: string; rating: number; themes: string | null; explanation: string | null; source: string; gameId: number | null }
export interface StudioReview {
  id: number; opening: string | null; white: string | null; black: string | null; whiteRating: number | null; blackRating: number | null;
  result: string | null; platform: string | null; playedAt: string | null; whiteAccuracy: number | null; blackAccuracy: number | null;
  moments: number; brilliant: number; blunders: number; mate: number; lastFen: string | null;
  /** False when the game has no move-by-move review yet. */
  reviewed?: boolean; chesscomGameId?: string | null; url?: string | null;
  /** Comebacks: who won, their worst Stockfish eval on the way (centipawns, their side), and that move. */
  winner?: 'white' | 'black' | null; worstCp?: number | null; worstMove?: number | null;
}
/** "Down 6.4 and still won" style hook, from the game's real eval. */
export function comebackHook(r: StudioReview): string | null {
  if (r.worstCp == null || !r.winner) return null;
  const who = (r.winner === 'white' ? r.white : r.black) ?? (r.winner === 'white' ? 'White' : 'Black');
  if (r.worstCp <= -1500) return `${who} was getting mated… and won 🤯`;
  return `${who} was down ${(Math.abs(r.worstCp) / 100).toFixed(1)}… and won 🔥`;
}
export interface ScoutData {
  username: string; gamesAnalyzed: number; wins: number; losses: number; draws: number;
  profile?: { name?: string; title?: string; avatar?: string; country?: string; ratings?: { bullet?: number; blitz?: number; rapid?: number } } | null;
  topOpenings?: { opening: string; games: number; winRate: number }[];
  weaknesses?: { category: string; severity: string; description: string }[];
  gamePgns?: string[];
  /** Worked out from their games (Studio only): colours, first moves, how games end, rating. */
  stats?: ScoutStats | null;
}
type Rec = { games: number; wins: number; draws: number; losses: number };
type EndBy = { checkmate: number; resignation: number; time: number; other: number };
export interface ScoutStats {
  asWhite: Rec; asBlack: Rec; firstMove: { san: string; pct: number }[];
  vsE4: { san: string; pct: number } | null; vsD4: { san: string; pct: number } | null;
  winsBy: EndBy; lossesBy: EndBy; avgMoves: number | null; timeControl: string | null;
  rating: { start: number; end: number; peak: number } | null;
}
export interface StudioScout { id: string; username: string; completedAt?: string | null; result: ScoutData }
export interface LessonStep { type: 'text' | 'board' | 'practice' | 'drill'; text: string; fen?: string; highlightSquares?: string[]; expectedMoveSan?: string }
export interface StudioLesson { id: number; courseId: number; title: string; summary: string; steps: LessonStep[]; course?: { title: string; icon: string } }
export type StudioSource =
  | { kind: 'game'; moment: StudioMoment } | { kind: 'trap'; trap: StudioTrap }
  | { kind: 'puzzle'; puzzle: StudioPuzzle } | { kind: 'review'; review: StudioReview; /** A promo for the game review itself. */ showcase?: boolean }
  | { kind: 'scout'; scout: StudioScout } | { kind: 'lesson'; lesson: StudioLesson }
  | { kind: 'scan'; fen: string; photo?: string; label?: string }
  | { kind: 'promo'; promo: StudioPromo }
  | { kind: 'line'; line: StudioLine }
  /** line: one variation's name for a one-line deep-dive video (unset = the whole opening). */
  | { kind: 'opening'; opening: { id: string; name: string; line?: string } }
  /** An Opening Map episode (a tree of opening names). */
  | { kind: 'map'; episode: number };
/** An opening clip: the main line, the ideas, the replies (with real-game and engine numbers) and each main variation. */
export interface StudioOpening {
  id: string; name: string; side: 'white' | 'black'; hook: string; ideas: string[]; line: string[];
  games: number; results: { white: number; draw: number; black: number } | null;
  /** Where the numbers come from: Lichess's opening explorer, or ChessScout's own games. */
  source?: 'lichess' | 'chessscout';
  /** lines: which variations (by index) start with this move. */
  options: { san: string; pct: number | null; games: number; scorePct: number | null; eval: number | null; lines?: number[] }[];
  lines: { name: string; short?: string; moves: string[]; note: string; pct: number | null; eval: number | null; why?: string[]; games?: number; whiteScore?: number | null; next?: { san: string; eval: number | null } | null }[];
  trap: { name: string; moves: string[]; notes: string[]; critical: number; summary: string } | null;
}
/** A game made in the Position Explorer (best / worst moves per side), every move graded by Stockfish. */
export interface StudioLine { startFen: string; title: string; white: string; black: string; moves: { san: string; classification: string; evalAfterCp: number | null; betterMove: string | null; loss?: number }[] }
/** Promo clips: ChessScout vs another site (your rows, your words), or "challenge your friends". */
export interface StudioPromo { template: 'versus' | 'challenge' | 'live' | 'tour'; hook: string; rival: string; rows: { label: string; us: string; them: string }[]; closer: string }

interface ReviewMove { moveIndex?: number; san: string; color?: 'white' | 'black'; classification?: string; explanation?: string; betterMove?: string | null; evalAfterCp?: number; fen?: string; bestLineSan?: string[] }
interface StudioGame { id: number; pgn: string; opening: string | null; white: string; black: string; whiteRating: number | null; blackRating: number | null; moves: ReviewMove[]; whiteAccuracy?: number | null; blackAccuracy?: number | null; overview?: string | null; result?: string | null }
interface Ply { san: string; from: string; to: string; fen: string; fenBefore: string; color: 'w' | 'b'; review?: ReviewMove }
interface Sticker { id: number; text: string; x: number; y: number; size: number; kind: 'emoji' | 'text' | 'badge' | 'caption' | 'reply'; tone?: number; /** Keyframes: shown from this frame to that one (frame ids); unset = the whole clip. */ from?: string; to?: string }
interface Clip {
  plies: Ply[]; key: number; tags: string[]; hook: string; sub: string; names: { w: string | null; b: string | null };
  ratings: { w: number | null; b: number | null }; fileBase: string; label: string; isTrap: boolean; opening: string | null;
  /** A puzzle: the opponent's move, then the solution (played to the end). */
  isPuzzle?: boolean; puzzleRating?: number;
  /** A whole game review: every move (or the highlights) and a summary card. */
  /** Review showcase (a promo for the game review, made from a real reviewed game). */
  showcase?: boolean;
  isReview?: boolean; accuracy?: { w: number | null; b: number | null }; overview?: string | null; result?: string | null;
  /** An Opponent Scout report: their favourite opening plays behind stat cards. */
  isScout?: boolean; scout?: ScoutData;
  /** A kids / beginner lesson: the coach explains, you try the move. */
  isLesson?: boolean; lesson?: StudioLesson;
  /** A scanned board: (the photo,) then the engine's best line. */
  isScan?: boolean; photo?: string;
  isPromo?: boolean; promo?: StudioPromo;
  /** Opening clips: where the main line, each variation and the trap sit in plies (1-based, inclusive). */
  isOpening?: boolean; openingData?: StudioOpening; ranges?: { main: [number, number]; lines: [number, number][]; trap: [number, number] | null };
  /** One-line deep dive: which line it is (1-based) out of how many the opening has. */
  lineMode?: { no: number; of: number };
  /** Opening Map episode: the board walks a tree of opening names. */
  isMap?: boolean; map?: MapEpisode;
}
type Frame =
  | { kind: 'intro'; fen: string }
  | { kind: 'move'; ply: number }
  | { kind: 'countdown'; n: number; fen: string; last: { from: string; to: string } | null; total?: number; text?: string; /** Inserted on the timeline before this frame id. */ anchor?: string }
  /** A full-screen line of text inserted on the timeline (quotes, "Part 2", a question). */
  | { kind: 'card'; fen: string; text: string; secs: number; anchor: string }
  | { kind: 'better'; fen: string; last: { from: string; to: string } | null; arrow: { from: string; to: string } | null; text: string }
  | { kind: 'reveal'; fen: string }
  | { kind: 'split'; played: { fen: string; last: { from: string; to: string } }; better: { fen: string; last: { from: string; to: string } }; playedSan: string; betterSan: string }
  | { kind: 'title'; fen: string }
  | { kind: 'summary'; fen: string }
  | { kind: 'scoutCard'; fen: string; last: { from: string; to: string } | null; card: 'profile' | 'colors' | 'openings' | 'habits' | 'weak'; idx?: number }
  | { kind: 'lessonText'; fen: string; text: string }
  | { kind: 'lessonBoard'; fen: string; text: string; highlights: string[]; last: { from: string; to: string } | null; celebrate?: boolean }
  | { kind: 'scanPhoto'; fen: string }
  /** The app's splash animation, after the end card. */
  | { kind: 'splash'; fen: string }
  | { kind: 'promoCard'; fen: string; last: { from: string; to: string } | null; card: 'vs' | 'switch' | 'live' | 'daily' | 'link' | 'match' | 'react' | 'review' | 'tour'; upTo?: number }
  /** Review showcase: the hook over the board, both players' move grades, and the closing card. */
  | { kind: 'rvCard'; fen: string; last: { from: string; to: string } | null; card: 'hook' | 'grades' | 'cta' }
  /** Opening clips: the ideas, real-game results, the replies, a variation's title, the trap's title. */
  | { kind: 'openCard'; fen: string; last: { from: string; to: string } | null; card: 'ideas' | 'stats' | 'options' | 'line' | 'trap' | 'why' | 'lineStats' | 'next'; idx?: number }
  /** Opening clips: the board winding back to the branch point after a line. */
  | { kind: 'rewind'; fen: string; last: { from: string; to: string } | null; idx: number }
  /** A beat on the starting position once the title / hook clears, so the first move is never hidden. */
  | { kind: 'hold'; fen: string; last: { from: string; to: string } | null }
  /** Opening clips: the hook scene, first thing on screen (the trap's final position, or the big question). */
  | { kind: 'teaser'; fen: string; last: { from: string; to: string } | null; text: string; sub: string; said: string; mate: boolean; /** Shows like / follow / share chips (the line says so). */ cta?: boolean }
  /** Opening Map: a move on the way to the next branch (back = winding back), and a named stop. */
  | { kind: 'mapMove'; fen: string; last: { from: string; to: string } | null; step: number; back?: boolean; capture?: boolean }
  | { kind: 'mapStep'; fen: string; last: { from: string; to: string } | null; step: number }
  | { kind: 'mapEnd'; fen: string; last: null; card: 'summary' | 'next' }
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
  kids: { label: 'Kids', css: { background: 'linear-gradient(165deg, #FFB547 0%, #FF6FA8 48%, #7C5CFF 100%)' } },
  sky: { label: 'Sky', css: { background: 'linear-gradient(170deg, #5BC0FF 0%, #2E7BEA 55%, #1B3FA8 100%)' } },
  gold: { label: 'Gold', css: { background: 'radial-gradient(120% 80% at 50% 0%, #5A4410 0%, #1A1406 65%, #0B0903 100%)' } },
  screen: { label: 'Green screen', css: { background: '#00FF00' } },
};
const EMOJIS = ['🔥', '😱', '🤯', '🧠', '👀', '💀', '🏆', '♟️', '⚡', '🎯', '😂', '🤔', '🍿', '😤', '👑', '💥'];
const TONES = [{ bg: '#F0605D', fg: '#fff' }, { bg: '#FFD84D', fg: '#141414' }, { bg: '#81B64C', fg: '#fff' }, { bg: '#FFFFFF', fg: '#141414' }, { bg: '#141414', fg: '#fff' }, { bg: '#1BACA6', fg: '#fff' }];
const BADGE_STICKERS = ['brilliant', 'great', 'best', 'excellent', 'book', 'inaccuracy', 'mistake', 'blunder', 'missed_win', 'checkmate'];
const MEME_CAPTIONS = ['BRO THOUGHT IT WAS FREE', "HE DIDN'T SEE IT COMING", '1 IN A MILLION MOVE', 'WAIT FOR IT…', '800 ELO BEHAVIOR', 'THE AUDACITY', 'HOW DID HE MISS THIS', 'GRANDMASTER MOVE'];
interface Insert { timer?: { secs: number; text: string }; card?: { secs: number; text: string } }
function frameKey(f: Frame): string {
  if (f.kind === 'move') return `m${f.ply}`;
  if (f.kind === 'countdown') return f.anchor ? `x${f.n}` : `c${f.n}`;
  return f.kind;
}
/** Stable ids for frames (pauses, sticker in/out points and inserts hang off these). */
function assignIds(frames: Frame[], prefix: string): string[] {
  const seen: Record<string, number> = {};
  return frames.map((f) => { const k = frameKey(f); seen[k] = (seen[k] ?? 0) + 1; return `${prefix}:${k}${seen[k] > 1 ? `.${seen[k]}` : ''}`; });
}
const TEXT_STICKERS = ['BRILLIANT!!', 'BLUNDER??', 'WAIT FOR IT…', 'NO WAY', 'GG', 'FIND THE MOVE', 'TRAP!', 'MATE', 'PAUSE NOW', 'COMMENT YOUR MOVE'];

// ── Preferences that carry over between clips (this browser only) ─────────
export const PREF_KEY = 'cs_studio_prefs_v1';
const DEFAULT_PREFS = {
  before: 8, after: 5, speed: 1.2, guess: true, remix: true,
  /** With remix on: a new board and pieces every move, or once per scene (a run of moves, a card, the intro…). */
  remixEvery: 'move' as 'move' | 'scene', captions: true, effects: true, arrow: true, sound: true, watermark: true,
  bg: 'green', betterLine: true, guessRating: false, outro: true, progress: true, intro: true, safeArea: true, showNames: false,
  handle: '@chessscout.net3', outroLine: 'Review your games free',
  /** Call to action on the closing splash: spoken (with the voiceover on) and shown as big subtitles. */
  splashCta: true, ctaLine: 'Follow for more chess, and share this with a friend who needs to see it!',
  /** Adds a ChessScout.net line after the call to action (spoken and subtitled). */
  ctaSite: true, siteLine: 'Scout your next opponent free at ChessScout.net.',
  /** One-line opening videos: said near the start, right after what's about to be explained. */
  lineCtaLine: "Don't forget to like, follow and share for the other lines of this opening, and more openings!",
  /** Openings: a hook scene first; Full (every line) or Quick (one line plus the trap, under a minute). */
  openTeaser: true, openCut: 'full' as 'full' | 'quick',
  /** Clean view's 5-second lead-in: the first scene, still (so an untrimmed video never opens on black), or black. */
  leadIn: 'scene' as 'scene' | 'black',
  /** How the voiceover talks: Creator (punchy, reacts to the moves) or Teacher (the original, explains everything). */
  tone: 'creator' as 'creator' | 'teacher',
  /** Opening Map episodes: the board tilted back in 3D (off: the board stays flat). */
  tilt: false,
  /** Look of every clip: Coach (the coach's speech bubble, stamped badges, a topic header, an early
   *  call to action and a "comment your answer" ending) or Classic (the original look). */
  theme: 'coach' as 'coach' | 'classic',
  /** Fast start: most viewers decide in the first 3 seconds, so the board moves right away. No
   *  separate title card before a hook scene, a short hook line, no pause before the first move,
   *  and the like / follow / share ask comes after the first few moves. Off = the original order. */
  fastStart: true,
  /** App tour: 'tree' = the Family Tree look (the board always on screen, the coach's line on top,
   *  each feature stamped on and listed under the board); 'cards' = the original feature cards. */
  tourStyle: 'tree' as 'tree' | 'cards',
  /** Said near the start of every clip in the Coach look (empty = none). */
  earlyCta: "Like, follow and share for more chess like this!",
  /** The same, for Family Tree parts. */
  seriesCta: "Count along, then comment your score!",
  split: true, voice: false, voiceName: 'ash', compTitle: 'Top moments this week',
  music: 'off' as MusicStyle, musicVol: 0.5, beatSync: true, musicFx: true, subs: true, pieceFx: true, trapBefore: 99, countdownSecs: 3, choices: false, zoom: false, splash: true, reviewMode: 'highlights' as 'highlights' | 'full',
};
type Prefs = typeof DEFAULT_PREFS;
function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    // Once: the old default voices (onyx, and nova from the Kids preset) move to the new narrator.
    // Once: the tilted board was briefly the default; it's flat now.
    if (!saved.tiltV1) { saved.tilt = false; saved.tiltV1 = 1; }
    if (!saved.voiceV2) { if (!saved.voiceName || saved.voiceName === 'onyx' || saved.voiceName === 'nova') saved.voiceName = 'ash'; saved.voiceV2 = 1; }
    return { ...DEFAULT_PREFS, ...saved };
  } catch { return DEFAULT_PREFS; }
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
  return gameMateCounts(out);
}

/** The video shows the moves actually played, so "sets up checkmate in N" counts the
 *  mating side's moves to the checkmate that happens on screen, not the engine's
 *  best-defence count (which can be longer when the defender didn't find the checks). */
function gameMateCounts(plies: Ply[]): Ply[] {
  const mateAt = plies.findIndex((p) => p.san.includes('#'));
  if (mateAt < 0) return plies;
  const side = plies[mateAt].color;
  return plies.map((p, i) => {
    const ex = p.review?.explanation;
    if (!ex || i >= mateAt || !/(Sets up a forced checkmate in \d+|Sets up checkmate next move|This allows a forced checkmate(?!:))/.test(ex)) return p;
    let n = 0; for (let k = i + 1; k <= mateAt; k++) if (plies[k].color === side) n++;
    const setsUp = p.color === side;
    const fixed = ex
      .replace(/Sets up a forced checkmate in \d+\.|Sets up checkmate next move\./, (m0) => (setsUp ? (n <= 1 ? 'Sets up checkmate next move.' : `Sets up checkmate in ${n}.`) : m0))
      .replace(/This allows a forced checkmate(?!:)( in \d+)?/, (m0) => (!setsUp ? (n <= 1 ? 'This allows checkmate next move' : `This allows checkmate in ${n}`) : m0));
    return fixed === ex ? p : { ...p, review: { ...p.review!, explanation: fixed } };
  });
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
    label: `Game #${m.gameId} · move ${Math.floor(m.moveIndex / 2) + 1}${m.moveIndex % 2 ? '…' : '.'}`, isTrap: false, opening: m.opening,
  };
}

function trapClip(t: StudioTrap): Clip {
  // The punishing move after the victim's mistake is the one to find.
  const key0 = Math.min(t.moves.length - 1, t.critical + 1);
  const reviews: ReviewMove[] = t.moves.map((san, i) => ({
    san, explanation: t.notes[i] ?? '',
    classification: san.includes('#') ? 'checkmate' : i === t.critical ? 'blunder' : i === key0 ? 'great' : i < t.critical ? 'book' : 'best',
  }));
  // When the trap starts mid-opening, play the opening moves that lead there first.
  const lead = t.leadIn ?? [];
  let plies = lead.length ? playSans(undefined, [...lead, ...t.moves], [...lead.map((san) => ({ san, classification: 'book', explanation: '' })), ...reviews]) : [];
  if (plies.length !== lead.length + t.moves.length) plies = playSans(t.startingFen && t.startingFen !== 'startpos' ? t.startingFen : undefined, t.moves, reviews);
  const key = key0 + (plies.length > t.moves.length ? lead.length : 0);
  return {
    plies, key, tags: ['trap', ...(t.moves.some((s) => s.includes('#')) ? ['checkmate'] : [])],
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
  const themes = (p.themes ?? '').split(/[ ,]+/).filter(Boolean);
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

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** SAN moves from a PGN (headers, comments, variations and move numbers stripped). */
function pgnSans(pgn: string): string[] {
  return pgn.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\$\d+/g, ' ').split(/\s+/)
    .map((t) => t.replace(/^\d+\.+/, '')).filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}
/** Opening names a site couldn't work out ("Undefined", "Unknown") aren't shown. */
const realOpening = (o: string) => !!o && !/^(undefined|unknown|null|-|\?)$/i.test(o.trim());
function scoutClip(s: StudioScout): Clip {
  const d = { ...s.result, topOpenings: (s.result.topOpenings ?? []).filter((o) => realOpening(o.opening)) };
  const top = d.topOpenings?.[0]?.opening ?? '';
  const words = top.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  // A game of theirs in their favourite opening, to play behind the stats.
  const pgn = (d.gamePgns ?? []).find((g) => { const h = (g.match(/\[(Opening|ECOUrl) "([^"]+)"\]/g) ?? []).join(' ').toLowerCase(); return words.length > 0 && words.every((w) => h.includes(w)); }) ?? d.gamePgns?.[0] ?? '';
  const plies = pgn ? playSans(undefined, pgnSans(pgn).slice(0, 6), []) : [];
  const name = d.profile?.name || s.username;
  return {
    plies, key: Math.max(0, plies.length - 1), tags: ['scout'], hook: `Scouting ${name} 🔍`, sub: `${d.gamesAnalyzed} games scouted${top ? ` · plays the ${top}` : ''}`,
    names: { w: null, b: null }, ratings: { w: null, b: null }, fileBase: `chessscout-scout-${s.username}`, label: `Opponent scout · ${s.username}`,
    isTrap: false, opening: top || null, isScout: true, scout: d,
  };
}
function lessonClip(l: StudioLesson): Clip {
  return {
    plies: [], key: 0, tags: ['lesson'], hook: `${l.course?.icon ?? '♟️'} ${l.title}`, sub: l.summary,
    names: { w: null, b: null }, ratings: { w: null, b: null }, fileBase: `chessscout-lesson-${l.id}`, label: `Lesson · ${l.title}`,
    isTrap: false, opening: null, isLesson: true, lesson: l,
  };
}
function scanClip(fen: string, line: string[], photo?: string): Clip {
  const plies = playSans(fen, line.slice(0, 6), line.map((san, k) => (k === 0 ? { san, classification: 'best' } : undefined)));
  const side = fen.split(' ')[1] === 'b' ? 'Black' : 'White';
  return {
    plies, key: 0, tags: ['scan'], hook: photo ? 'I scanned this board. Best move? 📸' : `${side} to move. Best move? 📸`, sub: 'Scan any board with ChessScout',
    names: { w: null, b: null }, ratings: { w: null, b: null }, fileBase: 'chessscout-scan', label: 'Scanned position',
    isTrap: false, opening: null, isScan: true, photo,
  };
}
// App tour: what ChessScout does, one card each (only things the app really does).
const TOUR: { emo: string; title: string; line: string; say: string }[] = [
  { emo: '⚡', title: 'Play online', line: '5 minutes to 7 days a move, all on one screen', say: 'Play online, from five-minute games to one move a day, all on one screen.' },
  { emo: '♞', title: 'Play on Lichess', line: 'Nobody free? Play a real Lichess player, right here', say: 'Nobody free? Play real Lichess players, right inside ChessScout.' },
  { emo: '🔔', title: 'Never miss a move', line: "Daily games tell you when it's your turn", say: "And daily games tell you whenever it's your move." },
  { emo: '🤖', title: 'Practice bots', line: 'Every level, any time', say: 'Bots at every level, any time.' },
  { emo: '🧠', title: 'Every game reviewed', line: 'Accuracy, mistakes and the better move. Free', say: 'Every game reviewed free: your accuracy, your mistakes, and the better move.' },
  { emo: '🔍', title: 'Opponent Scout', line: 'Scout anyone on Chess.com or Lichess before you play', say: 'Scout your next opponent before you play them.' },
  { emo: '🧩', title: 'Puzzles', line: 'From real games, plus a daily puzzle', say: 'Puzzles from real games, plus a daily puzzle.' },
  { emo: '📖', title: 'Openings', line: 'Learn and drill the lines you play', say: 'Learn and drill your openings.' },
  { emo: '📸', title: 'Scan a board', line: 'Snap a photo, get the best move', say: 'Snap a photo of any board and get the best move.' },
  { emo: '🧒', title: 'Chess for Kids', line: 'Friendly games that teach every piece', say: 'Chess for Kids, with friendly games that teach every piece.' },
  { emo: '📺', title: 'Watch top events', line: 'Live broadcasts of top tournaments', say: 'And watch top tournaments live.' },
];
// The Opera Game (Morphy, Paris 1858): the classic short game, played behind promo cards.
const OPERA = 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(' ');
function promoClip(p: StudioPromo): Clip {
  const plies = playSans(undefined, OPERA, OPERA.map((san) => (san.includes('#') ? { san, classification: 'checkmate' } : undefined)));
  return {
    plies, key: plies.length - 1, tags: ['promo'], hook: p.hook, sub: p.template === 'versus' ? `ChessScout vs ${p.rival}` : 'Live and daily games on ChessScout',
    names: { w: null, b: null }, ratings: { w: null, b: null }, fileBase: `chessscout-promo-${p.template}`, label: p.template === 'versus' ? `Promo · vs ${p.rival}` : p.template === 'live' ? 'Promo · live play' : p.template === 'tour' ? 'Promo · app tour' : 'Promo · challenge your friends',
    isTrap: false, opening: null, isPromo: true, promo: p,
  };
}
/** A game count the voice can say: "2.4 million", "38 thousand", "512". */
const spokenCount = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')} million` : n >= 1e4 ? `${Math.round(n / 1000)} thousand` : String(n));
const evalText = (e: number | null | undefined) => (e == null ? '' : Math.abs(e) >= 90 ? (e > 0 ? 'White mates' : 'Black mates') : `${e > 0 ? '+' : ''}${e.toFixed(1)}`);
// What a move does, worked out from the position (never invented). It doesn't
// repeat the move itself (that's said just before): it says what the move is for.
const PIECE_NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const CENTER = ['d4', 'e4', 'd5', 'e5'];
function moveNote(fenBefore: string, san: string, prev?: { to: string; captured?: boolean }): string {
  try {
    const before = new Chess(fenBefore);
    const c = new Chess(fenBefore); const mv = c.move(san); if (!mv) return '';
    const me = mv.color as 'w' | 'b', them = (me === 'w' ? 'b' : 'w') as 'w' | 'b';
    const side = me === 'w' ? 'White' : 'Black';
    const P = PIECE_NAME[mv.piece];
    const at = (s: string) => c.get(s as never) as { type: string; color: string } | undefined;
    const turnTo = (g: Chess, col: 'w' | 'b') => { try { const p = g.fen().split(' '); p[1] = col; p[3] = '-'; return new Chess(p.join(' ')); } catch { return null; } };
    // The position with the mover to move again: what do they threaten now?
    const again = turnTo(c, me);
    const ctl = CENTER.filter((s) => c.attackers(s as never, me).includes(mv.to as never));
    // 1. What the move is.
    let head: string;
    if (mv.san.startsWith('O-O')) {
      const long = mv.san.startsWith('O-O-O');
      head = `${long ? 'Castles queenside' : 'Castles'}: the king tucks away and the rook comes to ${long ? 'd' : 'f'}${me === 'w' ? '1' : '8'}`;
    } else if (mv.captured) head = prev?.captured && prev.to === mv.to ? `Takes back on ${mv.to}` : `Grabs the ${PIECE_NAME[mv.captured]} on ${mv.to}`;
    else if ((mv.piece === 'n' || mv.piece === 'b') && mv.from[1] === (me === 'w' ? '1' : '8')) head = ['g2', 'b2', 'g7', 'b7'].includes(mv.to) ? 'The bishop goes to the long diagonal' : `Develops the ${P}`;
    else if (mv.piece === 'p' && CENTER.includes(mv.to)) head = 'Grabs space in the center';
    else if (mv.piece === 'p' && ['c4', 'c5', 'f4', 'f5'].includes(mv.to)) head = 'Hits the center from the side';
    else if (mv.piece === 'p' && ['g3', 'b3', 'g6', 'b6'].includes(mv.to)) head = `Makes room for the bishop on ${mv.to[0]}${me === 'w' ? '2' : '7'}`;
    else if (mv.piece === 'p' && ['a3', 'a6', 'h3', 'h6'].includes(mv.to)) {
      const kick = (again?.moves({ square: mv.to as never, verbose: true }) ?? []).find((m) => m.captured && m.captured !== 'p' && m.captured !== 'k');
      head = kick ? `Kicks the ${PIECE_NAME[kick.captured!]} on ${kick.to}` : `Takes the ${mv.to[0] === 'a' ? 'b' : 'g'}${me === 'w' ? '4' : '5'} square away`;
    }
    else if (mv.piece === 'p' && (ctl.length || ['c3', 'c6', 'd3', 'd6', 'e3', 'e6', 'f3', 'f6'].includes(mv.to))) head = 'Supports the center';
    else if (mv.piece === 'p') head = `Pushes the ${mv.to[0]}-pawn`;
    else head = `The ${P} goes to ${mv.to}`;
    if (mv.san.includes('#')) return `${head}. Checkmate!`;
    const does: string[] = []; const after: string[] = [];
    if (mv.san.includes('+')) does.push('gives check');
    // 2. Threats: mate in one, a fork, what it attacks (pawns only when they're short of defenders).
    let pinned = '';
    if ('bqr'.includes(mv.piece)) {
      const dirs = mv.piece === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : mv.piece === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [df, dr] of dirs) {
        let f = mv.to.charCodeAt(0) - 97 + df, r = Number(mv.to[1]) + dr; const seen: { s: string; p: { type: string; color: string } }[] = [];
        while (f >= 0 && f < 8 && r >= 1 && r <= 8 && seen.length < 2) { const s2 = String.fromCharCode(97 + f) + r; const p = at(s2); if (p) seen.push({ s: s2, p }); f += df; r += dr; }
        if (seen.length === 2 && seen.every((x) => x.p.color === them) && !'kp'.includes(seen[0].p.type) && (seen[1].p.type === 'k' || (seen[1].p.type === 'q' && seen[0].p.type !== 'q'))) {
          pinned = seen[0].s; does.push(`pins the ${PIECE_NAME[seen[0].p.type]} on ${seen[0].s} to the ${PIECE_NAME[seen[1].p.type]}`); break;
        }
      }
    }
    if (again) {
      const mate = again.moves({ verbose: true }).find((m) => m.san.includes('#'));
      if (mate) does.push(`threatens mate on ${mate.to}`);
      else {
        const hit = again.moves({ square: mv.to as never, verbose: true }).filter((m) => m.captured && m.captured !== 'k' && m.to !== pinned && !head.startsWith(`Kicks the ${PIECE_NAME[m.captured]} on ${m.to}`)).filter((m) => {
          if (m.captured !== 'p') return true;
          return c.attackers(m.to as never, them).length === 0 || c.attackers(m.to as never, me).length > c.attackers(m.to as never, them).length;
        });
        const pieces = hit.filter((m) => m.captured !== 'p');
        if (mv.piece !== 'k' && pieces.length >= 2) does.push(`forks the ${PIECE_NAME[pieces[0].captured!]} and the ${PIECE_NAME[pieces[1].captured!]}`);
        else if (hit.length) {
          const h = hit[0]; const n = c.attackers(h.to as never, me).length;
          if (h.captured === 'p' && n >= 2) after.push(`That's ${n === 2 ? 'two' : n} pieces on the pawn on ${h.to}.`);
          else does.push(`attacks the ${PIECE_NAME[h.captured!]} on ${h.to}`);
        }
      }
    }
    // f7 / f2: guarded only by the king, the classic target.
    const weak = me === 'w' ? 'f7' : 'f2';
    if (!does.length && !after.length && ('bq'.includes(mv.piece)) && (again?.moves({ square: mv.to as never, verbose: true }) ?? []).some((m) => m.to === weak)) {
      const def = c.attackers(weak as never, them);
      if (def.length === 1 && at(def[0])?.type === 'k') does.push(`eyes ${weak}, the weakest square near the king`);
    }
    // 3. Defends something that was attacked and unguarded.
    if (does.length < 2 && !mv.captured) {
      outer: for (const row of before.board()) for (const p of row) {
        if (!p || p.color !== me || p.square === mv.from || p.type === 'k') continue;
        if (before.attackers(p.square, them).length && !before.attackers(p.square, me).length && c.get(p.square)?.color === me && c.attackers(p.square, me).length) {
          does.push(`defends the ${PIECE_NAME[p.type]} on ${p.square}`); break outer;
        }
      }
    }
    // 4. Central squares it now controls (knights and pawns).
    if (does.length < 2 && (mv.piece === 'n' || mv.piece === 'p') && ctl.length) does.push(`controls ${ctl.join(' and ')}`);
    // 5. Opens a line for a bishop or the queen.
    if (does.length < 2 && mv.piece === 'p') {
      const mob = (g: Chess, s: string) => turnTo(g, me)?.moves({ square: s as never }).length ?? 0;
      outer2: for (const row of c.board()) for (const p of row) {
        if (!p || p.color !== me || (p.type !== 'b' && p.type !== 'q')) continue;
        if (mob(c, p.square) - mob(before, p.square) >= 2) { does.push(`opens a line for the ${PIECE_NAME[p.type]}`); break outer2; }
      }
    }
    // 6. Ready to castle now.
    if (mv.piece !== 'k') {
      const can = (g: Chess) => turnTo(g, me)?.moves().includes('O-O') ?? false;
      if (!can(before) && can(c)) after.push(`Now ${side} can castle.`);
    }
    const d = does.slice(0, 2);
    return `${head}.${d.length ? ` It ${d.join(' and ')}.` : ''}${after.length ? ` ${after[0]}` : ''}`;
  } catch { return ''; }
}
function openingClip(o0: StudioOpening, lineName?: string): Clip {
  // One-line deep dive: just that variation (with every move explained), no trap.
  if (lineName) {
    const k = o0.lines.findIndex((l) => l.name === lineName);
    if (k >= 0) {
      const l = o0.lines[k];
      const c = new Chess(); o0.line.forEach((m) => { try { c.move(m); } catch { /* checked below */ } });
      const mainPlies = playSans(undefined, o0.line, []); const lastMain = mainPlies[mainPlies.length - 1];
      let prev: { to: string; captured?: boolean } | undefined = lastMain ? { to: lastMain.to, captured: lastMain.san.includes('x') } : undefined;
      const notes = playSans(c.fen(), l.moves, []).map((p, i) => {
        const n = moveNote(p.fenBefore, p.san, prev); prev = { to: p.to, captured: p.san.includes('x') };
        return i === l.moves.length - 1 ? `${n} ${l.note}`.trim() : n;
      });
      const base = openingClip({ ...o0, lines: [l], trap: null, options: o0.options.filter((x) => x.lines?.includes(k)).map((x) => ({ ...x, lines: [0] })) });
      if (base.ranges?.lines.length) {
        const [a] = base.ranges.lines[0];
        notes.forEach((n, i) => { const p = base.plies[a - 1 + i]; if (p) p.review = { ...(p.review ?? { san: p.san }), classification: 'book', explanation: n }; });
        return {
          ...base, hook: `${o0.name}: the ${l.name} ♟️`, sub: 'Every move explained', fileBase: `chessscout-opening-${o0.id}-line${k + 1}`,
          label: `Opening · ${o0.name} · ${l.short ?? l.name}`, tags: ['opening'], lineMode: { no: k + 1, of: o0.lines.length },
        };
      }
    }
  }
  // Only lines whose every move is legal from the branch point are shown, and
  // options keep pointing at the right line numbers after any is dropped.
  let o = o0;
  {
    const c0 = new Chess(); let okMain = true;
    for (const m of o0.line) { try { c0.move(m); } catch { okMain = false; break; } }
    if (okMain) {
      const keep: number[] = [];
      o0.lines.forEach((l, k) => { const c = new Chess(c0.fen()); try { l.moves.forEach((m) => c.move(m)); keep.push(k); } catch { /* drop it */ } });
      if (keep.length !== o0.lines.length) {
        const remap = new Map(keep.map((k, n) => [k, n]));
        o = { ...o0, lines: keep.map((k) => o0.lines[k]), options: o0.options.map((x) => ({ ...x, lines: (x.lines ?? []).filter((k) => remap.has(k)).map((k) => remap.get(k)!) })) };
      }
    }
  }
  const book = (san: string, note = ''): ReviewMove => ({ san, classification: 'book', explanation: note });
  const main = playSans(undefined, o.line, o.line.map((san, i) => book(san, i === o.line.length - 1 ? `The ${o.name}` : '')));
  const keyFen = main.length ? main[main.length - 1].fen : START_FEN;
  const plies: Ply[] = [...main];
  const lines: [number, number][] = [];
  for (const l of o.lines) {
    const ps = playSans(keyFen, l.moves, l.moves.map((san, i) => book(san, i === l.moves.length - 1 ? l.note : '')));
    if (ps.length !== l.moves.length) continue;
    lines.push([plies.length + 1, plies.length + ps.length]);
    plies.push(...ps);
  }
  let trap: [number, number] | null = null;
  if (o.trap) {
    const t = o.trap;
    const ps = playSans(undefined, t.moves, t.moves.map((san, i) => ({ san, explanation: t.notes[i] ?? '', classification: san.includes('#') ? 'checkmate' : i === t.critical ? 'blunder' : i === t.critical + 1 ? 'great' : i < t.critical ? 'book' : 'best' })));
    if (ps.length === t.moves.length) { trap = [plies.length + 1, plies.length + ps.length]; plies.push(...ps); }
  }
  return {
    plies, key: Math.max(0, main.length - 1), tags: ['opening', ...(trap ? ['trap'] : [])], hook: `${o.hook} ♟️`, sub: `${o.lines.length} lines · counter moves · ${o.trap ? 'plus a trap' : 'what to play'}`,
    names: { w: null, b: null }, ratings: { w: null, b: null }, fileBase: `chessscout-opening-${o.id}`, label: `Opening · ${o.name}`,
    isTrap: false, opening: o.name, isOpening: true, openingData: o, ranges: { main: [1, main.length], lines, trap },
  };
}
function mapClip(no: number): Clip | null {
  const e = findEpisode(no); if (!e) return null;
  return {
    plies: [], key: 0, tags: ['opening'], hook: `The ${e.family} family tree 🌳`, sub: e.title,
    names: { w: null, b: null }, ratings: { w: null, b: null }, fileBase: `chessscout-family-tree-${partLabel(e)}`, label: `Family Tree · Part ${partLabel(e)}: ${e.title}`,
    isTrap: false, opening: null, isMap: true, map: e,
  };
}
/** The position (and last move) after a list of SAN moves from the start. */
function mapPos(ms: string[]): { fen: string; last: { from: string; to: string } | null; capture: boolean } {
  const c = new Chess(); let last: { from: string; to: string } | null = null; let capture = false;
  for (const m of ms) { try { const mv = c.move(m); last = { from: mv.from, to: mv.to }; capture = !!mv.captured; } catch { break; } }
  return { fen: c.fen(), last, capture };
}
const mapCount = (e: MapEpisode) => e.steps.filter((x) => x.name).length;
const mapText = (e: MapEpisode, t: string) => t.replace(/\{n\}/g, String(mapCount(e)));
const mapSay = (e: MapEpisode, st: { caption: string; name?: string }) => {
  const cap = mapText(e, st.caption).replace(/\*/g, '').replace(/[👇🤔]/gu, '').trim();
  if (!st.name) return cap;
  return `${/[.!?…]$/.test(cap) ? cap : `${cap}.`} The ${st.name}.`;
};
// A game built in the explorer: played like a game review, every move graded.
function lineClip(l: StudioLine): Clip {
  const plies = playSans(l.startFen, l.moves.map((m) => m.san), l.moves.map((m, i) => ({ moveIndex: i, san: m.san, classification: m.classification, evalAfterCp: m.evalAfterCp ?? undefined, betterMove: m.betterMove })));
  const blun = plies.filter((p) => p.review?.classification === 'blunder' || p.review?.classification === 'missed_win').length;
  let key = plies.findIndex((p) => p.review?.classification === 'blunder');
  if (key < 0) key = Math.max(0, plies.length - 1);
  const mated = plies[plies.length - 1]?.san.includes('#');
  // Accuracy per side from the win-chance each move gave away (same curve as game reviews).
  const startW = (l.startFen.split(' ')[1] ?? 'w') === 'w';
  const acc = (white: boolean) => {
    const ls = l.moves.filter((_, i) => (i % 2 === 0) === (white === startW)).map((m) => m.loss).filter((x): x is number => typeof x === 'number');
    if (!ls.length) return null;
    const avg = ls.reduce((a, b) => a + b, 0) / ls.length;
    return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.075 * avg) - 3.1668));
  };
  return {
    plies, key, tags: ['review', ...(blun ? ['blunder'] : []), ...(mated ? ['checkmate'] : [])], hook: l.title, sub: `${l.white} vs ${l.black}`,
    names: { w: l.white, b: l.black }, ratings: { w: null, b: null }, fileBase: 'chessscout-analyzer', label: `Analyzer · ${l.white} vs ${l.black}`,
    isTrap: false, opening: null, isReview: true, accuracy: { w: acc(true), b: acc(false) }, overview: null,
    result: mated ? (plies[plies.length - 1].color === 'w' ? '1-0' : '0-1') : null,
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
  if (clip.isLesson) { t.add('#chessforkids'); t.add('#learnchess'); t.add('#chessforbeginners'); }
  if (clip.isScout) { t.add('#chessprep'); t.add('#chessopponent'); }
  if (clip.isOpening || clip.isMap) { t.add('#chessopenings'); t.add('#chesstheory'); t.add('#learnchess'); }
  if (clip.isScan) { t.add('#chessapp'); t.add('#chesstips'); }
  if (clip.isPromo) { t.add('#chessapp'); t.add(clip.promo?.template === 'versus' ? '#chesscom' : '#playchess'); t.add('#chessfriends'); }
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

const srcKey = (x: StudioSource): string => (x.kind === 'map' ? `map-${x.episode}` : x.kind === 'opening' ? `o-${x.opening.id}${x.opening.line ? `-${x.opening.line}` : ''}` : x.kind === 'line' ? `line-${x.line.startFen}-${x.line.moves.map((m) => m.san).join(' ')}` : x.kind === 'promo' ? `promo-${x.promo.template}-${x.promo.hook}` : x.kind === 'scout' ? `s${x.scout.id}` : x.kind === 'lesson' ? `l${x.lesson.id}` : x.kind === 'scan' ? `x${x.fen}` : x.kind === 'trap' ? `t${x.trap.id}` : x.kind === 'puzzle' ? `p${x.puzzle.id}` : x.kind === 'review' ? `r${x.review.id}${x.showcase ? '-sc' : ''}` : `g${x.moment.gameId}-${x.moment.moveIndex}`);
const srcLabel = (x: StudioSource): string => (x.kind === 'map' ? `Family Tree · Part ${(() => { const e = findEpisode(x.episode); return e ? partLabel(e) : x.episode; })()}` : x.kind === 'opening' ? `Opening · ${x.opening.name}${x.opening.line ? ` · ${x.opening.line}` : ''}` : x.kind === 'line' ? `Analyzer · ${x.line.white} vs ${x.line.black}` : x.kind === 'promo' ? (x.promo.template === 'versus' ? `Promo · vs ${x.promo.rival}` : x.promo.template === 'live' ? 'Promo · live play' : x.promo.template === 'tour' ? 'Promo · app tour' : 'Promo · challenge friends') : x.kind === 'scout' ? `Scout · ${x.scout.username}` : x.kind === 'lesson' ? `Lesson · ${x.lesson.title}` : x.kind === 'scan' ? (x.label ? `Scan · ${x.label}` : 'Scanned position') : x.kind === 'trap' ? x.trap.name : x.kind === 'puzzle' ? `Puzzle · ${x.puzzle.rating}${x.puzzle.themes?.match(/mateIn\d/) ? ` · ${themeLabel(x.puzzle.themes.match(/mateIn\d/)![0])}` : ''}`
  : x.kind === 'review' ? `Review · ${x.review.white ?? 'White'} vs ${x.review.black ?? 'Black'}` : `${x.moment.san} · ${x.moment.opening ?? `game ${x.moment.gameId}`}`);
type ClipLook = BoardLook | 'remix' | 'mine';

export function StudioPlayer({ source, queue: initialQueue, title, onClose, onNext, onPrev, render = false }: {
  /** Being recorded to an MP4 by the video maker (pages/StudioRender.tsx): no controls, plays when told. */
  render?: boolean;
  source: StudioSource;
  /** A ready-made compilation title (auto Top 5); otherwise the remembered one. */
  title?: string;
  /** A compilation: these clips play back to back (one recording), with a title card first and the end card last. */
  queue?: StudioSource[];
  onClose: () => void; onNext?: () => void; onPrev?: () => void;
}) {
  // The compilation's clips: removable and reorderable from the player.
  const [queue, setQueue] = useState<StudioSource[] | undefined>(initialQueue);
  const isComp = !!queue && queue.length > 1;
  const [q, setQ] = useState(0);
  const current = queue && queue.length ? queue[Math.min(q, queue.length - 1)] : source;
  const [loadedKey, setLoadedKey] = useState('');
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
    const slot = Math.min(q, (queue?.length ?? 1) - 1);
    const key = srcKey(current);
    const nx = isComp ? queue![slot + 1] : undefined;
    if (nx?.kind === 'game') void getGame(nx.moment.gameId).catch(() => {});
    if (nx?.kind === 'review') void getGame(nx.review.id).catch(() => {});
    if (current.kind === 'trap') { setClip(trapClip(current.trap)); setClipQ(slot); setLoadedKey(key); return; }
    if (current.kind === 'promo') { setClip(promoClip(current.promo)); setClipQ(slot); setLoadedKey(key); return; }
    if (current.kind === 'line') { setClip(lineClip(current.line)); setClipQ(slot); setLoadedKey(key); return; }
    if (current.kind === 'map') { const mc = mapClip(current.episode); if (mc) { setClip(mc); setClipQ(slot); setLoadedKey(key); } else setErr('That episode is missing.'); return; }
    if (current.kind === 'opening') {
      // The first build of an opening can take a while on the server (it keeps going if
      // the request drops), so a failed load is retried a few times before giving up.
      const id = encodeURIComponent(current.opening.id);
      const load = async (): Promise<StudioOpening> => {
        for (let attempt = 0; ; attempt++) {
          try {
            const r = await apiFetch(`/api/admin/studio/opening/${id}`, { credentials: 'include' });
            const d = await r.json().catch(() => null);
            if (r.ok && d) return d as StudioOpening;
            if (r.status === 404 || r.status === 401 || r.status === 403) throw Object.assign(new Error(d?.error || "Couldn't load that opening."), { final: true });
          } catch (e) { if ((e as { final?: boolean }).final) throw e; }
          if (attempt >= 3) throw new Error('This opening is still being built on the server. Give it a minute, then open it again.');
          await new Promise((res) => setTimeout(res, 4000 * (attempt + 1)));
        }
      };
      load()
        .then((o) => { setClip(openingClip(o, current.kind === 'opening' ? current.opening.line : undefined)); setClipQ(slot); setLoadedKey(key); })
        .catch((e) => setErr(String(e?.message ?? e)));
      return;
    }
    if (current.kind === 'lesson') { setClip(lessonClip(current.lesson)); setClipQ(slot); setLoadedKey(key); return; }
    if (current.kind === 'scout') {
      const sc = current.scout;
      apiFetch(`/api/admin/studio/scout/${encodeURIComponent(sc.id)}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Scout not found'))))
        .then((full: StudioScout) => { setClip(scoutClip({ ...sc, result: { ...sc.result, ...full.result } })); setClipQ(slot); setLoadedKey(key); })
        .catch(() => { setClip(scoutClip(sc)); setClipQ(slot); setLoadedKey(key); });
      return;
    }
    if (current.kind === 'scan') {
      const sc = current;
      apiFetch('/api/admin/studio/best-line', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fen: sc.fen }) })
        .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "The engine couldn't look at this position."); return d as { bestLineSan: string[] }; })
        .then((d) => { if (!d.bestLineSan?.length) throw new Error('No legal moves in this position.'); setClip(scanClip(sc.fen, d.bestLineSan, sc.photo)); setClipQ(slot); setLoadedKey(key); })
        .catch((e) => setErr(String(e?.message ?? e)));
      return;
    }
    if (current.kind === 'puzzle') {
      try { setClip(puzzleClip(current.puzzle)); setClipQ(slot); setLoadedKey(key); } catch { setErr("This puzzle doesn't load."); }
      return;
    }
    if (current.kind === 'review') {
      const sc = !!current.showcase;
      getGame(current.review.id).then((g) => {
        const base = reviewClip(g);
        const cb = comebackHook(current.review);
        // A comeback: its hook, and the cover / key move at the winner's lowest point.
        const rc = cb ? { ...base, hook: cb, tags: [...base.tags, 'comeback'], key: Math.min(Math.max(0, current.review.worstMove ?? base.key), Math.max(0, base.plies.length - 1)), fileBase: `chessscout-comeback-${g.id}`, label: `Comeback #${g.id}` } : base;
        const bad = rc.plies.some((x) => ['blunder', 'missed_win', 'mistake'].includes(x.review?.classification ?? ''));
        setClip(sc ? { ...rc, showcase: true, hook: cb ?? (bad ? 'Where did this game go wrong? 👀' : 'Your coach grades every move 📊'), fileBase: `${rc.fileBase}-showcase`, label: `Review showcase #${g.id}` } : rc);
        setClipQ(slot); setLoadedKey(key);
      }).catch((e) => setErr(String(e?.message ?? e)));
      return;
    }
    const m = current.moment;
    getGame(m.gameId).then((g) => { setClip(gameClip(g, m)); setClipQ(slot); setLoadedKey(key); }).catch((e) => setErr(String(e?.message ?? e)));
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Settings (remembered between clips) ─────────────────────────────────
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  // What the closing splash says: the call to action, then (optionally) the ChessScout.net line.
  const ctaText = [prefs.ctaLine.trim(), prefs.ctaSite ? prefs.siteLine.trim() : ''].filter(Boolean).join(' ');
  // Voiceover clips are kept per voice and tone (the Creator tone is delivered with more energy).
  const voiceKey = `${prefs.voiceName}:${prefs.tone === 'teacher' ? 'teacher' : 'creator'}`;
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
  // Clean view for screen recording: 5 seconds of a blank screen (time to start
  // the recorder), then the clip plays from the start with nothing else on
  // screen. Double-tap brings up Replay / Exit; back or Esc also leaves.
  const [blank, setBlank] = useState(false);
  const blankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While in clean view the exact soundtrack (music, voice, move sounds) is
  // recorded too, starting with the black screen, so it lines up with a screen
  // recording made at the same time and can be added to it in any editor.
  const trackRec = useRef<MediaRecorder | null>(null);
  const [soundtrack, setSoundtrack] = useState<{ url: string; ext: string } | null>(null);
  const startSoundtrack = () => {
    try {
      if (trackRec.current?.state === 'recording') trackRec.current.stop();
      const m = mus(); routeSoundsTo(m.unlock(), m.sfx);
      const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';
      const rec = new MediaRecorder(m.stream, type ? { mimeType: type, audioBitsPerSecond: 192_000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        if (renderRef.current) {
          const ended = Date.now();
          const blob = new Blob(chunks, { type: type || 'audio/webm' });
          const fr = new FileReader();
          fr.onload = () => { const w = window as unknown as { __studioRender?: Record<string, unknown> }; w.__studioRender = { ...(w.__studioRender ?? {}), audio: String(fr.result).split(',')[1] ?? '', ext: type.includes('mp4') ? 'm4a' : 'webm', endedAt: ended, done: true }; };
          fr.readAsDataURL(blob);
          return;
        }
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: type || 'audio/webm' });
        setSoundtrack((old) => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(blob), ext: type.includes('mp4') ? 'm4a' : 'webm' }; });
      };
      rec.start(500);
      trackRec.current = rec;
    } catch { /* recording audio isn't supported here */ }
  };
  const stopSoundtrack = () => { if (trackRec.current?.state === 'recording') trackRec.current.stop(); trackRec.current = null; };
  // ── The video maker (render mode) ──
  const renderRef = useRef(render); renderRef.current = render;
  const renderStarted = useRef(false);
  const startBlank = () => {
    startSoundtrack();
    setExitHint(0); setPlaying(false); setBlank(true); blankDone.current = false;
    // "Still first scene" lead-in: the opening frame sits there, untouched, until play starts.
    if (prefs.leadIn === 'scene' && (!isComp || q === 0)) setI(0);
    if (blankTimer.current) clearTimeout(blankTimer.current);
    // After 5s the clip starts; the screen stays black until it's actually playing
    // (e.g. while the voiceover finishes preparing).
    blankTimer.current = setTimeout(() => { blankTimer.current = null; blankDone.current = true; restartRef.current(); }, 5000);
  };
  const blankDone = useRef(false);
  useEffect(() => () => { if (blankTimer.current) clearTimeout(blankTimer.current); }, []);
  const lastTap = useRef(0);
  const cleanTap = () => { const now = Date.now(); if (now - lastTap.current < 350) { lastTap.current = 0; showExit(); } else lastTap.current = now; };
  const enterClean = () => {
    // Unlock sound now (this tap), so music can start when the clip does.
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); } catch { /* ignore */ }
    setClean(true); startBlank(); try { window.history.pushState({ csClean: 1 }, ''); } catch { /* ignore */ }
  };
  const exitClean = () => { stopSoundtrack(); setClean(false); setExitHint(0); setBlank(false); if (blankTimer.current) { clearTimeout(blankTimer.current); blankTimer.current = null; } try { if (window.history.state?.csClean) { ignorePop.current = true; window.history.back(); } } catch { /* ignore */ } };
  // Back button: leaves clean view if it's on, otherwise closes the player (back to the Studio list, picks kept).
  const cleanRef = useRef(false); cleanRef.current = clean;
  const ignorePop = useRef(false);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    try { window.history.pushState({ csPlayer: 1 }, ''); } catch { /* ignore */ }
    const h = () => {
      if (ignorePop.current) { ignorePop.current = false; return; }
      if (cleanRef.current) { stopSoundtrack(); setClean(false); setExitHint(0); setBlank(false); if (blankTimer.current) { clearTimeout(blankTimer.current); blankTimer.current = null; } return; }
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
    setHook(isComp ? `#${queue!.length - clipQ} · ${stripEmoji(clip.hook)}` : clip.hook);
    // Quick openings show fewer lines, so the subtitle says how many are really in it.
    const o = clip.openingData;
    if (clip.isOpening && o && prefs.openCut === 'quick' && !clip.lineMode) {
      const n = Math.min(o.lines.length, o.trap ? 1 : 2);
      setSub(`${n === 1 ? 'The main line' : `${n} lines`} · counter moves · ${o.trap ? 'plus a trap' : 'what to play'}`);
    } else setSub(clip.sub);
    setFlipped(clip.plies[clip.key]?.color === 'b');
  }, [clip, clipQ, queue?.length, prefs.openCut]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The script ──────────────────────────────────────────────────────────
  // Countdowns and text cards inserted on the timeline, keyed by the frame they come before.
  const [inserts, setInserts] = useState<Record<string, Insert>>({});
  const frames = useMemo<Frame[]>(() => {
    if (!clip || (!clip.plies.length && !clip.isLesson && !clip.isScout && !clip.isMap)) return [];
    const { plies, key } = clip;
    const withInserts = (raw: Frame[]): Frame[] => {
      // Coach look: the title card (the intro) is the very first thing on screen, so it's
      // also the reel's cover. It goes in front of any hook scene (after a compilation's title).
      let base0 = raw;
      if (prefs.fastStart && raw.some((f) => f.kind === 'teaser')) {
        // Fast start: the hook scene is the first thing on screen (no still title card before it).
        base0 = raw.filter((f) => f.kind !== 'intro');
      } else if (prefs.theme !== 'classic' && prefs.intro && raw.length) {
        const rest = raw.filter((f) => f.kind !== 'intro');
        const at = rest[0]?.kind === 'title' ? 1 : 0;
        const firstBoard = rest.find((f) => f.kind !== 'title');
        const fen = firstBoard && 'fen' in firstBoard && firstBoard.fen ? firstBoard.fen : START_FEN;
        base0 = [...rest.slice(0, at), { kind: 'intro', fen }, ...rest.slice(at)];
      }
      // Every clip (the last one of a compilation) ends with the splash, after the end card.
      const base = prefs.splash && isLast && base0.length ? [...base0, { kind: 'splash' as const, fen: START_FEN }] : base0;
      if (!Object.keys(inserts).length) return base;
      const ids = assignIds(base, loadedKey);
      const fenOf = (f: Frame) => (f.kind === 'move' ? (f.ply > 0 ? plies[f.ply - 1].fen : plies[0].fenBefore) : f.kind === 'split' ? f.played.fen : f.fen);
      const res: Frame[] = [];
      base.forEach((f, k) => {
        const ins = inserts[ids[k]];
        if (ins) {
          const prev = res[res.length - 1] ?? f;
          const fen = fenOf(prev);
          const last = prev.kind === 'move' && prev.ply > 0 ? { from: plies[prev.ply - 1].from, to: plies[prev.ply - 1].to } : null;
          if (ins.card) res.push({ kind: 'card', fen, text: ins.card.text, secs: ins.card.secs, anchor: ids[k] });
          if (ins.timer) for (let n = ins.timer.secs; n >= 1; n--) res.push({ kind: 'countdown', n, fen, last, total: ins.timer.secs, text: ins.timer.text, anchor: ids[k] });
        }
        res.push(f);
      });
      return res;
    };
    const keyPly = key + 1;
    // Traps play their whole line by default (trapBefore 99); puzzles always play the setup move and the full solution.
    const startPly = Math.max(0, keyPly - 1 - (clip.isTrap ? prefs.trapBefore : prefs.before));
    const endPly = clip.isPuzzle || clip.isTrap || clip.isScan ? plies.length : Math.min(plies.length, keyPly + prefs.after);
    const fenAt = (p: number) => (!plies.length ? START_FEN : p <= 0 ? plies[0].fenBefore : plies[p - 1].fen);
    const lastAt = (p: number) => (p <= 0 ? null : { from: plies[p - 1].from, to: plies[p - 1].to });
    const out: Frame[] = [];
    if (clip.isPromo && clip.promo && clip.promo.template === 'tour') {
      // App tour: the hook, then each feature as a card with a few moves of the Opera Game between, then the end card.
      if (isComp && isFirst) out.push({ kind: 'title', fen: fenAt(0) });
      if (!prefs.fastStart && prefs.intro) out.push({ kind: 'intro', fen: fenAt(0) });
      if (prefs.tourStyle === 'cards') out.push({ kind: 'promoCard', fen: fenAt(0), last: null, card: 'tour', upTo: 0 });
      else out.push({ kind: 'teaser', fen: fenAt(0), last: null, mate: false, text: clip.promo.hook, sub: `${TOUR.length} things you can do`, said: stripEmoji(clip.promo.hook) });
      const per = Math.max(1, Math.floor(plies.length / TOUR.length));
      let p = 0;
      TOUR.forEach((_, k) => {
        for (let n = 0; n < per && p < plies.length; n++) out.push({ kind: 'move', ply: ++p });
        out.push({ kind: 'promoCard', fen: fenAt(p), last: lastAt(p), card: 'tour', upTo: k + 1 });
      });
      while (p < plies.length) out.push({ kind: 'move', ply: ++p });
      out.push({ kind: 'promoCard', fen: fenAt(p), last: lastAt(p), card: 'tour', upTo: TOUR.length + 1 });
      if (prefs.outro && isLast) out.push({ kind: 'outro', fen: fenAt(plies.length) });
      return withInserts(out);
    }
    if (clip.isPromo && clip.promo && clip.promo.template === 'live') {
      // Live play: "game found" first thing, then the Opera Game at blitz speed with draining
      // clocks and a chat reaction, Morphy's mate, the free review, and the time controls.
      if (isComp && isFirst) out.push({ kind: 'title', fen: fenAt(0) });
      if (!prefs.fastStart && prefs.intro) out.push({ kind: 'intro', fen: fenAt(0) });
      out.push({ kind: 'promoCard', fen: fenAt(0), last: null, card: 'match' });
      let p = 0;
      while (p < Math.min(10, plies.length)) out.push({ kind: 'move', ply: ++p });
      out.push({ kind: 'promoCard', fen: fenAt(p), last: lastAt(p), card: 'react' });
      while (p < plies.length) out.push({ kind: 'move', ply: ++p });
      out.push({ kind: 'promoCard', fen: fenAt(p), last: lastAt(p), card: 'review' });
      out.push({ kind: 'promoCard', fen: fenAt(p), last: lastAt(p), card: 'live' });
      if (prefs.outro && isLast) out.push({ kind: 'outro', fen: fenAt(plies.length) });
      return withInserts(out);
    }
    if (clip.isPromo && clip.promo) {
      const pr = clip.promo;
      if (isComp && isFirst) out.push({ kind: 'title', fen: fenAt(0) });
      if (prefs.intro) out.push({ kind: 'intro', fen: fenAt(0) });
      out.push({ kind: 'hold', fen: fenAt(0), last: null });
      // Moves play between the cards; the game finishes with mate before the end card.
      const cards: Frame[] = pr.template === 'versus'
        ? [...pr.rows.map((_, k) => ({ kind: 'promoCard' as const, fen: '', last: null, card: 'vs' as const, upTo: k + 1 })), { kind: 'promoCard', fen: '', last: null, card: 'switch' }]
        : [{ kind: 'promoCard', fen: '', last: null, card: 'live' }, { kind: 'promoCard', fen: '', last: null, card: 'link' }];
      const per = Math.max(1, Math.floor(plies.length / (cards.length + 1)));
      let p = 0;
      for (const c of cards) {
        for (let k = 0; k < per && p < plies.length; k++) out.push({ kind: 'move', ply: ++p });
        out.push({ ...(c as Extract<Frame, { kind: 'promoCard' }>), fen: fenAt(p), last: lastAt(p) });
      }
      while (p < plies.length) out.push({ kind: 'move', ply: ++p });
      if (prefs.outro && isLast) out.push({ kind: 'outro', fen: fenAt(plies.length) });
      return withInserts(out);
    }
    if (clip.isMap && clip.map) {
      // Walk the tree: wind back to where the next branch splits off, play out to it, name it.
      const e = clip.map; let prev: string[] = [];
      if (isComp && isFirst) out.push({ kind: 'title', fen: START_FEN });
      e.steps.forEach((st, k) => {
        const path = st.path.split(' ').filter(Boolean);
        let common = 0; while (common < prev.length && common < path.length && prev[common] === path[common]) common++;
        for (let n = prev.length - 1; n >= common; n--) { const p = mapPos(prev.slice(0, n)); out.push({ kind: 'mapMove', fen: p.fen, last: p.last, step: k, back: true }); }
        for (let n = common + 1; n <= path.length; n++) { const p = mapPos(path.slice(0, n)); out.push({ kind: 'mapMove', fen: p.fen, last: p.last, step: k, capture: p.capture }); }
        const p = mapPos(path); out.push({ kind: 'mapStep', fen: p.fen, last: p.last, step: k });
        prev = path;
      });
      const endFen = mapPos(prev).fen;
      out.push({ kind: 'mapEnd', fen: endFen, last: null, card: 'summary' });
      return withInserts(out);
    }
    if (clip.isOpening && clip.openingData && clip.ranges && clip.lineMode && clip.ranges.lines.length) {
      // One line, in depth: the hook, the opening's moves, then the line move by move
      // (each explained), why it works, real-game numbers, and "what's best next?".
      const o = clip.openingData; const l = o.lines[0]; const [a, b] = clip.ranges.lines[0];
      const [, m] = clip.ranges.main;
      const keyFen = fenAt(m), keyLast = lastAt(m), endFen = fenAt(b), endLast = lastAt(b);
      if (isComp && isFirst) out.push({ kind: 'title', fen: fenAt(0) });
      const early = stripEmoji(prefs.lineCtaLine.trim());
      if (prefs.openTeaser && (!isComp || isFirst)) {
        const nw = ['one', 'two', 'three', 'four', 'five', 'six'][clip.lineMode.no - 1] ?? String(clip.lineMode.no);
        out.push({ kind: 'teaser', fen: endFen, last: endLast, mate: false,
          text: `${o.name} · Line ${clip.lineMode.no} 🔥`, sub: `The ${l.name}, every move explained`,
          said: prefs.fastStart ? `The ${o.name}, line ${nw}: the ${l.name}.` : `The ${o.name}, line ${nw}: the ${l.name}. Every move, and why it works.${early ? ` ${early}` : ''}`, cta: !prefs.fastStart && !!early });
      } else if (prefs.intro) out.push({ kind: 'intro', fen: fenAt(0) });
      out.push({ kind: 'hold', fen: fenAt(0), last: null });
      for (let p = 1; p <= m; p++) out.push({ kind: 'move', ply: p });
      out.push({ kind: 'openCard', fen: keyFen, last: keyLast, card: 'line', idx: 0 });
      for (let p = a; p <= b; p++) out.push({ kind: 'move', ply: p });
      if (l.why?.length) out.push({ kind: 'openCard', fen: endFen, last: endLast, card: 'why', idx: 0 });
      if (l.pct != null || l.whiteScore != null || l.eval != null) out.push({ kind: 'openCard', fen: endFen, last: endLast, card: 'lineStats', idx: 0 });
      if (l.next) {
        const mover = endFen.split(' ')[1] === 'w' ? 'White' : 'Black';
        for (let n = 3; n >= 1; n--) out.push({ kind: 'countdown', n, fen: endFen, last: endLast, total: 3, text: `What's ${mover}'s best move here?`, anchor: 'opening' });
        out.push({ kind: 'openCard', fen: endFen, last: endLast, card: 'next', idx: 0 });
      }
      if (prefs.outro && isLast) out.push({ kind: 'outro', fen: endFen });
      return withInserts(out);
    }
    if (clip.isOpening && clip.openingData && clip.ranges) {
      const o = clip.openingData; const R = clip.ranges;
      const [, m] = R.main;
      const quick = prefs.openCut === 'quick';
      const keyFen = fenAt(m), keyLast = lastAt(m);
      if (isComp && isFirst) out.push({ kind: 'title', fen: fenAt(0) });
      // The hook scene: the payoff first. With a trap, its final position ("checkmate in
      // 4 moves"); without one, the big question over the position with every reply drawn.
      const teaser = prefs.openTeaser && (!isComp || isFirst);
      if (teaser) {
        if (R.trap && o.trap) {
          // "Mate in N" the chess way: only the mating side's moves, from the victim's
          // mistake (the trap's critical move) to checkmate.
          const [ta, tb] = R.trap;
          const from = o.trap.critical >= 0 && ta + o.trap.critical < tb ? ta + o.trap.critical + 1 : ta;
          const n = Math.floor((tb - from) / 2) + 1;
          const mate = !!clip.plies[tb - 1]?.san.includes('#');
          out.push({ kind: 'teaser', fen: fenAt(tb), last: lastAt(tb), mate,
            text: mate ? `Mate in ${n} 😱` : `Don't fall for this 🪤`,
            sub: `The ${o.trap.name} · it's at the end`,
            said: mate ? `Mate in ${n}. Here's the ${o.name}, and the trap that ends it.` : `Don't fall for this. Here's the ${o.name}, and the trap hiding in it.` });
        } else if (o.options.length >= 2) {
          const n = Math.min(4, o.options.length);
          out.push({ kind: 'teaser', fen: keyFen, last: keyLast, mate: false,
            text: `${n} ways to answer the ${o.name}. Which is yours? 🤔`, sub: 'Real-game numbers for each one',
            said: `There are ${n} main ways to answer the ${o.name}. Which one do you play?` });
        }
      }
      if (prefs.intro) out.push({ kind: 'intro', fen: fenAt(0) });
      if (!teaser) out.push({ kind: 'hold', fen: fenAt(0), last: null });
      for (let p = 1; p <= m; p++) out.push({ kind: 'move', ply: p });
      out.push({ kind: 'openCard', fen: keyFen, last: keyLast, card: 'ideas' });
      if (!quick && o.results && o.games >= 10) out.push({ kind: 'openCard', fen: keyFen, last: keyLast, card: 'stats' });
      // "What would you play?" then the replies with how often they're played and what Stockfish thinks.
      if (o.options.length) {
        const mover = keyFen.split(' ')[1] === 'w' ? 'White' : 'Black';
        if (!quick) for (let n = 3; n >= 1; n--) out.push({ kind: 'countdown', n, fen: keyFen, last: keyLast, total: 3, text: `What should ${mover} play here?`, anchor: 'opening' });
        out.push({ kind: 'openCard', fen: keyFen, last: keyLast, card: 'options' });
      }
      // Each variation: it lights up on the line map, plays out, then the board
      // rewinds move by move to the branch point for the next one.
      // Quick: the most played line only (two when there's no trap).
      const shown = quick ? R.lines.slice(0, R.trap ? 1 : 2) : R.lines;
      shown.forEach(([a, b], idx) => {
        out.push({ kind: 'openCard', fen: keyFen, last: keyLast, card: 'line', idx });
        for (let p = a; p <= b; p++) out.push({ kind: 'move', ply: p });
        if (idx < shown.length - 1 || !R.trap) for (let p = b - 1; p >= a - 1; p--) out.push({ kind: 'rewind', fen: p >= a ? fenAt(p) : keyFen, last: p >= a ? lastAt(p) : keyLast, idx });
      });
      if (R.trap) {
        const [a, b] = R.trap;
        out.push({ kind: 'openCard', fen: START_FEN, last: null, card: 'trap' });
        for (let p = a; p <= b; p++) out.push({ kind: 'move', ply: p });
        out.push({ kind: 'hold', fen: fenAt(b), last: lastAt(b) });
      }
      if (prefs.outro && isLast) out.push({ kind: 'outro', fen: R.trap ? fenAt(R.trap[1]) : keyFen });
      return withInserts(out);
    }
    if (clip.isScout) {
      if (isComp && isFirst) out.push({ kind: 'title', fen: fenAt(0) });
      if (prefs.intro) out.push({ kind: 'intro', fen: fenAt(0) });
      // A few opening moves of theirs behind the cards; the cards carry the clip.
      out.push({ kind: 'hold', fen: fenAt(0), last: null });
      const b = plies.length;
      for (let p = 1; p <= b; p++) out.push({ kind: 'move', ply: p });
      const st = clip.scout?.stats;
      out.push({ kind: 'scoutCard', fen: fenAt(b), last: lastAt(b), card: 'profile' });
      if (st && st.asWhite.games + st.asBlack.games > 0) out.push({ kind: 'scoutCard', fen: fenAt(b), last: lastAt(b), card: 'colors' });
      if (clip.scout?.topOpenings?.length) out.push({ kind: 'scoutCard', fen: fenAt(b), last: lastAt(b), card: 'openings' });
      if (st) out.push({ kind: 'scoutCard', fen: fenAt(b), last: lastAt(b), card: 'habits' });
      // One card per weakness, so each is shown in full.
      (clip.scout?.weaknesses ?? []).slice(0, 3).forEach((_, idx) => out.push({ kind: 'scoutCard', fen: fenAt(b), last: lastAt(b), card: 'weak', idx }));
      if (prefs.outro && isLast) out.push({ kind: 'outro', fen: fenAt(b) });
      return withInserts(out);
    }
    if (clip.isLesson && clip.lesson) {
      // Lesson boards can be kingless demos (a lone knight), so only the board layout is checked.
      const legal = (f?: string) => (f && f.trim().split(/\s+/)[0].split('/').length === 8 ? f.trim() : null);
      let at = legal(clip.lesson.steps.find((st) => st.fen)?.fen) ?? START_FEN;
      if (isComp && isFirst) out.push({ kind: 'title', fen: at });
      if (prefs.intro) out.push({ kind: 'intro', fen: at });
      for (const st of clip.lesson.steps) {
        const f = legal(st.fen);
        if (f) at = f;
        if (st.type === 'board' && f) out.push({ kind: 'lessonBoard', fen: f, text: st.text, highlights: st.highlightSquares ?? [], last: null });
        else if (st.type === 'practice' && f && st.expectedMoveSan) {
          out.push({ kind: 'lessonBoard', fen: f, text: st.text, highlights: st.highlightSquares ?? [], last: null });
          for (let n = 3; n >= 1; n--) out.push({ kind: 'countdown', n, fen: f, last: null, total: 3, text: 'Your turn!', anchor: 'lesson' });
          try {
            const c = new Chess(f, { skipValidation: true }); const mv = c.move(st.expectedMoveSan);
            if (mv) { at = c.fen(); out.push({ kind: 'lessonBoard', fen: at, text: `✓ ${mv.san}! Great job!`, highlights: [], last: { from: mv.from, to: mv.to }, celebrate: true }); }
          } catch { /* skip a move that doesn't play */ }
        } else out.push({ kind: 'lessonText', fen: at, text: st.text });
      }
      if (prefs.outro && isLast) out.push({ kind: 'outro', fen: at });
      return withInserts(out);
    }
    if (clip.isReview && clip.showcase) {
      // Review showcase: straight to the move that decided the game (the coach explains it),
      // the move played next to the better one, the game's best move, both players' grades,
      // the accuracy, and every game reviewed free.
      const cls = (k: number) => plies[k]?.review?.classification ?? '';
      let bad = plies.findIndex((_, k) => cls(k) === 'blunder' || cls(k) === 'missed_win');
      if (bad < 0) bad = plies.findIndex((_, k) => cls(k) === 'mistake');
      const good = plies.findIndex((_, k) => cls(k) === 'brilliant' || cls(k) === 'great');
      const kIdx = bad >= 0 ? bad : good >= 0 ? good : plies.length - 1;
      const kp = kIdx + 1;
      if (isComp && isFirst) out.push({ kind: 'title', fen: fenAt(0) });
      out.push({ kind: 'rvCard', fen: fenAt(Math.max(0, kp - 3)), last: lastAt(Math.max(0, kp - 3)), card: 'hook' });
      for (let p = Math.max(1, kp - 2); p <= kp; p++) out.push({ kind: 'move', ply: p });
      const kr = plies[kIdx]?.review;
      if (bad >= 0 && kr?.betterMove) {
        try {
          const c = new Chess(plies[kIdx].fenBefore); const bm = c.move(kr.betterMove);
          if (bm) {
            out.push({ kind: 'split', played: { fen: plies[kIdx].fen, last: { from: plies[kIdx].from, to: plies[kIdx].to } }, better: { fen: c.fen(), last: { from: bm.from, to: bm.to } }, playedSan: plies[kIdx].san, betterSan: bm.san });
            out.push({ kind: 'better', fen: plies[kIdx].fenBefore, last: null, arrow: { from: bm.from, to: bm.to }, text: `Better was ${bm.san}` });
          }
        } catch { /* skip */ }
      }
      if (good >= 0 && good !== kIdx) out.push({ kind: 'move', ply: good + 1 });
      out.push({ kind: 'rvCard', fen: fenAt(plies.length), last: lastAt(plies.length), card: 'grades' });
      out.push({ kind: 'summary', fen: fenAt(plies.length) });
      out.push({ kind: 'rvCard', fen: fenAt(plies.length), last: lastAt(plies.length), card: 'cta' });
      if (prefs.outro && isLast) out.push({ kind: 'outro', fen: fenAt(plies.length) });
      return withInserts(out);
    }
    if (clip.isReview) {
      if (isComp && isFirst) out.push({ kind: 'title', fen: fenAt(0) });
      if (prefs.intro) out.push({ kind: 'intro', fen: fenAt(0) });
      if (prefs.intro || (isComp && isFirst)) out.push({ kind: 'hold', fen: fenAt(0), last: null });
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
      return withInserts(out);
    }
    if (isComp && isFirst) out.push({ kind: 'title', fen: fenAt(startPly) });
    if (prefs.intro) out.push({ kind: 'intro', fen: fenAt(startPly) });
    if (clip.isScan && clip.photo) out.push({ kind: 'scanPhoto', fen: fenAt(startPly) });
    if (prefs.intro || (isComp && isFirst) || (clip.isScan && clip.photo)) out.push({ kind: 'hold', fen: fenAt(startPly), last: lastAt(startPly) });
    else out.push({ kind: 'move', ply: startPly });
    for (let p = startPly + 1; p < keyPly; p++) out.push({ kind: 'move', ply: p });
    if (prefs.guess) for (let n = prefs.countdownSecs; n >= 1; n--) out.push({ kind: 'countdown', n, fen: fenAt(keyPly - 1), last: lastAt(keyPly - 1), total: prefs.countdownSecs });
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
    return withInserts(out);
  }, [clip, prefs.before, prefs.trapBefore, prefs.after, prefs.intro, prefs.guess, prefs.betterLine, prefs.guessRating, prefs.outro, prefs.split, prefs.reviewMode, prefs.countdownSecs, prefs.splash, prefs.openTeaser, prefs.openCut, prefs.lineCtaLine, prefs.theme, inserts, loadedKey, isComp, isFirst, isLast]);

  // ── Keyframes: a stable id per frame (so pauses and sticker in/out points survive setting changes) ─
  const frameIds = useMemo(() => assignIds(frames, loadedKey), [frames]);
  // A / B / C: the key move and two believable alternatives (checks and captures first), in a fixed shuffled order.
  const choices = useMemo(() => {
    if (!clip || !prefs.choices) return null;
    const kp = clip.plies[clip.key];
    if (!kp) return null;
    try {
      const hash = (t: string) => [...t].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
      const c = new Chess(kp.fenBefore);
      const weight = (m: { san: string; captured?: string; piece: string }) => (m.san.includes('+') ? 3 : 0) + (m.captured ? 2 : 0) + (m.piece !== 'p' ? 1 : 0);
      const pool = c.moves({ verbose: true }).filter((m) => m.san !== kp.san).sort((a, b) => weight(b) - weight(a) || hash(a.san) - hash(b.san)).slice(0, 6);
      if (pool.length < 2) return null;
      const second = pool[1 + (hash(kp.fenBefore) % Math.max(1, pool.length - 1))] ?? pool[1];
      const opts = [kp.san, pool[0].san, second.san === pool[0].san ? pool[1].san : second.san];
      return { options: opts.map((x) => ({ x, h: hash(x + kp.fenBefore) })).sort((a, b) => a.h - b.h).map((o) => o.x), correct: kp.san, white: kp.color === 'w' };
    } catch { return null; }
  }, [clip, prefs.choices]); // eslint-disable-line react-hooks/exhaustive-deps
  const idOf = useMemo(() => new Map(frames.map((f, k) => [f, frameIds[k]])), [frames, frameIds]);
  const [holds, setHolds] = useState<Record<string, number>>({});
  const dur = (f: Frame) => {
    const base = baseDur(f) + (holds[idOf.get(f) ?? ''] ?? 0) + (ctaIdx >= 0 && earlyText && frames[ctaIdx] === f ? 2200 : 0);
    const said = prefs.voice ? narration(f) : null;
    const len = said ? voiceLen.current.get(`${voiceKey}|${said}`) : undefined;
    // A frame always lasts until its line has been said in full, plus a breath.
    const d = len ? Math.max(base, len * 1000 + 450) : base;
    // On the beat: every frame lasts a whole number of beats, so moves land on the music
    // (rounded up when there's a voice line, so it's never cut short).
    const bpm = bpmOf(prefs.music);
    if (f.kind === 'rewind' || (f.kind === 'mapMove' && f.back)) return d; // a quick wind-back, not on the beat
    if (bpm && prefs.beatSync) { const beat = 60000 / bpm; return Math.max(1, (len ? Math.ceil : Math.round)(d / beat)) * beat; }
    return d;
  };
  const baseDur = (f: Frame) => {
    const s = prefs.speed * 1000;
    switch (f.kind) {
      case 'intro': return prefs.fastStart ? 1000 : prefs.theme !== 'classic' ? 2600 : frames[0]?.kind === 'teaser' ? 1300 : 1600;
      case 'teaser': return prefs.fastStart ? 1600 : f.cta ? 4400 : 2600;
      case 'mapMove': return f.back ? 170 : Math.max(420, s * 0.5);
      case 'mapStep': return clip?.map?.steps[f.step]?.name ? 2700 : 2600;
      case 'mapEnd': return 5200;
      case 'hold': return prefs.fastStart ? 250 : 800;
      case 'countdown': return 1000;
      case 'card': return f.secs * 1000;
      case 'better': return Math.max(s, 1300);
      case 'reveal': return 2400;
      case 'split': return 3200;
      case 'title': return 2200;
      case 'summary': return 4200;
      case 'scoutCard': return f.card === 'profile' ? 4200 : f.card === 'weak' ? 5200 : 4800;
      case 'lessonText': return Math.max(2600, f.text.split(/\s+/).length * 340);
      case 'lessonBoard': return f.celebrate ? 2400 : Math.max(3000, f.text.split(/\s+/).length * 340);
      case 'scanPhoto': return 3200;
      // Long enough for the subtitles to finish without the voiceover (it stretches to fit the voice anyway).
      case 'splash': return prefs.splashCta ? Math.max(3600, ctaText.split(/\s+/).filter(Boolean).length * 360 + 900) : 2800;
      case 'rvCard': return f.card === 'hook' ? 1700 : 4400;
      case 'promoCard': return f.card === 'tour' ? (f.upTo === 0 ? 1700 : (f.upTo ?? 0) > TOUR.length ? 4200 : 2400) : f.card === 'vs' ? 1500 : f.card === 'match' ? 1900 : f.card === 'react' ? 1500 : f.card === 'review' ? 4200 : 3600;
      case 'openCard': return f.card === 'line' ? 1900 : f.card === 'options' ? 5600 : f.card === 'trap' ? 2600 : f.card === 'why' ? 6400 : f.card === 'lineStats' ? 4400 : f.card === 'next' ? 3400 : 4600;
      case 'rewind': return 150;
      case 'outro': return 2800;
      default: {
        if (clip?.isPromo) return clip.plies[f.ply - 1]?.san.includes('#') ? 2400 : clip.promo?.template === 'live' ? Math.max(260, s * 0.4) : Math.max(300, s * 0.5);
        if (clip?.isOpening && clip.ranges && clip.lineMode && clip.ranges.lines.length) {
          // Deep dive: the line's moves get time for their explanation; the opening's own moves are brisk.
          const [a, b] = clip.ranges.lines[0]; const p = f.ply;
          if (p >= a && p <= b) return Math.max(s, 2600);
          return p === clip.ranges.main[1] ? Math.max(s, 1600) : Math.max(450, s * 0.7);
        }
        if (clip?.isOpening && clip.ranges) {
          // Brisk through the moves; a beat on the last move of each line (its note shows) and on the trap's key moves.
          const R = clip.ranges; const p = f.ply;
          const ends = [R.main[1], ...R.lines.map(([, b]) => b), ...(R.trap ? [R.trap[1]] : [])];
          const tr = clip.plies[p - 1]?.review?.classification;
          if (ends.includes(p) || tr === 'blunder' || tr === 'great' || tr === 'checkmate') return Math.max(s, 2200);
          return Math.max(450, s * 0.7);
        }
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
  const looks = useRef(new Map<number | string, BoardLook>());
  // A new clip starts from the top; edits to the same clip (inserts, settings) stay on the frame you were on.
  const shownClip = useRef<Clip | null>(null);
  const curId = useRef<string | null>(null);
  useEffect(() => {
    if (shownClip.current === clip && clip) {
      const k = curId.current ? frameIds.indexOf(curId.current) : -1;
      setI((x) => (k >= 0 ? k : Math.min(x, Math.max(0, frames.length - 1))));
      return;
    }
    shownClip.current = clip;
    setI(0); looks.current.clear(); if (autoNext.current) { autoNext.current = false; setPlaying(true); } else setPlaying(false);
  }, [frames]); // eslint-disable-line react-hooks/exhaustive-deps
  // Remembers the frame on screen (after the effect above has used the previous one).
  useEffect(() => { curId.current = frameIds[i] ?? null; });

  const frame: Frame | undefined = frames[i];
  const plies = clip?.plies ?? [];
  const keyPly = (clip?.key ?? 0) + 1;
  // What the board shows for this frame.
  const view = useMemo(() => {
    if (!frame) return null;
    if (frame.kind === 'move') {
      if (!plies.length) return null;
      const p = frame.ply; const m = p > 0 ? plies[p - 1] : null;
      return { fen: m ? m.fen : plies[0].fenBefore, last: m ? { from: m.from, to: m.to } : null, ply: p, move: m };
    }
    if (frame.kind === 'split') return { fen: frame.played.fen, last: frame.played.last, ply: -3, move: null as Ply | null };
    const fen = frame.fen;
    const last = frame.kind === 'rvCard' || frame.kind === 'countdown' || frame.kind === 'better' || frame.kind === 'hold' || frame.kind === 'scoutCard' || frame.kind === 'lessonBoard' || frame.kind === 'promoCard' || frame.kind === 'openCard' || frame.kind === 'rewind' || frame.kind === 'teaser' || frame.kind === 'mapMove' || frame.kind === 'mapStep' || frame.kind === 'mapEnd' ? frame.last : null;
    const ply = frame.kind === 'countdown' && !frame.anchor ? keyPly - 1 : frame.kind === 'intro' ? -1 : -2;
    return { fen, last, ply, move: null as Ply | null };
  }, [frame, plies, keyPly]);

  // Board and pieces: a compilation clip can have its own look; otherwise the global setting.
  const [clipLooks, setClipLooks] = useState<Record<string, ClipLook>>({});
  // A scene is a run of frames of the same kind (all the moves of a line are one scene).
  const sceneOf = useMemo(() => { let n = 0; return frames.map((f, j) => { if (j > 0 && f.kind !== frames[j - 1].kind) n++; return n; }); }, [frames]);
  const lookKey: number | string = prefs.remixEvery === 'scene' ? `s${sceneOf[i] ?? 0}` : i;
  const perFrame = () => looks.current.get(lookKey) ?? (() => { const l = randomLook(); looks.current.set(lookKey, l); return l; })();
  const cl = isComp ? clipLooks[loadedKey] : undefined;
  const look: BoardLook | null = cl === 'remix' ? perFrame() : cl === 'mine' ? null : cl ? cl : prefs.remix ? perFrame() : fixedLook;
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
    if (frame.kind === 'mapMove' && !frame.back && frame.last && prefs.sound) playMoveSound(frame.capture ? 'capture' : 'move');
    if (frame.kind === 'lessonBoard' && frame.last && prefs.sound) playMoveSound('move');
    if (frame.kind === 'lessonBoard' && frame.celebrate && prefs.effects) setConfetti(Date.now());
    if (frame.kind === 'countdown' && prefs.sound && frame.n === Math.min(3, frame.total ?? 3)) playMoveSound('check');
    // Sound design on top of the music.
    if (prefs.musicFx && playing) {
      const m = mus();
      if (frame.kind === 'countdown' && frame.n === Math.min(3, frame.total ?? 3)) m.accent('riser');
      if (frame.kind === 'countdown') m.accent('tick');
      if (frame.kind === 'title' || frame.kind === 'outro' || frame.kind === 'split' || frame.kind === 'intro' || frame.kind === 'card' || frame.kind === 'scoutCard' || frame.kind === 'openCard' || frame.kind === 'lessonText') m.accent('whoosh');
      if (frame.kind === 'rewind' || (frame.kind === 'mapMove' && frame.back)) m.accent('tick');
      if ((frame.kind === 'mapStep' && clip?.map?.steps[frame.step]?.name) || frame.kind === 'mapEnd') m.accent('whoosh');
      if (frame.kind === 'teaser') { m.accent('impact'); setTimeout(() => music.current?.accent('riser'), 900); }
      if (frame.kind === 'lessonBoard' && frame.celebrate) m.accent('chime');
      if (frame.kind === 'scanPhoto') m.accent('riser');
      if (frame.kind === 'splash') { m.accent('whoosh'); setTimeout(() => music.current?.accent('impact'), 680); }
      if (frame.kind === 'promoCard') m.accent(frame.card === 'vs' ? 'tick' : 'whoosh');
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
  // Move sounds play through the Studio's mix, so they're in the soundtrack too.
  // (Set up on the first Play, which counts as a tap, so phones allow the sound.)
  useEffect(() => () => { routeSoundsTo(null, null); music.current?.dispose(); }, []);
  useEffect(() => {
    if (!playing) return;
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); } catch { /* ignore */ }
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Creator tone: the same facts, said like a chess creator talks, not a lecture. Lines
  // vary from clip to clip (picked from the clip and frame, so the voiceover cache still works).
  // undefined = use the Teacher line; null = say nothing.
  const pickOf = (seed: string) => <T,>(xs: T[]): T => xs[[...seed].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 11) % xs.length];
  const firstSentence = (t: string) => t.split(/(?<=[.!?])\s/)[0];
  const reactTo = (cls: string | undefined, san: string, pick: <T,>(xs: T[]) => T): string => {
    const m = spokenSan(san);
    switch (cls) {
      case 'brilliant': return pick([`Oh, that's gorgeous. ${m}!`, `Wait for it... ${m}! Brilliant.`, `${m}! Are you kidding me?`]);
      case 'great': return pick([`${m}! Great find.`, `Ooh, ${m}. Nice.`, `${m}! That's the one.`]);
      case 'checkmate': return pick([`${m}. And that's mate!`, `${m}. Game over.`, `${m}. Checkmate. Goodnight.`]);
      case 'blunder': return pick([`Nooo. ${m}. Huge blunder.`, `And... ${m}. That's a blunder.`, `Oof. ${m}. That one hurts.`]);
      case 'mistake': return pick([`${m}? That's a mistake.`, `Hmm, ${m}. Not good.`]);
      case 'missed_win': return pick([`${m}... and they just missed a win.`, `${m}? There was a win right there!`]);
      case 'inaccuracy': return pick([`${m}. Not quite the best.`, `${m}. Close, but not the move.`]);
      default: return `${m}.`;
    }
  };
  const creatorLine = (f: Frame): string | null | undefined => {
    if (!clip) return undefined;
    const pick = pickOf(`${clip.label}|${frameKey(f)}|${f.kind === 'scoutCard' || f.kind === 'openCard' ? `${f.card}${f.idx ?? ''}` : ''}`);
    switch (f.kind) {
      case 'countdown': {
        if (f.n !== (f.total ?? 3)) return null;
        if (f.text) return undefined;
        return clip.isTrap ? pick(['One move wins here. See it?', "There's a trap. Can you spring it?", 'Pause it. What wins?']) : pick(["Pause it. What's the move?", 'Find it before I show you.', `You've got ${f.total ?? 3} seconds. Go.`]);
      }
      case 'move': {
        if (clip.isReview) {
          const r = clip.plies[f.ply - 1]; const rc = r?.san.includes('#') ? 'checkmate' : r?.review?.classification;
          if (!r || !rc || !(NOTABLE.has(rc) || rc === 'checkmate')) return null;
          return reactTo(rc, r.san, pick);
        }
        if (clip.isOpening) return undefined;
        if (f.ply !== clip.key + 1) return null;
        const m = clip.plies[clip.key]; const c = m.san.includes('#') ? 'checkmate' : m.review?.classification;
        const cap = prefs.captions && m.review?.explanation ? ` ${firstSentence(m.review.explanation)}` : '';
        return `${reactTo(c, m.san, pick)}${cap}`.slice(0, 300);
      }
      case 'split': return pick([`They played ${spokenSan(f.playedSan)}. But ${spokenSan(f.betterSan)} was right there.`, `${spokenSan(f.playedSan)} on the board... ${spokenSan(f.betterSan)} was the move.`]);
      case 'better': return f.arrow ? pick([`The engine wanted ${spokenSan(f.text.replace(/^Better was /, ''))}.`, `Should've played ${spokenSan(f.text.replace(/^Better was /, ''))}.`]) : null;
      case 'reveal': return clip.ratings.w && clip.ratings.b ? `They were rated ${clip.ratings.w} and ${clip.ratings.b}. Did you guess it?` : null;
      case 'scoutCard': {
        const d = clip.scout; if (!d) return undefined;
        const name = d.profile?.name || d.username;
        if (f.card === 'profile') return `Meet ${name}. ${d.wins} wins, ${d.losses} losses in their last ${d.gamesAnalyzed}. Let's find the weak spot.`;
        if (f.card === 'openings') { const o = d.topOpenings?.[0]; return o ? pick([`Their go-to? The ${o.opening}. They win ${o.winRate} percent with it.`, `Expect the ${o.opening}. They win ${o.winRate} percent with it.`]) : null; }
        const st = d.stats;
        if (f.card === 'colors' && st) {
          const pct = (r: Rec) => (r.games ? Math.round((r.wins / r.games) * 100) : 0);
          const fm = st.firstMove[0];
          return `With White they win ${pct(st.asWhite)} percent. With Black, ${pct(st.asBlack)}.${fm ? ` First move? ${spokenSan(fm.san)}, ${fm.pct} percent of the time.` : ''}${st.vsE4 ? ` Play e4 and they answer ${spokenSan(st.vsE4.san)}.` : ''}`;
        }
        if (f.card === 'habits' && st) {
          const lostTime = st.lossesBy.time, lostTotal = st.lossesBy.checkmate + st.lossesBy.resignation + st.lossesBy.time + st.lossesBy.other;
          const share = lostTotal && lostTime ? Math.round((lostTime / lostTotal) * 100) : 0;
          const a = st.timeControl ? `Mostly ${st.timeControl}${st.avgMoves ? `, games around ${st.avgMoves} moves` : ''}.` : '';
          return `${a}${share ? ` And ${share} percent of their losses? On the clock.` : ''}`.trim() || null;
        }
        const i = f.idx ?? 0; const w = d.weaknesses?.[i];
        return w ? `${i === 0 ? "Here's how you beat them" : i === 1 ? 'Weak spot number two' : 'And one more'}: ${w.category}. ${firstSentence(w.description)}` : null;
      }
      case 'openCard': {
        const o = clip.openingData; if (!o) return undefined;
        if (f.card === 'ideas') return `${pick(['The whole point?', "Here's the idea.", 'Why it works:'])} ${o.ideas.slice(0, prefs.openCut === 'quick' ? 1 : 2).join('. ')}.`;
        if (f.card === 'stats' && o.results) return `${spokenCount(o.games)} real games${o.source === 'lichess' ? ' on Lichess' : ''}. White scores ${o.results.white} percent, Black ${o.results.black}.`;
        if (f.card === 'options') {
          const [a, b, c] = o.options;
          if (!a) return null;
          return `${a.pct != null ? `Most people play ${spokenSan(a.san)}.` : `The big one is ${spokenSan(a.san)}.`}${b ? ` ${spokenSan(b.san)}${c ? ` and ${spokenSan(c.san)} are` : ' is'} the other big ${c ? 'ones' : 'one'}.` : ''}`;
        }
        if (f.card === 'line') { const k = f.idx ?? 0; const l = o.lines[k]; return l ? (k === 0 ? `First up: the ${l.name}.` : k === 1 ? `Now, the ${l.name}.` : k === 2 ? `Or try the ${l.name}.` : `And the ${l.name}.`) : null; }
        if (f.card === 'trap' && o.trap) return pick([`Now the fun part. The ${o.trap.name}.`, `Okay, the trap. The ${o.trap.name}. Don't fall for it.`]);
        return undefined;
      }
      case 'summary': {
        const a = clip.accuracy;
        if (a?.w == null || a?.b == null) return undefined;
        return `Final verdict: White ${Math.round(a.w)} percent accuracy, Black ${Math.round(a.b)}.${clip.overview ? ` ${firstSentence(clip.overview)}` : ''}`.slice(0, 260);
      }
      default: return undefined;
    }
  };
  // One-line opening videos: the same script in either tone (it's all facts from the board and the data).
  const evalWords = (e: number | null | undefined) => (e == null ? null : Math.abs(e) >= 90 ? `${e > 0 ? 'White' : 'Black'} has a forced mate` : Math.abs(e) < 0.4 ? 'about equal' : `${e > 0 ? 'White' : 'Black'} is ${Math.abs(e) < 1.2 ? 'slightly' : 'clearly'} better`);
  const lineScript = (f: Frame): string | null | undefined => {
    if (!clip?.lineMode || !clip.ranges || !clip.openingData) return undefined;
    const o = clip.openingData; const l = o.lines[0]; const [a, b] = clip.ranges.lines[0] ?? [0, -1];
    const creator = prefs.tone !== 'teacher';
    if (f.kind === 'move') {
      if (f.ply === clip.ranges.main[1]) {
        const early = !prefs.openTeaser && prefs.lineCtaLine.trim() ? ` ${stripEmoji(prefs.lineCtaLine.trim())}` : '';
        return `That's the ${o.name}.${early} Now the ${l.name}.`;
      }
      if (f.ply < a || f.ply > b) return null;
      const pl = clip.plies[f.ply - 1];
      return pl ? `${spokenSan(pl.san)}. ${pl.review?.explanation ?? ''}`.trim().slice(0, 320) : null;
    }
    if (f.kind === 'openCard') {
      if (f.card === 'line') return null;
      if (f.card === 'why') return l.why?.length ? `${creator ? 'So why does it work?' : 'Why it works.'} ${l.why.join('. ')}.` : null;
      if (f.card === 'lineStats') {
        const bits = [
          l.pct != null && (l.games ?? 0) > 0 ? `${l.pct} percent of games in the ${o.name} go into this line` : '',
          l.whiteScore != null ? `White scores ${l.whiteScore} percent in them` : '',
          evalWords(l.eval) ? `Stockfish says ${evalWords(l.eval)}` : '',
        ].filter(Boolean);
        return bits.length ? `${creator ? 'The numbers: ' : ''}${bits.join('. ')}.` : null;
      }
      if (f.card === 'next') return l.next ? (creator ? `Stockfish's pick? ${spokenSan(l.next.san)}.` : `Stockfish's best move here is ${spokenSan(l.next.san)}.`) : null;
    }
    return undefined;
  };
  // Coach look: which frame carries the early call to action, and its text.
  const coachOn = prefs.theme !== 'classic';
  const ctaIdx = (() => {
    if (!coachOn || !clip) return -1;
    if (prefs.fastStart) {
      // After the first few moves: the next card or coach beat, or the sixth move.
      if (clip.lineMode) return frames.findIndex((f) => f.kind === 'openCard' && f.card === 'line');
      let moves = 0;
      for (let k = 0; k < frames.length; k++) {
        const f = frames[k];
        if (f.kind === 'move' || (f.kind === 'mapMove' && !f.back)) moves++;
        else if (moves >= 3 && ['openCard', 'better', 'reveal', 'mapStep', 'scoutCard', 'lessonBoard', 'split', 'summary', 'promoCard'].includes(f.kind)) return k;
        if (moves >= 6 && f.kind === 'move') return k;
      }
      return -1;
    }
    if (clip.lineMode) return -1;
    const k = clip.isMap ? frames.findIndex((f) => f.kind === 'mapStep' && f.step === 0)
      : frames.findIndex((f) => f.kind === 'teaser') >= 0 ? frames.findIndex((f) => f.kind === 'teaser') : frames.findIndex((f) => f.kind === 'intro');
    return k;
  })();
  const earlyText = clip?.isMap ? prefs.seriesCta.trim() : prefs.fastStart && clip?.lineMode ? prefs.lineCtaLine.trim() : prefs.earlyCta.trim();
  const commentQ = !clip ? '' : clip.isTrap ? 'Would you fall for it?' : clip.isPuzzle ? 'Did you solve it?' : clip.isReview ? 'Which move would you have played differently?'
    : clip.isLesson ? 'Did you get it right?' : clip.lineMode ? 'Do you play this line?' : clip.isOpening ? 'Which line do you play?' : clip.isScout ? 'Who should I scout next?'
    : clip.isScan ? 'Want me to scan your board?' : clip.isPromo ? (clip.promo?.template === 'versus' ? 'Would you switch?' : clip.promo?.template === 'live' ? 'Blitz or rapid?' : clip.promo?.template === 'tour' ? 'Which one are you trying first?' : 'Who are you challenging first?') : 'Would you have found it?';
  const narration = (f: Frame | undefined): string | null => {
    const base = narrationBase(f);
    if (!f || !clip || !coachOn) return base;
    if (ctaIdx >= 0 && earlyText && frames[ctaIdx] === f) return `${base ? `${base} ` : ''}${stripEmoji(earlyText)}`;
    if (f.kind === 'outro') return `${commentQ} Tell me in the comments. ${stripEmoji(prefs.outroLine)}${/[.!?]$/.test(prefs.outroLine.trim()) ? '' : '.'}`;
    return base;
  };
  const narrationBase = (f: Frame | undefined): string | null => {
    if (!f || !clip) return null;
    if (f.kind === 'rvCard') {
      if (f.card === 'hook') return clip.plies.some((x) => ['blunder', 'missed_win', 'mistake'].includes(x.review?.classification ?? ''))
        ? "I ran this game through ChessScout's free game review. Watch the move that lost it." : "I ran this game through ChessScout's free game review. Watch the best move of the game.";
      if (f.card === 'grades') return 'Every move graded, for both players.';
      return 'Every game you play, reviewed like this. Free, at ChessScout dot net.';
    }
    if (f.kind === 'promoCard' && f.card === 'tour') {
      const k = f.upTo ?? 0;
      if (k === 0) return stripEmoji(clip.promo?.hook ?? "Here's everything ChessScout can do.");
      if (k > TOUR.length) return stripEmoji(clip.promo?.closer ?? 'All in one app. Free to start, at ChessScout dot net.');
      return TOUR[k - 1].say;
    }
    { const x = lineScript(f); if (x !== undefined) return x; }
    if (clip.isMap && clip.map) {
      const e = clip.map;
      if (f.kind === 'mapStep') return mapSay(e, e.steps[f.step]);
      if (f.kind === 'mapMove') return null;
      if (f.kind === 'mapEnd') {
        const nx = nextEpisode(e);
        return `That's the whole tree: ${mapCount(e)} openings. So, how many did you know? Tell me in the comments.${nx ? ` Next up: ${nx.title.replace(/^The /, 'the ')}.` : ''}`;
      }
    }
    if (prefs.tone !== 'teacher' && !clip.isLesson) { const c = creatorLine(f); if (c !== undefined) return c; }
    return teacherLine(f);
  };
  const teacherLine = (f: Frame | undefined): string | null => {
    if (!f || !clip) return null;
    switch (f.kind) {
      case 'title': return stripEmoji(compTitle);
      case 'intro': return prefs.theme !== 'classic' && (clip.isMap || frames.some((x) => x.kind === 'teaser')) ? null : stripEmoji(hook.replace(/^#\d+ · /, ''));
      case 'teaser': return f.said;
      case 'countdown': return f.n === (f.total ?? 3) ? (f.text ? stripEmoji(f.text) : clip.isTrap ? 'Can you spot the winning move?' : 'Can you find the move?') : null;
      case 'card': return stripEmoji(f.text);
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
      case 'scoutCard': {
        const d = clip.scout; if (!d) return null;
        const name = d.profile?.name || d.username;
        if (f.card === 'profile') return `${name}. ${d.wins} wins, ${d.losses} losses and ${d.draws} draws in their last ${d.gamesAnalyzed} games.`;
        if (f.card === 'openings') { const o = d.topOpenings?.[0]; return o ? `Their favourite opening is the ${o.opening}, and they win ${o.winRate} percent of the time.` : null; }
        const st = d.stats;
        if (f.card === 'colors' && st) {
          const pct = (r: Rec) => (r.games ? Math.round((r.wins / r.games) * 100) : 0);
          const fm = st.firstMove[0];
          return `As White they win ${pct(st.asWhite)} percent, as Black ${pct(st.asBlack)} percent.${fm ? ` They open with ${spokenSan(fm.san)} ${fm.pct} percent of the time.` : ''}${st.vsE4 ? ` Against e4 they play ${spokenSan(st.vsE4.san)}.` : ''}`;
        }
        if (f.card === 'habits' && st) {
          const lostTime = st.lossesBy.time, lostTotal = st.lossesBy.checkmate + st.lossesBy.resignation + st.lossesBy.time + st.lossesBy.other;
          const parts = [st.timeControl ? `They mostly play ${st.timeControl} games` : '', st.avgMoves ? `that last about ${st.avgMoves} moves` : ''].filter(Boolean).join(' ');
          return `${parts ? `${parts}.` : ''}${lostTotal && lostTime ? ` ${Math.round((lostTime / lostTotal) * 100)} percent of their losses are on time.` : ''}`.trim() || null;
        }
        const i = f.idx ?? 0; const w = d.weaknesses?.[i];
        return w ? `${i === 0 ? 'Their biggest weakness' : i === 1 ? 'Next' : 'And'}: ${w.category}. ${w.description.split(/(?<=[.!?])\s/)[0]}` : null;
      }
      case 'openCard': {
        const o = clip.openingData; if (!o) return null;
        if (f.card === 'ideas') return `The ${o.name}. ${(prefs.openCut === 'quick' ? o.ideas.slice(0, 2) : o.ideas).join('. ')}.`;
        if (f.card === 'stats' && o.results) return `In ${spokenCount(o.games)} real games${o.source === 'lichess' ? ' on Lichess' : ''}, White wins ${o.results.white} percent, Black ${o.results.black} percent.`;
        if (f.card === 'options') { const top = o.options.slice(0, 3).map((x) => spokenSan(x.san)); return `The main choices: ${top.join(', ')}.`; }
        if (f.card === 'line') { const l = o.lines[f.idx ?? 0]; return l ? `Line ${(f.idx ?? 0) + 1}: the ${l.name}.` : null; }
        if (f.card === 'trap' && o.trap) return `And watch out for the ${o.trap.name}.`;
        return null;
      }
      case 'lessonText': case 'lessonBoard': return stripEmoji(f.text.replace(/^✓\s*/, '')).slice(0, 400);
      case 'scanPhoto': return 'Snap a photo of any chess board.';
      case 'promoCard': {
        const pr = clip.promo; if (!pr) return null;
        if (f.card === 'vs') { const r = pr.rows[(f.upTo ?? 1) - 1]; return r ? `${r.label}. ChessScout: ${r.us}. ${pr.rival}: ${r.them}.` : null; }
        if (f.card === 'switch') return stripEmoji(pr.closer);
        if (f.card === 'match') return stripEmoji(pr.hook);
        if (f.card === 'react') return null;
        if (f.card === 'review') return 'And the second it ends, your coach reviews the game. Free. Every mistake, and the better move.';
        if (f.card === 'live' && pr.template === 'live') return `Five minutes up to seven days a move. ${stripEmoji(pr.closer)}`;
        if (f.card === 'live') return 'Play online: five minutes, all the way up to one move a day.';
        if (f.card === 'daily') return "Or daily games: one move a day, and we'll tell you when it's your turn.";
        return `Send a friend a challenge link. ${stripEmoji(pr.closer)}`;
      }
      case 'summary': {
        const a = clip.accuracy;
        const acc = a?.w != null && a?.b != null ? `White played with ${Math.round(a.w)} percent accuracy, Black with ${Math.round(a.b)}.` : 'Here is how both sides did.';
        return `${acc}${clip.overview ? ` ${clip.overview.split(/(?<=[.!?])\s/)[0]}` : ''}`.slice(0, 300);
      }
      // The closing splash says the follow / share line, so the end card doesn't repeat it.
      case 'outro': return prefs.splash && prefs.splashCta && isLast ? `${stripEmoji(prefs.outroLine)}.` : `${stripEmoji(prefs.outroLine)}. Follow for more.`;
      case 'splash': return prefs.splashCta && ctaText ? stripEmoji(ctaText) : null;
      default: return null;
    }
  };
  // Fetch every line of the script once, ahead of playback: a few at a time
  // (firing them all at once got some refused, which used to fall back to a
  // second, robotic browser voice), retried, all in the one chosen voice.
  // Playback waits until the whole script is ready, so nothing gets cut off.
  const [voicePrep, setVoicePrep] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    if (!prefs.voice || !frames.length) { setVoicePrep(null); return; }
    let live = true;
    const vkey = (t: string) => `${voiceKey}|${t}`;
    const lines = [...new Set(frames.map(narration).filter((x): x is string => !!x))];
    const todo = lines.filter((t) => !voiceUrl.current.has(vkey(t)));
    let done = lines.length - todo.length, failed = 0;
    setVoicePrep({ done, total: lines.length });
    const one = async (t: string) => {
      for (let attempt = 0; attempt < 3 && live; attempt++) {
        try {
          const r = await apiFetch('/api/tts/speak', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, voice: prefs.voiceName, style: prefs.tone === 'teacher' || clip?.isLesson ? 'studio' : 'creator' }) });
          if (!r.ok) throw new Error('tts');
          const url = URL.createObjectURL(await r.blob());
          await new Promise<void>((res) => { const a = new Audio(url); a.onloadedmetadata = () => { voiceLen.current.set(vkey(t), a.duration || 0); res(); }; a.onerror = () => res(); });
          voiceUrl.current.set(vkey(t), url);
          return;
        } catch { await new Promise((res) => setTimeout(res, 700 * (attempt + 1))); }
      }
      failed++;
    };
    void (async () => {
      const queue = [...todo];
      await Promise.all(Array.from({ length: 3 }, async () => {
        while (live && queue.length) { await one(queue.shift()!); done++; if (live) setVoicePrep({ done, total: lines.length }); }
      }));
      if (!live) return;
      setVoiceTick((x) => x + 1);
      setVoiceNote(failed ? `${failed} line${failed > 1 ? 's' : ''} of the voiceover couldn't be made (it uses OpenAI), so ${failed > 1 ? 'they play' : 'it plays'} silently. Try again in a moment.` : null);
    })();
    return () => { live = false; };
  }, [prefs.voice, prefs.voiceName, frames, hook, prefs.outroLine, compTitle, prefs.captions, prefs.splashCta, ctaText, prefs.openCut, prefs.tone]); // eslint-disable-line react-hooks/exhaustive-deps
  // Playback starts once the first few lines are ready; the rest keep coming in, in script
  // order, while it plays. If it ever reaches a line that isn't ready yet, it waits for it.
  const voiceReady = (() => {
    if (!prefs.voice || !voicePrep || voicePrep.done >= voicePrep.total) return true;
    const has = (t: string) => voiceUrl.current.has(`${voiceKey}|${t}`);
    const script = [...new Set(frames.map(narration).filter((x): x is string => !!x))];
    if (!script.slice(0, 4).every(has)) return false;
    const now = narration(frames[i]);
    return !now || has(now);
  })();
  useEffect(() => { if (blank && playing && blankDone.current) setBlank(false); }, [blank, playing]);
  // The premium narrator (ElevenLabs) when the server has it; it becomes the default once.
  const [premiumVoice, setPremiumVoice] = useState(false);
  useEffect(() => {
    apiFetch('/api/tts/voices').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d?.premium) return;
      setPremiumVoice(true);
      setPrefs((p) => {
        const cur = p as Prefs & { voiceV3?: number };
        if (cur.voiceV3) return p;
        const n = { ...cur, voiceV3: 1, voiceName: cur.voiceName === 'ash' ? 'premium' : cur.voiceName };
        try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* ignore */ }
        return n;
      });
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Pressing play before the voiceover is ready waits for it, then starts.
  const [waitVoice, setWaitVoice] = useState(false);
  useEffect(() => { if (playing && !voiceReady) { setPlaying(false); setWaitVoice(true); } }, [playing, voiceReady]);
  useEffect(() => { if (waitVoice && voiceReady) { setWaitVoice(false); setPlaying(true); } }, [waitVoice, voiceReady]);
  // Render mode: ready once the clip and its whole voiceover are loaded; done a beat after the last frame.
  useEffect(() => {
    if (!render) return;
    const w = window as unknown as { __studioRender?: Record<string, unknown> };
    if (w.__studioRender) w.__studioRender.ready = !!clip && frames.length > 0 && (!prefs.voice || !voicePrep || voicePrep.done >= voicePrep.total);
  }, [render, clip, frames.length, voicePrep, prefs.voice]);
  useEffect(() => {
    if (!render || !renderStarted.current || playing || waitVoice || i < frames.length - 1 || !isLast) return;
    const t = setTimeout(() => { if (renderStarted.current) { renderStarted.current = false; stopSoundtrack(); } }, 1200);
    return () => clearTimeout(t);
  }, [render, playing, waitVoice, i, frames.length, isLast]); // eslint-disable-line react-hooks/exhaustive-deps
  const voiceAudio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { if (!playing) { voiceAudio.current?.pause(); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } }, [playing]);
  useEffect(() => {
    if (!prefs.voice || !playing) return;
    const said = narration(frame);
    if (!said) return;
    voiceAudio.current?.pause();
    // Only the chosen voice ever plays (no browser-voice fallback).
    const url = voiceUrl.current.get(`${voiceKey}|${said}`);
    if (url) voiceAudio.current = mus().playVoice(url);
  }, [i, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Word-by-word subtitles of the voiceover (burned into the frame, so they're in the recording) ─
  const [, setSubTick] = useState(0);
  const subsOn = prefs.voice && prefs.subs && playing;
  const ctaOn = prefs.splashCta && playing && frames[i]?.kind === 'splash';
  useEffect(() => {
    if (!subsOn && !ctaOn) return;
    const t = setInterval(() => setSubTick((x) => x + 1), 70);
    return () => clearInterval(t);
  }, [subsOn, ctaOn]);

  const restart = () => {
    looks.current.clear();
    dueAt.current = null; nextClipAt.current = null;
    if (playing && prefs.music !== 'off') mus().start(prefs.music);
    if (isComp && q !== 0) { autoNext.current = true; setQ(0); return; }
    setI(0); setPlaying(true);
  };
  const restartRef = useRef(restart); restartRef.current = restart;
  useEffect(() => {
    if (!render) return;
    const w = window as unknown as { __studioRender?: Record<string, unknown> };
    w.__studioRender = { ...(w.__studioRender ?? {}), ready: false, done: false, start: () => {
      try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); } catch { /* ignore */ }
      setClean(true); setBlank(false);
      startSoundtrack();
      renderStarted.current = true;
      (w.__studioRender as Record<string, unknown>).startedAt = Date.now();
      restartRef.current();
    } };
  }, [render]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Compilation clips: remove, reorder, jump, per-clip look ────────────
  const removeClip = (k: number) => {
    if (!queue || queue.length <= 1) return;
    const n = queue.length;
    setQueue(queue.filter((_, j) => j !== k));
    // "Top 5 …" becomes "Top 4 …".
    const t = compTitle.replace(new RegExp(`(^|\\D)${n}(?=\\D|$)`), `$1${n - 1}`);
    if (t !== compTitle) setCompTitle(t);
    if (k < q) { setQ(q - 1); setClipQ((c) => c - 1); }
    else if (k === q) { setPlaying(false); setQ(Math.min(q, n - 2)); }
  };
  const moveClip = (k: number, dir: -1 | 1) => {
    if (!queue) return;
    const j = k + dir;
    if (j < 0 || j >= queue.length) return;
    const nl = [...queue]; [nl[k], nl[j]] = [nl[j], nl[k]];
    setQueue(nl);
    if (q === k) { setQ(j); setClipQ(j); } else if (q === j) { setQ(k); setClipQ(k); }
  };
  const goClip = (k: number) => { if (k !== q) { setPlaying(false); setQ(k); } };
  const setClipLook = (key: string, v: ClipLook | undefined) => { looks.current.clear(); setClipLooks((c) => { const n = { ...c }; if (v === undefined) delete n[key]; else n[key] = v; return n; }); };

  // ── Stickers ────────────────────────────────────────────────────────────
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [stickerFromHere, setStickerFromHere] = useState(true);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = timelineRef.current; const el = box?.querySelector<HTMLElement>(`[data-tl="${i}"]`);
    if (box && el) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
  }, [i]);
  const [customText, setCustomText] = useState('');
  const [textStyle, setTextStyle] = useState<'text' | 'caption' | 'reply'>('text');
  const [insText, setInsText] = useState('');
  const frameRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const addSticker = (text: string, kind: Sticker['kind'], tone?: number) => {
    const id = Date.now();
    setStickers((s) => [...s, { id, text, kind, tone, x: 50, y: kind === 'emoji' ? 30 : kind === 'caption' ? 13 : kind === 'reply' ? 30 : 22, size: kind === 'emoji' ? 12 : kind === 'badge' ? 7 : kind === 'caption' ? 8 : 6, from: stickerFromHere && i > 0 ? frameIds[i] : undefined }]);
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
  // The clean-view soundtrack stops a moment after the clip ends.
  useEffect(() => {
    if (!clean || blank || playing || i < frames.length - 1 || !isLast || trackRec.current?.state !== 'recording') return;
    const t = setTimeout(stopSoundtrack, 1200);
    return () => clearTimeout(t);
  }, [clean, blank, playing, i, frames.length]); // eslint-disable-line react-hooks/exhaustive-deps
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
    { label: 'Trap tutorial', v: { before: 30, trapBefore: 99, after: 4, speed: 1.6, guess: true, captions: true, betterLine: false, split: false, intro: true } },
    { label: 'Speedrun', v: { before: 400, after: 400, speed: 0.35, guess: false, captions: false, betterLine: false, split: false, intro: true } },
    { label: 'Quiz A/B/C', v: { guess: true, choices: true, countdownSecs: 5, betterLine: false, split: false, intro: true, before: 4, after: 2 } },
    { label: 'Meme edit', v: { zoom: true, effects: true, music: 'hype' as MusicStyle, guess: false, captions: false, intro: false, before: 4, after: 2, speed: 0.8 } },
    { label: '10-second challenge', v: { guess: true, countdownSecs: 10, choices: false, intro: true, before: 3, after: 3 } },
    { label: 'Kids', v: { bg: 'kids', music: 'playful' as MusicStyle, voice: true, subs: true, captions: true, pieceFx: true, effects: true, speed: 1.4, intro: true, outroLine: 'Learn chess free at chessscout.net' } },
    { label: 'Guess the rating', v: { before: 10, after: 6, speed: 0.9, guess: false, guessRating: true, captions: false } },
  ];
  const applyPreset = (v: Partial<Prefs>) => setPrefs((p) => { const n = { ...p, ...v }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const saveCover = () => {
    if (!clip) return;
    const kp = clip.plies[clip.key];
    const c = kp ? (kp.san.includes('#') ? 'checkmate' : kp.review?.classification) : null;
    // The position before the key move (the puzzle), unless it's a trap lesson's final position.
    const fen = kp ? kp.fenBefore : clip.plies[0]?.fenBefore ?? view?.fen ?? START_FEN;
    const colors = look ? (BOARD_THEMES[look.boardTheme] ?? { light: '#EEEED2', dark: '#769656' }) : { light: '#EEEED2', dark: '#769656' };
    const url = drawCover({ fen, flipped, hook: stripEmoji(hook) || hook, sub, bg: prefs.bg, badge: prefs.guess ? { glyph: '?', text: 'Find it', color: '#81B64C' } : c && LABEL[c] ? LABEL[c] : null, colors });
    const a = document.createElement('a'); a.href = url; a.download = `${clip.fileBase}-cover.png`; a.click();
  };

  // ── Post kit ────────────────────────────────────────────────────────────
  const postText = clip ? `${isComp ? stripEmoji(compTitle) : hook}\n\n${clip.isTrap ? 'Would you fall for it? 👇' : clip.isPuzzle ? 'Did you solve it? Drop the first move in the comments 👇' : clip.isReview ? 'Which move would you have played differently? 👇' : clip.isLesson ? 'Learning chess? Save this one and share it with a friend 👇' : clip.isMap ? 'Which of these do you play? Drop it in the comments 👇' : clip.isOpening ? 'Which line do you play? Drop it in the comments 👇' : clip.isScout ? 'Who should I scout next? Drop a username 👇' : clip.isScan ? 'Want me to scan your board? Drop a photo in the comments 👇' : clip.isPromo ? (clip.promo?.template === 'versus' ? 'Would you switch? 👇' : clip.promo?.template === 'live' ? 'Blitz or rapid? Tell me below 👇' : clip.promo?.template === 'tour' ? 'Which one are you trying first? 👇' : 'Tag the friend you want to beat 👇') : 'Would you have found it? Comment your move 👇'}\nReview your own games free at chessscout.net${clip.isPromo ? '\nOn Lichess? Join our team: lichess.org/team/chessscoutnet' : ''}\n\n${hashtagsFor(clip)}` : '';
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
  // Challenge promo: 10-minute clocks that tick down with each move (the side to move is lit).
  const clockChip = (side: 'w' | 'b') => {
    if (!clip.isPromo || (clip.promo?.template !== 'challenge' && clip.promo?.template !== 'live')) return null;
    const shown = frame?.kind === 'move' ? frame.ply : frame?.kind === 'promoCard' ? plies.findIndex((m) => m.fen === frame.fen) + 1 : 0;
    const blitz = clip.promo?.template === 'live';
    let left = blitz ? 300 : 600;
    for (let p = 0; p < shown; p++) if (plies[p]?.color === side) left -= blitz ? 8 + ((p * 7 + 3) % 19) : 3 + ((p * 7 + 3) % 11);
    left = Math.max(blitz ? 3 : 0, left);
    const toMove = (shown % 2 === 0 ? 'w' : 'b') === side;
    return <span className="rounded-[0.4em] px-[0.5em] py-[0.1em] font-black tabular-nums" style={{ fontSize: 'clamp(12px,1.9cqh,20px)', background: toMove ? (left < 20 ? '#E5484D' : '#F2F2F2') : 'rgba(0,0,0,.55)', color: toMove ? (left < 20 ? '#fff' : '#141414') : left < 20 ? '#ff8a8a' : '#fff' }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>;
  };
  const moveNo = cur ? `${Number(cur.fenBefore.split(' ')[5]) || Math.floor((view.ply - 1) / 2) + 1}${cur.color === 'w' ? '.' : '...'}` : '';
  const label = cls ? LABEL[cls] : null;
  // Arrows: the better move on a mistake (key frame), the engine line's first move, nothing otherwise.
  const arrows: { from: string; to: string; color?: string }[] = [];
  if (frame?.kind === 'better' && frame.arrow) arrows.push({ ...frame.arrow, color: 'rgba(129,182,76,0.95)' });
  // Opening clips: which variation is on screen (the line map shows then, and the hook steps aside).
  const openLine: number | null = (() => {
    if (!clip.isOpening || !clip.ranges || !frame) return null;
    if (frame.kind === 'openCard' && frame.card === 'line') return frame.idx ?? 0;
    if (frame.kind === 'rewind') return frame.idx;
    if (frame.kind === 'move') { const k = clip.ranges.lines.findIndex(([a, b]) => frame.ply >= a && frame.ply <= b); return k >= 0 ? k : null; }
    return null;
  })();
  // Opening clips: every reply on the options card, the line's first move on its title card.
  if (frame?.kind === 'openCard' && clip.openingData && (frame.card === 'options' || frame.card === 'line')) {
    const o = clip.openingData;
    const sans = frame.card === 'options' ? o.options.map((x) => x.san) : [o.lines[frame.idx ?? 0]?.moves[0]].filter(Boolean) as string[];
    const COLORS = ['rgba(129,182,76,0.95)', 'rgba(74,139,214,0.92)', 'rgba(232,180,71,0.92)', 'rgba(202,52,49,0.9)'];
    // Arrow colours match the line each move starts (grey for replies no line covers).
    sans.forEach((san, k) => {
      const ln = frame.card === 'line' ? (frame.idx ?? 0) : (o.options[k]?.lines?.[0] ?? -1);
      try { const c = new Chess(frame.fen); const mv = c.move(san); if (mv) arrows.push({ from: mv.from, to: mv.to, color: ln >= 0 ? COLORS[ln % 4] : 'rgba(150,160,158,0.85)' }); } catch { /* ignore */ }
    });
  }
  // One-line opening videos: the squares a move's note talks about light up, with an
  // arrow from the piece to each square it attacks, defends or controls.
  const noteMarks: string[] = (() => {
    if (!clip.lineMode || !clip.ranges || frame?.kind !== 'move') return [];
    const [a, b] = clip.ranges.lines[0] ?? [0, -1];
    if (frame.ply < a || frame.ply > b) return [];
    const pl = clip.plies[frame.ply - 1]; if (!pl) return [];
    // The move's own note (not the line's closing summary, which can name other squares).
    const own = moveNote(pl.fenBefore, pl.san);
    const sqs = [...new Set((own.match(/\b[a-h][1-8]\b/g) ?? []))].filter((q) => q !== pl.to);
    try {
      const c = new Chess(pl.fen);
      for (const q of sqs) if ((c.attackers(q as never, pl.color) as string[]).includes(pl.to)) arrows.push({ from: pl.to, to: q, color: 'rgba(255,214,10,0.9)' });
    } catch { /* ignore */ }
    return sqs;
  })();
  if (frame?.kind === 'openCard' && frame.card === 'next' && clip.openingData?.lines[0]?.next) {
    try { const c = new Chess(frame.fen); const mv = c.move(clip.openingData.lines[0].next!.san); if (mv) arrows.push({ from: mv.from, to: mv.to, color: 'rgba(129,182,76,0.95)' }); } catch { /* ignore */ }
  }
  if (frame?.kind === 'teaser' && !frame.mate && clip.openingData && !clip.ranges?.trap && !clip.lineMode) {
    const COLORS = ['rgba(129,182,76,0.95)', 'rgba(74,139,214,0.92)', 'rgba(232,180,71,0.92)', 'rgba(202,52,49,0.9)'];
    clip.openingData.options.slice(0, 4).forEach((x, k) => {
      try { const c = new Chess(frame.fen); const mv = c.move(x.san); if (mv) arrows.push({ from: mv.from, to: mv.to, color: COLORS[k % 4] }); } catch { /* ignore */ }
    });
  }
  if (prefs.arrow && isKey && rev?.betterMove && cls && BAD.has(cls)) {
    try { const c = new Chess(plies[keyPly - 1].fenBefore); const mv = c.move(rev.betterMove); if (mv) arrows.push({ from: mv.from, to: mv.to, color: 'rgba(129,182,76,0.9)' }); } catch { /* ignore */ }
  }
  let subWords: { words: string[]; hi: number } | null = null;
  const said = subsOn && frame && ['move', 'split', 'better', 'reveal'].includes(frame.kind) ? narration(frame) : null;
  if (said) {
    const words = said.split(/\s+/).filter(Boolean);
    const len = Math.max(400, (voiceLen.current.get(`${voiceKey}|${said}`) ?? words.length * 0.36) * 1000);
    const k = Math.max(0, Math.min(words.length - 1, Math.floor(((performance.now() - frameStart) / len) * words.length)));
    const c0 = Math.floor(k / 4) * 4;
    subWords = { words: words.slice(c0, c0 + 4), hi: k - c0 };
  }
  const zoomOrigin = (() => {
    if (!prefs.zoom || !clip) return null;
    const sq = clip.plies[clip.key]?.to; if (!sq) return null;
    const f = sq.charCodeAt(0) - 97, r = Number(sq[1]);
    const col = flipped ? 7 - f : f, row = flipped ? r - 1 : 8 - r;
    return `${(col + 0.5) * 12.5}% ${(row + 0.5) * 12.5}%`;
  })();
  // Opening clips always show their line notes; other clips follow the Captions setting.
  // Coach look: the bubble shows what the coach is saying (the latest line), else the hook.
  // The app tour in the tree look is laid out like the Family Tree (its own bubble, stamp and list).
  const tourTree = !!clip.isPromo && clip.promo?.template === 'tour' && prefs.tourStyle !== 'cards';
  const tourK = !tourTree ? 0 : (() => { for (let k = i; k >= 0; k--) { const f = frames[k]; if (f?.kind === 'promoCard' && f.card === 'tour') return f.upTo ?? 0; } return 0; })();
  const coachClip = coachOn && !clip.isMap && !tourTree;
  const bubbleText = (() => {
    if (!coachClip || !frame) return null;
    if (frame.kind === 'intro' || frame.kind === 'outro' || frame.kind === 'splash' || frame.kind === 'countdown' || frame.kind === 'card' || frame.kind === 'teaser' || frame.kind === 'title' || frame.kind === 'scanPhoto') return null;
    for (let k = i; k >= Math.max(0, i - 14); k--) {
      const t = narrationBase(frames[k]);
      if (t && frames[k].kind !== 'title') return t;
      if (frames[k].kind === 'intro' || frames[k].kind === 'teaser') break;
    }
    return stripEmoji(hook.replace(/^#\d+ · /, ''));
  })();
  const topic = !coachClip ? '' : clip.isTrap ? '🪤 Trap' : clip.isPuzzle ? `🧩 Puzzle${clip.puzzleRating ? ` · ${clip.puzzleRating}` : ''}` : clip.isReview ? '📊 Game review' : clip.isScout ? '🔍 Opponent scout'
    : clip.isLesson ? '🎓 Lesson' : clip.isOpening ? `♟️ ${clip.openingData?.name ?? 'Opening'}${clip.lineMode ? ` · Line ${clip.lineMode.no}` : ''}` : clip.isScan ? '📷 Scanned board' : clip.isPromo ? '♞ ChessScout' : '⚡ Game moment';
  // The title card: a kicker, a big title (*word* = highlighted) and a line under it.
  const titleCard = (() => {
    const emo = (hook.match(/\p{Extended_Pictographic}/u) ?? [''])[0];
    const plain = stripEmoji(hook.replace(/^#\d+ · /, '')).trim();
    const lastWord = (t: string) => t.replace(/(\S+)([.!?]*)$/, '*$1*$2');
    if (clip.isMap && clip.map) { const n = clip.map.steps.filter((x) => x.name).length; return { kicker: `The Family Tree · Part ${partLabel(clip.map)}`, title: `*${n}* openings`, sub: `from ${clip.map.family}. How many do you know?`, emo: '🌳', big: true }; }
    if (clip.lineMode && clip.openingData) { const l = clip.openingData.lines[0]; return { kicker: `${clip.openingData.name} · Line ${clip.lineMode.no}`, title: lastWord(`The ${l.name}`), sub: 'Every move, explained', emo: '♟️', big: false }; }
    if (clip.isOpening && clip.openingData) { const o = clip.openingData; const h = stripEmoji(o.hook).split(':'); return { kicker: 'Opening', title: lastWord(o.name), sub: (h[1] ?? h[0]).trim(), emo: '♟️', big: false }; }
    if (clip.isTrap) return { kicker: 'Trap alert', title: lastWord(plain.replace(/^The /, 'The ')), sub: 'Would you fall for it?', emo: emo || '🪤', big: false };
    if (clip.isPuzzle) return { kicker: `Puzzle${clip.puzzleRating ? ` · ${clip.puzzleRating}` : ''}`, title: 'Find the *move*', sub: plain, emo: emo || '🧩', big: false };
    if (clip.isScout && clip.scout) return { kicker: 'Opponent scout', title: lastWord(clip.scout.profile?.name || clip.scout.username), sub: 'Here’s how to beat them', emo: '🔍', big: false };
    if (clip.isReview) return { kicker: 'Game review', title: lastWord(plain), sub: clip.names.w && clip.names.b ? `${clip.names.w} vs ${clip.names.b}` : sub, emo: emo || '📊', big: false };
    if (clip.isLesson && clip.lesson) return { kicker: clip.lesson.course?.title ?? 'Lesson', title: lastWord(clip.lesson.title), sub: 'Learn it in a minute', emo: emo || '🎓', big: false };
    return { kicker: clip.isPromo ? 'ChessScout' : clip.isScan ? 'Scanned board' : 'Game moment', title: lastWord(plain), sub: sub, emo, big: false };
  })();
  const caption = frame?.kind === 'better' ? frame.text : (prefs.captions || clip.isOpening) && cur && !subWords ? rev?.explanation : null;
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
      <div className={`flex min-h-0 flex-1 items-center justify-center ${clean ? 'p-0' : 'p-3'}`} onClick={() => { setSelected(null); if (clean) cleanTap(); }}>
        <div ref={frameRef} className="relative overflow-hidden"
          style={{ ...(clean ? reelFrameSize(true) : { aspectRatio: '9 / 16', height: 'min(100%, 92dvh)', maxWidth: '100%', containerType: 'size' }), ...BACKGROUNDS[prefs.bg]?.css } as React.CSSProperties}>
          <motion.div key={shake} animate={shake ? { x: [0, -14, 12, -8, 6, 0] } : {}} transition={{ duration: 0.45 }} className="absolute inset-0">
            {prefs.progress && <div className="absolute inset-x-0 top-0 z-20 h-[0.6cqh] bg-white/15"><div className="h-full bg-[#81B64C] transition-all duration-300" style={{ width: `${progress * 100}%` }} /></div>}
            {/* Hook: pops in big on the intro, then sits at the top */}
            <motion.div key={frame?.kind === 'intro' ? `intro${playing ? 1 : 0}` : 'top'} initial={frame?.kind === 'intro' ? { scale: 0.6, opacity: 0, y: '18cqh' } : false}
              animate={{ scale: 1, opacity: pop || openLine != null || clip.isMap || coachClip || frame?.kind === 'teaser' || frame?.kind === 'countdown' || frame?.kind === 'card' || frame?.kind === 'scanPhoto' ? 0 : 1, y: frame?.kind === 'intro' ? '18cqh' : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
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
            {/* Coach look: the title card (first frame, and the reel's cover) */}
            <AnimatePresence>
              {coachOn && frame?.kind === 'intro' && (
                <motion.div key={`tc${playing ? 1 : 0}${clipQ}`} initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.35 }} className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
                  <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% 38%, rgba(11,17,18,.25) 0%, rgba(11,17,18,.82) 62%, rgba(5,8,6,.96) 100%)' }} />
                  {/* Light rays behind the title */}
                  <motion.div className="absolute left-1/2 top-[40%] h-[120cqh] w-[120cqh] -translate-x-1/2 -translate-y-1/2" initial={{ rotate: 0, opacity: 0 }} animate={{ rotate: 40, opacity: 0.5 }} transition={{ duration: 6, ease: 'linear' }}
                    style={{ background: 'repeating-conic-gradient(from 0deg, rgba(129,182,76,.22) 0deg 7deg, transparent 7deg 22deg)', maskImage: 'radial-gradient(circle, #000 0%, transparent 62%)', WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 62%)' }} />
                  <div className="absolute inset-x-[7%] top-[24%] text-center">
                    <motion.p initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
                      className="mx-auto w-fit rounded-full bg-[#81B64C] px-[1em] py-[0.3em] font-black uppercase tracking-[0.08em] text-white shadow-lg" style={{ fontSize: 'clamp(11px,2cqh,21px)' }}>{titleCard.kicker}</motion.p>
                    {titleCard.emo && (
                      <motion.p initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: -8 }} transition={{ delay: 0.55, type: 'spring', stiffness: 380, damping: 12 }}
                        className="mx-auto mt-[2cqh] w-fit" style={{ fontSize: 'clamp(34px,7.5cqh,80px)', filter: 'drop-shadow(0 0.12em 0.2em rgba(0,0,0,.6))' }}>{titleCard.emo}</motion.p>
                    )}
                    <motion.p initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 260, damping: 15 }}
                      className="relative mt-[1.4cqh] font-black uppercase leading-[0.95] text-white"
                      style={{ fontSize: titleCard.big ? 'clamp(44px,10.5cqh,112px)' : `clamp(30px,${titleCard.title.length > 30 ? 5.6 : titleCard.title.length > 18 ? 6.8 : 8.2}cqh,90px)`, letterSpacing: '-0.01em', textShadow: '0 0.06em 0 #0B1112, 0 0.12em 0.5em rgba(0,0,0,.65)' }}>
                      {titleCard.title.split(/(\*[^*]+\*)/).map((t, n) => t.startsWith('*') ? <span key={n} style={{ color: '#9BD35A' }}>{t.slice(1, -1)}</span> : <span key={n}>{t}</span>)}
                      {/* Shine sweep */}
                      <motion.span className="absolute inset-0" initial={{ x: '-120%' }} animate={{ x: '120%' }} transition={{ delay: 0.9, duration: 0.9, ease: 'easeInOut' }}
                        style={{ background: 'linear-gradient(100deg, transparent 30%, rgba(255,255,255,.55) 50%, transparent 70%)', mixBlendMode: 'overlay' }} />
                    </motion.p>
                    {titleCard.sub && (
                      <motion.p initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }}
                        className="mx-auto mt-[2cqh] max-w-[90%] font-black leading-snug text-white/85" style={{ fontSize: 'clamp(14px,2.7cqh,28px)' }}>{titleCard.sub}</motion.p>
                    )}
                  </div>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="absolute inset-x-0 bottom-[19%] flex items-center justify-center gap-[0.45em] font-black text-white/80" style={{ fontSize: 'clamp(12px,2cqh,20px)' }}>
                    <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="" style={{ width: '1.7em', height: '1.7em' }} />chessscout.net
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Coach look: topic header, the coach's speech bubble (what's being said), early call-to-action chips */}
            {coachClip && (<>
              <div className="pointer-events-none absolute inset-x-[5%] top-[2.4%] z-30 flex items-center justify-between font-black" style={{ fontSize: 'clamp(10px,1.65cqh,17px)' }}>
                <span className="truncate text-white">{topic}</span>
                {isComp && <span className="rounded-full bg-white/10 px-[0.6em] py-[0.1em] text-white/70">#{queue!.length - clipQ}</span>}
              </div>
              <AnimatePresence mode="wait">
                {bubbleText && !pop && !(openLine != null && !clip.lineMode) && (
                  <motion.div key={`b-${bubbleText}`} initial={{ opacity: 0, scale: 0.92, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                    className="pointer-events-none absolute left-[5%] right-[5%] top-[6%] z-30 flex items-start gap-[0.55em]" style={{ fontSize: `clamp(12px,${bubbleText.length > 110 ? 1.9 : bubbleText.length > 60 ? 2.2 : 2.5}cqh,26px)` }}>
                    <span className="grid h-[1.9em] w-[1.9em] shrink-0 place-items-center rounded-full bg-[#81B64C] text-[0.9em] shadow-lg">♞</span>
                    <p className="line-clamp-3 rounded-[0.9em] rounded-tl-[0.2em] bg-white px-[0.75em] py-[0.45em] font-black leading-[1.15] text-[#141A14] shadow-xl">{bubbleText}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </>)}
            {coachOn && ctaIdx >= 0 && earlyText && frames[ctaIdx] === frame && frame?.kind !== 'teaser' && (
              <div className={`pointer-events-none absolute inset-x-0 z-30 flex justify-center gap-[1cqh] ${clip.isMap ? 'top-[73%]' : 'top-[18.6%]'}`} style={{ fontSize: 'clamp(11px,1.9cqh,20px)' }}>
                {[['👍', 'Like'], ['＋', 'Follow'], ['↗', 'Share']].map(([g, t], n) => (
                  <motion.span key={`${t}${i}`} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1, scale: [1, 1.08, 1] }} transition={{ delay: 0.9 + n * 0.22, scale: { delay: 1.5 + n * 0.22, duration: 0.6, repeat: Infinity, repeatDelay: 1.4 } }}
                    className="inline-flex items-center gap-[0.35em] rounded-full px-[0.9em] py-[0.3em] font-black text-white shadow-lg" style={{ background: n === 1 ? '#81B64C' : 'rgba(11,17,18,.85)', border: '1.5px solid rgba(255,255,255,.6)' }}>
                    <span>{g}</span>{t}
                  </motion.span>
                ))}
              </div>
            )}
            {/* Board block */}
            <div className={`absolute ${clip.isMap || tourTree ? 'inset-x-[7%] top-[17.5%]' : coachClip ? 'inset-x-[4%] top-[24%]' : 'inset-x-[4%] top-[22%]'}`} style={{ opacity: (clip.isMap && frame?.kind === 'mapEnd') || (tourTree && tourK > TOUR.length) ? 0.18 : frame?.kind === 'intro' ? (coachOn ? 0.55 : 0.35) : frame?.kind === 'lessonText' ? 0.4 : 1, transition: 'opacity .4s' }}>
              {!clip.isMap && !tourTree && <div className="mb-1 flex items-center justify-between gap-2"><p className="truncate text-[clamp(11px,1.6cqh,16px)] font-bold text-white/85">{name(top)}</p>{clockChip(top)}</div>}
              <div className={prefs.zoom ? 'overflow-hidden rounded-[10px]' : undefined}
                style={clip.isMap && prefs.tilt ? { transform: 'perspective(120cqh) rotateX(26deg) scale(1.08)', transformOrigin: '50% 60%' } : undefined}>
              <motion.div className="relative" style={zoomOrigin && frame?.kind !== 'split' ? { transformOrigin: zoomOrigin } : undefined}
                animate={zoomOrigin && isKey ? { scale: [1, 1.75, 1.75, 1] } : prefs.effects && isKey ? { scale: [1, 1.045, 1] } : { scale: 1 }}
                transition={zoomOrigin && isKey ? { duration: Math.max(1.2, (frame ? dur(frame) : 2000) / 1000), times: [0, 0.22, 0.8, 1], ease: 'easeInOut' } : { duration: 0.6 }}>
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
                {((frame?.kind === 'lessonBoard' && frame.highlights.length > 0) || noteMarks.length > 0) && (
                  <div key={`marks${i}`} className="pointer-events-none absolute inset-x-0 top-0 aspect-square">
                    {(frame?.kind === 'lessonBoard' ? frame.highlights : noteMarks).map((sq, n) => {
                      const f = sq.charCodeAt(0) - 97, r = Number(sq[1]); if (f < 0 || f > 7 || !(r >= 1 && r <= 8)) return null;
                      const col = flipped ? 7 - f : f, row = flipped ? r - 1 : 8 - r;
                      return <motion.div key={sq} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0.55, 1, 0.55], scale: 1 }} transition={{ opacity: { duration: 1.4, repeat: Infinity, delay: noteMarks.length ? 0.5 + n * 0.25 : 0 }, scale: { duration: 0.3, delay: noteMarks.length ? 0.5 + n * 0.25 : 0 } }}
                        className="absolute rounded-[12%]" style={{ left: `${col * 12.5}%`, top: `${row * 12.5}%`, width: '12.5%', height: '12.5%', background: 'rgba(255,214,10,.42)', boxShadow: 'inset 0 0 0 3px rgba(255,214,10,.95)' }} />;
                    })}
                  </div>
                )}
              </motion.div>
              </div>
              {!clip.isMap && <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#2B2B2B]"><div className="h-full rounded-full bg-[#F2F2F2] transition-all duration-500" style={{ width: `${evPct}%` }} /></div>}
              {!clip.isMap && <div className="mt-1 flex items-center justify-between gap-2"><p className="truncate text-[clamp(11px,1.6cqh,16px)] font-bold text-white/85">{name(top === 'w' ? 'b' : 'w')}</p>{clockChip(top === 'w' ? 'b' : 'w')}</div>}
            </div>
            {/* Move + caption */}
            {(showBottomMove || (caption && !coachClip)) && !(subWords && !coachClip) && !(choices && isKey) && frame?.kind !== 'outro' && frame?.kind !== 'reveal' && (
              <div className="absolute inset-x-[5%] bottom-[9%] z-10">
                {showBottomMove && cur && (
                  <div className="flex items-center gap-2">
                    {label && <span className="shrink-0" style={{ fontSize: 'clamp(11px,1.45cqh,15px)' }}><Medallion glyph={label.glyph} color={label.color} size={2.1} /></span>}
                    <p className="truncate text-[clamp(14px,2.4cqh,24px)] font-black text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,.6)' }}>
                      {moveNo}{figurine(cur.san, cur.color === 'w')}{label && cls !== 'book' && cls !== 'good' ? <span style={{ color: label.color }}> {label.text.toLowerCase()}</span> : null}
                    </p>
                  </div>
                )}
                {caption && !coachClip && <p className={`mt-1 line-clamp-3 text-[clamp(12px,1.9cqh,19px)] font-semibold leading-snug ${frame?.kind === 'better' ? 'text-[#B8E08C]' : 'text-white/90'}`} style={{ textShadow: '0 2px 8px rgba(0,0,0,.6)' }}>{caption}</p>}
              </div>
            )}
            {subWords && !coachClip && (
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
                // One overlay for the whole countdown: it stays put and the number ticks down in place (no pop per second).
                <motion.div key={`cd-${frame.anchor ?? 'key'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                  className="absolute inset-x-0 top-[6%] z-20 flex h-[15%] flex-col items-center justify-center px-[5%]">
                  <div className="flex items-center justify-center gap-[2.2cqh]">
                    <div style={{ fontSize: 'clamp(36px,7.6cqh,82px)' }}><CountdownRing n={frame.n} seconds={dur(frame) / 1000} color={frame.n === 1 ? '#F0605D' : frame.n === 2 ? '#E8B447' : '#81B64C'} /></div>
                    <p className="max-w-[60cqw] rounded-[1em] bg-[#81B64C] px-[1em] py-[0.35em] font-black uppercase leading-tight text-white shadow-xl ring-2 ring-white" style={{ fontSize: 'clamp(14px,2.6cqh,28px)', textShadow: '0 1px 0 #3E6420' }}>{frame.text ?? (clip.isTrap ? 'Spot the winning move' : 'Can you find it?')}</p>
                  </div>
                  {(frame.total ?? 3) > 3 && (
                    <div className="mt-[1.2cqh] h-[0.8cqh] w-[70%] overflow-hidden rounded-full bg-white/20">
                      <motion.div className="h-full rounded-full" style={{ background: frame.n <= 3 ? '#F0605D' : '#81B64C' }}
                        initial={{ width: `${(((frame.total ?? 3) - frame.n) / (frame.total ?? 3)) * 100}%` }} animate={{ width: `${(((frame.total ?? 3) - frame.n + 1) / (frame.total ?? 3)) * 100}%` }} transition={{ duration: dur(frame) / 1000, ease: 'linear' }} />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {/* A / B / C: three moves to pick from during the countdown, the right one lights up on the reveal */}
            {choices && ((frame?.kind === 'countdown' && !frame.anchor) || isKey) && (
              <div className="pointer-events-none absolute inset-x-[5%] bottom-[9.5%] z-20 grid grid-cols-3 gap-[1.2cqh]">
                {choices.options.map((san, k) => {
                  const right = san === choices.correct; const reveal = isKey;
                  return (
                    <motion.div key={san} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: reveal && !right ? 0.45 : 1, scale: reveal && right ? 1.08 : 1 }} transition={{ delay: frame?.kind === 'countdown' ? k * 0.12 : 0, type: 'spring', stiffness: 320, damping: 18 }}
                      className="flex items-center gap-[0.5em] rounded-[0.6em] px-[0.6em] py-[0.45em] font-black text-white shadow-xl"
                      style={{ fontSize: 'clamp(13px,2.4cqh,26px)', background: reveal ? (right ? '#5FA83A' : '#7A2C2A') : 'rgba(10,14,12,.86)', border: `2px solid ${reveal && right ? '#fff' : 'rgba(255,255,255,.45)'}` }}>
                      <span className="grid h-[1.5em] w-[1.5em] shrink-0 place-items-center rounded-full text-[0.8em]" style={{ background: reveal && right ? '#fff' : '#81B64C', color: reveal && right ? '#3E6420' : '#fff' }}>{'ABC'[k]}</span>
                      <span className="truncate">{figurine(san, choices.white)}</span>
                    </motion.div>
                  );
                })}
              </div>
            )}
            {/* Promo cards */}
            <AnimatePresence>
              {frame?.kind === 'rvCard' && (() => {
                const box = 'absolute inset-x-[5%] top-[23%] z-30 rounded-[3cqh] bg-[#0B1112]/93 p-[2.4cqh] text-white shadow-2xl ring-2 ring-white/70';
                if (frame.card === 'hook') return (
                  <motion.div key="rvh" initial={{ opacity: 0, y: -20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                    className="absolute inset-x-[6%] top-[11%] z-30 rounded-[2.4cqh] bg-[#0B1112]/92 px-[2cqh] py-[1.4cqh] text-center text-white shadow-2xl ring-2 ring-white/70">
                    <p className="font-black uppercase tracking-[0.12em] text-[#B8E08C]" style={{ fontSize: 'clamp(10px,1.7cqh,18px)' }}>🧠 ChessScout game review</p>
                    <p className="mt-[0.4cqh] font-black leading-tight" style={{ fontSize: 'clamp(18px,3.6cqh,38px)' }}>{hook}</p>
                  </motion.div>
                );
                if (frame.card === 'grades') {
                  const rows: [string, string[]][] = [['brilliant', ['brilliant']], ['great', ['great']], ['best', ['best', 'excellent']], ['inaccuracy', ['inaccuracy']], ['mistake', ['mistake']], ['blunder', ['blunder', 'missed_win']]];
                  const n = (side: 'w' | 'b', ks: string[]) => clip.plies.filter((x) => x.color === side && ks.includes(x.review?.classification ?? '')).length;
                  return (
                    <motion.div key="rvg" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={box} style={{ fontSize: 'clamp(12px,2.1cqh,22px)' }}>
                      <div className="mb-[1cqh] grid grid-cols-[1fr_auto_1fr] items-center gap-[1cqh] text-center font-black">
                        <span className="truncate">{clip.names.w ?? 'White'}</span><span className="text-white/40">vs</span><span className="truncate">{clip.names.b ?? 'Black'}</span>
                      </div>
                      <div className="space-y-[0.6cqh]">
                        {rows.map(([k, ks], r) => { const L = LABEL[k]; return (
                          <motion.div key={k} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + r * 0.22 }} className="grid grid-cols-[1fr_auto_1fr] items-center gap-[1cqh] rounded-[0.5em] bg-white/[.06] px-[0.6em] py-[0.35em] font-black tabular-nums">
                            <span className="text-center" style={{ color: L.color }}>{n('w', ks)}</span>
                            <span className="inline-flex min-w-[8.5em] items-center justify-center gap-[0.4em]"><span className="grid h-[1.4em] w-[1.4em] place-items-center rounded-full text-[0.75em] text-white" style={{ background: L.color }}>{L.glyph}</span>{L.text}</span>
                            <span className="text-center" style={{ color: L.color }}>{n('b', ks)}</span>
                          </motion.div>
                        ); })}
                      </div>
                    </motion.div>
                  );
                }
                return (
                  <motion.div key="rvc" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className={`${box} text-center`} style={{ fontSize: 'clamp(13px,2.3cqh,24px)' }}>
                    <p className="font-black leading-tight" style={{ fontSize: '1.45em' }}>Every game. Reviewed. Free.</p>
                    <div className="mt-[1.4cqh] space-y-[0.7cqh] text-left">
                      {['Every move graded', 'Your mistakes, explained by your coach', 'The better move, on the board', 'Accuracy for both players'].map((t, n) => (
                        <motion.p key={t} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + n * 0.3 }} className="flex items-center gap-[0.6em] rounded-[0.5em] bg-white/[.07] px-[0.6em] py-[0.35em] font-black">
                          <span className="grid h-[1.3em] w-[1.3em] shrink-0 place-items-center rounded-full bg-[#81B64C] text-[0.75em]">✓</span>{t}
                        </motion.p>
                      ))}
                    </div>
                    <motion.p animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1, repeat: Infinity }} className="mx-auto mt-[1.4cqh] w-fit rounded-full bg-white px-[1em] py-[0.35em] font-black text-[#3E6420]">chessscout.net</motion.p>
                  </motion.div>
                );
              })()}
              {frame?.kind === 'promoCard' && clip.promo && (() => {
                const pr = clip.promo;
                const box = 'absolute inset-x-[5%] top-[23%] z-30 rounded-[3cqh] bg-[#0B1112]/93 p-[2.4cqh] text-white shadow-2xl ring-2 ring-white/70';
                if (frame.card === 'tour') {
                  if (tourTree) return null;
                  const k = frame.upTo ?? 0;
                  if (k === 0) return (
                    <motion.div key="t0" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }} transition={{ type: 'spring', stiffness: 320, damping: 16 }} className={`${box} text-center`} style={{ fontSize: 'clamp(14px,2.6cqh,28px)' }}>
                      <p className="font-black uppercase tracking-[0.12em] text-[#B8E08C]" style={{ fontSize: '0.7em' }}>♞ ChessScout</p>
                      <p className="mt-[0.6cqh] font-black leading-tight" style={{ fontSize: '1.5em' }}>{pr.hook}</p>
                      <div className="mt-[1.4cqh] flex flex-wrap justify-center gap-[0.6cqh]" style={{ fontSize: '1.3em' }}>
                        {TOUR.map((t, n) => <motion.span key={t.title} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1 + n * 0.06, type: 'spring', stiffness: 500, damping: 14 }}>{t.emo}</motion.span>)}
                      </div>
                    </motion.div>
                  );
                  if (k > TOUR.length) return (
                    <motion.div key="tend" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className={`${box} text-center`} style={{ fontSize: 'clamp(13px,2.3cqh,24px)' }}>
                      <div className="grid grid-cols-4 gap-[0.8cqh]">
                        {TOUR.map((t, n) => (
                          <motion.div key={t.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.05 }} className="rounded-[0.5em] bg-white/[.07] py-[0.4em]">
                            <span className="block" style={{ fontSize: '1.3em' }}>{t.emo}</span><span className="block px-[0.2em] text-[0.55em] font-black leading-tight text-white/80">{t.title}</span>
                          </motion.div>
                        ))}
                      </div>
                      <p className="mt-[1.4cqh] font-black leading-tight" style={{ fontSize: '1.3em' }}>{pr.closer}</p>
                      <motion.p animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1, repeat: Infinity }} className="mx-auto mt-[1cqh] w-fit rounded-full bg-white px-[1em] py-[0.35em] font-black text-[#3E6420]">chessscout.net</motion.p>
                    </motion.div>
                  );
                  const t = TOUR[k - 1];
                  return (
                    <motion.div key={`t${k}`} initial={{ opacity: 0, x: 60, rotate: 3 }} animate={{ opacity: 1, x: 0, rotate: 0 }} exit={{ opacity: 0, x: -60 }} transition={{ type: 'spring', stiffness: 340, damping: 22 }} className={`${box} text-center`} style={{ fontSize: 'clamp(14px,2.5cqh,26px)' }}>
                      <motion.p initial={{ scale: 0.3, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 12 }} style={{ fontSize: '2.6em', lineHeight: 1.1 }}>{t.emo}</motion.p>
                      <p className="mt-[0.6cqh] font-black leading-tight" style={{ fontSize: '1.5em' }}>{t.title}</p>
                      <p className="mt-[0.6cqh] font-bold text-white/80">{t.line}</p>
                      <div className="mt-[1.4cqh] flex justify-center gap-[0.5cqh]">
                        {TOUR.map((_, n) => <span key={n} className="h-[0.9cqh] rounded-full" style={{ width: n === k - 1 ? '3cqh' : '0.9cqh', background: n < k ? '#81B64C' : 'rgba(255,255,255,.25)' }} />)}
                      </div>
                    </motion.div>
                  );
                }
                if (frame.card === 'vs') return (
                  <motion.div key="vs" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={box} style={{ fontSize: 'clamp(11px,1.9cqh,20px)' }}>
                    <div className="mb-[1.2cqh] grid grid-cols-[1.25fr_1fr_1fr] items-end gap-[1cqh] text-center font-black">
                      <span />
                      <span className="rounded-[0.5em] bg-[#81B64C] px-[0.3em] py-[0.25em]">ChessScout</span>
                      <span className="rounded-[0.5em] bg-white/15 px-[0.3em] py-[0.25em] text-white/80">{pr.rival}</span>
                    </div>
                    <div className="space-y-[0.9cqh]">
                      {pr.rows.slice(0, frame.upTo ?? 1).map((r, k) => (
                        <motion.div key={k} initial={k === (frame.upTo ?? 1) - 1 ? { opacity: 0, x: -18, scale: 0.96 } : false} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                          className="grid grid-cols-[1.25fr_1fr_1fr] items-center gap-[1cqh] rounded-[0.5em] bg-white/[.06] px-[0.5em] py-[0.45em]">
                          <span className="font-black leading-tight">{r.label}</span>
                          <span className="text-center font-black leading-tight text-[#B8E08C]">{r.us}</span>
                          <span className="text-center font-bold leading-tight text-white/60">{r.them}</span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                );
                if (frame.card === 'switch') return (
                  <motion.div key="sw" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className={`${box} text-center`} style={{ fontSize: 'clamp(13px,2.4cqh,26px)' }}>
                    <p className="font-black leading-tight" style={{ fontSize: '1.35em' }}>{pr.closer}</p>
                    <p className="mt-[1.2cqh] font-bold text-white/75">Import your {pr.rival} games in one tap. Your history comes with you.</p>
                  </motion.div>
                );
                if (frame.card === 'match') return (
                  <motion.div key="match" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }} transition={{ type: 'spring', stiffness: 320, damping: 18 }} className={`${box} text-center`} style={{ fontSize: 'clamp(13px,2.3cqh,24px)' }}>
                    <motion.p initial={{ opacity: 1 }} animate={{ opacity: 0, height: 0 }} transition={{ delay: 0.75, duration: 0.2 }} className="font-black text-white/80">
                      <motion.span className="mr-[0.4em] inline-block" animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}>⏳</motion.span>Finding a game…
                    </motion.p>
                    <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8, type: 'spring', stiffness: 420, damping: 14 }}>
                      <p className="font-black text-[#B8E08C]" style={{ fontSize: '1.7em' }}>⚡ Game found!</p>
                      <div className="mt-[1.2cqh] flex items-center justify-center gap-[1.2cqh] font-black">
                        <span className="rounded-[0.5em] bg-white px-[0.7em] py-[0.3em] text-[#141414]">You</span>
                        <span className="text-white/60">vs</span>
                        <span className="rounded-[0.5em] bg-[#2B2B2B] px-[0.7em] py-[0.3em] ring-1 ring-white/30">Opponent</span>
                      </div>
                      <p className="mt-[1cqh] font-bold text-white/70">5 min · Blitz</p>
                    </motion.div>
                  </motion.div>
                );
                if (frame.card === 'react') return (
                  <motion.div key="react" initial={{ opacity: 0, y: -10, scale: 0.5 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: 'spring', stiffness: 500, damping: 16 }}
                    className="absolute left-1/2 top-[19%] z-30 -translate-x-1/2 rounded-[2cqh] bg-[#F5F7F6] px-[2cqh] py-[1cqh] font-black text-[#0B1213] shadow-2xl" style={{ fontSize: 'clamp(16px,3.2cqh,34px)' }}>
                    Nice move! 🔥
                  </motion.div>
                );
                if (frame.card === 'review') return (
                  <motion.div key="review" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={box} style={{ fontSize: 'clamp(13px,2.3cqh,24px)' }}>
                    <p className="text-center font-black" style={{ fontSize: '1.4em' }}>🧠 Reviewed instantly</p>
                    <div className="mt-[1.4cqh] space-y-[0.8cqh]">
                      {['Accuracy for both players', 'Every mistake marked', 'The better move, on the board', 'Free, every game'].map((t, n) => (
                        <motion.p key={t} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + n * 0.35, type: 'spring', stiffness: 380, damping: 20 }} className="flex items-center gap-[0.6em] rounded-[0.5em] bg-white/[.07] px-[0.6em] py-[0.4em] font-black">
                          <span className="grid h-[1.3em] w-[1.3em] shrink-0 place-items-center rounded-full bg-[#81B64C] text-[0.75em]">✓</span>{t}
                        </motion.p>
                      ))}
                    </div>
                  </motion.div>
                );
                if (frame.card === 'live') return (
                  <motion.div key="live" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`${box} text-center`} style={{ fontSize: 'clamp(13px,2.3cqh,24px)' }}>
                    <p className="font-black" style={{ fontSize: '1.4em' }}>⚡ Play online</p>
                    <div className="mt-[1.4cqh] grid grid-cols-2 gap-[1cqh]">
                      {[['5 min', 'Blitz'], ['5 | 3', 'Blitz'], ['10 min', 'Rapid'], ['15 min', 'Rapid'], ['1 day', 'a move'], ['3 days', 'a move']].map(([t, k], n) => (
                        <motion.div key={t} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 + n * 0.1, type: 'spring', stiffness: 380, damping: 16 }} className="rounded-[0.6em] bg-[#81B64C] py-[0.5em] font-black">
                          {t}<span className="block text-[0.7em] font-bold text-white/80">{k}</span>
                        </motion.div>
                      ))}
                    </div>
                    {pr.template === 'live' && (<>
                      <p className="mt-[1.4cqh] font-black leading-tight" style={{ fontSize: '1.15em' }}>{pr.closer}</p>
                      <motion.p animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1, repeat: Infinity }} className="mx-auto mt-[1cqh] w-fit rounded-full bg-white px-[1em] py-[0.35em] font-black text-[#3E6420]">chessscout.net/live</motion.p>
                    </>)}
                  </motion.div>
                );
                if (frame.card === 'daily') return (
                  <motion.div key="daily" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`${box} text-center`} style={{ fontSize: 'clamp(13px,2.3cqh,24px)' }}>
                    <p className="font-black" style={{ fontSize: '1.4em' }}>📅 Daily games</p>
                    <p className="mt-[0.6cqh] font-bold text-white/75">One move a day, with a heads-up on your turn</p>
                    <div className="mt-[1.4cqh] flex justify-center gap-[1cqh]">
                      {['1 day', '3 days', '7 days'].map((t, n) => (
                        <motion.span key={t} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 + n * 0.12, type: 'spring', stiffness: 380, damping: 16 }} className="rounded-[0.6em] bg-[#4A8BD6] px-[0.8em] py-[0.45em] font-black">{t}</motion.span>
                      ))}
                    </div>
                    <p className="mt-[0.8cqh] text-[0.8em] font-bold text-white/55">per move</p>
                  </motion.div>
                );
                return (
                  <motion.div key="link" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className={`${box} text-center`} style={{ fontSize: 'clamp(13px,2.3cqh,24px)' }}>
                    <p className="font-black" style={{ fontSize: '1.4em' }}>🤝 Challenge a friend</p>
                    <div className="mx-auto mt-[1.4cqh] rounded-[0.8em] bg-white px-[0.8em] py-[0.6em] text-left text-[#141414] shadow-xl">
                      <p className="text-[0.75em] font-bold text-[#6B6B6B]">You've been challenged ♟️</p>
                      <p className="font-black">10 min · Rapid</p>
                      <p className="mt-[0.4em] truncate rounded-[0.4em] bg-[#F1F4EF] px-[0.5em] py-[0.25em] text-[0.8em] font-bold text-[#3E6420]">chessscout.net/challenge/…</p>
                      <motion.p animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1, repeat: Infinity }} className="mt-[0.5em] rounded-[0.5em] bg-[#81B64C] py-[0.35em] text-center font-black text-white">Accept</motion.p>
                    </div>
                    <p className="mt-[1.2cqh] font-bold text-white/80">{pr.closer}</p>
                  </motion.div>
                );
              })()}
            </AnimatePresence>
            {/* Opponent Scout report cards */}
            <AnimatePresence>
              {frame?.kind === 'scoutCard' && clip.scout && (() => {
                const d = clip.scout; const name = d.profile?.name || d.username;
                const total = Math.max(1, d.wins + d.losses + d.draws);
                const SEVC: Record<string, string> = { Critical: '#F0605D', High: '#F0605D', Medium: '#E8B447', Low: '#81B64C' };
                return (
                  <motion.div key={`${frame.card}${frame.idx ?? ''}`} initial={{ opacity: 0, y: 30, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    className={`absolute inset-x-[5%] ${coachClip ? 'top-[24%]' : 'top-[23%]'} z-30 rounded-[3cqh] bg-[#0B1112]/93 p-[2.4cqh] text-white shadow-2xl ring-2 ring-white/70`} style={{ fontSize: 'clamp(11px,1.9cqh,20px)' }}>
                    <p className="mb-[1.2cqh] text-center font-black uppercase tracking-wide text-[#B8E08C]" style={{ fontSize: '0.95em' }}>🔍 Opponent scout</p>
                    {frame.card === 'profile' && (
                      <div className="text-center">
                        {d.profile?.avatar && <img src={d.profile.avatar} alt="" className="mx-auto mb-[1cqh] rounded-full ring-2 ring-white" style={{ width: '9cqh', height: '9cqh', objectFit: 'cover' }} />}
                        <p className="font-black" style={{ fontSize: '1.8em' }}>{d.profile?.title && <span className="mr-[0.3em] rounded bg-[#CA3431] px-[0.25em] text-[0.7em]">{d.profile.title}</span>}{name}</p>
                        {d.profile?.ratings && (
                          <div className="mt-[1cqh] flex justify-center gap-[1.5cqh] tabular-nums">
                            {(['bullet', 'blitz', 'rapid'] as const).filter((k) => d.profile?.ratings?.[k]).map((k) => (
                              <div key={k} className="rounded-[0.5em] bg-white/10 px-[0.6em] py-[0.2em]"><p className="text-[0.7em] uppercase text-white/60">{k}</p><p className="font-black" style={{ fontSize: '1.3em' }}>{d.profile!.ratings![k]}</p></div>
                            ))}
                          </div>
                        )}
                        <p className="mt-[1.4cqh] font-bold text-white/70">Last {d.gamesAnalyzed} games</p>
                        <div className="mx-auto mt-[0.6cqh] flex h-[2.4cqh] w-full overflow-hidden rounded-full font-black" style={{ fontSize: '0.8em' }}>
                          {[['W', d.wins, '#5FA83A'], ['D', d.draws, '#7A8580'], ['L', d.losses, '#CA3431']].map(([t, n, c]) => (n as number) > 0 && (
                            <motion.div key={t as string} initial={{ width: 0 }} animate={{ width: `${((n as number) / total) * 100}%` }} transition={{ duration: 0.8, delay: 0.3 }} className="grid place-items-center overflow-hidden" style={{ background: c as string }}>{t}{n}</motion.div>
                          ))}
                        </div>
                      </div>
                    )}
                    {frame.card === 'colors' && d.stats && (() => {
                      const st = d.stats;
                      const row = (label: string, piece: string, r: Rec) => {
                        const t = Math.max(1, r.games);
                        return (
                          <div className="rounded-[0.6em] bg-white/[.07] p-[0.6em]">
                            <div className="flex items-baseline justify-between font-black"><span>{piece} As {label}</span><span className="tabular-nums" style={{ fontSize: '1.3em' }}>{r.games ? Math.round((r.wins / r.games) * 100) : 0}%<span className="ml-[0.2em] text-[0.55em] text-white/60">wins</span></span></div>
                            <div className="mt-[0.4em] flex h-[1.6cqh] overflow-hidden rounded-full">
                              {([[r.wins, '#5FA83A'], [r.draws, '#7A8580'], [r.losses, '#CA3431']] as const).map(([n, c], k) => n > 0 && <motion.div key={k} initial={{ width: 0 }} animate={{ width: `${(n / t) * 100}%` }} transition={{ duration: 0.7, delay: 0.3 }} style={{ background: c }} />)}
                            </div>
                            <p className="mt-[0.2em] text-right text-[0.75em] font-bold tabular-nums text-white/60">{r.wins}W · {r.draws}D · {r.losses}L</p>
                          </div>
                        );
                      };
                      return (
                        <div className="space-y-[1cqh]">
                          <p className="text-center font-black" style={{ fontSize: '1.25em' }}>White or Black?</p>
                          {row('White', '♔', st.asWhite)}
                          {row('Black', '♚', st.asBlack)}
                          <div className="grid grid-cols-3 gap-[0.5em] text-center">
                            {[['Opens with', st.firstMove[0] ? `1.${st.firstMove[0].san}` : '—', st.firstMove[0] ? `${st.firstMove[0].pct}%` : ''], ['vs 1.e4', st.vsE4 ? `1…${st.vsE4.san}` : '—', st.vsE4 ? `${st.vsE4.pct}%` : ''], ['vs 1.d4', st.vsD4 ? `1…${st.vsD4.san}` : '—', st.vsD4 ? `${st.vsD4.pct}%` : '']].map(([k, v, pc]) => (
                              <motion.div key={k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="rounded-[0.6em] bg-white/[.07] px-[0.3em] py-[0.45em]">
                                <p className="text-[0.68em] font-bold uppercase text-white/55">{k}</p>
                                <p className="font-black" style={{ fontSize: '1.15em' }}>{v}</p>
                                <p className="text-[0.7em] font-bold text-[#B8E08C]">{pc}</p>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {frame.card === 'habits' && d.stats && (() => {
                      const st = d.stats;
                      const sum = (e: EndBy) => e.checkmate + e.resignation + e.time + e.other;
                      const lt = sum(st.lossesBy), wt = sum(st.winsBy);
                      const pct = (n: number, t: number) => (t ? Math.round((n / t) * 100) : 0);
                      const tiles: [string, string][] = [
                        ['Plays', st.timeControl ?? '—'],
                        ['Game length', st.avgMoves ? `${st.avgMoves} moves` : '—'],
                        ['Rating', st.rating ? `${st.rating.end}${st.rating.end !== st.rating.start ? ` (${st.rating.end > st.rating.start ? '+' : ''}${st.rating.end - st.rating.start})` : ''}` : '—'],
                        ['Peak', st.rating ? String(st.rating.peak) : '—'],
                      ];
                      const bars: [string, number, string][] = [
                        ['Loses on time', pct(st.lossesBy.time, lt), '#E8B447'],
                        ['Resigns', pct(st.lossesBy.resignation, lt), '#CA3431'],
                        ['Gets mated', pct(st.lossesBy.checkmate, lt), '#F0605D'],
                        ['Wins by mate', pct(st.winsBy.checkmate, wt), '#5FA83A'],
                      ];
                      return (
                        <div className="space-y-[1cqh]">
                          <p className="text-center font-black" style={{ fontSize: '1.25em' }}>{name}'s habits</p>
                          <div className="grid grid-cols-2 gap-[0.5em]">
                            {tiles.map(([k, v], i) => (
                              <motion.div key={k} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.1 }} className="rounded-[0.6em] bg-white/[.07] px-[0.5em] py-[0.45em] text-center">
                                <p className="text-[0.68em] font-bold uppercase text-white/55">{k}</p>
                                <p className="font-black tabular-nums" style={{ fontSize: '1.15em' }}>{v}</p>
                              </motion.div>
                            ))}
                          </div>
                          {bars.map(([k, v, c], i) => (
                            <div key={k}>
                              <div className="flex justify-between text-[0.85em] font-bold"><span>{k}</span><span className="tabular-nums">{v}%</span></div>
                              <div className="mt-[0.2em] h-[1.2cqh] overflow-hidden rounded-full bg-white/10"><motion.div initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.7, delay: 0.4 + i * 0.12 }} className="h-full rounded-full" style={{ background: c }} /></div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {frame.card === 'openings' && (
                      <div className="space-y-[1cqh]">
                        <p className="text-center font-black" style={{ fontSize: '1.25em' }}>{prefs.tone !== 'teacher' ? `${name}'s go-to openings` : `What ${name} plays`}</p>
                        {(d.topOpenings ?? []).slice(0, 4).map((o, k) => (
                          <motion.div key={o.opening} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + k * 0.15 }}>
                            <div className="flex items-baseline justify-between gap-2 font-bold"><span className="line-clamp-2">{k + 1}. {o.opening}</span><span className="shrink-0 tabular-nums text-white/60">{o.games} games</span></div>
                            <div className="mt-[0.3em] h-[1.4cqh] overflow-hidden rounded-full bg-white/10"><motion.div initial={{ width: 0 }} animate={{ width: `${o.winRate}%` }} transition={{ duration: 0.7, delay: 0.4 + k * 0.15 }} className="h-full rounded-full" style={{ background: o.winRate >= 55 ? '#5FA83A' : o.winRate >= 45 ? '#E8B447' : '#CA3431' }} /></div>
                            <p className="mt-[0.15em] text-right text-[0.8em] font-black tabular-nums text-white/75">wins {o.winRate}%</p>
                          </motion.div>
                        ))}
                      </div>
                    )}
                    {frame.card === 'weak' && (() => {
                      const all = d.weaknesses ?? []; const i = frame.idx ?? 0; const w = all[i]; if (!w) return null;
                      return (
                        <div>
                          <p className="text-center font-black" style={{ fontSize: '1.25em' }}>{prefs.tone !== 'teacher' ? `How to beat ${name} 🎯` : `How to beat ${name}`}</p>
                          <p className="mt-[0.2em] text-center text-[0.8em] font-bold text-white/55">{i + 1} of {Math.min(3, all.length)}</p>
                          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-[1cqh] rounded-[0.6em] bg-white/[.07] p-[0.8em]">
                            <p className="flex flex-wrap items-center gap-[0.4em] font-black" style={{ fontSize: '1.2em' }}><span className="rounded px-[0.35em] text-[0.6em] uppercase" style={{ background: SEVC[w.severity] ?? '#7A8580' }}>{w.severity}</span>{w.category}</p>
                            <p className="mt-[0.5em] leading-snug text-white/90">{w.description}</p>
                          </motion.div>
                        </div>
                      );
                    })()}
                  </motion.div>
                );
              })()}
            </AnimatePresence>
            {/* Opening clips: the line map. All the variations as one strip; the one playing
                glows in its colour, the ones done get a tick, and its moves tick along under it. */}
            {clip.isOpening && clip.openingData && clip.ranges && !(coachClip && clip.lineMode) && (() => {
              const o = clip.openingData; const R = clip.ranges;
              const COL = ['#81B64C', '#4A8BD6', '#E8B447', '#CA3431'];
              const active = openLine;
              if (active == null) return null;
              const [a, b] = R.lines[active];
              const shown = frame?.kind === 'move' ? frame.ply - a + 1 : frame?.kind === 'rewind' ? 0 : 0;
              const l = o.lines[active];
              const mover = clip.plies[a - 1]?.color === 'w';
              return (
                <div className="pointer-events-none absolute inset-x-[4%] top-[6.5%] z-30" style={{ fontSize: 'clamp(10px,1.7cqh,18px)' }}>
                  <div className="flex gap-[0.4em]">
                    {o.lines.map((ln, k) => {
                      const on = k === active, done = k < active;
                      return (
                        <motion.div key={k} layout animate={{ flexGrow: on ? 2.4 : 1, opacity: on ? 1 : done ? 0.75 : 0.45 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                          className="relative min-w-0 basis-0 overflow-hidden rounded-[0.6em] px-[0.5em] py-[0.35em]"
                          style={{ background: on ? COL[k % 4] : 'rgba(11,17,18,.78)', color: on ? '#0B1112' : '#fff', border: `2px solid ${COL[k % 4]}`, boxShadow: on ? `0 0 1.2em ${COL[k % 4]}` : undefined }}>
                          <p className="truncate font-black leading-tight" style={{ fontSize: on ? '1em' : '0.78em' }}>{done ? '✓ ' : ''}{on ? ln.name : (ln.short ?? ln.name)}</p>
                          {on && <p className="truncate text-[0.75em] font-bold opacity-80">{[ln.pct ? `${ln.pct}% of games` : null, ln.eval != null ? `${evalText(ln.eval)} at the end` : null].filter(Boolean).join(' · ') || `Line ${k + 1}`}</p>}
                        </motion.div>
                      );
                    })}
                  </div>
                  {/* The line's moves, filling in as they're played */}
                  <div className="mt-[0.45em] flex flex-wrap items-center gap-[0.3em]">
                    {frame?.kind === 'rewind' && <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-full bg-white/90 px-[0.6em] py-[0.1em] font-black text-[#0B1112]">⏪ Rewind</motion.span>}
                    {l && frame?.kind !== 'rewind' && l.moves.map((san, k) => (
                      <motion.span key={`${active}-${k}`} initial={false} animate={{ opacity: k < shown ? 1 : 0.28, scale: k === shown - 1 ? 1.12 : 1 }}
                        className="rounded-[0.4em] px-[0.4em] py-[0.05em] font-black tabular-nums" style={{ background: k < shown ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.12)', color: k < shown ? '#0B1112' : '#fff' }}>
                        {figurine(san, (k % 2 === 0) === mover)}
                      </motion.span>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* VHS-style tint while the board rewinds */}
            {frame?.kind === 'rewind' && <div className="pointer-events-none absolute inset-0 z-[25]" style={{ background: 'linear-gradient(180deg, rgba(74,139,214,.10), rgba(0,0,0,.18))', mixBlendMode: 'screen' }} />}
            {/* Opening clips: ideas, real-game results, replies, variation titles, trap */}
            <AnimatePresence>
              {frame?.kind === 'openCard' && clip.openingData && (() => {
                const o = clip.openingData;
                const COL = ['#81B64C', '#4A8BD6', '#E8B447', '#CA3431'];
                const mover = frame.fen.split(' ')[1] === 'w' ? 'White' : 'Black';
                const evChip = (e: number | null) => e == null ? null : (
                  <span className="rounded-[0.35em] px-[0.4em] py-[0.05em] text-[0.8em] font-black tabular-nums" style={{ background: Math.abs(e) < 0.4 ? 'rgba(255,255,255,.14)' : e > 0 ? '#F2F2F2' : '#1C1C1C', color: Math.abs(e) < 0.4 ? '#fff' : e > 0 ? '#141414' : '#fff', boxShadow: e < -0.4 ? 'inset 0 0 0 1px rgba(255,255,255,.35)' : undefined }}>{evalText(e)}</span>
                );
                // Variations don't get a pop-up: they light up on the line map instead.
                if (frame.card === 'line') return null;
                return (
                  <motion.div key={frame.card} initial={{ opacity: 0, y: 30, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    className={`absolute inset-x-[5%] ${frame.card === 'next' ? 'bottom-[15%]' : coachClip ? 'top-[24%]' : 'top-[22%]'} z-30 rounded-[3cqh] bg-[#0B1112]/93 p-[2.4cqh] text-white shadow-2xl ring-2 ring-white/70`} style={{ fontSize: 'clamp(11px,1.9cqh,20px)' }}>
                    <p className="mb-[1.2cqh] text-center font-black uppercase tracking-wide text-[#B8E08C]" style={{ fontSize: '0.95em' }}>♟️ {o.name}</p>
                    {frame.card === 'ideas' && (
                      <div className="space-y-[1cqh]">
                        <p className="text-center font-black" style={{ fontSize: '1.3em' }}>{prefs.tone !== 'teacher' ? 'Why it works 💡' : 'The ideas'}</p>
                        {(prefs.tone !== 'teacher' ? o.ideas.slice(0, prefs.openCut === 'quick' ? 1 : 2) : o.ideas).map((t, k) => (
                          <motion.div key={k} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + k * 0.45 }} className="flex items-start gap-[0.6em] rounded-[0.6em] bg-white/[.07] p-[0.6em]">
                            <span className="grid h-[1.6em] w-[1.6em] shrink-0 place-items-center rounded-full font-black text-[#0B1112]" style={{ background: COL[k % 4] }}>{k + 1}</span>
                            <span className="font-bold leading-snug">{t}</span>
                          </motion.div>
                        ))}
                      </div>
                    )}
                    {frame.card === 'stats' && o.results && (
                      <div className="text-center">
                        <p className="font-black" style={{ fontSize: '1.3em' }}>{prefs.tone !== 'teacher' ? 'Who actually wins? 👀' : 'Who wins?'}</p>
                        <p className="mt-[0.3em] font-bold text-white/65">{o.games.toLocaleString()} real games {o.source === 'lichess' ? 'on Lichess (players rated 1600+)' : 'by ChessScout players'}</p>
                        <div className="mt-[1.2cqh] flex h-[4cqh] overflow-hidden rounded-[0.6em] font-black">
                          {([['White', o.results.white, '#F2F2F2', '#141414'], ['Draw', o.results.draw, '#7A8580', '#fff'], ['Black', o.results.black, '#1C1C1C', '#fff']] as const).map(([t, n, bg, fg], k) => n > 0 && (
                            <motion.div key={t} initial={{ width: 0 }} animate={{ width: `${n}%` }} transition={{ duration: 0.9, delay: 0.3 + k * 0.1 }} className="grid place-items-center overflow-hidden whitespace-nowrap" style={{ background: bg, color: fg, fontSize: '0.85em' }}>{n >= 12 ? `${t} ${n}%` : `${n}%`}</motion.div>
                          ))}
                        </div>
                      </div>
                    )}
                    {frame.card === 'options' && (
                      <div className="space-y-[0.9cqh]">
                        <p className="text-center font-black" style={{ fontSize: '1.25em' }}>{prefs.tone !== 'teacher' ? `What would you play? 🤔` : `${mover}'s options`}</p>
                        {prefs.tone === 'teacher' && <p className="-mt-[0.6cqh] text-center text-[0.72em] font-bold text-white/55">Engine eval after the move (+ = better for White) · how often it's played · how it scores for {mover}</p>}
                        {o.options.map((x, k) => (
                          <motion.div key={x.san} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + k * 0.3 }} className="rounded-[0.6em] bg-white/[.07] p-[0.55em]" style={{ borderLeft: `0.35em solid ${x.lines?.length ? COL[x.lines[0] % 4] : '#7A8580'}` }}>
                            <div className="flex items-center justify-between gap-[0.5em]">
                              <span className="flex min-w-0 items-center gap-[0.35em] font-black" style={{ fontSize: '1.15em' }}>
                                {figurine(x.san, mover === 'White')}
                                {(x.lines ?? []).map((n) => <span key={n} className="rounded-[0.3em] px-[0.35em] text-[0.6em] font-black text-[#0B1112]" style={{ background: COL[n % 4] }}>Line {n + 1}</span>)}
                              </span>
                              {evChip(x.eval)}
                            </div>
                            {x.pct != null && x.games > 0 && (
                              <div className="mt-[0.35em] flex items-center gap-[0.5em]">
                                <div className="h-[1.1cqh] flex-1 overflow-hidden rounded-full bg-white/10"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(3, x.pct)}%` }} transition={{ duration: 0.7, delay: 0.4 + k * 0.3 }} className="h-full rounded-full" style={{ background: x.lines?.length ? COL[x.lines[0] % 4] : '#7A8580' }} /></div>
                                <span className="shrink-0 text-[0.75em] font-bold tabular-nums text-white/70">{x.pct}% played{x.scorePct != null ? ` · scores ${x.scorePct}%` : ''}</span>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}
                    {frame.card === 'why' && (o.lines[0]?.why?.length ?? 0) > 0 && (
                      <div className="space-y-[1cqh]">
                        <p className="text-center font-black" style={{ fontSize: '1.3em' }}>{prefs.tone !== 'teacher' ? 'Why it works 💡' : 'Why it works'}</p>
                        <p className="-mt-[0.6cqh] text-center text-[0.8em] font-bold text-white/55">{o.lines[0].name}</p>
                        {(o.lines[0].why ?? []).map((t, k) => (
                          <motion.div key={k} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + k * 0.6 }} className="flex items-start gap-[0.6em] rounded-[0.6em] bg-white/[.07] p-[0.6em]">
                            <span className="grid h-[1.6em] w-[1.6em] shrink-0 place-items-center rounded-full font-black text-[#0B1112]" style={{ background: COL[k % 4] }}>{k + 1}</span>
                            <span className="font-bold leading-snug">{t}</span>
                          </motion.div>
                        ))}
                      </div>
                    )}
                    {frame.card === 'lineStats' && o.lines[0] && (() => {
                      const l = o.lines[0];
                      const tiles: [string, string, string?][] = [
                        ...(l.pct != null && (l.games ?? 0) > 0 ? [[`${l.pct}%`, `of ${o.name} games go into this line`] as [string, string]] : []),
                        ...(l.whiteScore != null ? [[`${l.whiteScore}%`, `White's score in those ${l.games} games`] as [string, string]] : []),
                        ...(l.eval != null ? [[evalText(l.eval), `Stockfish: ${evalWords(l.eval)}`] as [string, string]] : []),
                      ];
                      return (
                        <div className="text-center">
                          <p className="font-black" style={{ fontSize: '1.3em' }}>{prefs.tone !== 'teacher' ? 'The numbers 📊' : 'In real games'}</p>
                          <div className="mt-[1.2cqh] grid gap-[1cqh]">
                            {tiles.map(([big, small], k) => (
                              <motion.div key={k} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + k * 0.35 }} className="rounded-[0.6em] bg-white/[.07] p-[0.6em]">
                                <p className="font-black tabular-nums" style={{ fontSize: '1.9em', color: COL[k % 4] }}>{big}</p>
                                <p className="font-bold text-white/70">{small}</p>
                              </motion.div>
                            ))}
                          </div>
                          {l.pct != null && (l.games ?? 0) > 0 && <p className="mt-[0.8cqh] text-[0.75em] font-bold text-white/45">{o.source === 'lichess' ? 'From games on Lichess (players rated 1600+)' : 'From games played on ChessScout'}</p>}
                        </div>
                      );
                    })()}
                    {frame.card === 'next' && o.lines[0]?.next && (() => { const nx = o.lines[0].next!; return (
                      <div className="text-center">
                        <p className="font-black" style={{ fontSize: '1.2em' }}>{prefs.tone !== 'teacher' ? "Stockfish's pick 🤖" : "Stockfish's best move"}</p>
                        <motion.p initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.2 }} className="mt-[0.4em] font-black text-[#B8E08C]" style={{ fontSize: '2.4em' }}>
                          {figurine(nx.san, frame.fen.split(' ')[1] === 'w')}
                        </motion.p>
                        {nx.eval != null && <p className="mt-[0.2em] font-bold text-white/70">{evalText(nx.eval)} · {evalWords(nx.eval)}</p>}
                      </div>
                    ); })()}
                    {frame.card === 'trap' && o.trap && (
                      <div className="text-center">
                        <motion.p initial={{ scale: 0.6 }} animate={{ scale: [0.6, 1.15, 1] }} transition={{ duration: 0.5 }} className="font-black text-[#F0605D]" style={{ fontSize: '1.6em' }}>🪤 Trap alert!</motion.p>
                        <p className="mt-[0.3em] font-black" style={{ fontSize: '1.25em' }}>{o.trap.name}</p>
                        {o.trap.summary && <p className="mt-[0.4em] line-clamp-3 text-[0.9em] text-white/75">{o.trap.summary}</p>}
                      </div>
                    )}
                  </motion.div>
                );
              })()}
            </AnimatePresence>
            {/* Kids / beginner lessons: the coach explains in a speech bubble */}
            <AnimatePresence>
              {(frame?.kind === 'lessonText' || (frame?.kind === 'lessonBoard' && !frame.celebrate)) && (
                <motion.div key={`ls${i}`} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  className={`pointer-events-none absolute inset-x-[4%] z-30 flex items-end gap-[1.2cqh] ${frame.kind === 'lessonText' ? 'top-[34%]' : 'bottom-[7.5%]'}`}>
                  <motion.div animate={{ y: [0, -6, 0], rotate: [0, -4, 0] }} transition={{ duration: 1.6, repeat: Infinity }} className="shrink-0" style={{ fontSize: frame.kind === 'lessonText' ? 'clamp(26px,5.6cqh,60px)' : 'clamp(18px,3.6cqh,40px)' }}>
                    <Medallion glyph="♞" color="#81B64C" size={2.2} />
                  </motion.div>
                  <div className="relative flex-1 rounded-[2.2cqh] bg-white px-[2cqh] py-[1.4cqh] font-black leading-snug text-[#1A1A1A] shadow-2xl" style={{ fontSize: frame.kind === 'lessonText' ? 'clamp(15px,3cqh,32px)' : 'clamp(13px,2.3cqh,24px)' }}>
                    <span className="absolute -left-[1.2cqh] bottom-[2cqh] h-[2.4cqh] w-[2.4cqh] rotate-45 bg-white" />
                    <span className="relative">{frame.text}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {frame?.kind === 'lessonBoard' && frame.celebrate && (
              <motion.div key={`ok${i}`} initial={{ scale: 0, rotate: -8 }} animate={{ scale: 1, rotate: -3 }} transition={{ type: 'spring', stiffness: 380, damping: 12 }}
                className="pointer-events-none absolute left-1/2 top-[11%] z-30 -translate-x-1/2 whitespace-nowrap" style={{ fontSize: 'clamp(20px,4cqh,42px)' }}>
                <StudioBadge glyph="✓" text="Great job!" color="#5FA83A" rays />
                {frame.last && <p className="mx-auto mt-[0.4em] w-fit rounded-full bg-black/75 px-[0.7em] py-[0.15em] font-black text-white" style={{ fontSize: '0.75em' }}>{frame.text.replace(/^✓\s*/, '').replace(/! Great job!$/, '')}</p>}
              </motion.div>
            )}
            {/* Scan Position: the photo, scanned */}
            <AnimatePresence>
              {frame?.kind === 'scanPhoto' && clip.photo && (
                <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.4 }} className="absolute inset-0 z-30 grid place-items-center bg-black/70 px-[7%]">
                  <div className="relative w-full overflow-hidden rounded-[2.4cqh] ring-4 ring-white/90 shadow-2xl" style={{ aspectRatio: '1 / 1' }}>
                    <img src={clip.photo} alt="" className="h-full w-full object-cover" />
                    <motion.div className="absolute inset-x-0 h-[18%]" initial={{ top: '-18%' }} animate={{ top: ['-18%', '100%', '-18%'] }} transition={{ duration: 2.4, ease: 'easeInOut' }}
                      style={{ background: 'linear-gradient(180deg, rgba(129,182,76,0) 0%, rgba(129,182,76,.55) 85%, #B8E08C 100%)' }} />
                    {[['left-[4%] top-[4%]', 'border-l-4 border-t-4'], ['right-[4%] top-[4%]', 'border-r-4 border-t-4'], ['left-[4%] bottom-[4%]', 'border-b-4 border-l-4'], ['right-[4%] bottom-[4%]', 'border-b-4 border-r-4']].map(([pos, b]) => (
                      <span key={pos} className={`absolute h-[14%] w-[14%] rounded-[0.6cqh] border-[#B8E08C] ${pos} ${b}`} />
                    ))}
                  </div>
                  <motion.p animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 0.9, repeat: Infinity }} className="absolute bottom-[16%] rounded-full bg-[#81B64C] px-[1em] py-[0.35em] font-black uppercase text-white ring-2 ring-white" style={{ fontSize: 'clamp(14px,2.6cqh,28px)' }}>📸 Scanning the board…</motion.p>
                </motion.div>
              )}
            </AnimatePresence>
            {/* App tour, tree look: the coach's line on top, the feature stamped on the board,
                and the list of features growing under it; it ends with all of them. */}
            {tourTree && frame?.kind !== 'teaser' && frame?.kind !== 'intro' && frame?.kind !== 'splash' && (() => {
              const done = tourK > TOUR.length;
              const cur = tourK >= 1 && !done ? TOUR[tourK - 1] : null;
              const stamping = frame?.kind === 'promoCard' && frame.card === 'tour' && !!cur;
              const shown = TOUR.slice(0, done ? TOUR.length : tourK);
              return (<>
                <div className="pointer-events-none absolute inset-x-[5%] top-[2.4%] z-30 flex items-center justify-between font-black" style={{ fontSize: 'clamp(10px,1.65cqh,17px)' }}>
                  <span className="text-white">♞ Everything on ChessScout</span>
                  <span className="rounded-full bg-white/10 px-[0.6em] py-[0.1em] text-white/70">{Math.min(tourK, TOUR.length)} / {TOUR.length}</span>
                </div>
                {cur && (
                  <AnimatePresence mode="wait">
                    <motion.div key={`tq${tourK}`} initial={{ opacity: 0, scale: 0.92, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                      className="pointer-events-none absolute left-[5%] right-[5%] top-[5.8%] z-30 flex items-start gap-[0.55em]" style={{ fontSize: 'clamp(13px,2.45cqh,26px)' }}>
                      <span className="grid h-[1.9em] w-[1.9em] shrink-0 place-items-center rounded-full bg-[#81B64C] text-[0.9em] shadow-lg">♞</span>
                      <p className="relative line-clamp-3 rounded-[0.9em] rounded-tl-[0.2em] bg-white px-[0.75em] py-[0.45em] font-black leading-[1.15] text-[#141A14] shadow-xl">{cur.say}</p>
                    </motion.div>
                  </AnimatePresence>
                )}
                <AnimatePresence>
                  {stamping && cur && (
                    <motion.div key={`tstamp${tourK}`} initial={{ scale: 2.4, opacity: 0, rotate: -16 }} animate={{ scale: 1, opacity: 1, rotate: -7 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                      className="pointer-events-none absolute left-1/2 top-[66%] z-30 -translate-x-1/2 text-center" style={{ fontSize: 'clamp(12px,2.4cqh,26px)' }}>
                      <div className="rounded-[0.35em] px-[0.6em] py-[0.25em]" style={{ border: '0.16em solid #9BD35A', boxShadow: 'inset 0 0 0 0.08em #0B1112, inset 0 0 0 0.16em #9BD35A, 0 0.4em 1.4em rgba(0,0,0,.55)', background: 'rgba(11,17,18,.88)' }}>
                        <p className="whitespace-nowrap font-black uppercase leading-none tracking-wide text-[#B8E08C]">{cur.emo} {cur.title}</p>
                        <p className="mt-[0.3em] whitespace-nowrap font-bold text-white/75" style={{ fontSize: '0.45em' }}>{cur.line}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {done && (
                  <motion.div key="tdone" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    className="pointer-events-none absolute inset-x-[6%] top-[9%] z-30 text-center">
                    <p className="font-black leading-[1.05] text-white" style={{ fontSize: 'clamp(24px,5cqh,54px)' }}>Which one are you<br />trying first?</p>
                    <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: [1, 1.06, 1], opacity: 1 }} transition={{ delay: 0.5, scale: { delay: 1, duration: 1, repeat: Infinity } }}
                      className="mx-auto mt-[1.2cqh] w-fit rounded-full bg-[#81B64C] px-[1em] py-[0.3em] font-black text-white" style={{ fontSize: 'clamp(14px,2.8cqh,30px)' }}>chessscout.net</motion.p>
                    <p className="mt-[0.8cqh] font-bold text-white/70" style={{ fontSize: 'clamp(12px,2cqh,21px)' }}>{clip.promo?.closer} Comment yours 👇</p>
                  </motion.div>
                )}
                <div className={`pointer-events-none absolute inset-x-[7%] z-20 ${done ? 'top-[37%]' : 'top-[72.6%]'}`} style={{ fontSize: `clamp(10px,${done ? 1.55 : 1.7}cqh,18px)`, transition: 'top .5s' }}>
                  <div className={done ? 'grid grid-cols-2 gap-x-[1em]' : ''}>
                    {(done ? shown : shown.slice(Math.max(0, shown.length - 4))).map((t) => {
                      const now = stamping && t === cur;
                      return (
                        <motion.div key={t.title} layout initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }} className="flex items-center" style={{ height: '1.6em' }}>
                          <span className="truncate rounded-[0.4em] px-[0.5em] py-[0.08em] font-black"
                            style={{ background: now ? '#81B64C' : 'transparent', color: now ? '#fff' : 'rgba(255,255,255,.88)', boxShadow: now ? '0 0 0 2px rgba(155,211,90,.5), 0 0 18px rgba(129,182,76,.55)' : undefined }}>
                            {t.emo} {t.title}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </>);
            })()}
            {/* The Family Tree: the coach's question bubble, the name stamped on the board,
                and the family tree growing under it; it ends with the whole tree and "how many did you know?". */}
            {clip.isMap && clip.map && frame?.kind !== 'intro' && (() => {
              const e = clip.map;
              const step = frame?.kind === 'mapMove' || frame?.kind === 'mapStep' ? frame.step : frame?.kind === 'mapEnd' ? e.steps.length : 0;
              const st = e.steps[Math.min(step, e.steps.length - 1)];
              const stamping = frame?.kind === 'mapStep' && st?.name;
              const tree = mapTree(e);
              const done = frame?.kind === 'mapEnd';
              const shown = tree.filter((x) => done || x.k < step || (x.k === step && frame?.kind === 'mapStep'));
              const moveList = (path: string) => path.split(' ').filter(Boolean).map((m, n) => (n % 2 === 0 ? `${n / 2 + 1}.${m}` : m)).join(' ');
              return (<>
                <div className="pointer-events-none absolute inset-x-[5%] top-[2.4%] z-30 flex items-center justify-between font-black" style={{ fontSize: 'clamp(10px,1.65cqh,17px)' }}>
                  <span className="text-white">🌳 The {e.family} family tree <span className="text-white/55">· Part {partLabel(e)}</span></span>
                  {/* The running count: big enough to read, so people count along (and comment their score). */}
                  <motion.span key={`cnt${shown.length}`} initial={{ scale: 1.35 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}
                    className="rounded-full bg-[#81B64C] px-[0.7em] py-[0.15em] tabular-nums text-white" style={{ fontSize: '1.35em' }}>{shown.length}/{tree.length}</motion.span>
                </div>
                {!done && st && (
                  <AnimatePresence mode="wait">
                    <motion.div key={`q${step}`} initial={{ opacity: 0, scale: 0.92, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                      className="pointer-events-none absolute left-[5%] right-[5%] top-[5.8%] z-30 flex items-start gap-[0.55em]" style={{ fontSize: 'clamp(13px,2.45cqh,26px)' }}>
                      <span className="grid h-[1.9em] w-[1.9em] shrink-0 place-items-center rounded-full bg-[#81B64C] text-[0.9em] shadow-lg">♞</span>
                      <p className="relative line-clamp-3 rounded-[0.9em] rounded-tl-[0.2em] bg-white px-[0.75em] py-[0.45em] font-black leading-[1.15] text-[#141A14] shadow-xl">
                        {mapText(e, st.caption).split(/(\*[^*]+\*)/).map((t, n) => t.startsWith('*') ? <span key={n} className="text-[#4E8A1F]">{t.slice(1, -1)}</span> : <span key={n}>{t}</span>)}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                )}
                <AnimatePresence>
                  {stamping && (
                    <motion.div key={`stamp${step}`} initial={{ scale: 2.4, opacity: 0, rotate: -16 }} animate={{ scale: 1, opacity: 1, rotate: -7 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                      className="pointer-events-none absolute left-1/2 top-[66%] z-30 -translate-x-1/2 text-center" style={{ fontSize: 'clamp(12px,2.4cqh,26px)' }}>
                      <div className="rounded-[0.35em] px-[0.6em] py-[0.25em]" style={{ border: '0.16em solid #9BD35A', boxShadow: 'inset 0 0 0 0.08em #0B1112, inset 0 0 0 0.16em #9BD35A, 0 0.4em 1.4em rgba(0,0,0,.55)', background: 'rgba(11,17,18,.88)' }}>
                        <p className="whitespace-nowrap font-black uppercase leading-none tracking-wide text-[#B8E08C]">{st.name}</p>
                        <p className="mt-[0.25em] whitespace-nowrap font-bold tabular-nums text-white/75" style={{ fontSize: '0.45em' }}>{moveList(st.path)}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {stamping && shown.length === tree.length && (
                  <motion.div key="save" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                    className="pointer-events-none absolute inset-x-0 top-[59%] z-30 flex justify-center" style={{ fontSize: 'clamp(12px,2.2cqh,24px)' }}>
                    <span className="rounded-full bg-white px-[0.8em] py-[0.25em] font-black text-[#141A14] shadow-xl">🔖 Save this for your next game</span>
                  </motion.div>
                )}
                {done && (
                  <motion.div key="score" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    className="pointer-events-none absolute inset-x-[6%] top-[12%] z-30 text-center">
                    <p className="font-black leading-[1.05] text-white" style={{ fontSize: 'clamp(26px,5.6cqh,60px)' }}>How many did<br />you know?</p>
                    <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 14 }}
                      className="mx-auto mt-[1.4cqh] w-fit rounded-full bg-[#81B64C] px-[1em] py-[0.3em] font-black text-white" style={{ fontSize: 'clamp(15px,3cqh,32px)' }}>__ / {tree.length}</motion.p>
                    <p className="mt-[1cqh] font-black text-white" style={{ fontSize: 'clamp(14px,2.8cqh,30px)' }}>Comment your score 👇</p>
                    <p className="mt-[0.6cqh] font-bold text-white/65" style={{ fontSize: 'clamp(11px,1.9cqh,20px)' }}>🔖 Save it · next part soon</p>
                  </motion.div>
                )}
                <div className={`pointer-events-none absolute inset-x-[7%] z-20 ${done ? 'top-[37%]' : 'top-[72.6%]'}`} style={{ fontSize: `clamp(10px,${done && tree.length > 10 ? 1.5 : 1.65}cqh,18px)`, transition: 'top .5s' }}>
                  {/* Under the big board there's room for the newest few branches; the whole tree shows at the end. */}
                  {(done ? shown : shown.slice(Math.max(0, (() => { const c = shown.findIndex((x) => x.k === step); return (c >= 0 ? c : shown.length - 1) - 3; })()), Math.max(4, (() => { const c = shown.findIndex((x) => x.k === step); return (c >= 0 ? c : shown.length - 1) + 1; })()))).map((x) => {
                    const now = stamping && x.k === step;
                    return (
                      <motion.div key={x.k} layout initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                        className="flex items-center" style={{ paddingLeft: `${x.depth * 1.35}em`, height: done && tree.length > 10 ? '1.45em' : '1.6em' }}>
                        {x.depth > 0 && <span className="mr-[0.35em] text-white/35">└</span>}
                        <span className="truncate rounded-[0.4em] px-[0.5em] py-[0.08em] font-black"
                          style={{ background: now ? '#81B64C' : 'transparent', color: now ? '#fff' : x.depth === 0 ? '#B8E08C' : 'rgba(255,255,255,.88)', boxShadow: now ? '0 0 0 2px rgba(155,211,90,.5), 0 0 18px rgba(129,182,76,.55)' : undefined }}>
                          {x.name}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </>);
            })()}
            {/* Opening clips: the hook scene. Big punchy text over the payoff position; it
                re-animates when play starts, so a recording opens on the motion. */}
            {frame?.kind === 'teaser' && (
              <motion.div key={`teaser${playing ? 1 : 0}`} className="pointer-events-none absolute inset-x-0 top-[5%] z-30 px-[6%] text-center">
                <motion.p initial={{ scale: 1.8, opacity: 0, rotate: -4 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 14 }}
                  className="font-black leading-[1.05]" style={{ fontSize: 'clamp(24px,5.8cqh,60px)', color: frame.mate ? '#FFD84D' : '#fff', textShadow: '0 0 4px #000, 0 4px 0 #000, 0 6px 22px rgba(0,0,0,.7)', WebkitTextStroke: '1.5px #000' }}>{frame.text}</motion.p>
                <motion.p initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }}
                  className="mx-auto mt-[1cqh] w-fit rounded-full bg-black/60 px-[1em] py-[0.3em] font-black text-white" style={{ fontSize: 'clamp(11px,2cqh,20px)' }}>{frame.sub} 👀</motion.p>
                {(frame.cta || (coachOn && earlyText && frames[ctaIdx] === frame)) && (
                  <div className="mt-[1.2cqh] flex justify-center gap-[1cqh]" style={{ fontSize: 'clamp(11px,1.9cqh,20px)' }}>
                    {[['👍', 'Like'], ['＋', 'Follow'], ['↗', 'Share']].map(([g, t], n) => (
                      <motion.span key={t} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1, scale: [1, 1.08, 1] }} transition={{ delay: 1.4 + n * 0.25, scale: { delay: 2 + n * 0.25, duration: 0.6, repeat: Infinity, repeatDelay: 1.4 } }}
                        className="inline-flex items-center gap-[0.35em] rounded-full px-[0.9em] py-[0.3em] font-black text-white" style={{ background: n === 1 ? '#81B64C' : 'rgba(0,0,0,.55)', border: '1.5px solid rgba(255,255,255,.55)' }}>
                        <span>{g}</span>{t}
                      </motion.span>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
            {frame?.kind === 'teaser' && frame.mate && <motion.div key={`tflash${playing ? 1 : 0}`} className="pointer-events-none absolute inset-0 z-20" initial={{ opacity: 0.7 }} animate={{ opacity: 0 }} transition={{ duration: 0.6 }} style={{ background: 'radial-gradient(circle at 50% 50%, rgba(255,216,77,.55), transparent 70%)' }} />}
            {frame?.kind === 'splash' && <StudioSplash key={`splash${i}`} />}
            {/* Call to action over the splash: big word-by-word subtitles (always, so it reads
                with the sound off too) and follow / share / save chips. */}
            {frame?.kind === 'splash' && prefs.splashCta && ctaText && (() => {
              const line = ctaText;
              const words = line.split(/\s+/).filter(Boolean);
              const len = Math.max(1200, (voiceLen.current.get(`${voiceKey}|${stripEmoji(line)}`) ?? words.length * 0.36) * 1000);
              const k = playing ? Math.max(0, Math.min(words.length - 1, Math.floor(((performance.now() - frameStart) / len) * words.length))) : 0;
              const c0 = Math.floor(k / 4) * 4;
              return (
                <div className="pointer-events-none absolute inset-x-[5%] bottom-[11%] z-[50] text-center">
                  <p className="font-black uppercase leading-[1.1]" style={{ fontSize: 'clamp(16px,3.3cqh,34px)', textShadow: '0 0 4px #000, 0 0 10px #000, 0 4px 0 #000', WebkitTextStroke: '1.5px #000' }}>
                    {words.slice(c0, c0 + 4).map((w, n) => (
                      <motion.span key={`${c0}-${w}-${n}`} initial={n === k - c0 ? { scale: 1.25 } : false} animate={{ scale: 1 }} className="inline-block" style={{ color: n === k - c0 ? '#FFD84D' : '#fff', marginRight: '0.28em' }}>{w}</motion.span>
                    ))}
                  </p>
                  <div className="mt-[1.4cqh] flex justify-center gap-[1.2cqh]" style={{ fontSize: 'clamp(12px,2.1cqh,22px)' }}>
                    {[['＋', 'Follow'], ['↗', 'Share'], ['🔖', 'Save']].map(([g, t], n) => (
                      <motion.span key={t} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1, scale: [1, 1.08, 1] }} transition={{ delay: 0.6 + n * 0.25, scale: { delay: 1.2 + n * 0.25, duration: 0.6, repeat: Infinity, repeatDelay: 1.4 } }}
                        className="inline-flex items-center gap-[0.35em] rounded-full px-[0.9em] py-[0.35em] font-black text-white" style={{ background: n === 0 ? '#81B64C' : 'rgba(255,255,255,.14)', border: '1.5px solid rgba(255,255,255,.55)' }}>
                        <span>{g}</span>{t}
                      </motion.span>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* Text card inserted on the timeline */}
            <AnimatePresence>
              {frame?.kind === 'card' && (
                <motion.div key={`card${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center bg-black/80 backdrop-blur-sm px-[8%]">
                  <motion.p initial={{ scale: 0.7, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                    className="whitespace-pre-line text-center font-black leading-[1.15] text-white" style={{ fontSize: 'clamp(22px,5cqh,54px)', textShadow: '0 4px 20px rgba(0,0,0,.6)' }}>{frame.text}</motion.p>
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
                  {coachClip ? (
                    <div className="rounded-[0.35em] px-[0.6em] py-[0.2em]" style={{ fontSize: 'clamp(20px,4cqh,42px)', transform: 'rotate(-4deg)', border: `0.14em solid ${LABEL[pop.cls].color}`, boxShadow: `inset 0 0 0 0.07em #0B1112, inset 0 0 0 0.14em ${LABEL[pop.cls].color}, 0 0.4em 1.4em rgba(0,0,0,.55)`, background: 'rgba(11,17,18,.9)' }}>
                      <p className="whitespace-nowrap font-black uppercase leading-none tracking-wide" style={{ color: LABEL[pop.cls].color }}>{LABEL[pop.cls].glyph} {LABEL[pop.cls].text}</p>
                    </div>
                  ) : (
                  <div style={{ fontSize: 'clamp(20px,4cqh,42px)' }}>
                    <StudioBadge {...LABEL[pop.cls]} rays={['brilliant', 'great', 'checkmate'].includes(pop.cls)} />
                  </div>
                  )}
                  {isKey && prevEval != null && rev?.evalAfterCp != null && Math.abs(rev.evalAfterCp - prevEval) >= 150 && (
                    <div style={{ fontSize: 'clamp(13px,2.3cqh,24px)' }}><EvalSwing from={fmtEval(prevEval)} to={fmtEval(rev.evalAfterCp)} color={LABEL[pop.cls].color} /></div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {/* Creator tone: a big reaction emoji with the badge */}
            <AnimatePresence>
              {pop && LABEL[pop.cls] && prefs.effects && prefs.tone !== 'teacher' && (() => {
                const R: Record<string, string> = { brilliant: '🤯', great: '🔥', best: '👌', blunder: '😱', mistake: '😬', missed_win: '🤦', checkmate: '💀', inaccuracy: '🤨' };
                const e = R[pop.cls]; if (!e) return null;
                return (
                  <motion.div key={`r${pop.at}`} initial={{ scale: 0, y: 30, rotate: -20, opacity: 0 }} animate={{ scale: [0, 1.4, 1], y: 0, rotate: 8, opacity: 1 }} exit={{ scale: 0.6, y: -40, opacity: 0 }} transition={{ duration: 0.55 }}
                    className="pointer-events-none absolute right-[6%] top-[19%] z-20" style={{ fontSize: 'clamp(34px,7cqh,76px)', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.5))' }}>{e}</motion.div>
                );
              })()}
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
              {frame?.kind === 'outro' && coachClip && (
                <motion.div key="coachOutro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center bg-black/75 backdrop-blur-sm">
                  <motion.div initial={{ scale: 0.8, y: 24 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="px-[8%] text-center">
                    <p className="font-black leading-[1.05] text-white" style={{ fontSize: 'clamp(28px,6cqh,64px)' }}>{commentQ}</p>
                    <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.45, type: 'spring', stiffness: 300, damping: 14 }}
                      className="mx-auto mt-[2cqh] w-fit rounded-full bg-[#81B64C] px-[1em] py-[0.35em] font-black text-white" style={{ fontSize: 'clamp(15px,2.8cqh,30px)' }}>Tell me in the comments 👇</motion.p>
                    <div className="mt-[4cqh] flex items-center justify-center gap-[0.5em] font-black text-white/85" style={{ fontSize: 'clamp(13px,2.2cqh,22px)' }}>
                      <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="" style={{ width: '1.8em', height: '1.8em' }} />
                      <span>{prefs.outroLine}</span>
                    </div>
                    {prefs.handle && <p className="mt-[0.6cqh] font-bold text-white/60" style={{ fontSize: 'clamp(12px,1.9cqh,19px)' }}>{prefs.handle}</p>}
                  </motion.div>
                </motion.div>
              )}
              {frame?.kind === 'outro' && !coachClip && (
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
            {stickers.filter((st) => {
              if (!st.from && !st.to) return true;
              const a = st.from ? frameIds.indexOf(st.from) : 0, b = st.to ? frameIds.indexOf(st.to) : frameIds.length - 1;
              return a >= 0 && b >= 0 && i >= a && i <= b;
            }).map((st) => (
              <div key={st.id} onPointerDown={(e) => { e.stopPropagation(); const fr = frameRef.current!.getBoundingClientRect(); drag.current = { id: st.id, dx: ((e.clientX - fr.left) / fr.width) * 100 - st.x, dy: ((e.clientY - fr.top) / fr.height) * 100 - st.y }; setSelected(st.id); }}
                onDoubleClick={() => setStickers((s) => s.filter((x) => x.id !== st.id))}
                className="absolute z-40 -translate-x-1/2 -translate-y-1/2 cursor-grab select-none touch-none"
                style={{ left: `${st.x}%`, top: `${st.y}%`, outline: selected === st.id && !clean && !recording ? '2px dashed rgba(255,255,255,.7)' : 'none', outlineOffset: 4 }}>
                {st.kind === 'emoji'
                  ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }} className="block" style={{ fontSize: `${st.size * 0.5}cqh`, lineHeight: 1 }}>{st.text}</motion.span>
                  : st.kind === 'caption'
                  ? <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }} className="text-center font-black uppercase leading-[1.04]"
                      style={{ fontSize: `${st.size * 0.55}cqh`, width: '88cqw', fontFamily: 'Impact, Anton, "Arial Black", system-ui, sans-serif', color: '#fff', WebkitTextStroke: '0.07em #000', paintOrder: 'stroke fill', textShadow: '0 0.08em 0 #000, 0 0 0.25em rgba(0,0,0,.55)', letterSpacing: '0.01em' }}>{st.text}</motion.p>
                  : st.kind === 'reply'
                  ? <motion.div initial={{ scale: 0, rotate: -3 }} animate={{ scale: 1, rotate: -2 }} transition={{ type: 'spring', stiffness: 380, damping: 16 }}
                      className="max-w-[78cqw] rounded-[0.6em] bg-white px-[0.8em] py-[0.55em] text-left shadow-2xl" style={{ fontSize: `${st.size * 0.42}cqh` }}>
                      <p className="flex items-center gap-[0.4em] font-bold text-[#6B6B6B]" style={{ fontSize: '0.62em' }}><span className="inline-block h-[1.3em] w-[1.3em] rounded-full" style={{ background: 'linear-gradient(135deg,#81B64C,#1BACA6)' }} />Reply to a comment</p>
                      <p className="mt-[0.15em] font-black leading-snug text-[#141414]">{st.text}</p>
                    </motion.div>
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
          {clean && blank && (prefs.leadIn === 'black' || (isComp && q !== 0)) && <div className="absolute inset-0 z-[70] bg-black" />}
          {clean && exitHint > 0 && (
            <div className="absolute inset-x-0 top-3 z-[80] flex justify-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={startBlank} aria-label="Replay from the start"
                className="flex items-center gap-1.5 rounded-full bg-[#81B64C] px-3.5 py-2 text-[13px] font-black text-white">
                <RotateCcw size={15} />Replay
              </button>
              <button onClick={exitClean} aria-label="Exit clean view"
                className="flex items-center gap-1.5 rounded-full bg-black/75 px-3.5 py-2 text-[13px] font-black text-white ring-1 ring-white/30">
                <X size={15} />Exit clean view
              </button>
            </div>
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
          {/* ── Timeline: every frame; tap to jump, then add a pause or set stickers to start / end there ── */}
          <div ref={timelineRef} className="mb-1.5 flex gap-1 overflow-x-auto pb-2 pr-1 pt-2" style={{ scrollbarWidth: 'thin' }}>
            {frames.map((f, k) => {
              const id = frameIds[k];
              const m = f.kind === 'move' ? plies[f.ply - 1] : null;
              const c = m ? (m.san.includes('#') ? 'checkmate' : m.review?.classification) : null;
              const tone = c && LABEL[c] && !['best', 'excellent', 'good', 'book'].includes(c) ? LABEL[c].color : null;
              const label = f.kind === 'move' ? (m ? figurine(m.san, m.color === 'w') : 'Start') : f.kind === 'countdown' ? (f.anchor ? `⏱${f.n}` : String(f.n)) : f.kind === 'card' ? 'Card' : f.kind === 'rewind' ? '⏪' : f.kind === 'openCard' ? (f.card === 'line' ? `Line ${(f.idx ?? 0) + 1}` : ({ ideas: 'Ideas', stats: 'Results', options: 'Replies', trap: 'Trap' } as Record<string, string>)[f.card]) : f.kind === 'scoutCard' ? (f.card === 'weak' ? `Weak ${(f.idx ?? 0) + 1}` : ({ profile: 'Profile', colors: 'Colours', openings: 'Openings', habits: 'Habits' } as Record<string, string>)[f.card]) : f.kind === 'lessonText' ? 'Coach' : f.kind === 'lessonBoard' ? (f.celebrate ? '✓' : 'Board') : f.kind === 'scanPhoto' ? 'Photo' : f.kind === 'splash' ? 'Splash' : f.kind === 'promoCard' ? (f.card === 'vs' ? `Row ${f.upTo}` : f.card[0].toUpperCase() + f.card.slice(1))
                : ({ title: 'Title', intro: 'Hook', hold: 'Start', better: 'Line', split: 'Split', reveal: 'Rating', summary: 'Summary', outro: 'End' } as Record<string, string>)[f.kind] ?? f.kind;
              const starts = stickers.filter((st) => st.from === id).length, ends = stickers.filter((st) => st.to === id).length;
              return (
                <button key={id} data-tl={k} onClick={() => setI(k)} title={id}
                  className="relative shrink-0 rounded-md px-2 pb-1 pt-1.5 text-[11.5px] font-black tabular-nums"
                  style={{ background: k === i ? '#81B64C' : 'rgba(255,255,255,.06)', color: k === i ? '#fff' : f.kind === 'move' ? '#E6E9E8' : '#9FB0AA', boxShadow: tone ? `inset 0 -3px 0 ${tone}` : undefined }}>
                  {label}
                  {holds[id] ? <span className="absolute -right-1 -top-1.5 rounded bg-[#E8B447] px-1 text-[9px] text-[#1A1205]">⏸{(holds[id] / 1000).toFixed(holds[id] % 1000 ? 1 : 0)}s</span> : null}
                  {(starts > 0 || ends > 0) && <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">{starts > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[#4FD1C5]" />}{ends > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[#F0605D]" />}</span>}
                </button>
              );
            })}
          </div>
          {frameIds[i] && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] text-white/60">
              <span className="font-bold text-white/80">Pause on this frame</span>
              {[0, 500, 1000, 2000, 3000, 5000].map((ms) => {
                const on = (holds[frameIds[i]] ?? 0) === ms;
                return (
                  <button key={ms} onClick={() => setHolds((h) => { const n = { ...h }; if (ms) n[frameIds[i]] = ms; else delete n[frameIds[i]]; return n; })}
                    className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ background: on ? '#E8B447' : 'rgba(255,255,255,.06)', color: on ? '#1A1205' : '#C9CFCD' }}>
                    {ms ? `+${ms / 1000}s` : 'None'}
                  </button>
                );
              })}
              {Object.keys(holds).length > 0 && <button onClick={() => setHolds({})} className="text-[11.5px] font-bold text-white/45 underline">Clear all pauses</button>}
            </div>
          )}
          {frameIds[i] && frame && (() => {
            const anchor = (frame.kind === 'countdown' || frame.kind === 'card') && frame.anchor ? frame.anchor : frameIds[i];
            const ins = inserts[anchor];
            const put = (kind: 'timer' | 'card', secs: number) => setInserts((m) => ({ ...m, [anchor]: { ...m[anchor], [kind]: { secs, text: insText.trim() || (kind === 'timer' ? 'Pause and find the move' : 'Part 2') } } }));
            const drop = (kind: 'timer' | 'card') => setInserts((m) => { const n = { ...m }; const v = { ...n[anchor] }; delete v[kind]; if (!v.timer && !v.card) delete n[anchor]; else n[anchor] = v; return n; });
            return (
              <div className="mb-3 rounded-lg bg-white/5 p-2 text-[12px] text-white/70">
                <p className="mb-1.5 font-bold text-white/80">Insert before this frame</p>
                <input value={insText} onChange={(e) => setInsText(e.target.value)} maxLength={120} placeholder="Text (e.g. Pause and find the move · Part 2 · a quote)" className="mb-1.5 w-full rounded-md bg-white/5 px-2 py-1 text-[12.5px] text-white outline-none ring-1 ring-white/10 focus:ring-[#81B64C]" />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold">⏱ Countdown</span>
                  {[3, 5, 10, 15, 30].map((sec) => <button key={sec} onClick={() => put('timer', sec)} className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ background: ins?.timer?.secs === sec ? '#81B64C' : 'rgba(255,255,255,.08)', color: '#fff' }}>{sec}s</button>)}
                  {ins?.timer && <button onClick={() => drop('timer')} className="text-[11.5px] font-bold text-[#F59B98] underline">Remove</button>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="font-bold">📝 Text card</span>
                  {[2, 3, 5].map((sec) => <button key={sec} onClick={() => put('card', sec)} className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ background: ins?.card?.secs === sec ? '#81B64C' : 'rgba(255,255,255,.08)', color: '#fff' }}>{sec}s</button>)}
                  {ins?.card && <button onClick={() => drop('card')} className="text-[11.5px] font-bold text-[#F59B98] underline">Remove</button>}
                </div>
              </div>
            );
          })()}
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button onClick={record} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-black text-white" style={{ background: recording ? '#CA3431' : '#2A3335' }}>
              {recording ? <Square size={14} /> : <Video size={14} />}{recording ? 'Stop recording' : 'Record clip'}
            </button>
            <button onClick={enterClean} className={ctl}><EyeOff size={14} className="mr-1 inline" />Clean view</button>
            <RenderMp4 name={clip?.fileBase ?? 'chessscout-clip'} shareText={postText}
              payload={() => ({ source: isComp && queue ? queue[0] : current, queue: isComp ? queue : undefined, title: isComp ? compTitle : undefined, prefs })} />
            <button onClick={() => set('leadIn', prefs.leadIn === 'scene' ? 'black' : 'scene')} className={ctl} title="What shows for the 5 seconds before a clean-view clip starts">Lead-in: {prefs.leadIn === 'scene' ? 'first scene' : 'black'}</button>
            {soundtrack && (
              <a href={soundtrack.url} download={`${clip?.fileBase ?? 'chessscout-clip'}-soundtrack.${soundtrack.ext}`} className={ctl} style={{ background: '#81B64C' }}>
                <Music size={14} className="mr-1 inline" />Download soundtrack
              </a>
            )}
            <button onClick={saveCover} className={ctl} title="Download a cover image for the post"><ImageIcon size={14} className="mr-1 inline" />Cover image</button>
          </div>
          {isComp && (
            <div className="mb-3">
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-white/50">Compilation title · clip {clipQ + 1} of {queue!.length}</label>
              <input value={compTitle} onChange={(e) => setCompTitle(e.target.value)} className="w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white outline-none ring-1 ring-white/10 focus:ring-[#81B64C]" />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">Clips · board &amp; pieces per clip</p>
                <div className="flex gap-1">
                  <button onClick={() => { looks.current.clear(); setClipLooks(Object.fromEntries(queue!.map((x) => [srcKey(x), randomLook()]))); }} className="rounded-md bg-white/10 px-2 py-0.5 text-[11.5px] font-bold"><Shuffle size={11} className="mr-1 inline" />New look each</button>
                  {Object.keys(clipLooks).length > 0 && <button onClick={() => { looks.current.clear(); setClipLooks({}); }} className="rounded-md bg-white/10 px-2 py-0.5 text-[11.5px] font-bold text-white/70">Reset</button>}
                </div>
              </div>
              <div className="mt-1.5 space-y-1">
                {queue!.map((x, k) => {
                  const key = srcKey(x); const v = clipLooks[key]; const n = queue!.length - k;
                  return (
                    <div key={key} className="flex items-center gap-1.5 rounded-lg px-1.5 py-1" style={{ background: k === clipQ ? 'rgba(129,182,76,.16)' : 'rgba(255,255,255,.04)', boxShadow: k === clipQ ? 'inset 0 0 0 1px rgba(129,182,76,.5)' : undefined }}>
                      <button onClick={() => goClip(k)} title="Go to this clip" className="shrink-0" style={{ fontSize: 9 }}><Medallion glyph={`#${n}`} color={rankColor(n)} size={2.4} /></button>
                      <button onClick={() => goClip(k)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-[12.5px] font-bold text-white">{srcLabel(x)}</p>
                        <p className="truncate text-[10.5px] text-white/45">{v === 'remix' ? 'New look every move' : v === 'mine' ? 'Your board' : v ? lookLabel(v) : prefs.remix ? 'New look every move (default)' : 'Default look'}</p>
                      </button>
                      <select value={v === undefined ? 'default' : typeof v === 'string' ? v : 'fixed'} title="Board and pieces for this clip"
                        onChange={(e) => { const m = e.target.value; setClipLook(key, m === 'default' ? undefined : m === 'fixed' ? randomLook() : (m as ClipLook)); }}
                        className="w-[5.6rem] shrink-0 rounded-md bg-white/5 px-1 py-1 text-[11px] text-white ring-1 ring-white/10">
                        <option value="default">Default</option><option value="fixed">One look</option><option value="remix">Every move</option><option value="mine">My board</option>
                      </select>
                      <button onClick={() => setClipLook(key, randomLook())} title="Another random board and pieces" className="rounded p-1 text-white/70 hover:bg-white/10"><Shuffle size={13} /></button>
                      <button onClick={() => moveClip(k, -1)} disabled={k === 0} title="Earlier" className="rounded p-1 text-white/60 hover:bg-white/10 disabled:opacity-25"><ArrowUp size={13} /></button>
                      <button onClick={() => moveClip(k, 1)} disabled={k === queue!.length - 1} title="Later" className="rounded p-1 text-white/60 hover:bg-white/10 disabled:opacity-25"><ArrowDown size={13} /></button>
                      <button onClick={() => removeClip(k)} title="Remove from the compilation" className="rounded p-1 text-[#F59B98] hover:bg-white/10"><X size={14} /></button>
                    </div>
                  );
                })}
              </div>
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
                {premiumVoice && <option value="premium">Premium narrator</option>}
                {['ash', 'ballad', 'verse', 'coral', 'sage', 'onyx', 'nova', 'echo', 'fable', 'alloy', 'shimmer'].map((v) => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}{v === 'ash' ? ' (recommended)' : ''}</option>)}
              </select>
            )}
            {prefs.voice && <Mic size={14} className="text-[#B8E08C]" />}
            <div className="inline-flex rounded-lg bg-white/5 p-0.5" title="How the voiceover and cards talk">
              {([['creator', 'Creator tone'], ['teacher', 'Teacher tone']] as const).map(([k, t]) => (
                <button key={k} onClick={() => set('tone', k)} className="rounded-md px-2.5 py-1 text-[12px] font-bold" style={{ background: (prefs.tone === 'teacher' ? 'teacher' : 'creator') === k ? '#81B64C' : 'transparent', color: (prefs.tone === 'teacher' ? 'teacher' : 'creator') === k ? '#fff' : '#C9CFCD' }}>{t}</button>
              ))}
            </div>
          </div>
          <p className="-mt-2 mb-3 text-[11.5px] text-white/45">Creator reacts to the moves and talks like a chess creator, with reaction emojis. Teacher explains everything, like a lesson.</p>
          {prefs.voice && voicePrep && voicePrep.done < voicePrep.total && <p className="-mt-1 mb-3 flex items-center gap-1.5 text-[12px] text-[#B8E08C]"><Mic size={12} />{waitVoice ? 'Starts as soon as the voiceover is ready' : 'Preparing the voiceover'} · {voicePrep.done}/{voicePrep.total}</p>}
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
            {clip.isTrap ? (
              <label className="text-white/60">Moves before<input type="number" min={0} max={60} value={Math.min(prefs.trapBefore, clip.key)} onChange={(e) => set('trapBefore', Number(e.target.value))} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" /></label>
            ) : (
              <label className="text-white/60">Moves before<input type="number" min={0} max={60} value={prefs.before} disabled={clip.isPuzzle || clip.isReview} onChange={(e) => set('before', Number(e.target.value))} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white disabled:opacity-40" /></label>
            )}
            <label className="text-white/60">Moves after{clip.isTrap || clip.isPuzzle || clip.isReview
              ? <input disabled value="To the end" className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white/50" />
              : <input type="number" min={0} max={60} value={prefs.after} onChange={(e) => set('after', Number(e.target.value))} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" />}</label>
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
          <div className="mb-3">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Look</p>
            <div className="inline-flex rounded-lg bg-white/5 p-0.5">
              {([['coach', 'Coach'], ['classic', 'Classic']] as const).map(([k, t]) => (
                <button key={k} onClick={() => set('theme', k)} className="rounded-md px-3 py-1 text-[12px] font-bold" style={{ background: (prefs.theme === 'classic' ? 'classic' : 'coach') === k ? '#81B64C' : 'transparent', color: (prefs.theme === 'classic' ? 'classic' : 'coach') === k ? '#fff' : '#C9CFCD' }}>{t}</button>
              ))}
            </div>
            <p className="mt-1 text-[11.5px] text-white/45">Coach: the coach's speech bubble says what's happening, badges are stamped on, a topic header, a like / follow / share line near the start and a "comment your answer" ending. Classic: the original look.</p>
            {prefs.theme !== 'classic' && !clip.lineMode && (
              <label className="mt-1.5 block text-[12px] text-white/60">{clip.isMap ? 'Call to action at the start of each part' : 'Call to action near the start'} (empty = none)
                <input value={clip.isMap ? prefs.seriesCta : prefs.earlyCta} onChange={(e) => set(clip.isMap ? 'seriesCta' : 'earlyCta', e.target.value)} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" />
              </label>
            )}
          </div>
          {clip.isMap && <div className="mb-3 flex flex-wrap gap-1.5">{toggle('tilt', '3D tilted board')}</div>}
          {clip.isOpening && (
            <div className="mb-3">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Opening clip</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="inline-flex rounded-lg bg-white/5 p-0.5">
                  {([['full', 'Full'], ['quick', 'Quick (under a minute)']] as const).map(([k, t]) => (
                    <button key={k} onClick={() => set('openCut', k)} className="rounded-md px-3 py-1 text-[12px] font-bold" style={{ background: prefs.openCut === k ? '#81B64C' : 'transparent', color: prefs.openCut === k ? '#fff' : '#C9CFCD' }}>{t}</button>
                  ))}
                </div>
                {toggle('openTeaser', 'Hook scene first')}
              </div>
              {clip.lineMode && <label className="mt-2 block text-[12px] text-white/60">Like / follow / share line (said at the start, after the intro; empty = none)<input value={prefs.lineCtaLine} onChange={(e) => set('lineCtaLine', e.target.value)} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" /></label>}
              <p className="mt-1 text-[11.5px] text-white/45">Quick keeps the ideas, the replies, the most played line and the trap. The hook scene opens on the trap's final position (or the big question) so the first second grabs people.</p>
            </div>
          )}
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Story</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {toggle('fastStart', 'Fast start (moves in the first second, like/follow ask after the first moves)')}
            {clip.isPromo && clip.promo?.template === 'tour' && (
              <div className="inline-flex rounded-lg bg-white/5 p-0.5">
                {([['tree', 'Tour: Family Tree look'], ['cards', 'Tour: feature cards']] as const).map(([k, t]) => (
                  <button key={k} onClick={() => set('tourStyle', k)} className="rounded-md px-3 py-1 text-[12px] font-bold" style={{ background: prefs.tourStyle === k ? '#81B64C' : 'transparent', color: prefs.tourStyle === k ? '#fff' : '#C9CFCD' }}>{t}</button>
                ))}
              </div>
            )}
            {toggle('intro', 'Hook intro')}
            {toggle('guess', 'Find-the-move countdown')}
            {prefs.guess && [3, 5, 10].map((sec) => (
              <button key={sec} onClick={() => set('countdownSecs', sec)} className="rounded-full px-2 py-1 text-[12px] font-bold" style={{ background: prefs.countdownSecs === sec ? 'rgba(129,182,76,.25)' : 'rgba(255,255,255,.06)', color: prefs.countdownSecs === sec ? '#B8E08C' : '#C9CFCD' }}>{sec}s</button>
            ))}
            {prefs.guess && toggle('choices', 'A / B / C choices')}
            {toggle('betterLine', 'Show the better line')}
            {toggle('split', 'Played vs better (side by side)')}
            {!clip.isTrap && toggle('guessRating', 'Guess the rating')}
            {toggle('outro', 'End card')}
            {toggle('splash', 'Splash screen at the end')}
          </div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Look</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {toggle('remix', 'Remix the board')}
            {prefs.remix && (
              <span className="inline-flex overflow-hidden rounded-full bg-white/10 text-[12px] font-bold">
                {(['move', 'scene'] as const).map((v) => (
                  <button key={v} onClick={() => { looks.current.clear(); set('remixEvery', v as never); }} className="px-2.5 py-1" style={prefs.remixEvery === v ? { background: '#81B64C', color: '#fff' } : undefined}>{v === 'move' ? 'Every move' : 'Every scene'}</button>
                ))}
              </span>
            )}
            {toggle('pieceFx', 'Animated pieces')}
            {toggle('zoom', 'Zoom on the key move')}
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
          {prefs.splash && (
            <div className="mb-3 text-[12px]">
              <div className="mb-1 flex items-center gap-2">{toggle('splashCta', 'Follow / share call to action on the splash')}</div>
              {prefs.splashCta && <label className="block text-white/60">Call to action (spoken with the voiceover, and shown as subtitles)<input value={prefs.ctaLine} onChange={(e) => set('ctaLine', e.target.value)} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" /></label>}
              {prefs.splashCta && <div className="mt-1.5 flex items-center gap-2">{toggle('ctaSite', 'Add a ChessScout.net line')}</div>}
              {prefs.splashCta && prefs.ctaSite && <label className="mt-1 block text-white/60">ChessScout.net line (said after the call to action)<input value={prefs.siteLine} onChange={(e) => set('siteLine', e.target.value)} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" /></label>}
            </div>
          )}

          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Stickers <span className="normal-case text-white/40">· drag to move, double-click to remove, pick one to set when it shows</span></p>
          <div className="mb-2 flex flex-wrap gap-1">
            {EMOJIS.map((e) => <button key={e} onClick={() => addSticker(e, 'emoji')} className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-[20px] hover:bg-white/10">{e}</button>)}
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {TEXT_STICKERS.map((t, k) => <button key={t} onClick={() => addSticker(t, 'text', k % TONES.length)} className="rounded-md px-2 py-1 text-[11px] font-black ring-1 ring-white/30" style={{ background: TONES[k % TONES.length].bg, color: TONES[k % TONES.length].fg }}>{t}</button>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (customText.trim()) { addSticker(customText.trim().slice(0, textStyle === 'text' ? 40 : 120), textStyle, stickers.length % TONES.length); setCustomText(''); } }} className="mb-2 flex gap-1.5">
            <select value={textStyle} onChange={(e) => setTextStyle(e.target.value as typeof textStyle)} className="shrink-0 rounded-lg bg-white/5 px-1.5 text-[12px] text-white ring-1 ring-white/10">
              <option value="text">Sticker</option><option value="caption">Meme caption</option><option value="reply">Comment reply</option>
            </select>
            <input value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder={textStyle === 'reply' ? 'The comment you are answering…' : textStyle === 'caption' ? 'Big top caption…' : 'Your own text…'} maxLength={textStyle === 'text' ? 40 : 120} className="min-w-0 flex-1 rounded-lg bg-white/5 px-3 py-1.5 text-[13px] text-white outline-none ring-1 ring-white/10 focus:ring-[#81B64C]" />
            <button type="submit" className="rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white">Add</button>
          </form>
          <div className="mb-2 flex flex-wrap gap-1">
            {MEME_CAPTIONS.map((t) => <button key={t} onClick={() => addSticker(t, 'caption')} className="rounded-md bg-black px-2 py-1 text-[11px] font-black uppercase text-white ring-1 ring-white/40" style={{ fontFamily: 'Impact, Anton, "Arial Black", sans-serif', letterSpacing: '.02em' }}>{t}</button>)}
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {BADGE_STICKERS.map((c) => <button key={c} onClick={() => addSticker(c, 'badge')} className="rounded-lg bg-white/5 px-1.5 py-1 hover:bg-white/10" style={{ fontSize: 9 }} title={LABEL[c].text}><StudioBadge {...LABEL[c]} /></button>)}
          </div>
          {stickers.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              <span className="self-center text-[11px] font-bold uppercase text-white/40">On this clip</span>
              {stickers.map((st) => (
                <button key={st.id} onClick={() => { setSelected(st.id); const k = st.from ? frameIds.indexOf(st.from) : -1; if (k >= 0 && (i < k || (st.to && i > frameIds.indexOf(st.to)))) setI(k); }}
                  className="max-w-[9rem] truncate rounded-md px-2 py-0.5 text-[11.5px] font-bold"
                  style={{ background: selected === st.id ? '#81B64C' : 'rgba(255,255,255,.08)', color: '#fff' }}>
                  {st.kind === 'badge' ? (LABEL[st.text]?.text ?? st.text) : st.text}{st.from || st.to ? ' ⏱' : ''}
                </button>
              ))}
            </div>
          )}
          <label className="mb-2 flex items-center gap-2 text-[12px] text-white/60">
            <input type="checkbox" checked={stickerFromHere} onChange={(e) => setStickerFromHere(e.target.checked)} className="accent-[#81B64C]" />
            New stickers appear from the frame you're on (off: whole clip)
          </label>
          {selected && stickers.some((s) => s.id === selected) && (() => {
            const st = stickers.find((s) => s.id === selected)!;
            const name = (id?: string) => { const k = id ? frameIds.indexOf(id) : -1; return k < 0 ? null : `frame ${k + 1}`; };
            const upd = (v: Partial<Sticker>) => setStickers((s) => s.map((x) => (x.id === selected ? { ...x, ...v } : x)));
            return (
              <div className="mb-2 rounded-lg bg-white/5 p-2 text-[12px] text-white/70">
                <p className="mb-1.5">Shows {st.from ? `from ${name(st.from) ?? 'another clip'}` : 'from the start'} {st.to ? `to ${name(st.to) ?? 'another clip'}` : 'to the end'}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => upd({ from: frameIds[i] })} className="rounded-full bg-[#4FD1C5]/20 px-2.5 py-1 font-bold text-[#7FE3D9]">Start here</button>
                  <button onClick={() => upd({ to: frameIds[i] })} className="rounded-full bg-[#F0605D]/20 px-2.5 py-1 font-bold text-[#F59B98]">End here</button>
                  <button onClick={() => upd({ from: undefined, to: undefined })} className="rounded-full bg-white/10 px-2.5 py-1 font-bold text-white/80">Whole clip</button>
                  {st.from && <button onClick={() => { const k = frameIds.indexOf(st.from!); if (k >= 0) setI(k); }} className="rounded-full bg-white/10 px-2.5 py-1 font-bold text-white/80">Go to start</button>}
                </div>
              </div>
            );
          })()}
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
            On a phone, tap Clean view and start your screen recorder: the screen stays black for 5 seconds, then the clip plays from the start with nothing else on screen. Double-tap for Replay or Exit (back also exits). If your recording has no sound, use Download soundtrack afterwards: it's the clip's exact audio, starting with the black screen, so in CapCut or TikTok you drop it under the recording at the very start. Settings are remembered for the next clip.
          </p>
          <p className="mt-2 text-[11px] text-white/35"><Eye size={12} className="mr-1 inline" />{clip.label}</p>
        </div>
      )}
    </div>
  );
}
