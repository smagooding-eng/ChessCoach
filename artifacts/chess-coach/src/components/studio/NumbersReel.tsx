// "Your last game was probably never played before" (about 24 seconds, 9:16).
// A real game's first ten moves play on the board while a counter climbs through
// the true number of possible move sequences after each one (perft from the
// starting position: 20, 400, 8,902 … 69,352,859,712,417), the tiles behind it
// shrink as they multiply, then Shannon's 10^120 against the 10^80 atoms in the
// observable universe, then the turn: nobody can memorise chess, you learn your
// own patterns, and ChessScout finds yours. Every number is a real count or a
// well-known estimate (named on screen). Also played by the video maker.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Maximize2 } from 'lucide-react';
import { playMoveSound } from '@/context/SettingsContext';
import { routeSoundsTo } from '@/lib/sounds';
import { StudioMusic, type MusicStyle } from './studioMusic';
import { RenderMp4 } from './RenderMp4';
import { HookPicker, hookLine } from './HookPicker';
import { ThemedMiniBoard } from '@/components/ThemedMiniBoard';
import { positionsFromSan } from '@/hooks/use-move-browser';

export interface NumbersReelOpts { hook: string; sub: string; twist: string; closer: string; music: MusicStyle }
export const NUMBERS_REEL_DEFAULT: NumbersReelOpts = {
  hook: 'Your last game was probably never played before',
  sub: 'Not by anyone. Not once. Ever.',
  twist: 'So nobody can memorise chess. You learn your patterns.',
  closer: 'ChessScout finds yours',
  music: 'suspense',
};

const G = '#81B64C', BG = '#070B0C', TEXT = '#F5F7F6', MUTED = '#8E9996', GOLD = '#E8B447', BLUE = '#5FA8E8';
// Exact number of possible move sequences after each half-move from the start (perft 1–10).
const PERFT = [20, 400, 8_902, 197_281, 4_865_609, 119_060_324, 3_195_901_860, 84_998_978_956, 2_439_530_234_167, 69_352_859_712_417];
const GAME = positionsFromSan('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4'.split(' '));
const WORDS = ['first move', 'one move each', 'two moves for White', 'two moves each', 'three for White', 'three moves each', 'four for White', 'four moves each', 'five for White', 'five moves each'];
const PATTERNS = ['Hangs a piece after castling', 'Misses knight forks', 'Trades into lost endgames'];

type Scene = 'idle' | 'hook' | 'count' | 'versus' | 'twist' | 'end';
const brand = (t: string) => {
  const m = t.match(/^(.*?)(chess)(scout)(\.net)?(.*)$/i);
  return m ? <>{m[1]}{m[2]}<span style={{ color: G }}>{m[3]}</span>{m[4]}{m[5]}</> : t;
};
const font = { fontFamily: 'Inter, system-ui, sans-serif' } as const;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const Pow = ({ b = 10, e }: { b?: number; e: number }) => <>{b}<sup style={{ fontSize: '0.55em', verticalAlign: '0.75em' }}>{e}</sup></>;

export function NumbersReel({ opts: initial = NUMBERS_REEL_DEFAULT, render = false, onClose }: { opts?: NumbersReelOpts; render?: boolean; onClose: () => void }) {
  const [opts, setOpts] = useState<NumbersReelOpts>(initial);
  const [scene, setScene] = useState<Scene>('idle');
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(0); // the counter's displayed value
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

  const PLY_MS = 950;
  const play = (onDone?: () => void) => {
    clear(); setShown(0);
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); m.stop(); if (opts.music !== 'off') m.start(opts.music); } catch { /* ignore */ }
    const go = (ms: number, s: Scene) => at(ms, () => { setScene(s); setStep(0); if (ms > 0) mus().accent('whoosh'); });
    go(0, 'hook'); at(100, () => mus().accent('riser'));
    at(1500, () => setStep(1));
    // The counter: each half-move plays on the board and the count climbs to the next real total.
    const t1 = 3200;
    go(t1, 'count');
    PERFT.forEach((target, k) => {
      const start = t1 + 500 + k * PLY_MS;
      const from = k ? PERFT[k - 1] : 1;
      at(start, () => { setStep(k + 1); playMoveSound(k === 9 ? 'capture' : 'move'); });
      for (let f = 1; f <= 8; f++) at(start + f * 70, () => { setShown(from * Math.pow(target / from, f / 8)); if (f === 8) mus().accent('tick'); });
    });
    // 10^120 against 10^80.
    const t2 = t1 + 500 + PERFT.length * PLY_MS + 900;
    go(t2, 'versus'); at(t2 + 150, () => mus().accent('impact'));
    at(t2 + 1400, () => setStep(1)); at(t2 + 2600, () => { setStep(2); mus().accent('impact'); });
    // The turn: your own patterns.
    const t3 = t2 + 4600;
    go(t3, 'twist');
    PATTERNS.forEach((_, k) => at(t3 + 1300 + k * 450, () => { setStep(k + 1); mus().accent('tick'); }));
    const t4 = t3 + 1300 + PATTERNS.length * 450 + 1100;
    go(t4, 'end'); at(t4 + 100, () => mus().accent('chime'));
    at(t4 + 3300, () => { music.current?.stop(); onDone?.(); });
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
  const hook = (
    <div className="flex h-full flex-col items-center justify-center gap-[3cqh] px-[7cqw] text-center">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }} className="relative">
        <ThemedMiniBoard fen={GAME[0].fen} size={Math.round(boardPx * 0.8)} />
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 12 }}
          className="absolute -right-[3cqw] -top-[3cqw] grid h-[7cqh] w-[7cqh] place-items-center rounded-full font-black" style={{ background: GOLD, color: '#111', fontSize: '4.4cqh' }}>?</motion.span>
      </motion.div>
      <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-black leading-[1.05]" style={{ fontSize: '5.6cqh', color: TEXT, letterSpacing: '-0.03em' }}>{brand(opts.hook)}</motion.p>
      <motion.p animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 10 }} className="font-extrabold" style={{ fontSize: '3cqh', color: GOLD }}>{opts.sub}</motion.p>
    </div>
  );

  // The tiles behind the counter: one per possible line, shrinking as they multiply.
  const ply = Math.max(1, step);
  const tile = Math.max(0.35, 13 / Math.pow(1.55, ply)); // cqw
  const pos = GAME[Math.min(step, GAME.length - 1)];
  const count = (
    <div className="relative flex h-full flex-col items-center justify-center gap-[2.4cqh] px-[6cqw] text-center">
      <div className="pointer-events-none absolute inset-0 transition-all duration-700" style={{
        opacity: 0.22,
        backgroundImage: `linear-gradient(45deg, ${G} 25%, transparent 25%, transparent 75%, ${G} 75%), linear-gradient(45deg, ${G} 25%, transparent 25%, transparent 75%, ${G} 75%)`,
        backgroundSize: `${tile}cqw ${tile}cqw`, backgroundPosition: `0 0, ${tile / 2}cqw ${tile / 2}cqw`,
        maskImage: 'radial-gradient(ellipse at 50% 45%, transparent 22%, black 70%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 45%, transparent 22%, black 70%)',
      }} />
      <p className="relative font-black uppercase tracking-[0.14em]" style={{ fontSize: '2cqh', color: MUTED }}>Possible games after</p>
      <AnimatePresence mode="wait">
        <motion.p key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}
          className="relative -mt-[1.6cqh] font-black" style={{ fontSize: '3cqh', color: TEXT }}>{step ? WORDS[step - 1] : '…'}</motion.p>
      </AnimatePresence>
      <p className="relative font-black tabular-nums leading-none" style={{ fontSize: shown >= 1e12 ? '5.4cqh' : shown >= 1e9 ? '6cqh' : '7.2cqh', color: step >= 9 ? GOLD : G, letterSpacing: '-0.02em', textShadow: '0 4px 30px rgba(0,0,0,.6)' }}>{step ? fmt(shown) : '1'}</p>
      <div className="relative mt-[1cqh]"><ThemedMiniBoard fen={pos.fen} size={boardPx} lastMove={pos.lastMove} /></div>
      <p className="relative font-bold" style={{ fontSize: '1.7cqh', color: MUTED }}>Exact counts from the starting position</p>
    </div>
  );

  const versus = (
    <div className="flex h-full flex-col items-center justify-center gap-[3.4cqh] px-[8cqw] text-center">
      <p className="font-black leading-tight" style={{ fontSize: '3.6cqh', color: TEXT }}>A whole game?</p>
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 13 }}>
        <p className="font-black leading-none" style={{ fontSize: '13cqh', color: GOLD }}>~<Pow e={120} /></p>
        <p className="mt-[1cqh] font-bold" style={{ fontSize: '2cqh', color: MUTED }}>possible games (Claude Shannon’s estimate, 1950)</p>
      </motion.div>
      <motion.div animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 12 }}>
        <p className="font-black leading-none" style={{ fontSize: '8cqh', color: BLUE }}>~<Pow e={80} /></p>
        <p className="mt-[1cqh] font-bold" style={{ fontSize: '2cqh', color: MUTED }}>atoms in the observable universe</p>
      </motion.div>
      <motion.p animate={{ opacity: step >= 2 ? 1 : 0, scale: step >= 2 ? 1 : 0.9 }} className="font-black leading-tight" style={{ fontSize: '3.8cqh', color: TEXT }}>
        More games than atoms.<br /><span style={{ color: GOLD }}>By a lot.</span>
      </motion.p>
    </div>
  );

  const twist = (
    <div className="flex h-full flex-col items-center justify-center gap-[3cqh] px-[7cqw] text-center">
      <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="font-black leading-[1.08]" style={{ fontSize: '5cqh', color: TEXT, letterSpacing: '-0.02em' }}>{brand(opts.twist)}</motion.p>
      <div className="w-full space-y-[1.4cqh]">
        {PATTERNS.map((p, k) => (
          <motion.div key={p} animate={{ opacity: step > k ? 1 : 0, x: step > k ? 0 : 30 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="flex items-center gap-[3cqw] rounded-[1.8cqh] px-[4cqw] py-[1.6cqh] text-left" style={{ background: '#141D1F', border: '1px solid #243033' }}>
            <span className="h-[1.4cqh] w-[1.4cqh] shrink-0 rounded-full" style={{ background: ['#E5484D', GOLD, BLUE][k] }} />
            <span className="font-extrabold" style={{ fontSize: '2.5cqh', color: TEXT }}>{p}</span>
          </motion.div>
        ))}
      </div>
      <p className="font-bold" style={{ fontSize: '1.8cqh', color: MUTED }}>Examples of patterns a review can find</p>
    </div>
  );

  const end = (
    <div className="flex h-full flex-col items-center justify-center gap-[2.6cqh] px-[7cqw] text-center">
      <motion.p initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="font-black leading-[1.05]" style={{ fontSize: '6.6cqh', color: TEXT, letterSpacing: '-0.03em' }}>{brand(opts.closer)}</motion.p>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="font-black" style={{ fontSize: '4.2cqh', color: TEXT }}>Chess<span style={{ color: G }}>Scout</span>.net</motion.p>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="font-bold" style={{ fontSize: '2.4cqh', color: MUTED }}>Free game reviews · link in bio</motion.p>
    </div>
  );

  const body = scene === 'hook' ? hook : scene === 'count' ? count : scene === 'versus' ? versus : scene === 'twist' ? twist : scene === 'end' ? end : null;
  const frame = (
    <div ref={frameRef} className="relative overflow-hidden" style={{ ...font, aspectRatio: '9 / 16', height: clean || render ? '100dvh' : 'min(78dvh, 820px)', maxWidth: '100%', containerType: 'size', background: `radial-gradient(ellipse at 50% 30%, #10261A 0%, ${BG} 65%)` }}
      onClick={() => { if (clean && (scene === 'end' || scene === 'idle')) setClean(false); }}>
      {!blank && (
        <AnimatePresence mode="wait">
          <motion.div key={scene} className="absolute inset-0" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.3 }}>{body}</motion.div>
        </AnimatePresence>
      )}
      {!blank && scene !== 'idle' && scene !== 'end' && (
        <p className="absolute inset-x-0 bottom-[3cqh] text-center font-black" style={{ fontSize: '2.2cqh', color: 'rgba(245,247,246,.55)' }}>Chess<span style={{ color: G }}>Scout</span>.net</p>
      )}
    </div>
  );

  if (render || clean) return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">{frame}</div>;
  const field = (k: 'hook' | 'sub' | 'twist' | 'closer', label: string) => (
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
          <p className="text-[12.5px] text-white/60">About 24 seconds: the hook, a real opening playing move by move while the count of possible games climbs through the exact totals (20, 400, 8,902 … 69 trillion after five moves each), Shannon’s 10¹²⁰ against the 10⁸⁰ atoms in the universe, then the turn to your own patterns and ChessScout.</p>
          <HookPicker topics={['riddle', 'improve']} onPick={(h) => setOpts({ ...opts, hook: h.text, sub: h.sub ?? opts.sub })} />
          {field('hook', 'Hook')}
          {field('sub', 'Line under the hook')}
          {field('twist', 'The turn')}
          {field('closer', 'Closing line')}
          <label className="block text-[12px] text-white/60">Music
            <select value={opts.music} onChange={(e) => setOpts({ ...opts, music: e.target.value as MusicStyle })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10">
              {(['suspense', 'epic', 'hype', 'lofi', 'playful', 'off'] as MusicStyle[]).map((m) => <option key={m} value={m} className="bg-[#0B1112]">{m === 'off' ? 'No music' : m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
          </label>
          <div className="whitespace-pre-line rounded-lg bg-white/5 p-2.5 text-[12px] text-white/75 ring-1 ring-white/10"><span className="font-bold text-white/50">Caption: </span>{`There are about 10^120 possible chess games, and only about 10^80 atoms in the observable universe. After just five moves each there are already 69,352,859,712,417 ways the game could have gone.\n\nSo unless it ended early, your last game was probably a first. You can't memorise chess, but you can learn your own patterns. Free game reviews at chessscout.net ♟️\n\n#chess #chesstok #chessfacts #shannonnumber #chessscout`}</div>
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
