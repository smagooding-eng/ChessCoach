// "App in 20 seconds": a fast cut through every main feature (Live play, Game
// review, Weaknesses, Openings, Tactics, Endgames, Puzzles, Scan a position,
// Opponent Scout) under one hook line, ending on chessscout.net. Real boards and
// the regular move sound; optional music, and a new board look every scene or
// every move. Example numbers on screen are labelled as examples, not claims.
// Also played by the video maker (render mode).
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Maximize2, Shuffle } from 'lucide-react';
import { Chess } from 'chess.js';
import { ChessBoard } from '@/components/ChessBoard';
import { LookOverride, randomLook, type BoardLook } from '@/context/SettingsContext';
import { routeSoundsTo } from '@/lib/sounds';
import { StudioMusic, type MusicStyle } from './studioMusic';
import { RenderMp4 } from './RenderMp4';

const GREEN = '#81B64C';
type Kind = 'live' | 'review' | 'weak' | 'openings' | 'tactics' | 'endgames' | 'puzzles' | 'scan' | 'scout';
interface Scene { kind: Kind; title: string; line: string; fen: string; move?: string; arrow?: [string, string] }
const SCENES: Scene[] = [
  { kind: 'live', title: 'Live play', line: 'Real opponents, any clock. Daily games too.', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', move: 'Bb5' },
  { kind: 'review', title: 'Free game review', line: 'Every move rated, and the better move shown.', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 6 5', move: 'Ng5', arrow: ['g5', 'f7'] },
  { kind: 'weak', title: 'Your weaknesses', line: 'Found in your own games, then fixed.', fen: '' },
  { kind: 'openings', title: 'Openings', line: 'Drill your lines until they’re automatic.', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', move: 'Nc6', arrow: ['f1', 'c4'] },
  { kind: 'tactics', title: 'Tactics', line: 'Forks, pins, mates: learn the pattern, then drill it.', fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', move: 'Nc7+' },
  { kind: 'endgames', title: 'Endgames', line: 'Finish the games you’re winning.', fen: '8/4P3/8/8/8/8/k7/6K1 w - - 0 1', move: 'e8=Q' },
  { kind: 'puzzles', title: 'Puzzles', line: 'Puzzles at your level, every day.', fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', move: 'Re8#' },
  { kind: 'scan', title: 'Scan a position', line: 'Photo of any board → instant analysis.', fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7' },
  { kind: 'scout', title: 'Opponent Scout', line: 'See what they play before the game starts.', fen: '' },
];

export interface FeatureBlitzOpts { hook: string; beat: number; music: MusicStyle; looks: 'mine' | 'scene' | 'move' }
export const FEATURE_BLITZ_DEFAULT: FeatureBlitzOpts = { hook: "Use this app for a week and you'll never go back to Chess.com", beat: 1.9, music: 'hype', looks: 'scene' };

type Phase = 'idle' | 'hook' | 'scene' | 'end' | 'done';

function afterMove(fen: string, san?: string) {
  if (!san) return { fen, last: null as { from: string; to: string } | null };
  try { const c = new Chess(fen); const m = c.move(san); return { fen: c.fen(), last: { from: m.from, to: m.to } }; } catch { return { fen, last: null }; }
}

export function FeatureBlitz({ opts: initial = FEATURE_BLITZ_DEFAULT, render = false, onClose }: { opts?: FeatureBlitzOpts; render?: boolean; onClose: () => void }) {
  const [opts, setOpts] = useState<FeatureBlitzOpts>(initial);
  const [phase, setPhase] = useState<Phase>('idle');
  const [k, setK] = useState(0); // scene
  const [moved, setMoved] = useState(false); // the scene's move has been played
  const [clean, setClean] = useState(false);
  const [blank, setBlank] = useState(false);
  const [seed, setSeed] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const music = useRef<StudioMusic | null>(null);
  const mus = () => (music.current ??= new StudioMusic());
  const rec = useRef<MediaRecorder | null>(null);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  useEffect(() => () => { clear(); music.current?.stop(); routeSoundsTo(null, null); }, []);

  // Board looks: one per scene, or a fresh one each move.
  const looks = useMemo(() => SCENES.map(() => [randomLook(), randomLook()] as [BoardLook, BoardLook]), [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const look: BoardLook | null = opts.looks === 'mine' ? null : opts.looks === 'scene' ? looks[k][0] : looks[k][moved ? 1 : 0];

  const total = () => 2200 + SCENES.length * opts.beat * 1000 + 3400;
  const play = (onDone?: () => void) => {
    clear(); setSeed((x) => x + 1);
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); m.stop(); if (opts.music !== 'off') m.start(opts.music); } catch { /* ignore */ }
    setPhase('hook'); setK(0); setMoved(false);
    later(150, () => mus().accent('riser'));
    let t = 2200; const beat = opts.beat * 1000;
    SCENES.forEach((sc, j) => {
      later(t, () => { setPhase('scene'); setK(j); setMoved(false); mus().accent('whoosh'); });
      // The board plays the regular move sound itself.
      if (sc.move) later(t + Math.min(650, beat * 0.35), () => setMoved(true));
      t += beat;
    });
    later(t, () => { setPhase('end'); mus().accent('impact'); });
    later(t + 3400, () => { setPhase('done'); music.current?.stop(); onDone?.(); });
  };
  useEffect(() => { if (!render) play(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const enterClean = () => { clear(); music.current?.stop(); setClean(true); setBlank(true); setPhase('idle'); later(5000, () => { setBlank(false); play(); }); };

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

  const sc = SCENES[k];
  const shown = sc.fen ? (moved ? afterMove(sc.fen, sc.move) : { fen: sc.fen, last: null }) : null;
  const flipped = sc.fen ? sc.fen.split(' ')[1] === 'b' && sc.kind !== 'review' : false;

  const visual = (() => {
    if (sc.kind === 'weak') return (
      <div className="w-[80cqw] space-y-[2.4cqh] rounded-[4cqw] p-[5cqw]" style={{ background: 'rgba(255,255,255,.06)' }}>
        {[['Hanging pieces', 78], ['Back-rank safety', 55], ['Endgame technique', 40]].map(([label, v], j) => (
          <div key={label as string}>
            <p className="mb-[0.8cqh] font-extrabold" style={{ fontSize: '4cqw' }}>{label}</p>
            <div className="h-[1.6cqh] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.1)' }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ delay: 0.15 + j * 0.15, duration: 0.6 }} className="h-full rounded-full" style={{ background: j === 0 ? '#FF6B6B' : j === 1 ? '#E8B447' : GREEN }} />
            </div>
          </div>
        ))}
        <p className="text-center" style={{ fontSize: '3cqw', color: 'rgba(255,255,255,.5)' }}>Example report</p>
      </div>
    );
    if (sc.kind === 'scout') return (
      <div className="w-[80cqw] space-y-[1.6cqh] rounded-[4cqw] p-[5cqw]" style={{ background: 'rgba(255,255,255,.06)' }}>
        <div className="flex items-center gap-[3cqw]">
          <span className="grid h-[12cqw] w-[12cqw] place-items-center rounded-full font-black" style={{ background: '#2B3A2A', fontSize: '6cqw' }}>?</span>
          <div><p className="font-black" style={{ fontSize: '5cqw' }}>Your next opponent</p><p style={{ fontSize: '3.4cqw', color: 'rgba(255,255,255,.6)' }}>Scouted from their recent games</p></div>
        </div>
        {['As White: 1.e4 most games', 'As Black vs 1.e4: the Sicilian', 'Weak spot: endgames'].map((t, j) => (
          <motion.p key={t} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + j * 0.18 }} className="rounded-[2.4cqw] px-[3cqw] py-[1.4cqh] font-bold" style={{ background: 'rgba(255,255,255,.07)', fontSize: '3.8cqw' }}>{t}</motion.p>
        ))}
        <p className="text-center" style={{ fontSize: '3cqw', color: 'rgba(255,255,255,.5)' }}>Example scouting report</p>
      </div>
    );
    const board = shown && (
      <LookOverride look={look}>
        <div className="relative w-[84cqw]">
          <ChessBoard fen={shown.fen} lastMove={shown.last} flipped={flipped} maxWidthOverride="100%" suppressConfirmMoves
            moveQuality={sc.kind === 'review' && moved ? 'great' : sc.kind === 'tactics' && moved ? 'brilliant' : null}
            arrows={sc.arrow && (sc.kind === 'openings' || moved) ? [{ from: sc.arrow[0], to: sc.arrow[1], color: sc.kind === 'review' ? 'rgba(129,182,76,.9)' : 'rgba(232,180,71,.85)' }] : undefined} />
          {sc.kind === 'scan' && (
            <>
              <motion.div className="pointer-events-none absolute inset-x-0 h-[1.2cqh] rounded-full" style={{ background: GREEN, boxShadow: `0 0 18px ${GREEN}` }} initial={{ top: '0%' }} animate={{ top: ['0%', '96%', '0%'] }} transition={{ duration: opts.beat * 0.9, ease: 'easeInOut' }} />
              <div className="pointer-events-none absolute -inset-[2cqw] rounded-[3cqw]" style={{ border: '3px dashed rgba(255,255,255,.55)' }} />
            </>
          )}
          {sc.kind === 'live' && <span className="absolute -top-[4.4cqh] left-0 rounded-full px-[2.4cqw] py-[0.4cqh] font-black text-white" style={{ background: '#FF5058', fontSize: '3.2cqw' }}>● LIVE</span>}
          {sc.kind === 'puzzles' && moved && <span className="absolute -top-[4.4cqh] right-0 rounded-full px-[2.4cqw] py-[0.4cqh] font-black" style={{ background: GREEN, fontSize: '3.2cqw' }}>Solved ✓</span>}
          {sc.kind === 'review' && moved && <span className="absolute -top-[4.4cqh] right-0 rounded-full px-[2.4cqw] py-[0.4cqh] font-black" style={{ background: '#3B9EDB', fontSize: '3.2cqw' }}>! Great move</span>}
        </div>
      </LookOverride>
    );
    return board;
  })();

  const frame = (
    <div className="relative overflow-hidden" style={{ aspectRatio: '9 / 16', height: clean || render ? '100dvh' : 'min(78dvh, 820px)', maxWidth: '100%', containerType: 'size', background: 'radial-gradient(120% 80% at 50% 30%, #1d2a17 0%, #0d110c 55%, #070807 100%)', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}
      onClick={() => { if (clean && (phase === 'done' || phase === 'idle')) setClean(false); }}>
      {!blank && phase !== 'idle' && (<>
        {/* The hook stays on top the whole time. */}
        <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: phase === 'end' || phase === 'done' ? 0 : 1, y: 0, scale: phase === 'hook' ? 1.08 : 1 }} transition={{ duration: 0.35 }}
          className="absolute inset-x-0 z-20 px-[6cqw] text-center font-black leading-[1.12]"
          style={{ top: phase === 'hook' ? '36cqh' : '7cqh', fontSize: phase === 'hook' ? '8.2cqw' : '5.4cqw', textShadow: '0 3px 14px rgba(0,0,0,.7)', transition: 'top .45s ease, font-size .45s ease' }}>
          {opts.hook}
        </motion.p>

        <AnimatePresence mode="wait">
          {phase === 'scene' && (
            <motion.div key={k} initial={{ opacity: 0, scale: 0.9, x: 40 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 1.04, x: -40 }} transition={{ duration: 0.22 }}
              className="absolute inset-0 flex flex-col items-center justify-center pt-[8cqh]">
              <p className="mb-[0.6cqh] font-black" style={{ fontSize: '3.4cqw', color: GREEN, letterSpacing: '.14em' }}>{String(k + 1).padStart(2, '0')} / {String(SCENES.length).padStart(2, '0')}</p>
              <p className="font-black leading-none" style={{ fontSize: '10cqw', letterSpacing: '-0.02em' }}>{sc.title}</p>
              <p className="mb-[3.4cqh] mt-[1cqh] px-[8cqw] text-center font-bold" style={{ fontSize: '4.2cqw', color: 'rgba(255,255,255,.75)' }}>{sc.line}</p>
              {visual}
            </motion.div>
          )}
          {(phase === 'end' || phase === 'done') && (
            <motion.div key="end" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }}
              className="absolute inset-0 flex flex-col items-center justify-center px-[6cqw] text-center">
              <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="" className="mb-[2.4cqh] h-[22cqw] w-[22cqw]" />
              <p className="font-black leading-none" style={{ fontSize: '11cqw', letterSpacing: '-0.02em' }}>Chess<span style={{ color: GREEN }}>Scout</span>.net</p>
              <p className="mt-[2cqh] font-extrabold" style={{ fontSize: '5cqw', color: 'rgba(255,255,255,.8)' }}>All of it. Free to start.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {phase === 'scene' && (
          <div className="absolute inset-x-[8cqw] bottom-[6cqh] flex gap-[1cqw]">
            {SCENES.map((_, j) => <span key={j} className="h-[0.7cqh] flex-1 rounded-full" style={{ background: j <= k ? GREEN : 'rgba(255,255,255,.18)' }} />)}
          </div>
        )}
      </>)}
    </div>
  );

  if (render || clean) return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">{frame}</div>;
  const pill = (on: boolean) => ({ background: on ? GREEN : 'rgba(255,255,255,.07)' });
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0B1112]/95 text-white">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 p-4 lg:flex-row lg:items-start">
        <div className="flex w-full items-center justify-between lg:hidden">
          <p className="font-black">App in {Math.round(total() / 1000)} seconds</p>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
        </div>
        {frame}
        <div className="w-full max-w-[420px] space-y-3">
          <div className="hidden items-center justify-between lg:flex">
            <p className="text-[17px] font-black">App in {Math.round(total() / 1000)} seconds</p>
            <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
          </div>
          <p className="text-[12.5px] text-white/60">A fast cut through every feature: {SCENES.map((s) => s.title).join(', ')}. Ends on chessscout.net.</p>
          <label className="block text-[12px] text-white/60">Hook (stays on top)<input value={opts.hook} onChange={(e) => setOpts({ ...opts, hook: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10" /></label>
          <div className="flex flex-wrap gap-1.5">
            {["Use this app for a week and you'll never go back to Chess.com", 'Everything Chess.com charges for. Free.', '9 reasons I stopped opening Chess.com'].map((h) => (
              <button key={h} onClick={() => setOpts({ ...opts, hook: h })} className="rounded-full px-2.5 py-1 text-[11.5px] font-bold" style={pill(opts.hook === h)}>{h}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-white/60">Pace:</span>
            {[[1.5, 'Fast'], [1.9, 'Normal'], [2.4, 'Relaxed']].map(([b, l]) => <button key={l} onClick={() => setOpts({ ...opts, beat: b as number })} className="rounded-full px-2.5 py-1 font-bold" style={pill(opts.beat === b)}>{l as string}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-white/60">Board:</span>
            {([['scene', 'New look every scene'], ['move', 'Every move'], ['mine', 'My board']] as const).map(([v, l]) => <button key={v} onClick={() => setOpts({ ...opts, looks: v })} className="rounded-full px-2.5 py-1 font-bold" style={pill(opts.looks === v)}>{l}</button>)}
            {opts.looks !== 'mine' && <button onClick={() => setSeed((x) => x + 1)} className="rounded-full bg-white/10 px-2 py-1" aria-label="Shuffle looks"><Shuffle size={12} /></button>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-white/60">Music:</span>
            {(['hype', 'epic', 'lofi', 'off'] as MusicStyle[]).map((v) => <button key={v} onClick={() => setOpts({ ...opts, music: v })} className="rounded-full px-2.5 py-1 font-bold capitalize" style={pill(opts.music === v)}>{v === 'off' ? 'None' : v}</button>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => play()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white"><Play size={14} />Replay</button>
            <button onClick={enterClean} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black"><Maximize2 size={14} />Clean view</button>
            <RenderMp4 name="chessscout-app-in-20s" shareText="Everything in one chess app ♞ chessscout.net" payload={() => ({ source: { kind: 'featureBlitz', opts }, prefs: {} })} />
          </div>
        </div>
      </div>
    </div>
  );
}
