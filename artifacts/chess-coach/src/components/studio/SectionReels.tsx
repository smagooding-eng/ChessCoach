// Promo reels for each section of the app (about 15-20 seconds, 9:16), in the
// same style as the tournament reel: a hook with flipping words, a few scenes
// showing the feature on the real board, then the closing line and the link.
// Every claim matches what the app does today; example data is labelled
// "Example" and players are made-up names. Also played by the video maker.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Maximize2, Swords, Search, Target, BookOpen, Zap, Crown, Puzzle, Camera, Crosshair, Baby, Check, Lock, Radio } from 'lucide-react';
import { playMoveSound } from '@/context/SettingsContext';
import { routeSoundsTo } from '@/lib/sounds';
import { StudioMusic, type MusicStyle } from './studioMusic';
import { RenderMp4 } from './RenderMp4';
import { ChessBoard, type MoveQuality } from '@/components/ChessBoard';
import { positionsFromSan } from '@/hooks/use-move-browser';
import { MOTIFS } from '@/lib/tactics';

const G = '#81B64C', BG = '#0B1112', CARD = '#141D1F', LINE = '#243033', TEXT = '#F5F7F6', MUTED = '#8E9996', GOLD = '#E8B447', RED = '#E5484D', ORANGE = '#F2A93B';

type IconKey = 'swords' | 'search' | 'target' | 'book' | 'zap' | 'crown' | 'puzzle' | 'camera' | 'crosshair' | 'baby';
const ICONS: Record<IconKey, typeof Swords> = { swords: Swords, search: Search, target: Target, book: BookOpen, zap: Zap, crown: Crown, puzzle: Puzzle, camera: Camera, crosshair: Crosshair, baby: Baby };

type Arrow = { from: string; to: string; color?: string };
export type ReelScene =
  | { type: 'hook'; icon: IconKey; title: string; flips: string[] }
  | { type: 'board'; caption: string; sans: string[]; fen?: string; stepMs?: number; badges?: Record<number, MoveQuality>; arrows?: Record<number, Arrow[]>; say?: Record<number, string>; top?: string; bottom?: string; clocks?: [number, number]; tag?: string; flipped?: boolean; live?: boolean }
  | { type: 'list'; caption: string; title: string; items: { label: string; sub?: string; pct?: number; color?: string; pro?: boolean }[]; tag?: string; typed?: string }
  | { type: 'chips'; caption: string; title: string; chips: string[]; pick: number[]; note?: string }
  | { type: 'photo'; caption: string; fen: string; best: Arrow; say: string };

export interface SectionDef { id: string; label: string; scenes: ReelScene[]; closer: string; url: string; caption: string }

const motif = (id: string) => MOTIFS.find((m) => m.id === id)?.demo;
const demoBoard = (id: string, caption: string, extra: Partial<Extract<ReelScene, { type: 'board' }>> = {}): ReelScene => {
  const d = motif(id);
  const sans = d?.steps.map((s) => s.san) ?? [];
  const say: Record<number, string> = {};
  d?.steps.forEach((s, k) => { if (s.say) say[k + 1] = s.say; });
  return { type: 'board', caption, fen: d?.fen, sans, say: { 0: d?.intro ?? '', ...say }, stepMs: 1500, ...extra };
};

const OPERA = 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(' ');

export const SECTIONS: SectionDef[] = [
  { id: 'live', label: 'Live play ⚡', closer: 'Play free now', url: 'chessscout.net/live', caption: 'Live chess, daily chess or a bot, then a free review of every game. ⚡',
    scenes: [
      { type: 'hook', icon: 'swords', title: 'Play chess online', flips: ['blitz', 'rapid', 'daily', 'against bots'] },
      { type: 'chips', caption: 'Pick your speed', title: 'Play online', chips: ['5 min', '5 | 3', '10 min', '15 min', 'Daily · 1 day', '3 days', '7 days'], pick: [2], note: 'Finding a game…' },
      { type: 'board', caption: 'Game found!', sans: OPERA, stepMs: 260, top: 'Opponent', bottom: 'You', clocks: [600, 600], badges: { 33: 'checkmate' }, live: true },
      { type: 'list', caption: 'Then a free review, right away', title: 'Game over · you won', items: [{ label: 'Every move rated by Stockfish' }, { label: 'Your best moves and your mistakes' }, { label: 'Saved to your games' }] },
    ] },
  { id: 'review', label: 'Game review 🔍', closer: 'Review your games free', url: 'chessscout.net', caption: 'Free game review: every move rated, and what you should have played instead. 🔍',
    scenes: [
      { type: 'hook', icon: 'search', title: 'Find out why you lost', flips: ['every move rated', 'your blunders', 'your best moves', 'what to play instead'] },
      { type: 'board', caption: 'Every move, rated by Stockfish', sans: 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#'.split(' '), stepMs: 1100, top: 'Opponent', bottom: 'You', flipped: true,
        badges: { 1: 'book', 2: 'book', 3: 'good', 4: 'good', 5: 'inaccuracy', 6: 'blunder', 7: 'checkmate' },
        arrows: { 6: [{ from: 'g7', to: 'g6', color: G }] }, say: { 6: 'Blunder. g6 stops the mate.', 7: 'Checkmate.' } },
      { type: 'list', caption: 'See exactly what went wrong', title: 'Move labels', items: [{ label: 'Brilliant', color: '#1BACA6' }, { label: 'Best', color: G }, { label: 'Inaccuracy', color: GOLD }, { label: 'Mistake', color: ORANGE }, { label: 'Blunder', color: RED }, { label: 'The AI coach explains why', pro: true }] },
    ] },
  { id: 'weaknesses', label: 'Weaknesses 🎯', closer: 'Find your weaknesses free', url: 'chessscout.net', caption: "What's really losing you games? ChessScout finds it in your own games. 🎯",
    scenes: [
      { type: 'hook', icon: 'target', title: "What's losing you games?", flips: ['missed tactics', 'bad openings', 'lost endgames', 'time trouble'] },
      { type: 'list', caption: 'Found in your own games', title: 'Your weaknesses', tag: 'Example', items: [{ label: 'Tactical awareness', sub: 'HIGH', pct: 72, color: RED }, { label: 'Opening preparation', sub: 'MEDIUM', pct: 38, color: GOLD }, { label: 'Endgame technique', sub: 'MEDIUM', pct: 34, color: GOLD }, { label: 'Positional play', sub: 'LOW', pct: 22, color: G }] },
      { type: 'list', caption: 'Then train exactly that', title: 'Your plan', items: [{ label: 'Tactics drills for your weak spots' }, { label: 'Openings you actually play' }, { label: 'Patterns across all your games', pro: true }, { label: 'Personalized courses', pro: true }] },
    ] },
  { id: 'openings', label: 'Openings 📖', closer: 'Train your openings free', url: 'chessscout.net/openings', caption: 'Learn openings by playing them. The trainer plays the other side, and hints show every move. 📖',
    scenes: [
      { type: 'hook', icon: 'book', title: 'Learn openings by playing them', flips: ['Italian Game', 'Sicilian', "Queen's Gambit", 'London System'] },
      { type: 'board', caption: 'The trainer plays the other side', sans: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4'.split(' '), stepMs: 900, top: 'Trainer', bottom: 'You',
        arrows: { 0: [{ from: 'e2', to: 'e4', color: G }], 2: [{ from: 'g1', to: 'f3', color: G }], 4: [{ from: 'f1', to: 'c4', color: G }], 6: [{ from: 'c2', to: 'c3', color: G }], 8: [{ from: 'd2', to: 'd4', color: G }] },
        say: { 0: 'Hints on: the arrow shows your move.', 6: 'Italian Game · Giuoco Piano' } },
      { type: 'list', caption: 'Every opening, several lines', title: 'Italian Game', items: [{ label: 'Main line · Giuoco Piano' }, { label: 'Two Knights (…Nf6)' }, { label: 'Hungarian (…Be7)' }, { label: 'Early …d6' }] },
    ] },
  { id: 'tactics', label: 'Tactics ⚔️', closer: 'Train tactics free', url: 'chessscout.net/tactics', caption: 'Forks, pins, skewers and more: see each one, then drill it. ⚔️',
    scenes: [
      { type: 'hook', icon: 'zap', title: 'Stop missing tactics', flips: ['forks', 'pins', 'skewers', 'discovered attacks'] },
      demoBoard('fork', 'See the pattern…'),
      demoBoard('skewer', '…then spot it yourself'),
      { type: 'list', caption: 'Every pattern, step by step', title: 'Tactics', items: [{ label: 'A demo for every pattern' }, { label: 'Guided practice, then drills' }, { label: 'Speed rounds', pro: true }, { label: 'Tactics you missed in your games', pro: true }] },
    ] },
  { id: 'endgames', label: 'Endgames 👑', closer: 'Master endgames free', url: 'chessscout.net/endgames', caption: 'Checkmate patterns and endgames, shown move by move. 👑',
    scenes: [
      { type: 'hook', icon: 'crown', title: 'Win the endgame', flips: ['checkmate patterns', 'pawn endgames', 'rook endgames', 'promotion'] },
      demoBoard('back-rank', 'Recognise the finish'),
      demoBoard('promotion', 'Push the pawn home'),
      { type: 'list', caption: 'From mates to the last few pawns', title: 'Endgames', items: [{ label: 'Back-rank, smothered, Arabian and more' }, { label: 'Pawn, rook and queen endgames' }, { label: 'Drills with three tries' }] },
    ] },
  { id: 'puzzles', label: 'Puzzles 🧩', closer: 'Unlimited puzzles, free', url: 'chessscout.net/puzzles', caption: 'Unlimited free puzzles with hints. Can you solve it? 🧩',
    scenes: [
      { type: 'hook', icon: 'puzzle', title: 'Unlimited free puzzles', flips: ['no daily limit', 'hints when you need them', 'every theme'] },
      demoBoard('mate-in-2', 'White to play. Can you find it?', { badges: {} }),
      { type: 'list', caption: 'As many as you want', title: 'Puzzles', items: [{ label: 'Unlimited, free' }, { label: 'Hints show the next move' }, { label: 'AI explanations', pro: true }] },
    ] },
  { id: 'scan', label: 'Scan a position 📸', closer: 'Scan your board', url: 'chessscout.net/scan', caption: 'Snap a photo of any chess board and see the best move. 📸',
    scenes: [
      { type: 'hook', icon: 'camera', title: 'Snap a photo of any board', flips: ['over the board', 'a book', 'a screenshot'] },
      { type: 'photo', caption: 'Photo in, position out', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', best: { from: 'h5', to: 'f7', color: G }, say: 'Best move: Qxf7#' },
      { type: 'list', caption: 'Then keep going from there', title: 'Scan a position', items: [{ label: 'Best move and the line after it' }, { label: 'Analyze it or play it out' }, { label: 'Part of ChessScout Pro', pro: true }] },
    ] },
  { id: 'scout', label: 'Opponent Scout 🕵️', closer: 'Scout your next opponent', url: 'chessscout.net/opponents', caption: 'Type any username and see what they play before your game. 🕵️',
    scenes: [
      { type: 'hook', icon: 'crosshair', title: 'Know your opponent first', flips: ['their openings', 'their weak spots', 'how they lose'] },
      { type: 'list', caption: 'Type any username', title: 'Opponent Scout', typed: 'their_username', tag: 'Example', items: [{ label: 'Favourite opening as white', sub: 'Italian Game', pct: 46, color: G }, { label: 'Favourite defence as black', sub: 'Sicilian', pct: 41, color: G }, { label: 'Games they lose on time', pct: 18, color: GOLD }] },
      { type: 'list', caption: 'Walk in prepared', title: 'Your prep', items: [{ label: 'Their stats, unlimited and free' }, { label: 'Their results with each opening' }, { label: 'AI weaknesses and prep', pro: true }] },
    ] },
  { id: 'kids', label: 'Kids 🧒', closer: 'Start your kids free', url: 'chessscout.net/kids', caption: 'Chess for kids: short lessons, one piece at a time. 🧒',
    scenes: [
      { type: 'hook', icon: 'baby', title: 'Teach your kids chess', flips: ['one piece at a time', 'short lessons', 'tactics for kids'] },
      { type: 'board', caption: 'One piece at a time', fen: '7k/8/8/8/8/8/8/R6K w - - 0 1', sans: ['Ra7', 'Kg8', 'Ra8+'], stepMs: 1300, say: { 0: 'The rook moves in straight lines.', 1: 'Straight up the board…', 3: '…then across the top. Check!' } },
      { type: 'list', caption: 'Made for young players', title: 'Kids', items: [{ label: 'Step-by-step lessons for every piece' }, { label: 'Kid-friendly tactics' }, { label: 'Kid Mode keeps them on the kids pages' }] },
    ] },
];

export interface SectionReelOpts { section: string; hook: string; closer: string; music: MusicStyle }

const brand = (t: string) => {
  const m = t.match(/^(.*?)(chess)(scout)(\.net)?(.*)$/i);
  return m ? <>{m[1]}{m[2]}<span style={{ color: G }}>{m[3]}</span>{m[4]}{m[5]}</> : t;
};
const card = { background: CARD, border: `1px solid ${LINE}`, borderRadius: '2.2cqh' } as const;
function Caption({ text }: { text: string }) {
  return <motion.p key={text} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
    className="px-[6cqw] text-center font-black leading-tight" style={{ fontSize: '4.3cqh', color: TEXT, letterSpacing: '-0.02em' }}>{brand(text)}</motion.p>;
}
function Tag({ text }: { text: string }) {
  return <span className="rounded-full px-[2.4cqw] py-[0.4cqh] font-black uppercase tracking-[0.12em]" style={{ fontSize: '1.4cqh', background: 'rgba(255,255,255,.08)', color: MUTED }}>{text}</span>;
}
const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

/** How long each scene runs (ms). */
function sceneMs(s: ReelScene): number {
  if (s.type === 'hook') return 700 + s.flips.length * 650 + 300;
  if (s.type === 'board') return 600 + s.sans.length * (s.stepMs ?? 900) + 1100;
  if (s.type === 'list') return 600 + (s.typed ? 900 : 0) + s.items.length * 380 + 1400;
  if (s.type === 'chips') return 700 + s.pick.length * 600 + 1300;
  return 4200; // photo
}
const sceneSteps = (s: ReelScene) => (s.type === 'hook' ? s.flips.length : s.type === 'board' ? s.sans.length : s.type === 'list' ? s.items.length : s.type === 'chips' ? s.pick.length : 3);
const firstStepAt = (s: ReelScene) => (s.type === 'hook' ? 700 : s.type === 'board' ? 600 : s.type === 'list' ? 600 + (s.typed ? 900 : 0) : s.type === 'chips' ? 700 : 500);
const stepGap = (s: ReelScene) => (s.type === 'hook' ? 650 : s.type === 'board' ? (s.stepMs ?? 900) : s.type === 'list' ? 380 : s.type === 'chips' ? 600 : 1100);

export function SectionReel({ opts: initial, render = false, onClose }: { opts?: SectionReelOpts; render?: boolean; onClose: () => void }) {
  const [opts, setOpts] = useState<SectionReelOpts>(initial ?? { section: 'live', hook: '', closer: '', music: 'hype' });
  const def = SECTIONS.find((s) => s.id === opts.section) ?? SECTIONS[0];
  const scenes: ReelScene[] = def.scenes.map((s, k) => (k === 0 && s.type === 'hook' && opts.hook.trim() ? { ...s, title: opts.hook } : s));
  const closer = opts.closer.trim() || def.closer;
  const [k, setK] = useState(-1); // scene index; scenes.length = end card
  const [step, setStep] = useState(0);
  const [typedN, setTypedN] = useState(0);
  const [clean, setClean] = useState(false);
  const [blank, setBlank] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const music = useRef<StudioMusic | null>(null);
  const mus = () => (music.current ??= new StudioMusic());
  const rec = useRef<MediaRecorder | null>(null);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const at = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  useEffect(() => () => { clear(); music.current?.stop(); routeSoundsTo(null, null); }, []);

  const play = (onDone?: () => void) => {
    clear();
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); m.stop(); if (opts.music !== 'off') m.start(opts.music); } catch { /* ignore */ }
    let t = 0;
    scenes.forEach((s, j) => {
      at(t, () => { setK(j); setStep(0); setTypedN(0); if (j > 0) mus().accent('whoosh'); else mus().accent('riser'); });
      if (s.type === 'list' && s.typed) for (let c = 1; c <= s.typed.length; c++) at(t + 300 + (c * 600) / s.typed.length, () => setTypedN(c));
      const n = sceneSteps(s);
      for (let i = 1; i <= n; i++) {
        at(t + firstStepAt(s) + (i - 1) * stepGap(s), () => {
          setStep(i);
          if (s.type === 'board') { const san = s.sans[i - 1] ?? ''; playMoveSound(san.includes('#') || san.includes('+') ? 'check' : san.includes('x') ? 'capture' : san.startsWith('O-') ? 'castle' : 'move'); }
          else if (s.type === 'chips' || s.type === 'photo') mus().accent('tick');
        });
      }
      t += sceneMs(s);
    });
    at(t, () => { setK(scenes.length); setStep(0); mus().accent('impact'); });
    at(t + 3400, () => { music.current?.stop(); onDone?.(); });
  };
  useEffect(() => { if (!render) play(); }, [opts.section]); // eslint-disable-line react-hooks/exhaustive-deps
  const enterClean = () => { clear(); music.current?.stop(); setClean(true); setBlank(true); setK(-1); at(5000, () => { setBlank(false); play(); }); };

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

  // ── Drawing a scene ──────────────────────────────────────────────────────
  const drawScene = (s: ReelScene): ReactNode => {
    if (s.type === 'hook') {
      const Icon = ICONS[s.icon];
      return (
        <div className="flex h-full flex-col items-center justify-center gap-[3cqh] px-[7cqw] text-center">
          <motion.div initial={{ scale: 0.4, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}
            className="grid place-items-center rounded-[3cqh]" style={{ width: '15cqh', height: '15cqh', background: `linear-gradient(160deg, ${G}, #4E7A2A)` }}>
            <Icon style={{ width: '8.5cqh', height: '8.5cqh', color: '#fff' }} strokeWidth={1.8} />
          </motion.div>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-black leading-[1.05]" style={{ fontSize: '6.4cqh', color: TEXT, letterSpacing: '-0.03em' }}>{brand(s.title)}</motion.p>
          <div className="h-[6cqh]">
            <AnimatePresence mode="wait">
              {step > 0 && <motion.p key={step} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.22 }}
                className="font-black" style={{ fontSize: '4.6cqh', color: G }}>{s.flips[Math.min(step, s.flips.length) - 1]}</motion.p>}
            </AnimatePresence>
          </div>
        </div>
      );
    }
    if (s.type === 'board') {
      const pos = positionsFromSan(s.sans, s.fen);
      const p = pos[Math.min(step, pos.length - 1)];
      const quality = s.badges?.[step] ?? null;
      const arrows = s.arrows?.[step] ?? [];
      const sayKey = Object.keys(s.say ?? {}).map(Number).filter((n) => n <= step).sort((a, b) => b - a)[0];
      const say = sayKey !== undefined ? s.say?.[sayKey] : undefined;
      // Clocks tick down a little each move on the side that moved.
      const spent = (side: 0 | 1) => { let x = 0; for (let i = 0; i < step; i++) if (i % 2 === side) x += 2 + ((i * 7) % 9); return x; };
      const wClock = s.clocks ? s.clocks[0] - spent(0) : null, bClock = s.clocks ? s.clocks[1] - spent(1) : null;
      const turnW = step % 2 === 0;
      const name = (label: string | undefined, c: number | null, active: boolean) => label ? (
        <div className="flex items-center justify-between px-[1cqw] font-extrabold" style={{ fontSize: '2.2cqh', color: TEXT }}>
          <span>{label}</span>
          {c != null && <span className="rounded-[1cqh] px-[2cqw] py-[0.3cqh] tabular-nums" style={{ background: active ? G : 'rgba(0,0,0,.35)', color: '#fff' }}>{clock(c)}</span>}
        </div>
      ) : null;
      const topIsWhite = !!s.flipped;
      return (
        <div className="flex h-full flex-col justify-center gap-[1.6cqh] px-[5cqw]">
          <Caption text={s.caption} />
          <div className="flex items-center justify-center gap-[2cqw]">
            {s.live && <span className="flex items-center gap-[1cqw] font-black" style={{ fontSize: '1.8cqh', color: RED }}><Radio className="animate-pulse" style={{ width: '2cqh', height: '2cqh' }} /> LIVE</span>}
            {s.tag && <Tag text={s.tag} />}
          </div>
          <div className="space-y-[1cqh] p-[1.4cqh]" style={card}>
            {name(s.top, topIsWhite ? wClock : bClock, topIsWhite ? turnW : !turnW)}
            <ChessBoard fen={p?.fen} lastMove={p?.lastMove ?? null} moveQuality={quality} arrows={arrows} flipped={s.flipped} maxWidthOverride="100%" animationMs={Math.min(220, (s.stepMs ?? 900) - 60)} suppressConfirmMoves />
            {name(s.bottom, topIsWhite ? bClock : wClock, topIsWhite ? !turnW : turnW)}
          </div>
          <div className="h-[6cqh]">
            <AnimatePresence mode="wait">
              {say && <motion.p key={say} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center font-extrabold leading-snug" style={{ fontSize: '2.5cqh', color: TEXT }}>{say}</motion.p>}
            </AnimatePresence>
          </div>
        </div>
      );
    }
    if (s.type === 'list') {
      return (
        <div className="flex h-full flex-col justify-center gap-[3cqh] px-[6cqw]">
          <Caption text={s.caption} />
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="space-y-[1.8cqh] p-[2.6cqh]" style={card}>
            <div className="flex items-center justify-between gap-[2cqw]">
              <p className="font-black uppercase tracking-[0.14em]" style={{ fontSize: '1.7cqh', color: MUTED }}>{s.title}</p>
              {s.tag && <Tag text={s.tag} />}
            </div>
            {s.typed && (
              <div className="flex items-center gap-[2cqw] rounded-[1.4cqh] px-[3cqw] py-[1.4cqh]" style={{ background: 'rgba(0,0,0,.3)', border: `1px solid ${LINE}` }}>
                <Search style={{ width: '2.4cqh', height: '2.4cqh', color: G }} />
                <span className="font-bold" style={{ fontSize: '2.3cqh', color: TEXT }}>{s.typed.slice(0, typedN)}{typedN < s.typed.length && <span className="ml-[0.3cqw] inline-block animate-pulse" style={{ width: '0.4cqw', height: '2.3cqh', background: G, verticalAlign: 'middle' }} />}</span>
              </div>
            )}
            {s.items.slice(0, step).map((it) => (
              <motion.div key={it.label} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
                <div className="flex items-center justify-between gap-[2cqw]">
                  <span className="flex min-w-0 items-center gap-[2cqw] font-extrabold" style={{ fontSize: '2.4cqh', color: TEXT }}>
                    {it.pct == null && <span className="grid shrink-0 place-items-center rounded-full" style={{ width: '3cqh', height: '3cqh', background: it.color ?? (it.pro ? GOLD : G) }}>{it.pro ? <Lock style={{ width: '1.7cqh', height: '1.7cqh', color: '#fff' }} /> : <Check style={{ width: '1.9cqh', height: '1.9cqh', color: '#fff' }} />}</span>}
                    <span className="min-w-0">{it.label}</span>
                  </span>
                  {it.pro && <span className="shrink-0 rounded px-[1.4cqw] py-[0.2cqh] font-black" style={{ fontSize: '1.4cqh', background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}55` }}>PRO</span>}
                  {it.sub && it.pct != null && <span className="shrink-0 font-black" style={{ fontSize: '1.6cqh', color: it.color ?? G }}>{it.sub}</span>}
                </div>
                {it.sub && it.pct == null && <p className="pl-[5cqw] font-bold" style={{ fontSize: '1.9cqh', color: MUTED }}>{it.sub}</p>}
                {it.pct != null && (
                  <div className="mt-[0.8cqh] h-[1cqh] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.09)' }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${it.pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} className="h-full rounded-full" style={{ background: it.color ?? G }} />
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      );
    }
    if (s.type === 'chips') {
      return (
        <div className="flex h-full flex-col justify-center gap-[3cqh] px-[6cqw]">
          <Caption text={s.caption} />
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="space-y-[2cqh] p-[2.6cqh]" style={card}>
            <p className="font-black uppercase tracking-[0.14em]" style={{ fontSize: '1.7cqh', color: MUTED }}>{s.title}</p>
            <div className="flex flex-wrap gap-[2cqw]">
              {s.chips.map((c, i) => {
                const on = s.pick.slice(0, step).includes(i);
                return <motion.span key={c} animate={{ scale: on ? [1, 1.12, 1] : 1 }} transition={{ duration: 0.3 }} className="rounded-[1.4cqh] px-[3.2cqw] py-[1.2cqh] font-extrabold"
                  style={{ fontSize: '2.3cqh', background: on ? G : 'rgba(255,255,255,.06)', color: on ? '#fff' : TEXT, border: `1px solid ${on ? G : LINE}` }}>{c}</motion.span>;
              })}
            </div>
            {s.note && step >= s.pick.length && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-[2cqw] font-extrabold" style={{ fontSize: '2.3cqh', color: G }}>
              <span className="inline-block animate-spin rounded-full" style={{ width: '2.4cqh', height: '2.4cqh', border: `0.4cqh solid ${G}`, borderTopColor: 'transparent' }} />{s.note}</motion.p>}
          </motion.div>
        </div>
      );
    }
    // photo → board → best move
    return (
      <div className="flex h-full flex-col justify-center gap-[2cqh] px-[5cqw]">
        <Caption text={s.caption} />
        <div className="relative space-y-[1cqh] p-[1.4cqh]" style={card}>
          <div className="relative">
            <ChessBoard fen={s.fen} arrows={step >= 2 ? [s.best] : []} maxWidthOverride="100%" suppressConfirmMoves />
            <AnimatePresence>
              {step < 1 && <motion.div key="cam" exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center rounded-[1cqh]" style={{ background: 'rgba(0,0,0,.72)' }}>
                <div className="text-center"><Camera style={{ width: '9cqh', height: '9cqh', color: '#fff', margin: '0 auto' }} /><p className="mt-[1cqh] font-black" style={{ fontSize: '2.4cqh', color: TEXT }}>Taking the photo…</p></div>
              </motion.div>}
            </AnimatePresence>
            {step === 1 && <motion.div initial={{ top: '0%' }} animate={{ top: '100%' }} transition={{ duration: 1 }} className="pointer-events-none absolute inset-x-0 h-[0.6cqh]" style={{ background: G, boxShadow: `0 0 20px ${G}` }} />}
          </div>
        </div>
        <div className="h-[6cqh]">{step >= 2 && <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center font-black" style={{ fontSize: '3cqh', color: G }}>{s.say}</motion.p>}</div>
      </div>
    );
  };

  const end = (
    <div className="flex h-full flex-col items-center justify-center gap-[2.6cqh] px-[7cqw] text-center">
      <motion.p initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="font-black leading-[1.05]" style={{ fontSize: '7cqh', color: TEXT, letterSpacing: '-0.03em' }}>{brand(closer)}</motion.p>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="font-black" style={{ fontSize: '4.2cqh', color: TEXT }}>Chess<span style={{ color: G }}>Scout</span>.net</motion.p>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="font-bold" style={{ fontSize: '2.4cqh', color: MUTED }}>{def.url}</motion.p>
    </div>
  );

  const body = k < 0 ? null : k >= scenes.length ? end : drawScene(scenes[k]);
  const frame = (
    <div className="relative overflow-hidden" style={{ fontFamily: 'Inter, system-ui, sans-serif', aspectRatio: '9 / 16', height: clean || render ? '100dvh' : 'min(78dvh, 820px)', maxWidth: '100%', containerType: 'size', background: `radial-gradient(ellipse at 50% 0%, #12301F 0%, ${BG} 60%)` }}
      onClick={() => { if (clean && (k < 0 || k >= scenes.length)) setClean(false); }}>
      {!blank && (
        <AnimatePresence mode="wait">
          <motion.div key={`${opts.section}-${k}`} className="absolute inset-0" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.28 }}>{body}</motion.div>
        </AnimatePresence>
      )}
      {!blank && k >= 0 && k < scenes.length && (
        <p className="absolute inset-x-0 bottom-[2.6cqh] text-center font-black" style={{ fontSize: '2.2cqh', color: 'rgba(245,247,246,.55)' }}>Chess<span style={{ color: G }}>Scout</span>.net</p>
      )}
    </div>
  );

  if (render || clean) return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">{frame}</div>;
  const total = Math.round((scenes.reduce((a, s) => a + sceneMs(s), 0) + 3400) / 1000);
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0B1112]/95 text-white">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 p-4 lg:flex-row lg:items-start">
        <div className="flex w-full items-center justify-between lg:hidden">
          <p className="font-black">Section promos</p>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
        </div>
        {frame}
        <div className="w-full max-w-[440px] space-y-3">
          <div className="hidden items-center justify-between lg:flex">
            <p className="text-[17px] font-black">Section promos</p>
            <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SECTIONS.map((s) => (
              <button key={s.id} onClick={() => setOpts({ ...opts, section: s.id, hook: '', closer: '' })} className="rounded-lg px-3 py-1.5 text-[12.5px] font-black"
                style={{ background: opts.section === s.id ? G : 'rgba(255,255,255,.08)', color: '#fff' }}>{s.label}</button>
            ))}
          </div>
          <p className="text-[12.5px] text-white/60">About {total} seconds. Example data is labelled "Example" and players are made-up names. Everything it says matches what the app does today.</p>
          <label className="block text-[12px] text-white/60">Hook<input value={opts.hook} placeholder={def.scenes[0].type === 'hook' ? def.scenes[0].title : ''} onChange={(e) => setOpts({ ...opts, hook: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10 placeholder:text-white/35" /></label>
          <label className="block text-[12px] text-white/60">Closing line<input value={opts.closer} placeholder={def.closer} onChange={(e) => setOpts({ ...opts, closer: e.target.value })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10 placeholder:text-white/35" /></label>
          <label className="block text-[12px] text-white/60">Music
            <select value={opts.music} onChange={(e) => setOpts({ ...opts, music: e.target.value as MusicStyle })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10">
              {(['hype', 'epic', 'playful', 'lofi', 'suspense', 'off'] as MusicStyle[]).map((m) => <option key={m} value={m} className="bg-[#0B1112]">{m === 'off' ? 'No music' : m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
          </label>
          <div className="rounded-lg bg-white/5 p-2.5 text-[12px] text-white/75 ring-1 ring-white/10"><span className="font-bold text-white/50">Caption: </span>{def.caption} {def.url}</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => play()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white"><Play size={14} />Replay</button>
            <button onClick={enterClean} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black"><Maximize2 size={14} />Clean view</button>
            <RenderMp4 name={`chessscout-${def.id}-promo`} shareText={`${def.caption} ${def.url}`} payload={() => ({ source: { kind: 'sectionReel', opts }, prefs: {} })} />
          </div>
        </div>
      </div>
    </div>
  );
}
