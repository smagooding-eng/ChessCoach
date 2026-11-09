// "Knight's tour" clip for Content Studio: a knight lands on all 64 squares once each, on
// the creator's own board with the regular move sound. Every square it lands on turns
// green or black so that, when the tour is done, the board is the ChessScout logo; then
// chessscout.net appears on the board. Also played by the video maker (render mode).
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, RotateCcw, Maximize2 } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { playMoveSound } from '@/context/SettingsContext';
import { routeSoundsTo } from '@/lib/sounds';
import { StudioMusic } from './studioMusic';
import { RenderMp4 } from './RenderMp4';
import { HookPicker, hookLine } from './HookPicker';

// A complete knight's tour from b1 (checked: 64 different squares, every step a knight move).
export const KNIGHT_TOUR = 'b1 a3 c2 a1 b3 c1 a2 b4 a6 b8 d7 f8 h7 g5 h3 g1 e2 g3 h1 f2 d1 b2 a4 c3 b5 a7 c8 b6 a8 c7 e8 g7 h5 f6 g8 h6 g4 h2 f1 d2 e4 c5 b7 a5 c4 d6 f7 h8 g6 h4 g2 e1 f3 e5 d3 f4 e6 d8 c6 d4 f5 e7 d5 e3'.split(' ');

// The logo as 8×8 squares (rank 8 at the top): the black rook on the green tile.
const LOGO = [
  '........',
  '.#.##.#.',
  '.######.',
  '..####..',
  '..####..',
  '..####..',
  '.######.',
  '........',
];
const GREEN = '#81B64C', BLACK = '#161616';
const colorOf = (sq: string) => {
  const f = sq.charCodeAt(0) - 97, r = Number(sq[1]);
  return LOGO[8 - r][f] === '#' ? BLACK : GREEN;
};
const fenWithKnight = (sq: string | null) => {
  const rows: string[] = [];
  for (let r = 8; r >= 1; r--) {
    let row = '', gap = 0;
    for (let f = 0; f < 8; f++) {
      const here = sq && sq.charCodeAt(0) - 97 === f && Number(sq[1]) === r;
      if (here) { if (gap) row += gap; gap = 0; row += 'N'; } else gap++;
    }
    if (gap) row += gap;
    rows.push(row);
  }
  return `${rows.join('/')} w - - 0 1`;
};

const SPEEDS = { fast: 260, normal: 360, slow: 520 } as const;
type Speed = keyof typeof SPEEDS;
export interface KnightTourOpts { hook: string; speed: Speed }
export const KNIGHT_TOUR_DEFAULT: KnightTourOpts = { hook: 'Can a knight land on all 64 squares… only once each? ♞', speed: 'normal' };

type Phase = 'idle' | 'tour' | 'logo' | 'site' | 'end';

export function KnightTour({ opts: initial = KNIGHT_TOUR_DEFAULT, render = false, onClose }: { opts?: KnightTourOpts; render?: boolean; onClose: () => void }) {
  const [opts, setOpts] = useState<KnightTourOpts>(initial);
  const [step, setStep] = useState(0); // squares landed on so far (1 = the starting square)
  const [phase, setPhase] = useState<Phase>('idle');
  // Squares coloured so far: a square changes only once the knight has landed on it.
  const [painted, setPainted] = useState(0);
  const [clean, setClean] = useState(false);
  const [blank, setBlank] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const music = useRef<StudioMusic | null>(null);
  const mus = () => (music.current ??= new StudioMusic());
  const rec = useRef<MediaRecorder | null>(null);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => { clear(); routeSoundsTo(null, null); music.current?.dispose?.(); }, []);

  const later = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  const play = (onDone?: () => void) => {
    clear();
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); } catch { /* ignore */ }
    const dt = SPEEDS[opts.speed];
    const hop = Math.min(320, dt - 40);
    setPhase('tour'); setStep(1); setPainted(1);
    let t = 900; // a beat on the hook before the first jump
    for (let k = 2; k <= 64; k++) { const n = k; later(t, () => setStep(n)); later(t + hop, () => { setPainted(n); playMoveSound('move'); }); t += dt; }
    t += 500; later(t, () => setPhase('logo'));
    t += 2300; later(t, () => setPhase('site'));
    t += 3200; later(t, () => { setPhase('end'); onDone?.(); });
  };
  const reset = () => { clear(); setPhase('idle'); setStep(0); setPainted(0); };

  // Clean view: 5 seconds of black (time to start a screen recording), then the clip.
  const enterClean = () => { reset(); setClean(true); setBlank(true); later(5000, () => { setBlank(false); play(); }); };

  // ── The video maker ──
  useEffect(() => {
    if (!render) return;
    const w = window as unknown as { __studioRender?: Record<string, unknown> };
    w.__studioRender = { ready: true, done: false, start: () => {
      const m = mus(); routeSoundsTo(m.unlock(), m.sfx);
      const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((x) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(x)) ?? '';
      const chunks: Blob[] = [];
      try {
        const r = new MediaRecorder(m.stream, type ? { mimeType: type, audioBitsPerSecond: 192_000 } : undefined);
        r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        r.onstop = () => {
          const ended = Date.now();
          const fr = new FileReader();
          fr.onload = () => { w.__studioRender = { ...(w.__studioRender ?? {}), audio: String(fr.result).split(',')[1] ?? '', ext: type.includes('mp4') ? 'm4a' : 'webm', endedAt: ended, done: true }; };
          fr.readAsDataURL(new Blob(chunks, { type: type || 'audio/webm' }));
        };
        r.start(500); rec.current = r;
      } catch { /* no audio recording: finish without it */ }
      (w.__studioRender as Record<string, unknown>).startedAt = Date.now();
      play(() => setTimeout(() => {
        if (rec.current?.state === 'recording') rec.current.stop();
        else w.__studioRender = { ...(w.__studioRender ?? {}), endedAt: Date.now(), done: true };
      }, 600));
    } };
  }, [render]); // eslint-disable-line react-hooks/exhaustive-deps

  const visited = KNIGHT_TOUR.slice(0, painted);
  const knightOn = phase === 'tour' || phase === 'idle' ? KNIGHT_TOUR[Math.max(0, step - 1)] : null;
  const marks = useMemo(() => Object.fromEntries(visited.map((sq) => [sq, { text: '', color: 'transparent', tint: colorOf(sq) }])), [painted]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = phase === 'logo' || phase === 'site' || phase === 'end';

  const frame = (
    <div className="relative flex flex-col items-center justify-center overflow-hidden"
      style={{ aspectRatio: '9 / 16', height: clean || render ? '100dvh' : 'min(78dvh, 820px)', maxWidth: '100%', containerType: 'size', background: 'radial-gradient(120% 80% at 50% 35%, #1d2a17 0%, #0d110c 55%, #070807 100%)', color: '#fff' }}
      onClick={() => { if (clean && (phase === 'end' || phase === 'idle')) setClean(false); }}>
      {blank ? null : (<>
        <div className="absolute inset-x-0 top-[9cqh] px-[6cqw] text-center">
          <AnimatePresence mode="wait">
            {!done ? (
              <motion.p key="hook" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="font-black leading-tight" style={{ fontSize: '6.4cqw', textShadow: '0 2px 10px rgba(0,0,0,.6)' }}>{opts.hook}</motion.p>
            ) : (
              <motion.p key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="font-black leading-tight" style={{ fontSize: '7.2cqw', color: GREEN, textShadow: '0 2px 10px rgba(0,0,0,.6)' }}>Every square. Once. ♞</motion.p>
            )}
          </AnimatePresence>
        </div>

        <motion.div className="relative w-[92cqw]" animate={{ scale: phase === 'logo' ? 1.04 : 1 }} transition={{ duration: 0.6 }}>
          <ChessBoard fen={fenWithKnight(knightOn)} practiceMode={false} expectedMoveSan={null} maxWidthOverride="100%" moveFx={Math.min(320, SPEEDS[opts.speed] - 40)} suppressConfirmMoves squareMarks={marks} />
          {/* chessscout.net on the board */}
          <AnimatePresence>
            {(phase === 'site' || phase === 'end') && (
              <motion.div key="site" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pointer-events-none absolute inset-x-0 top-0 z-20 grid aspect-square place-items-center" style={{ background: 'rgba(0,0,0,.38)' }}>
                <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 16 }}
                  className="rounded-[2.5cqw] px-[4cqw] py-[2.5cqw] font-black tracking-tight" style={{ fontSize: '11cqw', background: 'rgba(10,12,10,.82)', boxShadow: '0 8px 30px rgba(0,0,0,.6)' }}>
                  Chess<span style={{ color: GREEN }}>Scout</span>.net
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="absolute inset-x-0 bottom-[10cqh] text-center">
          {phase === 'tour' && <p className="font-black tabular-nums" style={{ fontSize: '6cqw' }}><span style={{ color: GREEN }}>{painted}</span> / 64</p>}
          {(phase === 'site' || phase === 'end') && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="font-bold" style={{ fontSize: '4.6cqw', color: '#cfd5cc' }}>Play, train and get your games reviewed free</motion.p>}
        </div>
      </>)}
    </div>
  );

  if (render || clean) return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">{frame}</div>;
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0B1112]/95 text-white">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 p-4 lg:flex-row lg:items-start">
        <div className="flex w-full items-center justify-between lg:hidden">
          <p className="font-black">Knight's tour → logo</p>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
        </div>
        {frame}
        <div className="w-full max-w-[420px] space-y-3">
          <div className="hidden items-center justify-between lg:flex">
            <p className="text-[17px] font-black">Knight's tour → logo</p>
            <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
          </div>
          <p className="text-[12.5px] text-white/60">The knight lands on all 64 squares once each, on your board with your move sound. Each square it lands on turns green or black, so the finished board is the ChessScout logo, then chessscout.net appears on it.</p>
          <HookPicker topics={['riddle', 'puzzle']} onPick={(h) => setOpts({ ...opts, hook: hookLine(h) })} />
          <label className="block text-[12px] text-white/60">Hook<input value={opts.hook} onChange={(e) => setOpts({ ...opts, hook: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10" /></label>
          <div className="flex flex-wrap gap-1.5">
            {(['fast', 'normal', 'slow'] as const).map((s) => (
              <button key={s} onClick={() => setOpts({ ...opts, speed: s })} className="rounded-full px-3 py-1 text-[12px] font-black" style={{ background: opts.speed === s ? GREEN : 'rgba(255,255,255,.07)' }}>
                {s === 'fast' ? 'Fast (~23s)' : s === 'normal' ? 'Normal (~30s)' : 'Slow (~41s)'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => play()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white">{phase === 'idle' ? <Play size={14} /> : <RotateCcw size={14} />}{phase === 'idle' ? 'Play' : 'Replay'}</button>
            <button onClick={reset} className="rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black">Reset</button>
            <button onClick={enterClean} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black"><Maximize2 size={14} />Clean view</button>
            <RenderMp4 name="chessscout-knights-tour" shareText="A knight on all 64 squares, once each… and it draws our logo ♞ chessscout.net"
              payload={() => ({ source: { kind: 'knightTour', opts }, prefs: {} })} />
          </div>
        </div>
      </div>
    </div>
  );
}
