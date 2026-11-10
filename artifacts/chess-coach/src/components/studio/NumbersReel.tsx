// Chess by the numbers (about 20 seconds, 9:16). Cold open on the end number,
// then "watch it happen": the start board, the 20 real first moves, then a field
// of boards zooming out while a counter speeds through the exact number of
// possible move sequences after each half-move (perft 1–10 from the start:
// 20, 400, 8,902 … 69,352,859,712,417). Then Shannon's 10^120 against the 10^80
// atoms in the observable universe, the personal turn ("your last game was
// probably never played before"), your own patterns, ChessScout, and a comment
// question. Every number is a real count or a named estimate. Also played by the
// video maker.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Maximize2 } from 'lucide-react';
import { playMoveSound, LookOverride } from '@/context/SettingsContext';
import { routeSoundsTo } from '@/lib/sounds';
import { StudioMusic, type MusicStyle } from './studioMusic';
import { RenderMp4 } from './RenderMp4';
import { HookPicker, hookLine } from './HookPicker';
import { ThemedMiniBoard } from '@/components/ThemedMiniBoard';
import { positionsFromSan } from '@/hooks/use-move-browser';
import { Chess } from 'chess.js';
import { reelFrameSize, CaptionBox, LookPicker, useReelLook, type ReelLook } from './reelKit';

export interface NumbersReelOpts { hook: string; personal: string; twist: string; closer: string; question: string; music: MusicStyle; look?: ReelLook }
export const NUMBERS_REEL_DEFAULT: NumbersReelOpts = {
  hook: 'ways a chess game can go in just 10 turns',
  personal: 'Your last game was probably never played before.',
  twist: 'So nobody can memorise chess. You learn your patterns.',
  closer: 'ChessScout finds yours',
  question: 'What was your first move today? 👇',
  music: 'suspense',
};

const G = '#81B64C', BG = '#070B0C', TEXT = '#F5F7F6', MUTED = '#8E9996', GOLD = '#E8B447', BLUE = '#5FA8E8', RED = '#E5484D';
// Exact number of possible move sequences after each half-move from the start (perft 1–10).
const PERFT = [20, 400, 8_902, 197_281, 4_865_609, 119_060_324, 3_195_901_860, 84_998_978_956, 2_439_530_234_167, 69_352_859_712_417];
const START = positionsFromSan([])[0];
// All 20 first moves, each on its own little board.
const FIRST20 = (() => {
  const c = new Chess();
  return c.moves({ verbose: true }).map((m) => { const d = new Chess(); d.move(m.san); return { san: m.san, fen: d.fen(), lastMove: { from: m.from, to: m.to } }; });
})();
// A "turn" is one player's move; 10 turns is 5 moves each.
const WORDS = ['1 turn', '2 turns', '3 turns', '4 turns', '5 turns', '6 turns', '7 turns', '8 turns', '9 turns', '10 turns · 5 moves each'];
// Faster and faster: the count runs away from you.
const PLY_MS = [1500, 1150, 850, 720, 640, 580, 540, 520, 560, 900];
const PATTERNS = ['Hangs a piece after castling', 'Misses knight forks', 'Trades into lost endgames'];

type Scene = 'idle' | 'cold' | 'count' | 'versus' | 'twist' | 'end';
const brand = (t: string) => {
  const m = t.match(/^(.*?)(chess)(scout)(\.net)?(.*)$/i);
  return m ? <>{m[1]}{m[2]}<span style={{ color: G }}>{m[3]}</span>{m[4]}{m[5]}</> : t;
};
const font = { fontFamily: 'Inter, system-ui, sans-serif' } as const;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const Pow = ({ b = 10, e }: { b?: number; e: number }) => <>{b}<sup style={{ fontSize: '0.55em', verticalAlign: '0.75em' }}>{e}</sup></>;
/** Digits in fixed-width slots so the number doesn't wobble while it climbs. */
const Digits = ({ text }: { text: string }) => <>{text.split('').map((ch, k) => <span key={k} style={{ display: 'inline-block', width: ch === ',' ? '0.28em' : '0.6em', textAlign: 'center' }}>{ch}</span>)}</>;

export function NumbersReel({ opts: initial = NUMBERS_REEL_DEFAULT, render = false, onClose }: { opts?: NumbersReelOpts; render?: boolean; onClose: () => void }) {
  const [opts, setOpts] = useState<NumbersReelOpts>({ ...NUMBERS_REEL_DEFAULT, ...initial });
  const [scene, setScene] = useState<Scene>('idle');
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(1); // the counter's displayed value
  const [clean, setClean] = useState(false);
  const [blank, setBlank] = useState(false);
  const [boardPx, setBoardPx] = useState(150);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const music = useRef<StudioMusic | null>(null);
  const mus = () => (music.current ??= new StudioMusic());
  const rec = useRef<MediaRecorder | null>(null);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const at = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  useEffect(() => () => { clear(); music.current?.stop(); routeSoundsTo(null, null); }, []);
  useLayoutEffect(() => {
    const el = frameRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBoardPx(Math.round(el.clientWidth * 0.5)));
    ro.observe(el); return () => ro.disconnect();
  });

  const play = (onDone?: () => void) => {
    clear(); setShown(1);
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); m.stop(); if (opts.music !== 'off') m.start(opts.music); } catch { /* ignore */ }
    const go = (ms: number, s: Scene) => at(ms, () => { setScene(s); setStep(0); if (ms > 0) mus().accent('whoosh'); });
    // Cold open: the end number first, then "watch it happen".
    go(0, 'cold'); at(60, () => mus().accent('impact'));
    at(1300, () => setStep(1));
    // The count: each half-move multiplies everything, faster and faster.
    const t1 = 2300;
    go(t1, 'count');
    let t = t1 + 350;
    PERFT.forEach((target, k) => {
      const from = k ? PERFT[k - 1] : 1;
      const dur = PLY_MS[k];
      at(t, () => { setStep(k + 1); playMoveSound(k >= 8 ? 'capture' : 'move'); if (k === 9) mus().accent('impact'); });
      const frames = 10;
      for (let f = 1; f <= frames; f++) at(t + (f * Math.min(dur * 0.7, 520)) / frames, () => { setShown(from * Math.pow(target / from, f / frames)); if (f === frames && k < 9) mus().accent('tick'); });
      t += dur;
    });
    // 10^120 against 10^80.
    const t2 = t + 300;
    go(t2, 'versus'); at(t2 + 150, () => mus().accent('impact'));
    at(t2 + 1200, () => setStep(1)); at(t2 + 2300, () => { setStep(2); mus().accent('impact'); });
    // Make it personal: your last game, your patterns.
    const t3 = t2 + 3900;
    go(t3, 'twist');
    at(t3 + 1300, () => setStep(1));
    PATTERNS.forEach((_, k) => at(t3 + 2000 + k * 380, () => { setStep(k + 2); mus().accent('tick'); }));
    const t4 = t3 + 2000 + PATTERNS.length * 380 + 1000;
    go(t4, 'end'); at(t4 + 100, () => mus().accent('chime'));
    at(t4 + 1400, () => setStep(1));
    at(t4 + 3600, () => { music.current?.stop(); onDone?.(); });
  };
  useEffect(() => { if (!render) play(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const enterClean = () => { clear(); music.current?.stop(); setClean(true); setBlank(true); setScene('idle'); at(5000, () => { setBlank(false); play(); }); };

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
          const ended = Date.now(); const fr = new FileReader();
          fr.onload = () => { w.__studioRender = { ...(w.__studioRender ?? {}), audio: String(fr.result).split(',')[1] ?? '', ext: type.includes('mp4') ? 'm4a' : 'webm', endedAt: ended, done: true }; };
          fr.readAsDataURL(new Blob(chunks, { type: type || 'audio/webm' }));
        };
        r.start(500); rec.current = r;
      } catch { /* finish without audio */ }
      (w.__studioRender as Record<string, unknown>).startedAt = Date.now();
      play(() => setTimeout(() => {
        if (rec.current?.state === 'recording') rec.current.stop();
        else w.__studioRender = { ...(w.__studioRender ?? {}), endedAt: Date.now(), done: true };
      }, 300));
    } };
  }, [render]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scenes ────────────────────────────────────────────────────────────────
  const big = fmt(PERFT[9]);
  const cold = (
    <div className="flex h-full flex-col items-center justify-center gap-[2.4cqh] px-[5cqw] text-center">
      <motion.p initial={{ scale: 2.6, opacity: 0, filter: 'blur(8px)' }} animate={{ scale: 1, opacity: 1, filter: 'blur(0px)', x: [0, -8, 7, -5, 3, 0] }}
        transition={{ duration: 0.45, x: { delay: 0.4, duration: 0.35 } }}
        className="font-black tabular-nums leading-none" style={{ fontSize: '5.6cqh', color: GOLD, letterSpacing: '-0.02em', textShadow: `0 0 40px ${GOLD}55` }}>{big}</motion.p>
      <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="font-black leading-[1.1]" style={{ fontSize: '4.2cqh', color: TEXT, letterSpacing: '-0.02em' }}>{brand(opts.hook)}</motion.p>
      <motion.p animate={{ opacity: step >= 1 ? 1 : 0, scale: step >= 1 ? 1 : 0.8 }} className="font-black uppercase tracking-[0.2em]" style={{ fontSize: '2.4cqh', color: G }}>Watch it happen</motion.p>
    </div>
  );

  // What fills the middle: the start board, then the 20 real first moves, then a field
  // of tiny boards that zooms out as it multiplies.
  const ply = step;
  const tile = Math.max(0.5, 22 / Math.pow(2.05, Math.max(0, ply - 2))); // cqw per tiny board
  const field = (
    <div className="relative grid place-items-center" style={{ width: '88cqw', height: '50cqh' }}>
      <AnimatePresence mode="wait">
        {ply === 0 && (
          <motion.div key="start" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.25 }}>
            <ThemedMiniBoard fen={START.fen} size={Math.round(boardPx * 1.1)} />
          </motion.div>
        )}
        {ply === 1 && (
          <motion.div key="twenty" className="grid grid-cols-4 gap-[1.6cqw]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.2 }}>
            {FIRST20.map((m, k) => (
              <motion.div key={m.san} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: k * 0.035, type: 'spring', stiffness: 380, damping: 18 }} className="flex flex-col items-center">
                <ThemedMiniBoard fen={m.fen} size={Math.round(boardPx * 0.3)} lastMove={m.lastMove} />
                <span className="font-black" style={{ fontSize: '1.4cqh', color: MUTED }}>{m.san}</span>
              </motion.div>
            ))}
          </motion.div>
        )}
        {ply >= 2 && (
          <motion.div key="field" className="absolute inset-0 overflow-hidden rounded-[2cqh]" initial={{ opacity: 0, scale: 1.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}>
            <div className="absolute inset-0 transition-all duration-500 ease-out" style={{
              // Gaps between boards on top, then a 4×4 checker per board, on a light base.
              backgroundImage: [
                `repeating-linear-gradient(90deg, transparent 0 ${tile * 0.84}cqw, ${BG} ${tile * 0.84}cqw ${tile}cqw)`,
                `repeating-linear-gradient(0deg, transparent 0 ${tile * 0.84}cqw, ${BG} ${tile * 0.84}cqw ${tile}cqw)`,
                'linear-gradient(45deg, #5C7A4A 25%, transparent 25%, transparent 75%, #5C7A4A 75%)',
                'linear-gradient(45deg, #5C7A4A 25%, transparent 25%, transparent 75%, #5C7A4A 75%)',
                'linear-gradient(#DCE3D5, #DCE3D5)',
              ].join(', '),
              backgroundSize: `auto, auto, ${tile * 0.42}cqw ${tile * 0.42}cqw, ${tile * 0.42}cqw ${tile * 0.42}cqw, auto`,
              backgroundPosition: `0 0, 0 0, 0 0, ${tile * 0.21}cqw ${tile * 0.21}cqw, 0 0`,
              opacity: Math.max(0.4, 1 - ply * 0.055),
            }} />
            <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 50%, transparent 30%, ${BG} 92%)` }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
  const shake = ply >= 7 ? { x: [0, -4 - ply, 3 + ply, -2, 0] } : { x: 0 };
  const count = (
    <div className="relative flex h-full flex-col items-center justify-center gap-[1.6cqh] px-[5cqw] text-center">
      <p className="font-black uppercase tracking-[0.14em]" style={{ fontSize: '2cqh', color: MUTED }}>Possible games after</p>
      <AnimatePresence mode="wait">
        <motion.p key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}
          className="-mt-[1cqh] font-black" style={{ fontSize: '3.4cqh', color: TEXT }}>{step ? WORDS[step - 1] : 'the start'}</motion.p>
      </AnimatePresence>
      <motion.p key={`n${step}`} animate={{ scale: [1.12, 1], ...shake }} transition={{ duration: 0.3 }}
        className="font-black leading-none" style={{ fontSize: shown >= 1e12 ? '5.3cqh' : shown >= 1e9 ? '6cqh' : '7.4cqh', color: step >= 9 ? GOLD : G, textShadow: `0 0 34px ${step >= 9 ? GOLD : G}44` }}><Digits text={fmt(shown)} /></motion.p>
      {field}
      <div className="flex gap-[1.2cqw]">
        {PERFT.map((_, k) => <span key={k} className="h-[0.9cqh] w-[5cqw] rounded-full transition-colors duration-200" style={{ background: k < step ? (k >= 8 ? GOLD : G) : 'rgba(255,255,255,.12)' }} />)}
      </div>
      <p className="font-bold" style={{ fontSize: '1.6cqh', color: MUTED }}>Exact counts from the starting position</p>
    </div>
  );

  const versus = (
    <div className="flex h-full flex-col items-center justify-center gap-[3.2cqh] px-[8cqw] text-center">
      <p className="font-black leading-tight" style={{ fontSize: '3.8cqh', color: TEXT }}>A whole game?</p>
      <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 12 }}>
        <p className="font-black leading-none" style={{ fontSize: '14cqh', color: GOLD, textShadow: `0 0 50px ${GOLD}55` }}>~<Pow e={120} /></p>
        <p className="mt-[1cqh] font-bold" style={{ fontSize: '2cqh', color: MUTED }}>possible games (Claude Shannon’s estimate)</p>
      </motion.div>
      <motion.div animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 12 }}>
        <p className="font-black leading-none" style={{ fontSize: '7.5cqh', color: BLUE }}>~<Pow e={80} /></p>
        <p className="mt-[1cqh] font-bold" style={{ fontSize: '2cqh', color: MUTED }}>atoms in the observable universe</p>
      </motion.div>
      <motion.p animate={{ opacity: step >= 2 ? 1 : 0, scale: step >= 2 ? 1 : 0.85 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }} className="font-black leading-tight" style={{ fontSize: '4cqh', color: TEXT }}>
        More games than atoms.
      </motion.p>
    </div>
  );

  const twist = (
    <div className="flex h-full flex-col items-center justify-center gap-[2.8cqh] px-[7cqw] text-center">
      <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="font-black leading-[1.08]" style={{ fontSize: '4.8cqh', color: GOLD, letterSpacing: '-0.02em' }}>{brand(opts.personal)}</motion.p>
      <motion.p animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 10 }} className="font-black leading-[1.12]" style={{ fontSize: '3.6cqh', color: TEXT }}>{brand(opts.twist)}</motion.p>
      <div className="w-full space-y-[1.3cqh]">
        {PATTERNS.map((p, k) => (
          <motion.div key={p} animate={{ opacity: step > k + 1 ? 1 : 0, x: step > k + 1 ? 0 : 30 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="flex items-center gap-[3cqw] rounded-[1.8cqh] px-[4cqw] py-[1.5cqh] text-left" style={{ background: '#141D1F', border: '1px solid #243033' }}>
            <span className="h-[1.4cqh] w-[1.4cqh] shrink-0 rounded-full" style={{ background: [RED, GOLD, BLUE][k] }} />
            <span className="font-extrabold" style={{ fontSize: '2.4cqh', color: TEXT }}>{p}</span>
          </motion.div>
        ))}
      </div>
      <p className="font-bold" style={{ fontSize: '1.7cqh', color: MUTED }}>Examples of patterns a review can find</p>
    </div>
  );

  const end = (
    <div className="flex h-full flex-col items-center justify-center gap-[2.4cqh] px-[7cqw] text-center">
      <motion.p initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="font-black leading-[1.05]" style={{ fontSize: '6.4cqh', color: TEXT, letterSpacing: '-0.03em' }}>{brand(opts.closer)}</motion.p>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="font-black" style={{ fontSize: '4.2cqh', color: TEXT }}>Chess<span style={{ color: G }}>Scout</span>.net</motion.p>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="font-bold" style={{ fontSize: '2.2cqh', color: MUTED }}>Free game reviews</motion.p>
      <motion.p animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 10 }} className="mt-[2cqh] rounded-[1.6cqh] px-[4cqw] py-[1.4cqh] font-black" style={{ fontSize: '2.8cqh', color: '#111', background: G }}>{opts.question}</motion.p>
    </div>
  );

  const look = useReelLook(opts.look, scene, step);
  const body = scene === 'cold' ? cold : scene === 'count' ? count : scene === 'versus' ? versus : scene === 'twist' ? twist : scene === 'end' ? end : null;
  const frame = (
    <div ref={frameRef} className="relative overflow-hidden" style={{ ...font, ...reelFrameSize(clean || render), background: `radial-gradient(ellipse at 50% 30%, #10261A 0%, ${BG} 65%)` }}
      onClick={() => { if (clean && (scene === 'end' || scene === 'idle')) setClean(false); }}>
      {!blank && (
        <AnimatePresence mode="wait">
          <motion.div key={scene} className="absolute inset-0" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.3 }}><LookOverride look={look}>{body}</LookOverride></motion.div>
        </AnimatePresence>
      )}
      {!blank && scene !== 'idle' && scene !== 'end' && (
        <p className="absolute inset-x-0 bottom-[3cqh] text-center font-black" style={{ fontSize: '2.2cqh', color: 'rgba(245,247,246,.55)' }}>Chess<span style={{ color: G }}>Scout</span>.net</p>
      )}
    </div>
  );

  if (render || clean) return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">{frame}</div>;
  const input = (k: 'hook' | 'personal' | 'twist' | 'closer' | 'question', label: string) => (
    <label className="block text-[12px] text-white/60">{label}<input value={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10" /></label>
  );
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0B1112]/95 text-white">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 p-4 lg:flex-row lg:items-start">
        <div className="flex w-full items-center justify-between lg:hidden">
          <p className="font-black">Chess by the numbers</p>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
        </div>
        {frame}
        <div className="w-full max-w-[420px] space-y-3">
          <div className="hidden items-center justify-between lg:flex">
            <p className="text-[17px] font-black">Chess by the numbers</p>
            <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
          </div>
          <p className="text-[12.5px] text-white/60">About 20 seconds. Opens on the end number (69,352,859,712,417) slamming in, then “Watch it happen”: the start board, all 20 real first moves on their own boards, then a field of boards zooming out as the count speeds up through the exact totals to 10 turns (5 moves each). Then Shannon’s 10¹²⁰ against the 10⁸⁰ atoms in the universe, the personal turn, your patterns, ChessScout, and a comment question to finish.</p>
          {input('hook', 'Under the big number (the hook)')}
          <HookPicker topics={['riddle', 'improve']} label="Pick a line for the personal turn" onPick={(h) => setOpts({ ...opts, personal: hookLine(h) })} />
          {input('personal', 'The personal turn')}
          {input('twist', 'The lesson')}
          {input('closer', 'Closing line')}
          {input('question', 'Comment question at the end')}
          <label className="block text-[12px] text-white/60">Music
            <select value={opts.music} onChange={(e) => setOpts({ ...opts, music: e.target.value as MusicStyle })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10">
              {(['suspense', 'epic', 'hype', 'lofi', 'playful', 'off'] as MusicStyle[]).map((m) => <option key={m} value={m} className="bg-[#0B1112]">{m === 'off' ? 'No music' : m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
          </label>
          <LookPicker value={opts.look} onChange={(v) => setOpts({ ...opts, look: v })} />
          <CaptionBox text={`There are about 10^120 possible chess games, and only about 10^80 atoms in the observable universe. After just five moves each there are already 69,352,859,712,417 ways the game could have gone.\n\nSo unless it ended early, your last game was probably a first. You can't memorise chess, but you can learn your own patterns. Free game reviews at chessscout.net ♟️\n\n#chess #chesstok #chessfacts #shannonnumber #chessscout`} />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => play()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white"><Play size={14} />Replay</button>
            <button onClick={enterClean} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black"><Maximize2 size={14} />Clean view</button>
            <RenderMp4 name="chessscout-chess-numbers" shareText="More possible chess games than atoms in the universe · chessscout.net ♟️" payload={() => ({ source: { kind: 'numbersReel', opts }, prefs: {} })} />
          </div>
        </div>
      </div>
    </div>
  );
}
