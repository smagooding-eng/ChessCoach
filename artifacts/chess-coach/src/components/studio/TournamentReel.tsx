// Tournament promo reel (about 21 seconds, 9:16): host a tournament for your
// club, school, office or friends. Make it (name, format, logo), share one
// link and everyone joins, the bracket plays out, anyone can watch the boards
// live, the champion, then "Host yours free". The players in it are made-up
// demo names, never real ChessScout users. Also played by the video maker.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Maximize2, Trophy, Share2, Radio, Link2, Check, Swords, CalendarDays } from 'lucide-react';
import { playMoveSound, LookOverride } from '@/context/SettingsContext';
import { routeSoundsTo } from '@/lib/sounds';
import { StudioMusic, type MusicStyle } from './studioMusic';
import { RenderMp4 } from './RenderMp4';
import { HookPicker, hookLine } from './HookPicker';
import { ThemedMiniBoard } from '@/components/ThemedMiniBoard';
import { positionsFromSan } from '@/hooks/use-move-browser';
import { reelFrameSize, CaptionBox, LookPicker, useReelLook, type ReelLook, EngagePicker, EngageOverlay, withEngage } from './reelKit';

export interface TournamentReelOpts { hook: string; who: string; name: string; closer: string; music: MusicStyle; look?: ReelLook; engage?: string }
export const TOURNAMENT_REEL_DEFAULT: TournamentReelOpts = {
  hook: 'Run a chess tournament',
  who: 'for your club, for your school, for your office, for your friends',
  name: 'Office Championship 2026',
  closer: 'Host yours free',
  music: 'hype',
};

const G = '#81B64C', BG = '#0B1112', CARD = '#141D1F', LINE = '#243033', TEXT = '#F5F7F6', MUTED = '#8E9996', GOLD = '#E8B447', RED = '#E5484D';
const PLAYERS = ['Alex', 'Maya', 'Diego', 'Sam', 'Priya', 'Leo', 'Nina', 'Omar'];
// Bracket results: who wins each match (index into the round's list).
const R1 = [['Alex', 'Leo'], ['Maya', 'Omar'], ['Diego', 'Nina'], ['Sam', 'Priya']];
const R2 = [['Alex', 'Maya'], ['Diego', 'Priya']];
const R3 = [['Maya', 'Diego']];
const CHAMP = 'Maya';
// Four boards playing at once in the "watch live" scene (real opening moves).
const LIVE_GAMES = [
  'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+',
  'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5',
  'c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6 Nf3 Nc6',
].map((s) => positionsFromSan(s.split(' ')));
const LIVE_NAMES = [['Alex', 'Leo'], ['Maya', 'Omar'], ['Diego', 'Nina'], ['Sam', 'Priya']];

type Scene = 'idle' | 'hook' | 'create' | 'invite' | 'bracket' | 'live' | 'champ' | 'end';
const brand = (t: string) => {
  const m = t.match(/^(.*?)(chess)(scout)(\.net)?(.*)$/i);
  return m ? <>{m[1]}{m[2]}<span style={{ color: G }}>{m[3]}</span>{m[4]}{m[5]}</> : t;
};
const font = { fontFamily: 'Inter, system-ui, sans-serif' } as const;

function Tap({ on }: { on: boolean }) {
  return (
    <AnimatePresence>
      {on && <motion.span key="tap" initial={{ opacity: 0.55, scale: 0.2 }} animate={{ opacity: 0, scale: 2.4 }} transition={{ duration: 0.55 }}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[6cqh] w-[6cqh] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'rgba(255,255,255,.7)' }} />}
    </AnimatePresence>
  );
}
function Caption({ text }: { text: string }) {
  return (
    <motion.p key={text} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
      className="px-[6cqw] text-center font-black leading-tight" style={{ fontSize: '4.4cqh', color: TEXT, letterSpacing: '-0.02em' }}>{brand(text)}</motion.p>
  );
}

export function TournamentReel({ opts: initial = TOURNAMENT_REEL_DEFAULT, render = false, onClose }: { opts?: TournamentReelOpts; render?: boolean; onClose: () => void }) {
  const [opts, setOpts] = useState<TournamentReelOpts>(initial);
  const [scene, setScene] = useState<Scene>('idle');
  const [step, setStep] = useState(0); // progress inside a scene
  const [tap, setTap] = useState('');
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
    const ro = new ResizeObserver(() => setBoardPx(Math.round(el.clientWidth * 0.4)));
    ro.observe(el); return () => ro.disconnect();
  });

  const whoList = opts.who.split(',').map((s) => s.trim()).filter(Boolean);
  const tapAt = (ms: number, id: string, sound = true) => at(ms, () => { setTap(id); if (sound) mus().accent('tick'); at(500, () => setTap('')); });

  const play = (onDone?: () => void) => {
    clear();
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); m.stop(); if (opts.music !== 'off') m.start(opts.music); } catch { /* ignore */ }
    const go = (ms: number, s: Scene) => at(ms, () => { setScene(s); setStep(0); if (ms > 0) mus().accent('whoosh'); });
    // Hook: the words under it change every 0.65s.
    go(0, 'hook'); at(100, () => mus().accent('riser'));
    whoList.forEach((_, k) => at(700 + k * 650, () => setStep(k + 1)));
    const t1 = 700 + whoList.length * 650 + 300;
    // Make it: the name types in, the format and time control get picked, the logo pops, Create.
    go(t1, 'create');
    const nameMs = 1100;
    for (let c = 1; c <= opts.name.length; c++) at(t1 + 300 + (c * nameMs) / opts.name.length, () => setStep(c));
    const n = opts.name.length;
    tapAt(t1 + 1600, 'knockout'); at(t1 + 1600, () => setStep(n + 1));
    tapAt(t1 + 2100, 'daily'); at(t1 + 2100, () => setStep(n + 2));
    at(t1 + 2600, () => { setStep(n + 3); mus().accent('chime'); });
    tapAt(t1 + 3200, 'create');
    // Share one link: players join one by one.
    const t2 = t1 + 3700;
    go(t2, 'invite');
    tapAt(t2 + 600, 'share');
    PLAYERS.forEach((_, k) => at(t2 + 1000 + k * 200, () => { setStep(k + 1); playMoveSound('move'); }));
    // The bracket plays out round by round.
    const t3 = t2 + 1000 + PLAYERS.length * 200 + 700;
    go(t3, 'bracket');
    [1, 2, 3].forEach((r) => at(t3 + r * 850, () => { setStep(r); playMoveSound('capture'); }));
    // Everyone watches the boards live.
    const t4 = t3 + 3 * 850 + 800;
    go(t4, 'live');
    const plies = Math.max(...LIVE_GAMES.map((g) => g.length - 1));
    for (let p = 1; p <= plies; p++) at(t4 + 250 + p * 300, () => { setStep(p); playMoveSound(p % 5 === 0 ? 'capture' : 'move'); });
    // The champion, then the end card.
    const t5 = t4 + 250 + plies * 300 + 500;
    go(t5, 'champ'); at(t5 + 150, () => mus().accent('impact'));
    const t6 = t5 + 2300;
    go(t6, 'end'); at(t6 + 100, () => mus().accent('chime'));
    at(t6 + 3200, () => { music.current?.stop(); onDone?.(); });
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
  const card = { background: CARD, border: `1px solid ${LINE}`, borderRadius: '2.2cqh' } as const;
  const chip = (label: string, on: boolean, id: string, icon?: ReactNode) => (
    <span className="relative inline-flex items-center gap-[1cqw] overflow-hidden rounded-[1.4cqh] px-[3.2cqw] py-[1.1cqh] font-extrabold transition-colors duration-200"
      style={{ fontSize: '2.1cqh', background: on ? G : 'rgba(255,255,255,.06)', color: on ? '#fff' : TEXT, border: `1px solid ${on ? G : LINE}` }}>
      {icon}{label}<Tap on={tap === id} />
    </span>
  );

  const hook = (
    <div className="flex h-full flex-col items-center justify-center gap-[3cqh] px-[7cqw] text-center">
      <motion.div initial={{ scale: 0.4, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}>
        <Trophy style={{ width: '13cqh', height: '13cqh', color: GOLD }} strokeWidth={1.6} />
      </motion.div>
      <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-black leading-[1.05]" style={{ fontSize: '6.6cqh', color: TEXT, letterSpacing: '-0.03em' }}>{brand(opts.hook)}</motion.p>
      <div className="h-[6cqh]">
        <AnimatePresence mode="wait">
          {step > 0 && <motion.p key={step} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.22 }}
            className="font-black" style={{ fontSize: '4.8cqh', color: G }}>{whoList[Math.min(step, whoList.length) - 1]}</motion.p>}
        </AnimatePresence>
      </div>
    </div>
  );

  const n = opts.name.length;
  const create = (
    <div className="flex h-full flex-col justify-center gap-[3cqh] px-[6cqw]">
      <Caption text="Make it in seconds" />
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="space-y-[2.2cqh] p-[2.6cqh]" style={card}>
        <p className="font-black uppercase tracking-[0.14em]" style={{ fontSize: '1.6cqh', color: MUTED }}>New tournament</p>
        <div className="flex items-center gap-[3cqw]">
          <AnimatePresence>
            {step >= n + 3 && <motion.div key="logo" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}
              className="grid shrink-0 place-items-center rounded-[1.6cqh]" style={{ width: '8.5cqh', height: '8.5cqh', background: `linear-gradient(160deg, ${G}, #4E7A2A)` }}>
              <Trophy style={{ width: '5cqh', height: '5cqh', color: '#fff' }} />
            </motion.div>}
          </AnimatePresence>
          <div className="min-w-0 flex-1 rounded-[1.4cqh] px-[3cqw] py-[1.4cqh]" style={{ background: 'rgba(0,0,0,.3)', border: `1px solid ${LINE}` }}>
            <p className="truncate font-extrabold" style={{ fontSize: '2.6cqh', color: TEXT }}>
              {opts.name.slice(0, Math.min(step, n))}
              {step < n && <span className="ml-[0.3cqw] inline-block animate-pulse" style={{ width: '0.4cqw', height: '2.6cqh', background: G, verticalAlign: 'middle' }} />}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-[2cqw]">
          {chip('Knockout', step >= n + 1, 'knockout', <Swords style={{ width: '2.2cqh', height: '2.2cqh' }} />)}
          {chip('Arena', false, 'arena')}
        </div>
        <div className="flex flex-wrap gap-[2cqw]">
          {chip('Live', false, 'live')}
          {chip('Daily · 1 day a move', step >= n + 2, 'daily', <CalendarDays style={{ width: '2.2cqh', height: '2.2cqh' }} />)}
        </div>
        <div className="relative overflow-hidden rounded-[1.6cqh] py-[1.8cqh] text-center font-black" style={{ fontSize: '2.6cqh', background: G, color: '#fff' }}>
          Create tournament<Tap on={tap === 'create'} />
        </div>
      </motion.div>
    </div>
  );

  const invite = (
    <div className="flex h-full flex-col justify-center gap-[3cqh] px-[6cqw]">
      <Caption text="Share one link. Everyone joins." />
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="space-y-[2cqh] p-[2.6cqh]" style={card}>
        <div className="flex items-center gap-[2cqw] rounded-[1.4cqh] px-[3cqw] py-[1.4cqh]" style={{ background: 'rgba(0,0,0,.3)', border: `1px solid ${LINE}` }}>
          <Link2 style={{ width: '2.4cqh', height: '2.4cqh', color: G }} />
          <span className="truncate font-bold" style={{ fontSize: '2.1cqh', color: TEXT, fontFamily: 'ui-monospace, monospace' }}>chessscout.net/tournaments/…</span>
        </div>
        <div className="relative flex items-center justify-center gap-[2cqw] overflow-hidden rounded-[1.6cqh] py-[1.6cqh] font-black" style={{ fontSize: '2.5cqh', background: G, color: '#fff' }}>
          <Share2 style={{ width: '2.6cqh', height: '2.6cqh' }} /> Share<Tap on={tap === 'share'} />
        </div>
        <p className="pt-[0.6cqh] font-black uppercase tracking-[0.14em]" style={{ fontSize: '1.6cqh', color: MUTED }}>Registered · {step}</p>
        <div className="flex flex-wrap gap-[1.8cqw]">
          <AnimatePresence>
            {PLAYERS.slice(0, step).map((p) => (
              <motion.span key={p} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 16 }}
                className="rounded-[1.2cqh] px-[3cqw] py-[0.9cqh] font-extrabold" style={{ fontSize: '2.2cqh', background: 'rgba(255,255,255,.07)', color: TEXT }}>{p}</motion.span>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );

  const round = (pairs: string[][], shown: boolean, winnersShown: boolean, label: string) => (
    <div className="flex flex-1 flex-col justify-around gap-[1.2cqh]">
      <p className="text-center font-black uppercase tracking-[0.1em]" style={{ fontSize: '1.5cqh', color: G }}>{label}</p>
      {pairs.map(([a, b]) => {
        const winner = winnersShown ? (label === 'Quarters' ? (R2.flat().includes(a) ? a : b) : label === 'Semis' ? (R3.flat().includes(a) ? a : b) : CHAMP) : null;
        return (
          <motion.div key={a + b} initial={{ opacity: 0, x: -12 }} animate={{ opacity: shown ? 1 : 0, x: shown ? 0 : -12 }} transition={{ duration: 0.3 }}
            className="overflow-hidden rounded-[1.2cqh]" style={{ background: 'rgba(0,0,0,.3)', border: `1px solid ${LINE}` }}>
            {[a, b].map((p, i) => (
              <p key={p} className="flex items-center justify-between px-[1.6cqw] py-[0.7cqh] font-extrabold" style={{ fontSize: '1.75cqh', borderTop: i ? `1px solid ${LINE}` : undefined, color: winner && winner !== p ? MUTED : TEXT, textDecoration: winner && winner !== p ? 'line-through' : undefined }}>
                <span className="truncate">{p}</span>{winner === p && <Check style={{ width: '1.8cqh', height: '1.8cqh', color: G }} />}
              </p>
            ))}
          </motion.div>
        );
      })}
    </div>
  );
  const bracket = (
    <div className="flex h-full flex-col justify-center gap-[3cqh] px-[4cqw]">
      <Caption text="The bracket runs itself" />
      <div className="flex gap-[2cqw] p-[2cqh]" style={{ ...card, height: '46cqh' }}>
        {round(R1, true, step >= 1, 'Quarters')}
        {round(R2, step >= 1, step >= 2, 'Semis')}
        {round(R3, step >= 2, step >= 3, 'Final')}
      </div>
      <p className="text-center font-bold" style={{ fontSize: '2.2cqh', color: MUTED }}>Knockout or arena · live or daily</p>
    </div>
  );

  const live = (
    <div className="flex h-full flex-col justify-center gap-[2.4cqh] px-[4cqw]">
      <Caption text="Anyone can watch. No sign-up." />
      <p className="flex items-center justify-center gap-[1.4cqw] font-black" style={{ fontSize: '2.2cqh', color: RED }}><Radio className="animate-pulse" style={{ width: '2.4cqh', height: '2.4cqh' }} /> 4 games live</p>
      <div className="grid grid-cols-2 justify-items-center gap-[2.4cqw]">
        {LIVE_GAMES.map((g, k) => {
          const p = g[Math.min(step, g.length - 1)];
          return (
            <motion.div key={k} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: k * 0.08 }} className="space-y-[0.5cqh] rounded-[1.4cqh] p-[1cqh]" style={{ background: CARD, border: `1px solid ${LINE}` }}>
              <p className="truncate font-extrabold" style={{ fontSize: '1.6cqh', color: step % 2 === 1 ? G : TEXT, width: boardPx }}>{LIVE_NAMES[k][1]}</p>
              <ThemedMiniBoard fen={p.fen} size={boardPx} lastMove={p.lastMove} />
              <p className="truncate font-extrabold" style={{ fontSize: '1.6cqh', color: step % 2 === 0 ? G : TEXT, width: boardPx }}>{LIVE_NAMES[k][0]}</p>
            </motion.div>
          );
        })}
      </div>
      <p className="text-center font-bold" style={{ fontSize: '2cqh', color: MUTED }}>Fullscreen it for the office TV or your stream</p>
    </div>
  );

  const champ = (
    <div className="relative flex h-full flex-col items-center justify-center gap-[2.4cqh] text-center">
      {Array.from({ length: 26 }).map((_, k) => (
        <motion.span key={k} initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }} animate={{ x: Math.cos(k * 1.7) * (120 + (k % 5) * 30), y: Math.sin(k * 1.7) * (140 + (k % 4) * 40) + 120, opacity: 0, rotate: k * 40 }} transition={{ duration: 1.6, ease: 'easeOut' }}
          className="absolute left-1/2 top-[38%] block rounded-[2px]" style={{ width: 8, height: 14, background: [G, GOLD, '#fff', '#5FA8E8'][k % 4] }} />
      ))}
      <motion.div initial={{ scale: 0.2, y: 40 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 12 }}>
        <Trophy style={{ width: '17cqh', height: '17cqh', color: GOLD }} strokeWidth={1.5} />
      </motion.div>
      <p className="font-black uppercase tracking-[0.18em]" style={{ fontSize: '2.2cqh', color: GOLD }}>Champion</p>
      <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="font-black" style={{ fontSize: '7cqh', color: TEXT, letterSpacing: '-0.03em' }}>{CHAMP}</motion.p>
      <p className="font-bold" style={{ fontSize: '2.4cqh', color: MUTED }}>{opts.name}</p>
    </div>
  );

  const end = (
    <div className="flex h-full flex-col items-center justify-center gap-[2.6cqh] px-[7cqw] text-center">
      <motion.p initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="font-black leading-[1.05]" style={{ fontSize: '7cqh', color: TEXT, letterSpacing: '-0.03em' }}>{brand(opts.closer)}</motion.p>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="font-black" style={{ fontSize: '4.2cqh', color: TEXT }}>Chess<span style={{ color: G }}>Scout</span>.net</motion.p>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="font-bold" style={{ fontSize: '2.4cqh', color: MUTED }}>chessscout.net/tournaments</motion.p>
    </div>
  );

  const look = useReelLook(opts.look, scene, step);
  const body = scene === 'hook' ? hook : scene === 'create' ? create : scene === 'invite' ? invite : scene === 'bracket' ? bracket : scene === 'live' ? live : scene === 'champ' ? champ : scene === 'end' ? end : null;
  const frame = (
    <div ref={frameRef} className="relative overflow-hidden" style={{ ...font, ...reelFrameSize(clean || render), background: `radial-gradient(ellipse at 50% 0%, #12301F 0%, ${BG} 60%)` }}
      onClick={() => { if (clean && (scene === 'end' || scene === 'idle')) setClean(false); }}>
      <EngageOverlay text={opts.engage} show={scene === 'end'} />
      {!blank && (
        <AnimatePresence mode="wait">
          <motion.div key={scene} className="absolute inset-0" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.28 }}><LookOverride look={look}>{body}</LookOverride></motion.div>
        </AnimatePresence>
      )}
      {!blank && scene !== 'idle' && scene !== 'end' && (
        <p className="absolute inset-x-0 bottom-[3cqh] text-center font-black" style={{ fontSize: '2.2cqh', color: 'rgba(245,247,246,.55)' }}>Chess<span style={{ color: G }}>Scout</span>.net</p>
      )}
    </div>
  );

  if (render || clean) return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">{frame}</div>;
  const field = (k: 'hook' | 'who' | 'name' | 'closer', label: string) => (
    <label className="block text-[12px] text-white/60">{label}<input value={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10" /></label>
  );
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0B1112]/95 text-white">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 p-4 lg:flex-row lg:items-start">
        <div className="flex w-full items-center justify-between lg:hidden">
          <p className="font-black">Tournament reel</p>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
        </div>
        {frame}
        <div className="w-full max-w-[420px] space-y-3">
          <div className="hidden items-center justify-between lg:flex">
            <p className="text-[17px] font-black">Tournament reel</p>
            <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
          </div>
          <p className="text-[12.5px] text-white/60">About 21 seconds: the hook, making a tournament (name, knockout, daily, logo), sharing the link while players join, the bracket playing out, four boards live for anyone to watch, the champion, then your closing line. The players are made-up demo names, not real users.</p>
          <HookPicker topics={['tournament']} onPick={(h) => setOpts({ ...opts, hook: hookLine(h) })} />
          {field('hook', 'Hook')}
          {field('who', 'Who it’s for (comma-separated, they flip under the hook)')}
          {field('name', 'Tournament name in the demo')}
          {field('closer', 'Closing line')}
          <label className="block text-[12px] text-white/60">Music
            <select value={opts.music} onChange={(e) => setOpts({ ...opts, music: e.target.value as MusicStyle })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10">
              {(['hype', 'epic', 'playful', 'lofi', 'suspense', 'off'] as MusicStyle[]).map((m) => <option key={m} value={m} className="bg-[#0B1112]">{m === 'off' ? 'No music' : m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
          </label>
          <LookPicker value={opts.look} onChange={(v) => setOpts({ ...opts, look: v })} />
          <EngagePicker kind="promo" value={opts.engage} onChange={(v) => setOpts({ ...opts, engage: v })} />
          <CaptionBox key={opts.engage ?? ''} text={withEngage(opts.engage, `Run a chess tournament for your ${whoList.slice(0, 3).join(', ') || 'club or friends'}, free 🏆\nMake it, share one link, everyone joins. Anyone can watch the boards live.\n\nHost yours at chessscout.net/tournaments\n\n#chess #chesstournament #chessclub #chesscommunity #chessscout`)} />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => play()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white"><Play size={14} />Replay</button>
            <button onClick={enterClean} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black"><Maximize2 size={14} />Clean view</button>
            <RenderMp4 name="chessscout-tournament-reel" shareText="Run your own chess tournament free · chessscout.net/tournaments 🏆" payload={() => ({ source: { kind: 'tournamentReel', opts }, prefs: {} })} />
          </div>
        </div>
      </div>
    </div>
  );
}
