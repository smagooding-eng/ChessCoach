// Crowd chess: the followers play a game one move a day. Each day's reel shows
// the move the comments chose yesterday (and the engine's reply, when it's
// followers vs ChessScout), then asks for the next move. You record the winning
// comment's move here (play it on the board), the engine answers, and you post
// that day's reel. The game is kept on the server (/api/admin/studio/crowd), so
// it's the same on every device. Also played by the video maker (kind "crowdReel").
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Maximize2, Undo2, Loader2, Cpu, Users, RotateCcw } from 'lucide-react';
import { Chess } from 'chess.js';
import { playMoveSound, LookOverride } from '@/context/SettingsContext';
import { routeSoundsTo } from '@/lib/sounds';
import { apiFetch } from '@/lib/api';
import { StudioMusic, type MusicStyle } from './studioMusic';
import { RenderMp4 } from './RenderMp4';
import { ChessBoard } from '@/components/ChessBoard';
import { reelFrameSize, CaptionBox, LookPicker, useReelLook, type ReelLook, EngagePicker, EngageOverlay, withEngage, PinnedBox, useBackToClose } from './reelKit';

export interface CrowdMove { san: string; by: 'crowd' | 'engine'; day: number; note?: string }
export interface CrowdGame { mode: 'engine' | 'both'; crowd: 'w' | 'b'; day: number; moves: CrowdMove[]; startedAt: string }
export interface CrowdReelOpts { game: CrowdGame; engage: string; music: MusicStyle; look?: ReelLook }

const G = '#81B64C', BG = '#0B1112', TEXT = '#F5F7F6', MUTED = '#8E9996', GOLD = '#E8B447', BLUE = '#5FA8E8';
const side = (c: 'w' | 'b') => (c === 'w' ? 'White' : 'Black');
const title = (g: CrowdGame) => (g.mode === 'engine' ? 'Followers vs ChessScout' : 'Followers play both sides');
const pgnOf = (moves: CrowdMove[]) => moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m.san}` : m.san)).join(' ');

type Scene = 'idle' | 'hook' | 'recap1' | 'recap2' | 'ask' | 'end';

/** The reel itself (also what the MP4 renderer plays). */
export function CrowdReel({ opts: initial, render = false, onClose }: { opts?: CrowdReelOpts; render?: boolean; onClose: () => void }) {
  useBackToClose(onClose, !render);
  const [opts, setOpts] = useState<CrowdReelOpts | null>(initial ?? null);
  const [scene, setScene] = useState<Scene>('idle');
  const [shownPlies, setShownPlies] = useState(0);
  const [clean, setClean] = useState(false);
  const [blank, setBlank] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const music = useRef<StudioMusic | null>(null);
  const mus = () => (music.current ??= new StudioMusic());
  const rec = useRef<MediaRecorder | null>(null);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const at = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  useEffect(() => () => { clear(); music.current?.stop(); routeSoundsTo(null, null); }, []);

  // ── Managing the game (not in renders) ───────────────────────────────────
  const [loaded, setLoaded] = useState(!!initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState('');
  const [resetArmed, setResetArmed] = useState(false);
  useEffect(() => {
    if (initial) return;
    apiFetch('/api/admin/studio/crowd').then((r) => (r.ok ? r.json() : null)).then((d) => {
      setOpts({ game: d?.game ?? null, engage: 'Most-liked comment gets played 👇', music: 'suspense' } as CrowdReelOpts);
      setLoaded(true);
    }).catch(() => { setErr("Couldn't load the game."); setLoaded(true); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (game: CrowdGame | null) => {
    setSaving(true); setErr(null);
    const r = await apiFetch('/api/admin/studio/crowd', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game }) }).catch(() => null);
    setSaving(false);
    if (!r?.ok) setErr("Couldn't save. Check your connection.");
  };
  const setGame = (game: CrowdGame | null) => { setOpts((o) => (o ? { ...o, game: game as CrowdGame } : o)); void save(game); };

  const game = opts?.game ?? null;
  const all = game?.moves ?? [];
  const chessAt = (n: number) => { const c = new Chess(); for (let i = 0; i < n; i++) c.move(all[i].san); return c; };
  // Today's reel shows the moves chosen since the last reel (this day's moves), then asks.
  const todays = game ? all.filter((m) => m.day === game.day) : [];
  const before = all.length - todays.length;
  const crowdToMove = game ? (chessAt(all.length).turn() === game.crowd || game.mode === 'both') : false;
  const over = game ? chessAt(all.length).isGameOver() : false;

  const engineReply = async (g: CrowdGame) => {
    const c = new Chess(); g.moves.forEach((m) => c.move(m.san));
    if (c.isGameOver()) return g;
    setThinking(true);
    const r = await apiFetch('/api/admin/studio/best-line', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fen: c.fen() }) }).then((x) => x.json()).catch(() => null);
    setThinking(false);
    const san = r?.bestMoveSan as string | undefined;
    if (!san) { setErr("The engine couldn't answer. Try again in a moment."); return g; }
    try { c.move(san); } catch { setErr('The engine gave an odd move. Play its reply on the board yourself.'); return g; }
    return { ...g, moves: [...g.moves, { san, by: 'engine' as const, day: g.day }] };
  };
  const start = async (mode: CrowdGame['mode'], crowd: 'w' | 'b') => {
    let g: CrowdGame = { mode, crowd, day: 1, moves: [], startedAt: new Date().toISOString() };
    if (mode === 'engine' && crowd === 'b') g = await engineReply(g); // the engine opens
    setGame(g);
  };
  // You play the winning comment's move on the board: it's a new day.
  const recordCrowd = async (san: string) => {
    if (!game) return;
    let g: CrowdGame = { ...game, day: game.day + 1, moves: [...game.moves, { san, by: 'crowd', day: game.day + 1, note: note.trim() || undefined }] };
    setNote('');
    if (g.mode === 'engine') g = await engineReply(g);
    setGame(g);
  };
  const undo = () => {
    if (!game || !game.moves.length) return;
    const lastDay = game.moves[game.moves.length - 1].day;
    if (lastDay <= 1) return; // day 1's only move is the engine's opener: start a new game instead
    setGame({ ...game, moves: game.moves.filter((m) => m.day !== lastDay), day: lastDay - 1 });
  };

  // ── Playback ──────────────────────────────────────────────────────────────
  const play = (onDone?: () => void, o: CrowdReelOpts | null = opts) => {
    if (!o?.game) return;
    clear();
    const g = o.game;
    const tdy = g.moves.filter((m) => m.day === g.day);
    const base = g.moves.length - tdy.length;
    setShownPlies(base); setScene('hook');
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); m.stop(); if (o.music !== 'off') m.start(o.music); } catch { /* ignore */ }
    at(80, () => mus().accent('riser'));
    let t = 2300;
    const c = new Chess(); g.moves.slice(0, base).forEach((m) => c.move(m.san));
    tdy.forEach((m, i) => {
      const sc: Scene = i === 0 ? 'recap1' : 'recap2';
      at(t, () => { setScene(sc); mus().accent('whoosh'); });
      const mv = c.move(m.san);
      at(t + 750, () => { setShownPlies(base + i + 1); playMoveSound(mv.san.includes('+') || mv.san.includes('#') ? 'check' : mv.captured ? 'capture' : 'move'); mus().accent('impact'); });
      t += 2300;
    });
    at(t, () => { setScene('ask'); mus().accent('chime'); });
    t += 5200;
    at(t, () => { setScene('end'); mus().accent('whoosh'); });
    at(t + 3200, () => { music.current?.stop(); onDone?.(); });
  };
  useEffect(() => { if (!render && loaded && opts?.game) play(); }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const look = useReelLook(opts?.look, scene, shownPlies);
  if (!loaded || !opts) return render ? null : <div className="fixed inset-0 z-[80] grid place-items-center bg-[#0B1112]/95"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>;

  // ── The frame ─────────────────────────────────────────────────────────────
  const boardC = chessAt(Math.min(shownPlies, all.length));
  const last = shownPlies > 0 ? (() => { const c = new Chess(); let lm: { from: string; to: string } | null = null; for (let i = 0; i < shownPlies; i++) { const m = c.move(all[i].san); lm = { from: m.from, to: m.to }; } return lm; })() : null;
  const askSide = game ? side(chessAt(all.length).turn()) : 'White';
  const recapMove = scene === 'recap1' ? todays[0] : scene === 'recap2' ? todays[1] : null;
  const moveNo = (idx: number) => `${Math.floor(idx / 2) + 1}.${idx % 2 ? '..' : ''}`;
  const frame = game && (
    <div className="relative overflow-hidden" style={{ fontFamily: 'Inter, system-ui, sans-serif', ...reelFrameSize(clean || render), background: `radial-gradient(ellipse at 50% 0%, #10261A 0%, ${BG} 62%)` }}
      onClick={() => { if (clean && (scene === 'end' || scene === 'idle')) setClean(false); }}>
      <EngageOverlay text={opts.engage} show={scene === 'ask'} />
      {!blank && scene !== 'end' && scene !== 'idle' && (
        <div className="flex h-full flex-col px-[4cqw] pt-[4cqh]">
          <div className="text-center">
            <p className="font-black uppercase tracking-[0.14em]" style={{ fontSize: '1.9cqh', color: G }}>{game.mode === 'engine' ? '👥 vs 🤖' : '👥 vs 👥'} · Day {game.day}</p>
            <p className="font-black leading-[1.05]" style={{ fontSize: '4cqh', color: TEXT, letterSpacing: '-0.02em' }}>{title(game)}</p>
          </div>
          <div className="relative mt-[1.6cqh]">
            <LookOverride look={look}><ChessBoard fen={boardC.fen()} lastMove={last} flipped={game.crowd === 'b'} maxWidthOverride="100%" suppressConfirmMoves animationMs={300} /></LookOverride>
          </div>
          <div className="mt-[2cqh] text-center">
            <AnimatePresence mode="wait">
              {scene === 'hook' && (
                <motion.p key="h" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="font-black leading-tight" style={{ fontSize: '3.2cqh', color: TEXT }}>
                  {todays.some((m) => m.by === 'crowd') ? <>Here’s what you chose 👇</> : <>You choose every {game.mode === 'engine' ? side(game.crowd) : ''} move.<br /><span style={{ color: GOLD }}>{game.mode === 'engine' ? 'Can followers beat the engine?' : 'One move a day.'}</span></>}
                </motion.p>
              )}
              {recapMove && (
                <motion.div key={scene} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <p className="font-black uppercase tracking-[0.12em]" style={{ fontSize: '1.9cqh', color: recapMove.by === 'crowd' ? G : BLUE }}>{recapMove.by === 'crowd' ? 'You chose' : todays.some((m) => m.by === 'crowd') ? 'ChessScout replied' : 'ChessScout opens with'}</p>
                  <p className="font-black leading-none" style={{ fontSize: '7cqh', color: TEXT }}>{moveNo(all.indexOf(recapMove))} {recapMove.san}</p>
                  {recapMove.note && <p className="mt-[0.6cqh] font-bold" style={{ fontSize: '2cqh', color: MUTED }}>{recapMove.note}</p>}
                </motion.div>
              )}
              {scene === 'ask' && (
                <motion.div key="a" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 15 }}>
                  <p className="font-black leading-none" style={{ fontSize: '5.4cqh', color: TEXT }}>{over ? 'Game over!' : <>Your move, <span style={{ color: GOLD }}>{askSide}</span></>}</p>
                  {!over && <p className="mt-[0.8cqh] font-bold" style={{ fontSize: '2.1cqh', color: MUTED }}>Move {Math.floor(all.length / 2) + 1} · it gets played in tomorrow’s reel</p>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
      {!blank && scene === 'end' && (
        <div className="flex h-full flex-col items-center justify-center gap-[2.4cqh] px-[7cqw] text-center">
          <p className="font-black uppercase tracking-[0.14em]" style={{ fontSize: '2cqh', color: G }}>{title(game)}</p>
          <p className="font-black leading-tight" style={{ fontSize: '5cqh', color: TEXT }}>{over ? 'Thanks for playing!' : <>Day {game.day + 1}<br />tomorrow</>}</p>
          <p className="rounded-[1.6cqh] bg-white px-[5cqw] py-[1.4cqh] font-black" style={{ fontSize: '3cqh', color: '#141A14' }}>Follow so you don’t miss your move</p>
          <p className="mt-[2cqh] font-black" style={{ fontSize: '3.8cqh', color: TEXT }}>Chess<span style={{ color: G }}>Scout</span>.net</p>
        </div>
      )}
      {!blank && scene !== 'end' && <p className="absolute inset-x-0 bottom-[2cqh] text-center font-black" style={{ fontSize: '2cqh', color: 'rgba(245,247,246,.55)' }}>Chess<span style={{ color: G }}>Scout</span>.net</p>}
    </div>
  );
  if (render) return game ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">{frame}</div> : null;
  if (clean && frame) return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">{frame}</div>;

  const pgn = pgnOf(all);
  const recap = todays.map((m) => `${m.by === 'crowd' ? 'You chose' : 'ChessScout replied'} ${moveNo(all.indexOf(m))}${m.san}`).join(' · ');
  const caption = game ? withEngage(opts.engage, `${title(game)} · Day ${game.day} ♟️\n${recap ? `${recap}\n` : ''}${over ? 'Game over! Thanks for playing.' : `Your move as ${askSide}! The most-liked comment gets played in tomorrow's reel.`}\n${pgn ? `\nMoves so far: ${pgn}\n` : ''}\nchessscout.net\n\n#chess #chesscommunity #playchess #chessgame #chessscout`) : '';
  const panelCard = 'rounded-xl bg-white/5 p-3 ring-1 ring-white/10';
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0B1112]/95 text-white">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 p-4 lg:flex-row lg:items-start">
        <div className="flex w-full items-center justify-between lg:hidden">
          <p className="font-black">Crowd chess 👥</p>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
        </div>
        {frame ?? <div className="grid place-items-center rounded-2xl bg-white/5 text-center text-[13px] text-white/50" style={{ aspectRatio: '9 / 16', height: 'min(60dvh, 600px)' }}>Start a game →</div>}
        <div className="w-full max-w-[440px] space-y-3">
          <div className="hidden items-center justify-between lg:flex">
            <p className="text-[17px] font-black">Crowd chess 👥</p>
            <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
          </div>
          {err && <p className="text-[12.5px] text-[#E5484D]">{err}</p>}
          {!game ? (
            <div className={panelCard}>
              <p className="text-[14px] font-black">Start the followers’ game</p>
              <p className="mt-1 text-[12.5px] text-white/60">Each day’s reel asks for a move. Next day, you play the most-liked comment’s move here and post the new reel. It starts from the starting position.</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={() => void start('engine', 'w')} className="rounded-lg bg-[#81B64C] px-3 py-2 text-left text-[12.5px] font-black"><Cpu size={14} className="mb-0.5" />Followers (White) vs ChessScout</button>
                <button onClick={() => void start('engine', 'b')} className="rounded-lg bg-white/10 px-3 py-2 text-left text-[12.5px] font-black"><Cpu size={14} className="mb-0.5" />Followers (Black) vs ChessScout</button>
                <button onClick={() => void start('both', 'w')} className="col-span-2 rounded-lg bg-white/10 px-3 py-2 text-left text-[12.5px] font-black"><Users size={14} className="mb-0.5" />Followers play both sides (comments pick every move)</button>
              </div>
            </div>
          ) : (
            <>
              <div className={panelCard}>
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-black">{title(game)} · Day {game.day}</p>
                  {(saving || thinking) && <span className="flex items-center gap-1 text-[11.5px] text-white/50"><Loader2 size={12} className="animate-spin" />{thinking ? 'Engine thinking…' : 'Saving…'}</span>}
                </div>
                <p className="mt-0.5 break-words text-[12px] text-white/55">{pgn || 'No moves yet: today’s reel asks for the first move.'}</p>
              </div>
              {!over && crowdToMove && (
                <div className={panelCard}>
                  <p className="text-[13.5px] font-black">Play the winning comment’s move ({askSide})</p>
                  <p className="mb-2 text-[12px] text-white/55">Make the move on the board. {game.mode === 'engine' ? 'ChessScout replies straight away, ' : ''}it becomes Day {game.day + 1}, and the reel updates.</p>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional credit, e.g. “@sam's pick, 14 likes”" className="mb-2 w-full rounded-lg bg-white/5 px-3 py-1.5 text-[12.5px] text-white ring-1 ring-white/10" />
                  <div className="mx-auto max-w-[320px]">
                    <ChessBoard fen={chessAt(all.length).fen()} flipped={game.mode === 'engine' ? game.crowd === 'b' : chessAt(all.length).turn() === 'b'} practiceMode={!thinking} onMovePlayed={(san) => void recordCrowd(san)} maxWidthOverride="100%" suppressConfirmMoves />
                  </div>
                </div>
              )}
              {!over && !crowdToMove && game.mode === 'engine' && (
                <button onClick={() => { void engineReply(game).then((g) => { if (g !== game) setGame(g); }); }} disabled={thinking} className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-2 text-[12.5px] font-black disabled:opacity-50"><Cpu size={14} />Get ChessScout’s reply</button>
              )}
              <div className="flex flex-wrap gap-2">
                <button onClick={undo} disabled={!all.length || thinking} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-40"><Undo2 size={14} />Undo last day</button>
                <button onClick={() => { if (!resetArmed) { setResetArmed(true); setTimeout(() => setResetArmed(false), 3000); return; } setResetArmed(false); setGame(null); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold" style={{ background: resetArmed ? '#E5484D' : 'rgba(255,255,255,.1)' }}><RotateCcw size={14} />{resetArmed ? 'Tap again to end this game' : 'New game'}</button>
              </div>
              <EngagePicker kind="crowd" value={opts.engage} onChange={(v) => setOpts({ ...opts, engage: v })} label="Engagement line while it asks (and first line of the caption)" />
              <label className="block text-[12px] text-white/60">Music
                <select value={opts.music} onChange={(e) => setOpts({ ...opts, music: e.target.value as MusicStyle })} className="mt-0.5 w-full rounded-lg bg-white/5 px-3 py-2 text-[14px] font-bold text-white ring-1 ring-white/10">
                  {(['suspense', 'epic', 'hype', 'lofi', 'playful', 'off'] as MusicStyle[]).map((m) => <option key={m} value={m} className="bg-[#0B1112]">{m === 'off' ? 'No music' : m[0].toUpperCase() + m.slice(1)}</option>)}
                </select>
              </label>
              <LookPicker value={opts.look} onChange={(v) => setOpts({ ...opts, look: v })} />
              <CaptionBox key={caption} text={caption} />
              <PinnedBox text={`📌 Moves so far: ${pgn || '(none yet)'}\nComment your move: notation like Nf3, or just say it (“knight to f3”). Most-liked comment gets played tomorrow 👇`} />
              <div className="flex flex-wrap gap-2">
                <button onClick={() => play()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white"><Play size={14} />Play today’s reel</button>
                <button onClick={enterClean} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black"><Maximize2 size={14} />Clean view</button>
                <RenderMp4 name={`chessscout-crowd-day-${game.day}`} shareText={`${title(game)} · Day ${game.day} ♟️ Your move! · chessscout.net`} payload={() => ({ source: { kind: 'crowdReel', opts }, prefs: {} })} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
