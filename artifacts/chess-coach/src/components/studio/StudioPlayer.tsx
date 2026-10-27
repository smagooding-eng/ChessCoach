import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Chess } from 'chess.js';
import { X, Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Shuffle, Video, Square, Eye, EyeOff, FlipVertical2, Trash2 } from 'lucide-react';
import { ChessBoard, type MoveQuality } from '@/components/ChessBoard';
import { LookOverride, randomLook, lookLabel, playMoveSound, type BoardLook } from '@/context/SettingsContext';
import { apiFetch } from '@/lib/api';
import { normalizeFen } from '@/lib/utils';

// Content Studio player: one game moment in a 9:16 frame made for TikTok,
// Reels and Shorts. Autoplays from a few moves before the key move, can stop
// for "can you find it?" with a countdown, pops the move's badge, throws
// confetti on brilliant moves and mates, shakes on blunders, and can put a
// new random board and piece set on every move. Stickers drag anywhere in the
// frame. "Record clip" captures just the frame (Chrome on a computer); on a
// phone, "Clean view" hides everything but the frame for the screen recorder.

export interface StudioMoment {
  gameId: number; moveIndex: number; tags: string[]; classification: string | null; san: string;
  trapName: string | null; opening: string | null; white: string | null; black: string | null;
  whiteRating: number | null; blackRating: number | null; platform: string | null;
}
interface ReviewMove { moveIndex: number; san: string; color: 'white' | 'black'; classification?: string; explanation?: string; betterMove?: string | null; evalAfterCp?: number; fen?: string }
interface StudioGame { id: number; pgn: string; opening: string | null; white: string; black: string; whiteRating: number | null; blackRating: number | null; moves: ReviewMove[] }
interface Ply { san: string; from: string; to: string; fen: string; fenBefore: string; color: 'w' | 'b'; review?: ReviewMove }
interface Sticker { id: number; text: string; x: number; y: number; size: number; kind: 'emoji' | 'text' }

const LABEL: Record<string, { text: string; color: string; glyph: string }> = {
  brilliant: { text: 'BRILLIANT', color: '#1BACA6', glyph: '!!' }, great: { text: 'GREAT MOVE', color: '#4A8BD6', glyph: '!' },
  best: { text: 'BEST', color: '#5FA83A', glyph: '★' }, excellent: { text: 'EXCELLENT', color: '#7DB94A', glyph: '!' },
  good: { text: 'GOOD', color: '#8AA86E', glyph: '✓' }, book: { text: 'BOOK', color: '#A88865', glyph: '📖' },
  inaccuracy: { text: 'INACCURACY', color: '#E3AE2A', glyph: '?!' }, mistake: { text: 'MISTAKE', color: '#E5822A', glyph: '?' },
  blunder: { text: 'BLUNDER', color: '#CA3431', glyph: '??' }, missed_win: { text: 'MISSED WIN', color: '#B8343E', glyph: '✗' },
  checkmate: { text: 'CHECKMATE', color: '#E8B447', glyph: '#' },
};
const BACKGROUNDS: Record<string, { label: string; css: React.CSSProperties }> = {
  dark: { label: 'Dark', css: { background: '#0B1112' } },
  green: { label: 'ChessScout', css: { background: 'radial-gradient(120% 80% at 50% 0%, #2E4A1E 0%, #0E1A0C 60%, #070B06 100%)' } },
  purple: { label: 'Purple', css: { background: 'linear-gradient(160deg, #2A1446 0%, #0F0A1F 100%)' } },
  sunset: { label: 'Sunset', css: { background: 'linear-gradient(170deg, #4A1E14 0%, #1A0B10 70%)' } },
  screen: { label: 'Green screen', css: { background: '#00FF00' } },
};
const EMOJIS = ['🔥', '😱', '🤯', '🧠', '👀', '💀', '🏆', '♟️', '⚡', '🎯', '😂', '🤔'];
const TEXT_STICKERS = ['BRILLIANT!!', 'BLUNDER??', 'WAIT FOR IT…', 'NO WAY', 'GG', 'FIND THE MOVE', 'TRAP!', 'MATE'];

function hookFor(m: StudioMoment): string {
  if (m.tags.includes('trap') && m.trapName) return `The ${m.trapName} 🪤`;
  if (m.tags.includes('brilliant')) return 'Find the brilliant move 🔥';
  if (m.tags.includes('checkmate')) return 'How fast can you see the mate? ♟️';
  if (m.tags.includes('sacrifice')) return 'Would you give this up? 😳';
  if (m.tags.includes('fork')) return 'The fork nobody saw coming 🍴';
  if (m.tags.includes('skewer') || m.tags.includes('pin')) return 'Pinned and punished 📌';
  if (m.tags.includes('missed_win')) return 'One move from winning… 😩';
  if (m.tags.includes('blunder')) return 'One move ruined everything 😱';
  return 'Watch this 👀';
}

function buildPlies(g: StudioGame): Ply[] {
  const out: Ply[] = [];
  const fenTag = g.pgn?.match(/\[FEN "([^"]+)"\]/)?.[1];
  const startFen = g.moves[0]?.fen ?? (fenTag ? normalizeFen(fenTag) : undefined);
  // The review's own move list, or the PGN's moves when there's no review.
  const sans = g.moves.length
    ? g.moves.map((m) => m.san)
    : (g.pgn ?? '').replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').split(/\s+/)
        .map((t) => t.replace(/^\d+\.+/, '')).filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  try {
    const c = startFen ? new Chess(startFen) : new Chess();
    sans.forEach((san, i) => {
      const fenBefore = c.fen();
      const m = c.move(san);
      if (!m) throw new Error('bad move');
      out.push({ san: m.san, from: m.from, to: m.to, fen: c.fen(), fenBefore, color: m.color as 'w' | 'b', review: g.moves[i] });
    });
  } catch { /* keep the moves that played */ }
  return out;
}

function figurine(san: string, white: boolean): string {
  const map: Record<string, string> = white ? { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' } : { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' };
  return san.replace(/^[KQRBN]/, (p) => map[p] ?? p);
}

function Confetti({ fire }: { fire: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!fire) return;
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const W = (cv.width = cv.offsetWidth * 2), H = (cv.height = cv.offsetHeight * 2);
    const colors = ['#81B64C', '#E8B447', '#1BACA6', '#FFFFFF', '#F0605D', '#4A8BD6'];
    const parts = Array.from({ length: 160 }, () => ({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.45, vx: (Math.random() - 0.5) * 26, vy: -Math.random() * 30 - 10, r: Math.random() * 10 + 6, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6 }));
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

export function StudioPlayer({ moment, onClose }: { moment: StudioMoment; onClose: () => void }) {
  const [game, setGame] = useState<StudioGame | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    apiFetch(`/api/admin/studio/game/${moment.gameId}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Game not found'))))
      .then(setGame).catch((e) => setErr(String(e?.message ?? e)));
  }, [moment.gameId]);
  const plies = useMemo(() => (game ? buildPlies(game) : []), [game]);
  const keyPly = moment.moveIndex + 1; // the position after the key move

  // ── Clip settings ───────────────────────────────────────────────────────
  const [hook, setHook] = useState(() => hookFor(moment));
  const [sub, setSub] = useState(() => moment.opening ?? '');
  const [before, setBefore] = useState(8);
  const [after, setAfter] = useState(5);
  const [speed, setSpeed] = useState(1.2);
  const [guess, setGuess] = useState(true);
  const [remix, setRemix] = useState(true);
  const [fixedLook, setFixedLook] = useState<BoardLook | null>(null);
  const [showNames, setShowNames] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [effects, setEffects] = useState(true);
  const [arrow, setArrow] = useState(true);
  const [sound, setSound] = useState(true);
  const [watermark, setWatermark] = useState(true);
  const [bg, setBg] = useState<keyof typeof BACKGROUNDS>('green');
  const [flipped, setFlipped] = useState(() => (moment.moveIndex % 2 === 1));
  const [clean, setClean] = useState(false);

  const startPly = Math.max(0, keyPly - 1 - before);
  const endPly = Math.min(plies.length, keyPly + after);
  const [ply, setPly] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pop, setPop] = useState<{ cls: string; at: number } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [shake, setShake] = useState(0);
  const looks = useRef(new Map<number, BoardLook>());
  useEffect(() => { if (plies.length) setPly(startPly); }, [plies.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const look: BoardLook | null = remix ? (looks.current.get(ply) ?? (() => { const l = randomLook(); looks.current.set(ply, l); return l; })()) : fixedLook;

  const cur = ply > 0 ? plies[ply - 1] : null;
  const rev = cur?.review;
  const cls = (cur?.san.includes('#') ? 'checkmate' : rev?.classification) ?? null;
  const isKey = ply === keyPly;

  // Effects when a move lands.
  const land = useCallback((p: number) => {
    const m = p > 0 ? plies[p - 1] : null;
    if (!m) return;
    if (sound) playMoveSound(m.san.includes('#') || m.san.includes('+') ? 'check' : m.san.startsWith('O-O') ? 'castle' : m.san.includes('=') ? 'promote' : m.san.includes('x') ? 'capture' : 'move');
    if (!effects) return;
    const c = m.san.includes('#') ? 'checkmate' : m.review?.classification;
    if (p === keyPly || (c && ['brilliant', 'great', 'blunder', 'missed_win', 'checkmate'].includes(c))) {
      if (c) setPop({ cls: c, at: Date.now() });
      if (c === 'brilliant' || c === 'great' || c === 'checkmate') setConfetti(Date.now());
      if (c === 'blunder' || c === 'missed_win') setShake(Date.now());
    }
  }, [plies, sound, effects, keyPly]);

  const goTo = useCallback((p: number) => { const n = Math.max(0, Math.min(plies.length, p)); setPly(n); if (n > 0) land(n); }, [plies.length, land]);

  // Autoplay, with the guess-the-move stop before the key move.
  useEffect(() => {
    if (!playing || countdown !== null) return;
    if (ply >= endPly) { setPlaying(false); return; }
    const t = setTimeout(() => {
      if (guess && ply === keyPly - 1) { setCountdown(3); return; }
      goTo(ply + 1);
    }, ply === startPly ? 900 : speed * 1000);
    return () => clearTimeout(t);
  }, [playing, ply, endPly, keyPly, startPly, speed, guess, countdown, goTo]);
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) { setCountdown(null); goTo(keyPly); return; }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, goTo, keyPly]);

  const restart = () => { looks.current.clear(); setCountdown(null); setPly(startPly); setPlaying(true); };

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
      const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 10_000_000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: type || 'video/webm' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `chessscout-${moment.gameId}-${moment.moveIndex}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      };
      track.addEventListener('ended', () => { if (rec.state !== 'inactive') rec.stop(); });
      recRef.current = rec;
      rec.start(250);
      setRecording(true);
      setTimeout(restart, 600);
    } catch {
      setRecNote('Recording needs Chrome on a computer. On a phone, use "Clean view" and your screen recorder.');
    }
  };
  // Stop a recording a moment after the clip ends.
  useEffect(() => {
    if (!recording || playing || ply < endPly) return;
    const t = setTimeout(() => recRef.current?.state === 'recording' && recRef.current.stop(), 1500);
    return () => clearTimeout(t);
  }, [recording, playing, ply, endPly]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') { if (clean) setClean(false); else onClose(); }
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === 'ArrowRight') goTo(ply + 1);
      if (e.key === 'ArrowLeft') setPly(Math.max(0, ply - 1));
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) setStickers((s) => s.filter((x) => x.id !== selected));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [clean, onClose, goTo, ply, selected]);

  if (err) return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-6 text-white" onClick={onClose}><p>{err}</p></div>
  );

  const fen = cur ? cur.fen : plies[0]?.fenBefore ?? new Chess().fen();
  // Best move arrow on the key position after the reveal, when the key move wasn't the best.
  const arrows = arrow && isKey && rev?.betterMove && cls && ['blunder', 'mistake', 'missed_win', 'inaccuracy'].includes(cls)
    ? (() => { try { const c = new Chess(plies[keyPly - 1].fenBefore); const m = c.move(rev.betterMove!); return m ? [{ from: m.from, to: m.to, color: 'rgba(129,182,76,0.9)' }] : []; } catch { return []; } })()
    : [];
  const ev = rev?.evalAfterCp;
  const evPct = ev == null ? 50 : Math.abs(ev) >= 9000 ? (ev > 0 ? 100 : 0) : Math.max(4, Math.min(96, 50 + 50 * (2 / (1 + Math.exp(-ev / 400)) - 1)));
  const name = (side: 'w' | 'b') => {
    const n = side === 'w' ? moment.white : moment.black; const r = side === 'w' ? moment.whiteRating : moment.blackRating;
    return `${showNames && n ? n : side === 'w' ? 'White' : 'Black'}${r ? ` (${r})` : ''}`;
  };
  const top = flipped ? 'w' : 'b';
  const moveNo = cur ? `${Math.floor((ply - 1) / 2) + 1}${cur.color === 'w' ? '.' : '...'}` : '';
  const caption = captions && cur ? rev?.explanation : null;
  const label = cls ? LABEL[cls] : null;

  const ctl = 'rounded-lg bg-white/10 px-2.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-white/15';
  const toggle = (on: boolean, set: (v: boolean) => void, text: string) => (
    <button onClick={() => set(!on)} className="rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: on ? 'rgba(129,182,76,.25)' : 'rgba(255,255,255,.06)', color: on ? '#B8E08C' : '#C9CFCD', border: `1px solid ${on ? 'rgba(129,182,76,.5)' : 'rgba(255,255,255,.1)'}` }}>{text}</button>
  );

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#05080A] text-white lg:flex-row" onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }}>
      {/* ── The 9:16 frame ── */}
      <div className={`flex min-h-0 flex-1 items-center justify-center ${clean ? 'p-0' : 'p-3'}`} onClick={() => setSelected(null)}>
        <div ref={frameRef} className="relative overflow-hidden"
          style={{ aspectRatio: '9 / 16', height: clean ? '100dvh' : 'min(100%, 92dvh)', maxWidth: '100%', containerType: 'size', ...BACKGROUNDS[bg].css } as React.CSSProperties}>
        <motion.div key={shake} animate={shake ? { x: [0, -14, 12, -8, 6, 0] } : {}} transition={{ duration: 0.45 }} className="absolute inset-0">
          {/* Hook */}
          <div className="absolute inset-x-0 top-[7%] z-10 px-[6%] text-center">
            <p className="font-black leading-[1.08] text-white" style={{ fontSize: 'clamp(18px, 4.6cqh, 44px)', textShadow: '0 3px 14px rgba(0,0,0,.6)' }}>{hook}</p>
            {sub && <p className="mt-1.5 text-[clamp(11px,1.8cqh,18px)] font-bold text-white/70">{sub}</p>}
          </div>
          {/* Board block */}
          <div className="absolute inset-x-[4%] top-[22%]">
            <p className="mb-1 truncate text-[clamp(11px,1.6cqh,16px)] font-bold text-white/85">{name(top)}</p>
            <motion.div animate={effects && isKey ? { scale: [1, 1.04, 1] } : { scale: 1 }} transition={{ duration: 0.6 }}>
              <LookOverride look={look}>
                <ChessBoard fen={fen} flipped={flipped} lastMove={cur ? { from: cur.from, to: cur.to } : null} moveQuality={(cls as MoveQuality) ?? null}
                  arrows={arrows} maxWidthOverride="100%" animationMs={Math.min(450, speed * 300)} suppressConfirmMoves />
              </LookOverride>
            </motion.div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#2B2B2B]"><div className="h-full rounded-full bg-[#F2F2F2] transition-all duration-500" style={{ width: `${evPct}%` }} /></div>
            <p className="mt-1 truncate text-[clamp(11px,1.6cqh,16px)] font-bold text-white/85">{name(top === 'w' ? 'b' : 'w')}</p>
          </div>
          {/* Move caption */}
          {cur && (
            <div className="absolute inset-x-[5%] bottom-[9%] z-10">
              <div className="flex items-center gap-2">
                {label && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-black text-white" style={{ background: label.color }}>{label.glyph}</span>}
                <p className="truncate text-[clamp(14px,2.4cqh,24px)] font-black text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,.6)' }}>
                  {moveNo}{figurine(cur.san, cur.color === 'w')}{label && cls !== 'book' && cls !== 'good' ? <span style={{ color: label.color }}> {label.text.toLowerCase()}</span> : null}
                </p>
              </div>
              {caption && <p className="mt-1 line-clamp-3 text-[clamp(12px,1.9cqh,19px)] font-semibold leading-snug text-white/90" style={{ textShadow: '0 2px 8px rgba(0,0,0,.6)' }}>{caption}</p>}
            </div>
          )}
          {watermark && <p className="absolute inset-x-0 bottom-[3%] z-10 text-center text-[clamp(10px,1.5cqh,15px)] font-black tracking-wide text-white/75">chessscout.net</p>}
          {/* Countdown */}
          <AnimatePresence>
            {countdown !== null && countdown > 0 && (
              <motion.div key={countdown} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.35 }}
                className="absolute inset-0 z-20 grid place-items-center">
                <div className="text-center">
                  <p className="text-[clamp(16px,2.6cqh,26px)] font-black text-white" style={{ textShadow: '0 2px 10px rgba(0,0,0,.7)' }}>Can you find it?</p>
                  <p className="font-black text-white" style={{ fontSize: 'clamp(60px,14cqh,150px)', textShadow: '0 4px 20px rgba(0,0,0,.7)' }}>{countdown}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Badge pop */}
          <AnimatePresence>
            {pop && LABEL[pop.cls] && Date.now() - pop.at < 1800 && (
              <motion.div key={pop.at} initial={{ scale: 0, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }} exit={{ scale: 1.3, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 14 }} onAnimationComplete={() => setTimeout(() => setPop(null), 1100)}
                className="pointer-events-none absolute left-1/2 top-[44%] z-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl px-5 py-2.5 text-center font-black text-white shadow-2xl"
                style={{ background: LABEL[pop.cls].color, fontSize: 'clamp(22px,4.4cqh,46px)', border: '3px solid rgba(255,255,255,.9)' }}>
                {LABEL[pop.cls].glyph} {LABEL[pop.cls].text}
              </motion.div>
            )}
          </AnimatePresence>
          {effects && <Confetti fire={confetti} />}
          {/* Stickers */}
          {stickers.map((st) => (
            <div key={st.id} onPointerDown={(e) => { e.stopPropagation(); const fr = frameRef.current!.getBoundingClientRect(); drag.current = { id: st.id, dx: ((e.clientX - fr.left) / fr.width) * 100 - st.x, dy: ((e.clientY - fr.top) / fr.height) * 100 - st.y }; setSelected(st.id); }}
              onDoubleClick={() => setStickers((s) => s.filter((x) => x.id !== st.id))}
              className="absolute z-40 -translate-x-1/2 -translate-y-1/2 cursor-grab select-none touch-none"
              style={{ left: `${st.x}%`, top: `${st.y}%`, outline: selected === st.id && !clean ? '2px dashed rgba(255,255,255,.7)' : 'none', outlineOffset: 4 }}>
              {st.kind === 'emoji'
                ? <span style={{ fontSize: `${st.size * 0.5}cqh`, lineHeight: 1 }}>{st.text}</span>
                : <span className="block whitespace-nowrap rounded-xl px-3 py-1 font-black text-white" style={{ fontSize: `${st.size * 0.4}cqh`, background: '#F0605D', border: '3px solid #fff', transform: 'rotate(-6deg)', boxShadow: '0 6px 20px rgba(0,0,0,.4)' }}>{st.text}</span>}
            </div>
          ))}
        </motion.div>
          {clean && <button onClick={() => setClean(false)} aria-label="Show controls" className="absolute left-0 top-0 z-50 h-16 w-16 opacity-0" />}
        </div>
      </div>

      {/* ── Controls ── */}
      {!clean && (
        <div className="max-h-[46dvh] w-full shrink-0 overflow-y-auto border-t border-white/10 bg-[#0B1112] p-4 lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[15px] font-black">Clip</p>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"><X size={18} /></button>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <button onClick={() => setPlaying((p) => !p)} className="flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[13px] font-black text-white">{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pause' : 'Play'}</button>
            <button onClick={restart} className={ctl}><RotateCcw size={14} className="mr-1 inline" />From start</button>
            <button onClick={() => setPly(Math.max(0, ply - 1))} className={ctl} aria-label="Back"><ChevronLeft size={15} /></button>
            <button onClick={() => goTo(ply + 1)} className={ctl} aria-label="Forward"><ChevronRight size={15} /></button>
            <button onClick={() => setFlipped((f) => !f)} className={ctl} aria-label="Flip"><FlipVertical2 size={14} /></button>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button onClick={record} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-black text-white" style={{ background: recording ? '#CA3431' : '#2A3335' }}>
              {recording ? <Square size={14} /> : <Video size={14} />}{recording ? 'Stop recording' : 'Record clip'}
            </button>
            <button onClick={() => setClean(true)} className={ctl}><EyeOff size={14} className="mr-1 inline" />Clean view</button>
          </div>
          {recNote && <p className="mb-3 text-[12px] text-[#E8B447]">{recNote}</p>}

          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-white/50">Hook</label>
          <input value={hook} onChange={(e) => setHook(e.target.value)} className="mb-2 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white outline-none ring-1 ring-white/10 focus:ring-[#81B64C]" />
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-white/50">Subtitle</label>
          <input value={sub} onChange={(e) => setSub(e.target.value)} className="mb-3 w-full rounded-lg bg-white/5 px-3 py-2 text-[13px] text-white outline-none ring-1 ring-white/10 focus:ring-[#81B64C]" />

          <div className="mb-3 grid grid-cols-3 gap-2 text-[12px]">
            <label className="text-white/60">Moves before<input type="number" min={0} max={30} value={before} onChange={(e) => setBefore(Number(e.target.value))} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" /></label>
            <label className="text-white/60">Moves after<input type="number" min={0} max={30} value={after} onChange={(e) => setAfter(Number(e.target.value))} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" /></label>
            <label className="text-white/60">Sec / move<input type="number" min={0.4} max={4} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="mt-0.5 w-full rounded bg-white/5 px-2 py-1 text-white" /></label>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {toggle(remix, (v) => { looks.current.clear(); setRemix(v); }, 'Remix board every move')}
            {toggle(guess, setGuess, 'Pause: find the move')}
            {toggle(effects, setEffects, 'Pop, confetti, shake')}
            {toggle(captions, setCaptions, 'Coach caption')}
            {toggle(arrow, setArrow, 'Best-move arrow')}
            {toggle(showNames, setShowNames, 'Player names')}
            {toggle(sound, setSound, 'Move sounds')}
            {toggle(watermark, setWatermark, 'Watermark')}
          </div>
          {!remix && (
            <div className="mb-3 flex items-center gap-2">
              <button onClick={() => setFixedLook(randomLook())} className={ctl}><Shuffle size={14} className="mr-1 inline" />Random look</button>
              <button onClick={() => setFixedLook(null)} className={ctl}>My board</button>
            </div>
          )}
          {look && <p className="-mt-1 mb-3 text-[11.5px] text-white/50">{lookLabel(look)}</p>}

          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Background</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(Object.keys(BACKGROUNDS) as (keyof typeof BACKGROUNDS)[]).map((k) => (
              <button key={k} onClick={() => setBg(k)} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ border: `1px solid ${bg === k ? '#81B64C' : 'rgba(255,255,255,.12)'}`, color: bg === k ? '#fff' : '#C9CFCD' }}>
                <span className="h-3.5 w-3.5 rounded-full" style={BACKGROUNDS[k].css} />{BACKGROUNDS[k].label}
              </button>
            ))}
          </div>

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
          <p className="mt-2 text-[11.5px] leading-snug text-white/45">
            Space plays and pauses, arrows step, Esc leaves clean view. "Record clip" saves just the frame (Chrome on a computer: pick this tab, turn on tab audio for move sounds).
            On a phone, open Clean view and use the screen recorder; tap the top-left corner to bring the controls back.
          </p>
          <p className="mt-2 text-[11px] text-white/35"><Eye size={12} className="mr-1 inline" />Game #{moment.gameId} · move {moment.moveIndex + 1}</p>
        </div>
      )}
    </div>
  );
}
