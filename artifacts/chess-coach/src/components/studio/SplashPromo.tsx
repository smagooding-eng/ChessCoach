// Promo built from the app's splash: the black rook jumps and smashes a green pawn,
// then "Chess.com is dead." and then "ChessScout.net". Lines are editable. Short
// enough to loop; also played by the video maker (render mode).
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Maximize2 } from 'lucide-react';
import { playMoveSound } from '@/context/SettingsContext';
import { routeSoundsTo } from '@/lib/sounds';
import { StudioMusic } from './studioMusic';
import { StudioSplash } from './StudioSplash';
import { RenderMp4 } from './RenderMp4';

export interface SplashPromoOpts { line1: string; line2: string; tag: string }
export const SPLASH_PROMO_DEFAULT: SplashPromoOpts = { line1: 'Chess.com is dead.', line2: 'ChessScout.net', tag: '' };
const GREEN = '#81B64C';

// ChessScout.net with "Scout" in green (any other line is shown as typed).
const brand = (t: string) => {
  const m = t.match(/^(.*?)(chess)(scout)(\.net)?(.*)$/i);
  return m ? <>{m[1]}{m[2]}<span style={{ color: GREEN }}>{m[3]}</span>{m[4]}{m[5]}</> : t;
};

type Phase = 'idle' | 'smash' | 'line1' | 'line2' | 'end';

export function SplashPromo({ opts: initial = SPLASH_PROMO_DEFAULT, render = false, onClose }: { opts?: SplashPromoOpts; render?: boolean; onClose: () => void }) {
  const [opts, setOpts] = useState<SplashPromoOpts>(initial);
  const [phase, setPhase] = useState<Phase>('idle');
  const [run, setRun] = useState(0); // remounts the splash so its animation replays
  const [clean, setClean] = useState(false);
  const [blank, setBlank] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const music = useRef<StudioMusic | null>(null);
  const mus = () => (music.current ??= new StudioMusic());
  const rec = useRef<MediaRecorder | null>(null);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  useEffect(() => () => { clear(); routeSoundsTo(null, null); }, []);

  const play = (onDone?: () => void) => {
    clear();
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); } catch { /* ignore */ }
    setRun((n) => n + 1); setPhase('smash');
    later(680, () => playMoveSound('capture')); // the rook lands on the pawn
    later(1000, () => setPhase('line1'));
    later(3000, () => setPhase('line2'));
    later(5600, () => { setPhase('end'); onDone?.(); });
  };
  useEffect(() => { if (!render) play(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const enterClean = () => { clear(); setClean(true); setBlank(true); setPhase('idle'); later(5000, () => { setBlank(false); play(); }); };

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

  const below = (
    <div className="mt-[3.4cqh] flex h-[16cqh] flex-col items-center justify-start text-center" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <AnimatePresence mode="wait">
        {phase === 'line1' && (
          <motion.p key="l1" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="px-[6cqw] font-black leading-tight" style={{ fontSize: '5.8cqh', color: '#e5e5e0', letterSpacing: '-0.02em' }}>{brand(opts.line1)}</motion.p>
        )}
        {(phase === 'line2' || phase === 'end') && (
          <motion.div key="l2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <p className="font-black leading-tight" style={{ fontSize: '6.4cqh', color: '#e5e5e0', letterSpacing: '-0.02em' }}>{brand(opts.line2)}</p>
            {opts.tag && <p className="mt-[1.6cqh] font-extrabold" style={{ fontSize: '3cqh', color: 'rgba(229,229,224,.78)' }}>{brand(opts.tag)}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const frame = (
    <div className="relative overflow-hidden" style={{ aspectRatio: '9 / 16', height: clean || render ? '100dvh' : 'min(78dvh, 820px)', maxWidth: '100%', containerType: 'size', background: '#141413' }}
      onClick={() => { if (clean && (phase === 'end' || phase === 'idle')) setClean(false); }}>
      {!blank && phase !== 'idle' && <StudioSplash key={run} pawn="green" below={below} />}
    </div>
  );

  if (render || clean) return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">{frame}</div>;
  const field = (k: keyof SplashPromoOpts, label: string) => (
    <label className="block text-[12px] text-white/60">{label}<input value={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10" /></label>
  );
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0B1112]/95 text-white">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 p-4 lg:flex-row lg:items-start">
        <div className="flex w-full items-center justify-between lg:hidden">
          <p className="font-black">Splash promo</p>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
        </div>
        {frame}
        <div className="w-full max-w-[420px] space-y-3">
          <div className="hidden items-center justify-between lg:flex">
            <p className="text-[17px] font-black">Splash promo</p>
            <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
          </div>
          <p className="text-[12.5px] text-white/60">Your loading screen with the pawn green: the rook smashes it, then the first line, then the second. About 6 seconds, so it loops well.</p>
          {field('line1', 'First line (after the smash)')}
          {field('line2', 'Second line')}
          {field('tag', 'Small line under it (optional)')}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => play()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white"><Play size={14} />Replay</button>
            <button onClick={enterClean} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black"><Maximize2 size={14} />Clean view</button>
            <RenderMp4 name="chessscout-splash-promo" shareText="chessscout.net ♜" payload={() => ({ source: { kind: 'splashPromo', opts }, prefs: {} })} />
          </div>
        </div>
      </div>
    </div>
  );
}
