import { markValueMoment } from '@/lib/valueMoment';
import { startTrial } from '@/lib/startTrial';
import { trackFunnelEvent } from '@/lib/funnelTracking';
import { apiFetch } from '@/lib/api';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Chess } from 'chess.js';
import { useHoldRepeat } from '@/hooks/use-hold-repeat';
import { ArrowLeft, Bell, ChevronLeft, ChevronRight, FlipVertical2, ListTree, Star, RotateCcw, X, Sparkles } from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { useLocation } from 'wouter';
import { MaterialStrip } from '@/components/GameStatusStrip';
import { ChessBoard, type MoveQuality } from '@/components/ChessBoard';
import { normalizeFen } from '@/lib/utils';
import { playMoveSound, vibrateFor, LookOverride, randomLook, type BoardLook } from '@/context/SettingsContext';

// Step-by-step game review: the coach talks you through the game one move
// at a time, above a full-width board that shows each move's quality
// (coloured squares, a badge on the piece, arrows for the better move and
// the reply it allows). A move strip under the board, and Best / Retry /
// Show / Next at the bottom. Built on the same review data as the full
// analysis view, which stays one tap away.

export type Classification = MoveQuality;
export interface GuidedReviewMove {
  moveIndex: number; san: string; color: 'white' | 'black'; classification: Classification;
  explanation: string; betterMove: string | null; evalAfterCp?: number; bestLineSan?: string[];
  /** The engine's expected continuation after this move (both sides). */
  replyLineSan?: string[];
  pros?: string[]; cons?: string[];
  /** Pro: the coach's take on this move, worked out from the position (server). */
  coachTake?: string;
}
interface PlyMove { san: string; fen: string; from?: string | null; to?: string | null; fenBefore?: string | null }

const GREEN = '#81B64C';
const BG = '#0B1112';
const CLS: Record<Classification, { color: string; glyph: string; phrase: string; strip: boolean; textColor?: string }> = {
  checkmate: { color: '#C9971C', glyph: '#', phrase: 'is checkmate', strip: true },
  brilliant: { color: '#1BACA6', glyph: '!!', phrase: 'is brilliant', strip: true, textColor: '#3FD0C9' },
  great: { color: '#4A8BD6', glyph: '!', phrase: 'is a great move', strip: true, textColor: '#74A8EA' },
  best: { color: '#5FA83A', glyph: '★', phrase: 'is best', strip: true },
  excellent: { color: '#7DB94A', glyph: '!', phrase: 'is excellent', strip: true },
  good: { color: '#8AA86E', glyph: '✓', phrase: 'is good', strip: false },
  book: { color: '#A88865', glyph: '📖', phrase: 'is a book move', strip: true },
  inaccuracy: { color: '#E3AE2A', glyph: '?!', phrase: 'is an inaccuracy', strip: true, textColor: '#F0C14B' },
  mistake: { color: '#E5822A', glyph: '?', phrase: 'is a mistake', strip: true, textColor: '#F29A4A' },
  blunder: { color: '#CA3431', glyph: '??', phrase: 'is a blunder', strip: true, textColor: '#F0605D' },
  missed_win: { color: '#B8343E', glyph: '✗', phrase: 'is a miss', strip: true, textColor: '#F0605D' },
};
const BAD = new Set<Classification>(['inaccuracy', 'mistake', 'blunder', 'missed_win']);
// Shown inside another page of ours (the Streamer Studio's board panel).
const IN_FRAME = (() => { try { return window.self !== window.top && window.parent.location.origin === window.location.origin; } catch { return false; } })();
const GOOD_REPLY = new Set<Classification>(['best', 'brilliant', 'great', 'excellent', 'checkmate']);

/** "Nf3" -> "♘f3" (outlined for White, solid for Black), as text not emoji. */
function figurine(san: string, white: boolean): string {
  const map: Record<string, string> = white
    ? { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' }
    : { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' };
  return san.replace(/^[KQRBN]/, (p) => `${map[p]}︎`);
}
function evalLabel(cp?: number | null): string | null {
  if (typeof cp !== 'number' || !Number.isFinite(cp)) return null;
  if (Math.abs(cp) >= 9000) { const n = Math.max(0, 10000 - Math.abs(cp)); return `${cp > 0 ? '+' : '-'}M${n || ''}`; }
  const v = cp / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
}
function sanToSquares(fen: string, san: string): { from: string; to: string; fen: string } | null {
  try { const c = new Chess(normalizeFen(fen)); const m = c.move(san); return m ? { from: m.from, to: m.to, fen: c.fen() } : null; } catch { return null; }
}
function soundFor(san: string) {
  playMoveSound(san.includes('#') || san.includes('+') ? 'check' : san.startsWith('O-O') ? 'castle' : san.includes('=') ? 'promote' : san.includes('x') ? 'capture' : 'move');
}
/** Splits the coach's text: what fits the top card (about two lines), and the rest for below. */
function splitText(t: string): { top: string; rest: string } {
  const clean = (t || '').replace(/\s+/g, ' ').trim();
  // Sentence breaks are a stop followed by a space and a capital, so move numbers ("8...Bxc6 9.Bxc6") stay whole.
  const parts = clean.split(/(?<=[.!?])\s+(?=[A-Z"(])/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return { top: '', rest: '' };
  // One long sentence: it can't fit on top, so it all goes below.
  if (parts[0].length > 110) return { top: '', rest: clean };
  let top = parts[0]; let k = 1;
  while (k < parts.length && (top + ' ' + parts[k]).length <= 100) { top += ' ' + parts[k]; k++; }
  return { top, rest: parts.slice(k).join(' ') };
}

function standing(cp: number | null | undefined): string {
  if (cp == null) return '';
  const side = cp > 0 ? 'White' : 'Black';
  if (Math.abs(cp) >= 9000) return `${side} has a forced mate`;
  const a = Math.abs(cp);
  return a < 50 ? 'About equal' : a < 150 ? `${side} is slightly better` : a < 400 ? `${side} is better` : `${side} is winning`;
}


function Badge({ cls, size = 22 }: { cls: Classification; size?: number }) {
  const c = CLS[cls];
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-black text-white" aria-hidden
      style={{ width: size, height: size, background: c.color, fontSize: size * (c.glyph.length > 1 ? 0.46 : 0.58), boxShadow: '0 1px 0 rgba(0,0,0,.25)' }}>
      {c.glyph}
    </span>
  );
}

function EvalBarH({ cp }: { cp: number | null }) {
  const white = cp == null ? 50 : Math.abs(cp) >= 9000 ? (cp > 0 ? 100 : 0) : Math.max(4, Math.min(96, 50 + 50 * (2 / (1 + Math.exp(-cp / 400)) - 1)));
  const label = evalLabel(cp);
  return (
    <div className="relative h-[14px] w-full overflow-hidden rounded-[4px]" style={{ background: '#3A3A38' }} aria-label={`Evaluation ${label ?? ''}`}>
      <div className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out" style={{ background: '#F2F2EE', width: `${white}%` }} />
      {label && <span className="absolute inset-y-0 flex items-center px-1.5 text-[10px] font-black tabular-nums"
        style={white >= 50 ? { left: 0, color: '#1C1C1C' } : { right: 0, color: '#F2F2EE' }}>{label}</span>}
    </div>
  );
}

export interface GuidedReviewProps {
  moves: PlyMove[];
  startFen: string;
  reviewMoves: GuidedReviewMove[];
  ply: number;
  setPly: (n: number) => void;
  flipped: boolean;
  onFlip: () => void;
  whiteName: string; blackName: string;
  accuracy?: { white: number; black: number } | null;
  result?: string | null;
  onExit: () => void;
  /** Pro: the last step's "Continue to Pro report" (the full analysis, on its Report tab). */
  onReport?: () => void;
  onBack: () => void;
  /** Shown under the end-of-game summary (e.g. the stay-in-touch offer). */
  endExtra?: React.ReactNode;
  /** The member's first review after signing up: open at the deciding move, then "what's next". */
  firstReview?: boolean;
  /** Which side the member played (for the deciding move). */
  mySide?: 'w' | 'b' | null;
  /** The engine review is showing; the AI coach's notes are still being written. */
  coachPending?: boolean;
  /** How far the coach's notes have got (moves covered so far, of all). */
  coachProgress?: { done: number; total: number } | null;
  /** While the engine is still reviewing: its evaluation of each position so far (index = moves played). */
  liveEvals?: number[] | null;
  /** 'preparing' while the engine reviews the game; the moves can still be browsed. */
  status?: 'ready' | 'loading' | 'preparing' | 'error';
  progress?: { done: number; total: number } | null;
  errorText?: string | null;
  onRetryReview?: () => void;
  /** Pro: the full in-depth analysis view is available. */
  canFullAnalysis?: boolean;
  /** Not Pro: where "Full analysis (Pro)" goes (the Pro page). */
  onUpgrade?: () => void;
  /** Admin: show the Remix button (a random board and pieces on every move, for content). */
  canRemix?: boolean;
}

/** Free reviews: the coach's card on a costly move, locked, with the trial one tap away. */
const trialTrack = (event: 'card_shown' | 'card_start') => {
  void apiFetch('/api/trial/track', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }) }).catch(() => {});
};
let teaserCounted = false; // once per visit is enough: the admin panel counts members
function CoachTeaser({ label, onUpgrade }: { label: string; onUpgrade?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (!teaserCounted) { teaserCounted = true; trialTrack('card_shown'); } }, []);
  const go = async () => {
    trialTrack('card_start');
    setBusy(true); setErr('');
    const e = await startTrial('coach');
    if (e) { setErr(e); setBusy(false); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}
      className="rounded-[14px] px-3 py-2.5" style={{ background: '#162022', border: '1px solid rgba(255,255,255,.07)' }}>
      {/* Compact, so it fits under the board without scrolling */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-black uppercase tracking-wide" style={{ background: '#E8B447', color: '#1C1C1C' }}>Coach · Pro</span>
        <p className="min-w-0 flex-1 text-[12.5px] font-bold leading-snug text-[#F5F7F6]">Why was this {label}? Your coach explains it.</p>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={() => void go()} disabled={busy} className="flex-1 rounded-xl py-2 text-[13px] font-extrabold disabled:opacity-60" style={{ background: GREEN, color: '#06110A' }}>
          {busy ? 'Opening…' : 'Try Pro free for 3 days'}
        </button>
        {onUpgrade && <button onClick={onUpgrade} className="shrink-0 px-1 text-[12px] font-bold text-[#C9CFCD] underline">What's in Pro</button>}
      </div>
      {err && <p className="mt-1 text-[11.5px] font-bold text-[#FF7A80]">{err}</p>}
    </motion.div>
  );
}

type Mode = { kind: 'main' } | { kind: 'best'; step: number } | { kind: 'reply'; step: number } | { kind: 'retry'; state: 'trying' | 'right' | 'wrong' };

// ── First review after signing up ──────────────────────────────────────────
// The review opens at the move that decided the game (the biggest swing in the
// member's winning chances), and a "what's next" card offers today's puzzles from
// their own mistakes, a live game, and a heads-up when the full report is ready.
const winFor = (cp: number, side: 'w' | 'b') => {
  const w = Math.abs(cp) >= 9000 ? (cp > 0 ? 100 : 0) : 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  return side === 'w' ? w : 100 - w;
};
export function decidingMove(reviewMoves: GuidedReviewMove[], mySide: 'w' | 'b' | null): { ply: number; from: number; to: number; mine: boolean } | null {
  const side = mySide ?? 'w';
  const myColor = side === 'w' ? 'white' : 'black';
  const sorted = [...reviewMoves].sort((a, b) => a.moveIndex - b.moveIndex);
  let prev = 20, best: { ply: number; from: number; to: number; mine: boolean; score: number } | null = null;
  for (const m of sorted) {
    if (typeof m.evalAfterCp !== 'number') continue;
    const from = winFor(prev, side), to = winFor(m.evalAfterCp, side);
    prev = m.evalAfterCp;
    if (!['inaccuracy', 'mistake', 'blunder', 'missed_win'].includes(m.classification)) continue;
    const mine = !mySide || m.color === myColor;
    // the member's own slips first: that's what they can fix
    const score = Math.abs(to - from) * (mine ? 1.5 : 1);
    if (!best || score > best.score) best = { ply: m.moveIndex + 1, from, to, mine, score };
  }
  return best && Math.abs(best.to - best.from) >= 8 ? best : null;
}

function FirstReviewNext({ onDaily, onPlay, onHome, offerTrial }: { onDaily: () => void; onPlay: () => void; onHome: () => void; offerTrial?: boolean }) {
  const { permission, isSubscribed, subscribe, loading } = usePushNotifications();
  // Free accounts that can still take the trial: the offer, inline (not a popup).
  const [eligible, setEligible] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialErr, setTrialErr] = useState('');
  useEffect(() => {
    if (!offerTrial) return;
    let off = false;
    void apiFetch('/api/stripe/trial-offer', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!off && d?.eligible) { setEligible(true); trackFunnelEvent('trial_card_shown'); trialTrack('card_shown'); }
    }).catch(() => {});
    return () => { off = true; };
  }, [offerTrial]);
  const tryPro = async () => {
    trackFunnelEvent('trial_card_clicked');
    trialTrack('card_start');
    setTrialBusy(true); setTrialErr('');
    const e = await startTrial('coach');
    if (e) { setTrialErr(e); setTrialBusy(false); }
  };
  const notifyOn = permission === 'granted' && isSubscribed;
  const canAsk = !notifyOn && permission !== 'denied' && permission !== 'unsupported';
  const row = 'flex w-full items-center gap-3 rounded-[13px] px-3 py-2.5 text-left';
  return (
    <div className="mx-3 mt-2 rounded-[16px] p-3.5" style={{ background: '#162022', border: '1px solid rgba(255,255,255,.08)' }}>
      <p className="text-[15px] font-extrabold text-white">What's next</p>
      <div className="mt-2.5 space-y-2">
        <button onClick={onDaily} className={row} style={{ background: 'rgba(129,182,76,.14)', border: '1px solid rgba(129,182,76,.35)' }}>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-extrabold text-white">Fix it: today's 3 puzzles</span>
            <span className="block text-[12px] leading-snug" style={{ color: '#AEB6B3' }}>Positions from your own games where the better move was there. New ones every day.</span>
          </span>
          <ChevronRight size={18} className="shrink-0" style={{ color: GREEN }} />
        </button>
        <button onClick={onPlay} className={row} style={{ background: 'rgba(255,255,255,.06)' }}>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-extrabold text-white">Play a game now</span>
            <span className="block text-[12px] leading-snug" style={{ color: '#AEB6B3' }}>Find a live opponent here or on Lichess, and it's reviewed when you're done.</span>
          </span>
          <ChevronRight size={18} className="shrink-0" style={{ color: '#C9CFCD' }} />
        </button>
      </div>
      {eligible && (
        <div className="mt-3 rounded-[13px] px-3 py-3" style={{ background: '#1D2628', border: '1px solid rgba(232,180,71,.35)' }}>
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-black uppercase tracking-wide" style={{ background: '#E8B447', color: '#1C1C1C' }}>Pro</span>
            <span className="text-[14px] font-extrabold text-white">Your coach on every move</span>
          </div>
          <p className="mt-1 text-[12.5px] leading-snug" style={{ color: '#AEB6B3' }}>What you did well and what you missed, in plain English, on every game; your weak spots across all your games; courses built from your own mistakes.</p>
          <button onClick={() => void tryPro()} disabled={trialBusy} className="mt-2.5 w-full rounded-xl py-2.5 text-[13.5px] font-extrabold disabled:opacity-60" style={{ background: GREEN, color: '#06110A' }}>
            {trialBusy ? 'Opening…' : 'Try Pro free for 3 days'}
          </button>
          <p className="mt-1.5 text-center text-[11px]" style={{ color: '#87918E' }}>Cancel any time before it ends and you pay nothing.</p>
          {trialErr && <p className="mt-1 text-[11.5px] font-bold text-[#FF7A80]">{trialErr}</p>}
        </div>
      )}
      <div className="mt-3 rounded-[13px] px-3 py-2.5" style={{ background: 'rgba(255,255,255,.04)' }}>
        <p className="text-[12.5px] leading-snug" style={{ color: '#C9CFCD' }}>
          Your other games are being reviewed now, and your report (strengths, weak spots, what to train) builds from them.
          {notifyOn ? ' We’ll let you know when it’s ready.' : canAsk ? ' Turn on notifications and we’ll tell you when it’s ready.' : ''}
        </p>
        {canAsk && (
          <button onClick={() => { void subscribe(); }} disabled={loading} className="mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-extrabold text-white disabled:opacity-60" style={{ background: 'linear-gradient(180deg,#81B64C,#5F8F36)' }}>
            <Bell size={14} /> Turn on notifications
          </button>
        )}
      </div>
      <button onClick={onHome} className="mt-2.5 text-[12.5px] font-bold underline" style={{ color: '#87918E' }}>Go to my dashboard</button>
    </div>
  );
}

export function GuidedReview({ moves, startFen, reviewMoves, ply, setPly, flipped, onFlip, whiteName, blackName, accuracy, result, onExit, onReport, onBack, endExtra, coachPending = false, coachProgress = null, liveEvals = null, status = 'ready', progress, errorText, onRetryReview, canFullAnalysis = true, onUpgrade, canRemix = false, firstReview = false, mySide = null }: GuidedReviewProps) {
  // Remix (admin, for content): a new random board and piece set on every move.
  const [remixOn, setRemixOn] = useState(false);
  const remixLooks = useRef(new Map<number, BoardLook>());
  // Full analysis (with the AI coach) is Pro: members go there, others to the Pro page.
  const openFull = canFullAnalysis ? onExit : (onUpgrade ?? onExit);
  const openReport = canFullAnalysis ? (onReport ?? onExit) : (onUpgrade ?? onExit);
  const max = moves.length;
  const [mode, setMode] = useState<Mode>({ kind: 'main' });
  const [, navigateTo] = useLocation();
  // First review: jump to the deciding move once the review is in.
  const [decisive, setDecisive] = useState<{ ply: number; from: number; to: number; mine: boolean } | null>(null);
  const decisiveDone = useRef(false);
  useEffect(() => {
    if (!firstReview || decisiveDone.current || status !== 'ready' || reviewMoves.length === 0) return;
    decisiveDone.current = true;
    const d = decidingMove(reviewMoves, mySide);
    if (d) { setDecisive(d); setPly(d.ply); }
  }, [firstReview, status, reviewMoves, mySide, setPly]);
  const [seenDecisive, setSeenDecisive] = useState(false);
  // Stepping onto the last move (checkmate or the final position): the Pro report opens by itself
  // a few seconds later. Going back to an earlier move first cancels it.
  const lastPly = useRef(ply);
  useEffect(() => {
    const was = lastPly.current; lastPly.current = ply;
    if (IN_FRAME || !canFullAnalysis || !onReport || mode.kind !== 'main' || moves.length === 0 || ply !== moves.length || was >= ply) return undefined;
    const t = window.setTimeout(() => onReport(), 3500);
    return () => window.clearTimeout(t);
  }, [ply, mode.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const [expanded, setExpanded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const byIndex = useMemo(() => new Map(reviewMoves.map((r) => [r.moveIndex, r])), [reviewMoves]);
  const fenAt = useCallback((n: number) => (n <= 0 ? startFen : moves[n - 1]?.fen ?? startFen), [moves, startFen]);
  const rev = ply > 0 ? byIndex.get(ply - 1) ?? null : null;
  const move = ply > 0 ? moves[ply - 1] : null;
  const fenBefore = ply > 0 ? (move?.fenBefore || fenAt(ply - 1)) : startFen;
  const isWhiteMove = ply > 0 && (rev ? rev.color === 'white' : new Chess(normalizeFen(fenBefore)).turn() === 'w');
  const bad = !!rev && BAD.has(rev.classification);

  // Leaving a move resets the side views.
  useEffect(() => { setMode({ kind: 'main' }); setExpanded(false); }, [ply]);

  const go = useCallback((n: number) => {
    const next = Math.max(0, Math.min(max, n));
    if (next === ply) return;
    if (next === ply + 1 && moves[next - 1]?.san) soundFor(moves[next - 1].san);
    setPly(next);
  }, [max, ply, moves, setPly]);

  // Hold an arrow to speed through the moves (quietly: only a single step plays the move sound).
  const plyRef = useRef(ply);
  plyRef.current = ply;
  const holdStep = (d: 1 | -1) => (repeat: boolean) => {
    const target = Math.max(0, Math.min(max, plyRef.current + d));
    if (target === plyRef.current) return false;
    // A buzz for every move the pieces make, forwards or back, held or tapped
    // (a single step forward already buzzes from the board itself).
    const san = moves[(d === 1 ? target : plyRef.current) - 1]?.san ?? '';
    if (repeat || d === -1) vibrateFor(san.includes('+') || san.includes('#') ? 'check' : san.includes('x') ? 'capture' : 'move');
    if (repeat) { plyRef.current = target; setPly(target); } else go(target);
    return true;
  };
  const holdPrev = useHoldRepeat(holdStep(-1));
  const holdNext = useHoldRepeat(holdStep(1));

  // Keyboard and swipe.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(ply + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(ply - 1); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [go, ply]);
  // Game alerts ask (every 5th review, see GameAlerts): this game's review was looked at.
  const seenSent = useRef(false);
  useEffect(() => {
    if (seenSent.current || status !== 'ready' || !reviewMoves.length) return;
    const id = window.location.pathname.match(/\/games\/([^/?#]+)/)?.[1];
    if (!id) return;
    seenSent.current = true;
    window.dispatchEvent(new CustomEvent('cs:review-seen', { detail: id }));
  }, [status, reviewMoves.length]);

  // Streamer Studio remote: when this review is shown inside the Studio's board panel, the
  // Studio steers it (moves, mistakes, flip) from controls outside the stream picture,
  // and this tells it where we are. Only active inside a frame on the same site.
  useEffect(() => {
    if (!IN_FRAME) return undefined;
    const post = () => {
      try {
        window.parent.postMessage({
          src: 'cs-review', ply, total: max, flipped, white: whiteName ?? '', black: blackName ?? '',
          moves: moves.map((m, i) => ({ san: m.san, cls: byIndex.get(i)?.classification ?? null })),
        }, window.location.origin);
      } catch { /* parent gone */ }
    };
    post();
    const badAt = (i: number) => { const c = byIndex.get(i)?.classification; return !!c && BAD.has(c); };
    const h = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const m = e.data as { src?: string; cmd?: string; n?: number; d?: number } | null;
      if (!m || m.src !== 'cs-remote') return;
      if (m.cmd === 'hello') post();
      else if (m.cmd === 'go' && typeof m.n === 'number') go(m.n);
      else if (m.cmd === 'step' && typeof m.d === 'number') go(ply + m.d);
      else if (m.cmd === 'flip') onFlip();
      else if (m.cmd === 'mistake' && typeof m.d === 'number') {
        // plies are 1-based: move index i is shown at ply i + 1
        if (m.d > 0) { for (let i = ply; i < max; i++) if (badAt(i)) { go(i + 1); return; } }
        else { for (let i = ply - 2; i >= 0; i--) if (badAt(i)) { go(i + 1); return; } go(0); }
      }
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [ply, max, flipped, moves, byIndex, go, onFlip, whiteName, blackName]);
  useEffect(() => () => { if (IN_FRAME) try { window.parent.postMessage({ src: 'cs-review', gone: true }, window.location.origin); } catch { /* */ } }, []);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { if (mode.kind === 'retry') return; touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current; touch.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
    // swipe right = next move, swipe left = back
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(ply + (dx > 0 ? 1 : -1));
  };

  // What the board shows.
  const lastMoveOf = (n: number) => {
    if (n <= 0) return null;
    const m = moves[n - 1];
    if (m?.from && m?.to) return { from: m.from, to: m.to };
    const r = m?.san ? sanToSquares(m.fenBefore || fenAt(n - 1), m.san) : null;
    return r ? { from: r.from, to: r.to } : null;
  };
  const bestApplied = rev?.betterMove ? sanToSquares(fenBefore, rev.betterMove) : null;
  const line = useMemo(() => {
    const out: { san: string; from: string; to: string; fen: string }[] = [];
    let f = fenBefore;
    for (const san of rev?.bestLineSan ?? []) { const r = sanToSquares(f, san); if (!r) break; out.push({ san, ...r }); f = r.fen; }
    return out;
  }, [fenBefore, rev?.bestLineSan]);

  // Best: the better move and the engine's next few moves after it.
  const bestLine = useMemo(() => {
    if (line.length && (!rev?.betterMove || line[0].san === rev.betterMove)) return line;
    return bestApplied && rev?.betterMove ? [{ san: rev.betterMove, ...bestApplied }] : [];
  }, [line, bestApplied, rev?.betterMove]);

  // What the engine expects next, from the position after this move.
  const replyLine = useMemo(() => {
    const out: { san: string; from: string; to: string; fen: string }[] = [];
    if (ply <= 0) return out;
    let f = fenAt(ply);
    for (const san of rev?.replyLineSan ?? []) { const r = sanToSquares(f, san); if (!r) break; out.push({ san, ...r }); f = r.fen; }
    return out;
  }, [ply, fenAt, rev?.replyLineSan]);

  // The reply this move allows (the engine's choice for the other side next).
  const replyArrow = useMemo(() => {
    if (!rev || !bad || ply >= max) return null;
    const next = byIndex.get(ply);
    const nm = moves[ply];
    const san = next && GOOD_REPLY.has(next.classification) ? nm?.san : next?.betterMove;
    if (!san) return null;
    const r = sanToSquares(fenAt(ply), san);
    return r ? { from: r.from, to: r.to, color: 'rgba(66,153,225,0.85)' } : null;
  }, [rev, bad, ply, max, byIndex, moves, fenAt]);

  let boardFen = fenAt(ply);
  let lastMove = lastMoveOf(ply);
  let quality: MoveQuality | null = rev?.classification ?? null;
  let arrows: { from: string; to: string; color?: string }[] = [];
  if (mode.kind === 'main') {
    if (bad && bestApplied) arrows.push({ from: bestApplied.from, to: bestApplied.to, color: 'rgba(129,182,76,0.9)' });
    if (replyArrow) arrows.push(replyArrow);
  } else if (mode.kind === 'best' && bestLine.length) {
    const step = Math.min(mode.step, bestLine.length - 1);
    boardFen = bestLine[step].fen; lastMove = { from: bestLine[step].from, to: bestLine[step].to }; quality = step === 0 ? 'best' : null; arrows = [];
  } else if (mode.kind === 'reply' && replyLine.length) {
    const step = Math.min(mode.step, replyLine.length - 1);
    boardFen = replyLine[step].fen; lastMove = { from: replyLine[step].from, to: replyLine[step].to }; quality = null; arrows = [];
  } else if (mode.kind === 'retry') {
    boardFen = fenBefore; lastMove = ply > 1 ? lastMoveOf(ply - 1) : null; quality = null; arrows = [];
  }
  const cpNow = mode.kind === 'main' ? (ply === 0 ? 20 : rev?.evalAfterCp ?? (typeof liveEvals?.[ply] === 'number' ? liveEvals[ply] : null)) : rev?.evalAfterCp ?? null;

  // Best: play the line through, one move at a time (tap a move to jump to it).
  const [autoPlay, setAutoPlay] = useState(true);
  useEffect(() => {
    if ((mode.kind !== 'best' && mode.kind !== 'reply') || !autoPlay) return;
    const l = mode.kind === 'best' ? bestLine : replyLine;
    if (mode.step >= l.length - 1) return;
    const kind = mode.kind;
    const t = setTimeout(() => { soundFor(l[mode.step + 1].san); setMode({ kind, step: mode.step + 1 }); }, 1100);
    return () => clearTimeout(t);
  }, [mode, bestLine, replyLine, autoPlay]);

  // ── The coach's bubble ─────────────────────────────────────────────────
  const counts = useMemo(() => {
    const keys: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'missed_win', 'blunder'];
    const c = (color: 'white' | 'black') => Object.fromEntries(keys.map((k) => [k, reviewMoves.filter((m) => m.color === color && m.classification === k).length])) as Record<Classification, number>;
    return { keys, white: c('white'), black: c('black') };
  }, [reviewMoves]);

  // Top card: short, fixed height (so the board never moves). Under the
  // board: the fuller explanation and extras for the same move.
  const H = 'text-[15px] font-extrabold text-[#F5F7F6]';
  const P = 'text-[13.5px] leading-snug text-[#C9CFCD]';
  const pieceName: Record<string, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' };
  const chipsFor = (kind: 'best' | 'reply', l: { san: string; fen: string }[], start: string, minLen: number) => l.length >= minLen && (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-[13.5px] text-[#C9CFCD]">
      {l.map((m, i) => {
        const w = new Chess(normalizeFen(i === 0 ? start : l[i - 1].fen)).turn() === 'w';
        const on = mode.kind === kind && i === mode.step;
        return (
          <button key={i} onClick={() => { setAutoPlay(false); if (mode.kind !== kind) soundFor(m.san); setMode({ kind, step: i }); }}
            className={`rounded px-1.5 py-0.5 ${on ? 'bg-[#81B64C]/25 font-bold text-[#F5F7F6]' : 'bg-white/5'}`}>
            {figurine(m.san, w)}
          </button>
        );
      })}
      {mode.kind === kind
        ? <button onClick={() => { setAutoPlay(true); soundFor(l[0].san); setMode({ kind, step: 0 }); }} className="ml-1 text-[12px] font-bold text-[#81B64C]">Replay</button>
        : <button onClick={() => { setAutoPlay(true); soundFor(l[0].san); setMode({ kind, step: 0 }); }} className="ml-1 text-[12px] font-bold text-[#81B64C]">Play</button>}
    </div>
  );
  const lineChips = chipsFor('best', bestLine, fenBefore, 2);
  const L = 'text-[11.5px] font-bold uppercase tracking-wide text-[#87918E]';

  let top: React.ReactNode = null;
  let detail: React.ReactNode = null;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  if (status === 'loading' && !rev) {
    top = (<><p className={H}>Loading your review…</p><p className={`mt-0.5 ${P}`}>Just a moment.</p></>);
  } else if (status === 'preparing' && !rev) {
    top = (
      <>
        {progress && progress.total > 0 && progress.done >= progress.total ? (<>
          {/* The engine has finished every move; what's left is the coach writing its notes. */}
          <p className={H}>Almost there…</p>
          <p className={`mt-0.5 ${P}`}>Stockfish has checked every move. {canFullAnalysis ? 'Your coach is writing the notes, usually under a minute.' : 'Putting your review together.'}</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-full animate-pulse rounded-full" style={{ background: GREEN }} /></div>
        </>) : (<>
          <p className={H}>Reviewing your game…</p>
          <p className={`mt-0.5 ${P}`}>{progress ? `Move ${Math.ceil(progress.done / 2)} of ${Math.ceil(progress.total / 2)}` : 'Starting the engine'}. You can look through the moves meanwhile.</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(5, pct)}%`, background: GREEN }} /></div>
        </>)}
      </>
    );
  } else if (status === 'error' && !rev) {
    top = (
      <>
        <p className={H}>Couldn't review this game</p>
        <div className="mt-1 flex items-center gap-2">
          <p className={`min-w-0 flex-1 truncate ${P}`}>{errorText || 'Something went wrong.'}</p>
          {onRetryReview && <button onClick={onRetryReview} className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-bold text-white" style={{ background: GREEN }}>Try again</button>}
        </div>
      </>
    );
  } else if (ply === 0 && mode.kind === 'main') {
    top = (<><p className={H}>Let's review your game</p><p className={`mt-0.5 ${P}`}>Move by move. Tap Next, or swipe the board.</p></>);
  } else if (mode.kind === 'best' && rev?.betterMove) {
    top = (
      <>
        <div className="flex items-center gap-2"><Badge cls="best" /><p className={`flex-1 truncate ${H}`}>{figurine(rev.betterMove, isWhiteMove)} was best</p></div>
        <p className={`mt-1 line-clamp-2 ${P}`}>Instead of {figurine(rev.san, isWhiteMove)}. Watch the engine's line play out.</p>
      </>
    );
    detail = (
      <>
        <p className="text-[12px] font-bold uppercase tracking-wide text-[#87918E]">Engine line</p>
        {lineChips || <p className={`mt-1 ${P}`}>{figurine(rev.betterMove, isWhiteMove)}</p>}
        <p className={`mt-2 ${P}`}>{rev.explanation}</p>
      </>
    );
  } else if (mode.kind === 'reply' && rev && move) {
    top = (
      <>
        <p className={`truncate ${H}`}>{bad ? 'How this gets punished' : 'What the engine expects next'}</p>
        <p className={`mt-1 line-clamp-2 ${P}`}>The engine's main line after {figurine(move.san, isWhiteMove)}. Tap a move to stop on it.</p>
      </>
    );
    detail = (
      <>
        <p className={L}>Engine line</p>
        {chipsFor('reply', replyLine, fenAt(ply), 1)}
        <p className={`mt-2 text-[12.5px] ${P}`}>{standing(rev.evalAfterCp)}</p>
      </>
    );
  } else if (mode.kind === 'retry') {
    top = mode.state === 'right' ? (
      <>
        <div className="flex items-center gap-2"><Badge cls="best" /><p className={H}>That's it!</p></div>
        <p className={`mt-1 line-clamp-2 ${P}`}>{rev?.betterMove ? `${figurine(rev.betterMove, isWhiteMove)} is the best move here.` : 'Well found.'}</p>
      </>
    ) : (
      <><p className={H}>{mode.state === 'wrong' ? 'Not quite. Try again' : 'Find a better move'}</p><p className={`mt-0.5 ${P}`}>{isWhiteMove ? 'White' : 'Black'} to move. Drag a piece to try.</p></>
    );
    const p0 = rev?.betterMove?.[0] ?? '';
    detail = mode.state === 'right' ? (rev ? <p className={P}>{rev.explanation}</p> : null) : (
      <p className={P}><b className="text-[#F5F7F6]">Hint:</b> it's a {pieceName[p0] ?? 'pawn'} move{rev?.betterMove?.includes('x') ? ' that captures' : ''}{rev?.betterMove?.includes('+') ? ', with check' : ''}.</p>
    );
  } else if (rev && move) {
    const t = splitText(rev.explanation);
    const ev = evalLabel(rev.evalAfterCp);
    top = (
      <>
        <div className="flex items-center gap-2">
          <Badge cls={rev.classification} />
          <p className={`min-w-0 flex-1 truncate ${H}`}>{figurine(move.san, isWhiteMove)} {CLS[rev.classification].phrase}</p>
          {ev && <span className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-[13px] font-extrabold tabular-nums text-[#F5F7F6]">{ev}</span>}
        </div>
        {expanded
          ? <p className={`mt-1 ${P}`}>{rev.explanation}</p>
          : (t.top || t.rest) && <p className={`mt-1 line-clamp-2 ${P}`}>{t.top || t.rest}{t.top && t.rest && <span className="ml-1 font-bold text-[#81B64C]">More</span>}</p>}
      </>
    );
    // AI-coached reviews (Pro): the coach's full explanation and its pros and
    // cons go in a card under the board, as before. Free reviews have neither.
    const aiCoached = !!(rev.pros?.length || rev.cons?.length || rev.coachTake);
    if (aiCoached) {
      const take = rev.coachTake || null;
      detail = (
        <>
          <p className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-[#87918E]">Coach</p>
          {t.rest && <p className={P}>{t.rest}</p>}
          <div className={`${t.rest ? 'mt-2' : ''} grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-3`}>
            <div className="min-w-0">
              {!!rev.pros?.length && (
                <ul className="space-y-0.5">{rev.pros.map((x, i) => <li key={i} className={`flex gap-1.5 ${P}`}><span className="text-[#81B64C]">+</span>{x}</li>)}</ul>
              )}
              {!!rev.cons?.length && (
                <ul className="mt-1.5 space-y-0.5">{rev.cons.map((x, i) => <li key={i} className={`flex gap-1.5 ${P}`}><span className="text-[#F0605D]">−</span>{x}</li>)}</ul>
              )}
            </div>
            {/* the two sides weighed up in plain English */}
            {take && <p className={`min-w-0 border-l border-white/15 pl-3 ${P}`}>{take}</p>}
          </div>
        </>
      );
    }
  } else if (move) {
    top = <p className={H}>{figurine(move.san, isWhiteMove)}</p>;
  }
  const accent = mode.kind === 'reply' ? '#4299E1' : mode.kind === 'best' || (mode.kind === 'retry' && mode.state === 'right') ? CLS.best.color : rev && mode.kind === 'main' ? CLS[rev.classification].color : GREEN;
  const animKey = `${ply}-${mode.kind}-${mode.kind === 'retry' ? mode.state : ''}`;
  // For Streamer Studio's board-only view: what the note says, as data (see data-studio below).
  const studioCls = mode.kind === 'best' || (mode.kind === 'retry' && mode.state === 'right') ? 'best' : rev && move && mode.kind === 'main' && ply > 0 ? rev.classification : null;
  const studioEval = rev && move && mode.kind === 'main' && ply > 0 ? evalLabel(rev.evalAfterCp) ?? '' : '';
  const studioMain = !!(rev && move && mode.kind === 'main' && ply > 0);
  const studioText = studioMain ? rev!.explanation ?? '' : '';
  const studioPros = studioMain ? JSON.stringify(rev!.pros ?? []) : '[]', studioCons = studioMain ? JSON.stringify(rev!.cons ?? []) : '[]';

  const atEnd = ply >= max && mode.kind === 'main';
  // Went through the whole game: a moment the Pro offer can follow (free accounts only).
  const endMarked = useRef(false);
  useEffect(() => {
    if (!atEnd || endMarked.current || canFullAnalysis || status !== 'ready' || max < 2) return;
    endMarked.current = true;
    markValueMoment('review');
  }, [atEnd, canFullAnalysis, status, max]);
  let look: BoardLook | null = null;
  if (remixOn) { look = remixLooks.current.get(ply) ?? randomLook(); remixLooks.current.set(ply, look); }
  const canExpand = mode.kind === 'main' && !!rev && ply > 0 && !!splitText(rev.explanation).rest;

  // ── Move strip ─────────────────────────────────────────────────────────
  const stripRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = activeRef.current, box = stripRef.current;
    if (!el || !box) return;
    box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [ply]);

  const startFenTurnWhite = new Chess(normalizeFen(startFen)).turn() === 'w';
  const startNo = parseInt(startFen.split(' ')[5] || '1', 10) || 1;

  // ── Buttons ─────────────────────────────────────────────────────────────
  const canBest = bad && bestLine.length > 0;
  const canRetry = bad && !!rev?.betterMove;
  const next = () => {
    if (mode.kind !== 'main') { setMode({ kind: 'main' }); return; }
    go(ply + 1);
  };

  const tool = (label: string, icon: React.ReactNode, on: boolean, enabled: boolean, onClick: () => void) => (
    <button onClick={onClick} disabled={!enabled}
      className="flex w-[64px] flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11.5px] font-bold transition-colors disabled:opacity-30"
      style={{ color: on ? GREEN : '#C9CFCD', background: on ? 'rgba(129,182,76,.12)' : 'transparent' }}>
      {icon}{label}
    </button>
  );

  const resultLine = (() => {
    if (result === '1-0') return `${whiteName} won`;
    if (result === '0-1') return `${blackName} won`;
    if (result === '1/2-1/2' || result === 'draw') return 'Draw';
    if (result === 'win') return 'You won';
    if (result === 'loss') return 'You lost';
    return null;
  })();

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: BG }}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button onClick={onBack} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-xl text-white active:scale-95"><ArrowLeft size={22} /></button>
        <div className="flex-1 text-center">
          <p className="text-[18px] font-black text-white">Game Review</p>
          {coachPending && <p className="-mt-0.5 animate-pulse text-[11.5px] font-semibold" style={{ color: GREEN }}>{coachProgress && coachProgress.done > 0 ? `Coach notes: ${coachProgress.done} of ${coachProgress.total} moves` : 'Coach notes on the way…'}</p>}
        </div>
        {canRemix && (
          <button onClick={() => { remixLooks.current.clear(); setRemixOn((v) => !v); }} aria-label="Remix board and pieces" title="Remix: a random board and pieces on every move"
            className="grid h-10 w-10 place-items-center rounded-xl active:scale-95" style={{ color: remixOn ? GREEN : '#C9CFCD', background: remixOn ? 'rgba(129,182,76,.15)' : 'transparent' }}>
            <Sparkles size={20} />
          </button>
        )}
        <button onClick={onFlip} aria-label="Flip board" className="grid h-10 w-10 place-items-center rounded-xl text-[#C9CFCD] active:scale-95"><FlipVertical2 size={20} /></button>
        <button onClick={openFull} aria-label="Full analysis (Pro)" title="Full analysis (Pro)" className="relative grid h-10 w-10 place-items-center rounded-xl text-[#C9CFCD] active:scale-95">
          <ListTree size={20} />
          {!canFullAnalysis && <span className="absolute -right-0.5 top-0.5 rounded px-0.5 text-[8px] font-black" style={{ background: '#E8B447', color: '#1C1C1C' }}>PRO</span>}
        </button>
      </div>

      {/* Phones: one column. Wide desktop (lg): board on the left, the coach, summary, moves and buttons on the right. */}
      <div className="mx-auto flex w-full max-w-[560px] min-h-0 flex-1 flex-col lg:grid lg:max-w-[1180px] lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_minmax(0,1fr)_auto_auto] lg:gap-x-6 lg:px-6 lg:pb-4">
        {/* Top card: fixed height so the board never shifts */}
        <div data-studio="coach" data-accent={accent} data-glyph={studioCls ? CLS[studioCls].glyph : ''} data-glyphcolor={studioCls ? CLS[studioCls].color : ''} data-eval={studioEval} data-text={studioText} data-pros={studioPros} data-cons={studioCons} className="relative z-20 h-[92px] shrink-0 px-3 pb-2 pt-1 lg:col-start-2 lg:row-start-1 lg:px-0">
          {/* Tap to read the whole explanation; it opens over the board, so nothing moves. */}
          <div onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
            className={`absolute inset-x-3 top-1 overflow-hidden rounded-[14px] px-3.5 py-2.5 ${expanded ? 'min-h-[84px] shadow-2xl' : 'h-[84px]'} ${canExpand ? 'cursor-pointer' : ''}`}
            style={{ background: '#162022', border: '1px solid rgba(255,255,255,.07)', borderLeft: `4px solid ${accent}` }}>
            {/* The new note fades in straight away (no waiting for the old one to leave, which
                left a note stuck on screen when skipping quickly through the moves). */}
            <motion.div key={animKey} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }}>
              {top}
            </motion.div>
          </div>
        </div>
        {/* Board with eval bar */}
        {/* Desktop: board, eval bar and material keep one width that fits the window height. */}
        <div className="cs-review-board shrink-0 px-1.5 lg:col-start-1 lg:row-span-4 lg:row-start-1 lg:self-start lg:pt-1" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className="min-w-0">
            <LookOverride look={look}>
            <ChessBoard
              key={mode.kind === 'retry' ? `retry-${retryKey}` : 'review'}
              fen={boardFen}
              flipped={flipped}
              lastMove={lastMove}
              moveQuality={quality}
              arrows={arrows}
              maxWidthOverride="100%"
              animationMs={260}
              suppressConfirmMoves
              practiceMode={mode.kind === 'retry' && mode.state !== 'right'}
              expectedMoveSan={mode.kind === 'retry' ? rev?.betterMove ?? null : null}
              onMovePlayed={(_san, ok) => {
                if (mode.kind !== 'retry') return;
                if (ok) setMode({ kind: 'retry', state: 'right' });
                else { setMode({ kind: 'retry', state: 'wrong' }); setTimeout(() => setRetryKey((k) => k + 1), 900); }
              }}
            />
            </LookOverride>
          </div>
          {/* Evaluation bar, then the material each side has won (Streamer Studio shows these
              beside a board-only view: data-studio marks them) */}
          <div data-studio="evalnames" data-cp={cpNow ?? ''} data-white={whiteName} data-black={blackName}>
          <div className="mt-1.5 px-0.5"><EvalBarH cp={cpNow} /></div>
          <div className="mt-1 flex items-center justify-between gap-2 px-1 text-[11.5px] text-[#C9CFCD]">
            <span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-bold">{whiteName}</span><MaterialStrip fen={boardFen} color="w" /></span>
            <span className="flex min-w-0 items-center justify-end gap-1.5"><MaterialStrip fen={boardFen} color="b" /><span className="truncate font-bold">{blackName}</span></span>
          </div>
          </div>
        </div>

        {/* Between the board and the move strip: the start and end summaries (scrolls if tall). */}
        <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto pb-1 lg:col-start-2 lg:row-start-2 lg:[&>div]:mx-0">
        {/* Free accounts, on a move that cost something: where Pro's coach notes go, what the
            coach would tell them (Pro reviews are untouched: this needs !canFullAnalysis). */}
        {!canFullAnalysis && !detail && bad && mode.kind === 'main' && ply > 0 && status === 'ready' && (
          <div className="px-3 pt-2">
            <CoachTeaser key={animKey} label={({ inaccuracy: 'an inaccuracy', mistake: 'a mistake', blunder: 'a blunder', missed_win: 'a missed win' } as Record<string, string>)[rev!.classification] ?? 'a mistake'} onUpgrade={onUpgrade} />
          </div>
        )}

        {/* More from the coach about this move */}
        {detail && (
          <div className="px-3 pt-2">
            <motion.div key={animKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}
              className="rounded-[14px] px-3.5 py-3" style={{ background: '#162022', border: '1px solid rgba(255,255,255,.07)' }}>
              {detail}
            </motion.div>
          </div>
        )}

        {/* The whole game at a glance, the same on every move */}
        {/* Free only: Pro gets the AI coach card here instead. */}
        {!canFullAnalysis && ply > 0 && mode.kind === 'main' && reviewMoves.length > 0 && (() => {
          const keys = (['brilliant', 'great', 'best', 'inaccuracy', 'mistake', 'missed_win', 'blunder'] as Classification[])
            .filter((k) => counts.white[k] || counts.black[k] || k === 'best' || k === 'mistake' || k === 'blunder');
          const row = (name: string, acc: number | null, side: 'white' | 'black') => (
            <div className="flex items-center gap-2">
              <span className="w-[72px] truncate text-[12.5px] font-bold text-white">{name}</span>
              <span className="w-[34px] text-[17px] font-black tabular-nums text-white">{acc != null ? Math.round(acc) : '–'}</span>
              <div className="flex flex-1 items-center justify-end gap-2.5">
                {keys.map((k) => (
                  <span key={k} className="flex w-[30px] items-center justify-end gap-1 text-[12.5px] font-bold tabular-nums" style={{ color: counts[side][k] ? (CLS[k].textColor ?? '#E7ECEA') : '#55605D' }}>
                    {counts[side][k]}<Badge cls={k} size={14} />
                  </span>
                ))}
              </div>
            </div>
          );
          return (
            <div className="mx-3 mt-2 rounded-[14px] px-3 py-2.5" style={{ background: '#162022', border: '1px solid rgba(255,255,255,.07)' }}>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#87918E]">Game rating · accuracy</p>
              <div className="space-y-1.5">
                {row(whiteName, accuracy?.white ?? null, 'white')}
                {row(blackName, accuracy?.black ?? null, 'black')}
              </div>
            </div>
          );
        })()}

        {/* First review: the deciding move, then what's next */}
        {decisive && ply === decisive.ply && mode.kind === 'main' && (
          <div className="mx-3 mt-2 rounded-[16px] p-3.5" style={{ background: '#162022', border: '1px solid rgba(255,255,255,.08)' }}>
            <p className="text-[15px] font-extrabold text-white">{decisive.mine ? 'This is the move that decided your game' : 'This is where the game turned'}</p>
            <p className="mt-1 text-[13px]" style={{ color: '#AEB6B3' }}>
              Your winning chances: <b className="tabular-nums text-white">{Math.round(decisive.from)}%</b> → <b className="tabular-nums" style={{ color: decisive.to < decisive.from ? '#FF7A80' : GREEN }}>{Math.round(decisive.to)}%</b>
            </p>
            {canRetry && decisive.mine && (
              <button onClick={() => { setSeenDecisive(true); setMode({ kind: 'retry', state: 'trying' }); }} className="mt-2.5 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-extrabold text-white" style={{ background: 'linear-gradient(180deg,#81B64C,#5F8F36)' }}>
                <RotateCcw size={14} /> Find the better move
              </button>
            )}
          </div>
        )}
        {firstReview && status === 'ready' && mode.kind === 'main' && ((decisive && (ply === decisive.ply || seenDecisive)) || atEnd) && (
          <FirstReviewNext offerTrial={!canFullAnalysis} onDaily={() => navigateTo('/daily-three')} onPlay={() => navigateTo('/play')} onHome={() => navigateTo('/')} />
        )}
        {/* End of game summary */}
        {atEnd && (
          <div className="mx-3 mt-2 rounded-[16px] p-3" style={{ background: '#162022', border: '1px solid rgba(255,255,255,.08)' }}>
            <p className="text-[15px] font-extrabold text-white">{resultLine ?? 'Game over'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => setPly(0)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>Start over</button>
              <button onClick={() => { const i = reviewMoves.filter((m) => BAD.has(m.classification)).sort((a, b) => a.moveIndex - b.moveIndex)[0]; if (i) setPly(i.moveIndex + 1); }}
                className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>First mistake</button>

            </div>
          </div>
        )}
        {atEnd && endExtra}

        {/* Opening summary: who played how (start of the review) */}
        {ply === 0 && mode.kind === 'main' && reviewMoves.length > 0 && (
          <div className="mx-3 mt-2 overflow-hidden rounded-[16px]" style={{ background: '#162022', border: '1px solid rgba(255,255,255,.08)' }}>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2 text-[12.5px] font-bold text-white">
              <span className="truncate">{whiteName}</span><span className="text-[#87918E]">Accuracy</span><span className="truncate text-right">{blackName}</span>
              {accuracy && <>
                <span className="text-[20px] font-black">{Math.round(accuracy.white)}</span><span />
                <span className="text-right text-[20px] font-black">{Math.round(accuracy.black)}</span>
              </>}
            </div>
            <div className="grid grid-cols-[2rem_1fr_2rem] gap-y-1 border-t border-white/5 px-3 py-2 text-[12.5px]">
              {counts.keys.filter((k) => counts.white[k] || counts.black[k]).map((k) => (
                <React.Fragment key={k}>
                  <span className="text-center font-bold" style={{ color: CLS[k].textColor ?? '#E7ECEA' }}>{counts.white[k]}</span>
                  <span className="flex items-center justify-center gap-1.5 capitalize text-[#C9CFCD]"><Badge cls={k} size={16} />{k === 'missed_win' ? 'Miss' : k}</span>
                  <span className="text-center font-bold" style={{ color: CLS[k].textColor ?? '#E7ECEA' }}>{counts.black[k]}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        </div>

        {/* Move strip */}
        <div className="flex shrink-0 items-center gap-1 px-1 py-2 lg:col-start-2 lg:row-start-3 lg:min-w-0">
          <button {...holdPrev} disabled={ply <= 0} aria-label="Previous move" className="grid h-10 w-9 shrink-0 place-items-center text-[#C9CFCD] disabled:opacity-25"><ChevronLeft size={26} /></button>
          <div ref={stripRef} className="hide-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scroll-smooth">
            {moves.map((m, i) => {
              const r = byIndex.get(i);
              const white = (i % 2 === 0) === startFenTurnWhite;
              const no = startNo + Math.floor((i + (startFenTurnWhite ? 0 : 1)) / 2);
              const active = ply === i + 1;
              const c = r ? CLS[r.classification] : null;
              return (
                <React.Fragment key={i}>
                  {(white || i === 0) && <span className="shrink-0 pl-1.5 text-[15px] text-[#87918E]">{no}.{!white ? '..' : ''}</span>}
                  <button ref={active ? activeRef : undefined} onClick={() => go(i + 1)}
                    className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[16px] font-bold"
                    style={{ color: c?.textColor ?? '#E7ECEA', background: active ? 'rgba(255,255,255,.10)' : 'transparent', boxShadow: active ? `inset 0 -2px 0 ${GREEN}` : 'none' }}>
                    {r && c?.strip && r.classification !== 'good' && <Badge cls={r.classification} size={18} />}
                    {figurine(m.san, white)}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
          <button {...holdNext} disabled={ply >= max} aria-label="Next move" className="grid h-10 w-9 shrink-0 place-items-center text-[#C9CFCD] disabled:opacity-25"><ChevronRight size={26} /></button>
        </div>

        {/* Bottom bar */}
        <div className="flex shrink-0 items-center gap-1 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 lg:col-start-2 lg:row-start-4 lg:px-0">
          {tool('Best', <Star size={21} />, mode.kind === 'best', canBest, () => { if (mode.kind === 'best') setMode({ kind: 'main' }); else { setAutoPlay(true); soundFor(bestLine[0].san); setMode({ kind: 'best', step: 0 }); } })}
          {tool('Retry', <RotateCcw size={21} />, mode.kind === 'retry', canRetry, () => setMode(mode.kind === 'retry' ? { kind: 'main' } : { kind: 'retry', state: 'trying' }))}
          <button onClick={atEnd && mode.kind === 'main' ? openReport : next}
            className="relative ml-auto flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-[14px] text-[18px] font-black text-white transition-transform active:scale-[0.98]"
            style={{ background: `linear-gradient(180deg, #8FC25A, ${GREEN})`, boxShadow: '0 4px 0 #5F8F36' }}>
            {mode.kind !== 'main' ? <><X size={18} /> Back to game</> : ply === 0 ? (status === 'ready' ? 'Start review' : 'Next') : atEnd ? <span className="text-[clamp(14px,4.4vw,18px)]">Continue to Pro report</span> : 'Next'}
            {/* Free accounts: the same PRO badge as the full-analysis icon above */}
            {!canFullAnalysis && atEnd && mode.kind === 'main' && <span className="absolute -right-1 -top-2 rounded-md px-1.5 py-0.5 text-[10px] font-black shadow" style={{ background: '#E8B447', color: '#1C1C1C' }}>PRO</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
