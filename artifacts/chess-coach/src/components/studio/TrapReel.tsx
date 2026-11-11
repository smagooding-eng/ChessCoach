// Trap reels (9:16, about 20–30 seconds): an opening trap explained step by step,
// like the Family Tree. The hook and the trap's name, then the moves play in
// groups, each with a line of explanation under the board: the setup, the
// natural-looking mistake (red), the trap (green), the win (gold), then a
// stamp on the board (CHECKMATE / wins the queen…) and an end card asking for
// the save and the next trap in the comments. The side that springs the trap
// faces the viewer. Also played by the video maker (kind "trapReel").
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Maximize2 } from 'lucide-react';
import { Chess } from 'chess.js';
import { playMoveSound, LookOverride } from '@/context/SettingsContext';
import { routeSoundsTo } from '@/lib/sounds';
import { StudioMusic, type MusicStyle } from './studioMusic';
import { RenderMp4 } from './RenderMp4';
import { HookPicker, hookLine } from './HookPicker';
import { ChessBoard, type MoveQuality } from '@/components/ChessBoard';
import { reelFrameSize, CaptionBox, LookPicker, useReelLook, type ReelLook, EngagePicker, PinnedBox } from './reelKit';
import { TRAPS, trapById, type TrapStepKind } from './traps';

type Speed = 'fast' | 'normal' | 'slow';
export interface TrapReelOpts { trap: string; hook: string; question: string; speed: Speed; music: MusicStyle; look?: ReelLook }
export const trapReelDefaults = (id: string): TrapReelOpts => ({ trap: id, hook: trapById(id).hook, question: 'Which trap should we do next? 👇', speed: 'normal', music: 'suspense' });

const G = '#81B64C', BG = '#0B1112', TEXT = '#F5F7F6', MUTED = '#8E9996', GOLD = '#E8B447', RED = '#E5484D';
const MOVE_MS: Record<Speed, number> = { fast: 430, normal: 560, slow: 740 };
const READ_MS: Record<Speed, number> = { fast: 34, normal: 42, slow: 52 }; // per character of the explanation
const KIND: Record<TrapStepKind, { label: string; color: string } | null> = {
  intro: null, setup: null,
  bait: { label: '❌ The mistake', color: RED },
  trap: { label: '‼ The trap', color: G },
  win: { label: '🏆 The win', color: GOLD },
};
const brand = (t: string) => {
  const m = t.match(/^(.*?)(chess)(scout)(\.net)?(.*)$/i);
  return m ? <>{m[1]}{m[2]}<span style={{ color: G }}>{m[3]}</span>{m[4]}{m[5]}</> : t;
};

type Scene = 'idle' | 'play' | 'stamp' | 'end';

export function TrapReel({ opts: initial, render = false, onClose }: { opts?: TrapReelOpts; render?: boolean; onClose: () => void }) {
  const [opts, setOpts] = useState<TrapReelOpts>(initial ?? trapReelDefaults(TRAPS[0].id));
  const trap = trapById(opts.trap);
  const [scene, setScene] = useState<Scene>('idle');
  const [stepIdx, setStepIdx] = useState(0);
  const [ply, setPly] = useState(0);
  const [clean, setClean] = useState(false);
  const [blank, setBlank] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const music = useRef<StudioMusic | null>(null);
  const mus = () => (music.current ??= new StudioMusic());
  const rec = useRef<MediaRecorder | null>(null);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const at = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  useEffect(() => () => { clear(); music.current?.stop(); routeSoundsTo(null, null); }, []);

  const play = (onDone?: () => void, o: TrapReelOpts = opts) => {
    clear();
    const tr = trapById(o.trap);
    setScene('play'); setStepIdx(0); setPly(0);
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); m.stop(); if (o.music !== 'off') m.start(o.music); } catch { /* ignore */ }
    at(80, () => mus().accent('riser'));
    // The positions, to know which moves capture or check (for the sounds).
    const c = new Chess(); const vm = tr.san.map((san) => c.move(san));
    let t = Math.max(2200, tr.steps[0].text.length * READ_MS[o.speed]);
    let prev = 0;
    tr.steps.forEach((st, i) => {
      if (i === 0) return;
      at(t, () => { setStepIdx(i); if (st.kind === 'bait') mus().accent('whoosh'); });
      for (let p = prev; p < st.upto; p++) {
        const when = t + 250 + (p - prev) * MOVE_MS[o.speed];
        at(when, () => {
          setPly(p + 1);
          const m = vm[p];
          playMoveSound(m.san.includes('#') || m.san.includes('+') ? 'check' : m.captured ? 'capture' : m.flags.includes('k') || m.flags.includes('q') ? 'castle' : 'move');
          if (p + 1 === st.upto && (st.kind === 'trap' || st.kind === 'win')) mus().accent('impact');
        });
      }
      const moving = (st.upto - prev) * MOVE_MS[o.speed];
      const hold = Math.max(st.kind === 'setup' ? 1100 : 1700, st.text.length * READ_MS[o.speed] - moving * 0.5);
      t += 250 + moving + hold;
      prev = st.upto;
    });
    at(t, () => { setScene('stamp'); mus().accent('impact'); });
    at(t + 1900, () => { setScene('end'); mus().accent('chime'); });
    at(t + 1900 + 3400, () => { music.current?.stop(); onDone?.(); });
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

  // ── The board at the current ply ──────────────────────────────────────────
  const game = new Chess();
  let lastMove: { from: string; to: string } | null = null;
  let lastSan = '';
  for (let p = 0; p < ply; p++) { const m = game.move(trap.san[p]); lastMove = { from: m.from, to: m.to }; lastSan = m.san; }
  const step = trap.steps[stepIdx];
  const atStepEnd = ply === step.upto && stepIdx > 0;
  const quality: MoveQuality | null = !atStepEnd ? null
    : step.kind === 'bait' ? 'blunder' : step.kind === 'trap' ? 'brilliant' : step.kind === 'win' ? (game.isCheckmate() ? 'checkmate' : 'best') : null;
  const moveLabel = ply ? `${Math.ceil(ply / 2)}.${ply % 2 === 0 ? '..' : ''} ${lastSan}` : '';
  const look = useReelLook(opts.look, stepIdx, ply);
  const k = KIND[step.kind];
  const showing = scene === 'play' || scene === 'stamp';

  const playScene = (
    <div className="flex h-full flex-col px-[4cqw] pb-[6cqh] pt-[4.5cqh]">
      {/* Header: the hook, then the trap's name and opening. */}
      <div className="text-center">
        <p className="font-black leading-[1.05]" style={{ fontSize: stepIdx === 0 ? '4.6cqh' : '3.4cqh', color: TEXT, letterSpacing: '-0.02em', transition: 'font-size .35s' }}>{brand(opts.hook)}</p>
        <p className="mt-[0.8cqh] font-black uppercase tracking-[0.12em]" style={{ fontSize: '1.8cqh', color: G }}>🪤 {trap.name} · {trap.opening}</p>
      </div>
      <div className="relative mt-[1.6cqh]">
        <LookOverride look={look}><ChessBoard fen={game.fen()} lastMove={lastMove} moveQuality={quality} flipped={trap.trapper === 'b'} maxWidthOverride="100%" suppressConfirmMoves animationMs={240} /></LookOverride>
        {moveLabel && <span className="absolute left-[1.5cqw] top-[1.5cqw] rounded-full bg-black/70 px-[2.4cqw] py-[0.4cqh] font-black tabular-nums" style={{ fontSize: '2cqh', color: TEXT }}>{moveLabel}</span>}
        <AnimatePresence>
          {scene === 'stamp' && (
            <motion.div key="stamp" initial={{ scale: 2.4, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -8 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}
              className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="rounded-[1.6cqh] px-[4cqw] py-[1.2cqh] text-center font-black leading-none" style={{ fontSize: trap.result.length > 12 ? '4.2cqh' : '6.4cqh', color: '#111', background: GOLD, boxShadow: '0 10px 40px rgba(0,0,0,.6)' }}>{trap.result}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* The explanation for this step. */}
      <div className="mt-[1.8cqh] flex-1">
        <AnimatePresence mode="wait">
          <motion.div key={stepIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}
            className="rounded-[1.8cqh] px-[4cqw] py-[1.6cqh]" style={{ background: '#141D1F', border: `2px solid ${k?.color ?? '#243033'}` }}>
            {k && <p className="mb-[0.5cqh] font-black uppercase tracking-[0.1em]" style={{ fontSize: '1.7cqh', color: k.color }}>{k.label}</p>}
            <p className="font-extrabold leading-[1.22]" style={{ fontSize: '2.7cqh', color: TEXT }}>{step.text}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );

  const end = (
    <div className="flex h-full flex-col items-center justify-center gap-[2.4cqh] px-[7cqw] text-center">
      <p className="font-black uppercase tracking-[0.14em]" style={{ fontSize: '2cqh', color: G }}>🪤 {trap.name}</p>
      <motion.p initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        className="rounded-[1.8cqh] bg-white px-[5cqw] py-[1.6cqh] font-black leading-tight" style={{ fontSize: '3.6cqh', color: '#141A14' }}>🔖 Save it for your next game</motion.p>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="font-black leading-tight" style={{ fontSize: '3.4cqh', color: TEXT }}>{opts.question}</motion.p>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="mt-[2cqh] font-black" style={{ fontSize: '3.8cqh', color: TEXT }}>Chess<span style={{ color: G }}>Scout</span>.net</motion.p>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="font-bold" style={{ fontSize: '2.1cqh', color: MUTED }}>Free game reviews · find the traps you fall for</motion.p>
    </div>
  );

  const frame = (
    <div className="relative overflow-hidden" style={{ fontFamily: 'Inter, system-ui, sans-serif', ...reelFrameSize(clean || render), background: `radial-gradient(ellipse at 50% 0%, #15301F 0%, ${BG} 60%)` }}
      onClick={() => { if (clean && (scene === 'end' || scene === 'idle')) setClean(false); }}>
      {!blank && (showing ? playScene : scene === 'end' ? end : null)}
      {!blank && showing && <p className="absolute inset-x-0 bottom-[2cqh] text-center font-black" style={{ fontSize: '2cqh', color: 'rgba(245,247,246,.55)' }}>Chess<span style={{ color: G }}>Scout</span>.net</p>}
    </div>
  );

  if (render || clean) return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">{frame}</div>;

  const pgn = trap.san.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m}` : m)).join(' ');
  const caption = `${opts.question ? `${opts.question}\n` : ''}${trap.name} (${trap.opening}) 🪤 ${opts.hook}\n\n${pgn}\n\nSave it for your next game 🔖\n\nchessscout.net\n\n#chess #chesstraps #chessopenings #learnchess #chessscout`;
  const pick = (id: string) => { const o = { ...opts, ...trapReelDefaults(id), speed: opts.speed, music: opts.music, look: opts.look, question: opts.question }; setOpts(o); play(undefined, o); };
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0B1112]/95 text-white">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 p-4 lg:flex-row lg:items-start">
        <div className="flex w-full items-center justify-between lg:hidden">
          <p className="font-black">Trap reels 🪤</p>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
        </div>
        {frame}
        <div className="w-full max-w-[420px] space-y-3">
          <div className="hidden items-center justify-between lg:flex">
            <p className="text-[17px] font-black">Trap reels 🪤</p>
            <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
          </div>
          <p className="text-[12.5px] text-white/60">An opening trap explained step by step: the setup, the mistake (red), the trap (green) and the win (gold), with the trapping side facing the viewer. Ends asking for the save and the next trap in the comments. Every line is checked move by move.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {TRAPS.map((t) => (
              <button key={t.id} onClick={() => pick(t.id)} className="rounded-lg px-2.5 py-2 text-left" style={{ background: t.id === opts.trap ? 'rgba(129,182,76,.22)' : 'rgba(255,255,255,.05)', boxShadow: t.id === opts.trap ? `0 0 0 2px ${G}` : 'inset 0 0 0 1px rgba(255,255,255,.08)' }}>
                <span className="block text-[12.5px] font-black leading-tight text-white">{t.name}</span>
                <span className="block text-[11px] text-white/50">{t.opening} · {t.trapper === 'w' ? 'White' : 'Black'} · {Math.ceil(t.san.length / 2)} moves</span>
              </button>
            ))}
          </div>
          <HookPicker topics={['trap', 'opening']} onPick={(h) => setOpts({ ...opts, hook: hookLine(h) })} />
          <label className="block text-[12px] text-white/60">Hook<input value={opts.hook} onChange={(e) => setOpts({ ...opts, hook: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10" /></label>
          <EngagePicker kind="trap" value={opts.question} onChange={(v) => setOpts({ ...opts, question: v })} label="Engagement line on the end card (and in the caption)" />
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-[56px] text-[11px] font-bold uppercase tracking-wider text-white/40">Speed</span>
            {(['fast', 'normal', 'slow'] as Speed[]).map((sp) => <button key={sp} onClick={() => setOpts({ ...opts, speed: sp })} className="rounded-md px-2.5 py-1 text-[12px] font-bold capitalize" style={{ background: opts.speed === sp ? G : 'rgba(255,255,255,.07)' }}>{sp}</button>)}
          </div>
          <label className="block text-[12px] text-white/60">Music
            <select value={opts.music} onChange={(e) => setOpts({ ...opts, music: e.target.value as MusicStyle })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10">
              {(['suspense', 'epic', 'hype', 'lofi', 'playful', 'off'] as MusicStyle[]).map((m) => <option key={m} value={m} className="bg-[#0B1112]">{m === 'off' ? 'No music' : m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
          </label>
          <LookPicker value={opts.look} onChange={(v) => setOpts({ ...opts, look: v })} />
          <CaptionBox key={caption} text={caption} />
          <PinnedBox text={`Have you ever fallen for the ${trap.name}? 😅\nFull line: ${pgn}`} />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => play()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white"><Play size={14} />Replay</button>
            <button onClick={enterClean} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black"><Maximize2 size={14} />Clean view</button>
            <RenderMp4 name={`chessscout-trap-${trap.id}`} shareText={`${trap.name} 🪤 ${opts.hook} · chessscout.net`} payload={() => ({ source: { kind: 'trapReel', opts }, prefs: {} })} />
          </div>
        </div>
      </div>
    </div>
  );
}
