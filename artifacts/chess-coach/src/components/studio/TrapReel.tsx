// Trap reels (9:16, about 20–30 seconds): an opening trap explained step by step,
// like the Family Tree. The hook and the trap's name, then the moves play in
// groups, each with a line of explanation under the board: the setup, the
// natural-looking mistake (red), the trap (green), the win (gold), then a
// stamp on the board (CHECKMATE / wins the queen…) and an end card asking for
// the save and the next trap in the comments. The side that springs the trap
// faces the viewer. Also played by the video maker (kind "trapReel").
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Maximize2, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Chess } from 'chess.js';
import { playMoveSound, LookOverride } from '@/context/SettingsContext';
import { routeSoundsTo } from '@/lib/sounds';
import { StudioMusic, type MusicStyle } from './studioMusic';
import { RenderMp4 } from './RenderMp4';
import { HookPicker, hookLine } from './HookPicker';
import { ChessBoard, type MoveQuality } from '@/components/ChessBoard';
import { reelFrameSize, CaptionBox, LookPicker, useReelLook, type ReelLook, EngagePicker, PinnedBox, useBackToClose } from './reelKit';
import { TRAPS, trapById, type TrapStepKind } from './traps';

type Speed = 'fast' | 'normal' | 'slow';
export interface TrapReelOpts { trap: string; hook: string; question: string; speed: Speed; music: MusicStyle; look?: ReelLook; coldOpen?: boolean; pauses?: boolean; voice?: boolean; voiceName?: string }
export const trapReelDefaults = (id: string): TrapReelOpts => ({ trap: id, hook: trapById(id).hook, question: 'Have you fallen for this? 👇', speed: 'normal', music: 'suspense', coldOpen: true, pauses: true });

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

type Scene = 'idle' | 'cold' | 'play' | 'stamp' | 'end';
const TONE: Record<string, string> = { red: '#E5484D', gold: '#E8B447', green: '#81B64C', blue: '#5FA8E8' };
const SAN_RE = /(?:\d+\.{1,3})?(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)(?:!!|\?\?|!\?|\?!|!|\?)?/g;
/** The explanation with its moves in colour. */
// ── Voiceover: the narrator reads each step, with the moves said in words ──
const PIECE: Record<string, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' };
function sayMove(tok: string): string {
  let m = tok.replace(/^\d+\.{1,3}/, '').replace(/[!?]+$/, '');
  const end = m.endsWith('#') ? ', checkmate' : m.endsWith('+') ? ', check' : '';
  m = m.replace(/[+#]$/, '');
  if (m === 'O-O') return `castles${end}`;
  if (m === 'O-O-O') return `castles queenside${end}`;
  const promo = m.match(/=([QRBN])$/); m = m.replace(/=[QRBN]$/, '');
  const piece = PIECE[m[0]] ?? '';
  const body = piece ? m.slice(1) : m;
  const cap = body.includes('x');
  const to = (body.match(/[a-h][1-8]$/) ?? [body])[0];
  const who = piece || (cap ? `${body[0]} pawn` : 'pawn');
  return `${who} ${cap ? 'takes' : 'to'} ${to}${promo ? `, promotes to a ${PIECE[promo[1]]}` : ''}${end}`;
}
/** A line for the narrator: moves in words, no emoji. */
export function speakable(text: string): string {
  SAN_RE.lastIndex = 0;
  return text.replace(SAN_RE, (t) => {
    // A bare square ("aims at f7") stays a square; anything with a piece, capture, check or number is a move.
    if (!/O-O|[KQRBNx+#=!?]|^\d/.test(t) || !/[a-h][1-8]|O-O/.test(t)) return t;
    return sayMove(t) + (/[!?]$/.test(t) ? '.' : '');
  })
    .replace(/(check|checkmate|[a-h][1-8]) (?=(?:pawn|knight|bishop|rook|queen|king|castles|[a-h] pawn)\b)/g, '$1, ')
    .replace(/\.\./g, '.')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}

function richText(text: string, color: string) {
  const out: ReactNode[] = []; let last = 0; let m: RegExpExecArray | null;
  SAN_RE.lastIndex = 0;
  while ((m = SAN_RE.exec(text))) { if (m.index > last) out.push(text.slice(last, m.index)); out.push(<span key={m.index} style={{ color, fontWeight: 900 }}>{m[0]}</span>); last = m.index + m[0].length; }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function TrapReel({ opts: initial, render = false, onClose }: { opts?: TrapReelOpts; render?: boolean; onClose: () => void }) {
  useBackToClose(onClose, !render);
  const [opts, setOpts] = useState<TrapReelOpts>(initial ?? trapReelDefaults(TRAPS[0].id));
  const trap = trapById(opts.trap);
  const [scene, setScene] = useState<Scene>('idle');
  const [stepIdx, setStepIdx] = useState(0);
  const [ply, setPly] = useState(0);
  const [pauseLeft, setPauseLeft] = useState(0); // >0: frozen, asking the viewer
  const [callout, setCallout] = useState<{ san: string; kind: TrapStepKind } | null>(null);
  const [shake, setShake] = useState(0);
  const voiceMap = useRef(new Map<string, { url: string; len: number }>());
  const [voicePrep, setVoicePrep] = useState<{ done: number; total: number } | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [premium, setPremium] = useState(false);
  useEffect(() => { apiFetch('/api/tts/voices').then((x) => (x.ok ? x.json() : null)).then((d) => { if (d?.premium) setPremium(true); }).catch(() => {}); }, []);
  const voiceAudio = useRef<HTMLAudioElement | null>(null);
  const playId = useRef(0); // a newer Replay cancels a start still waiting for the voice
  const linesFor = (o: TrapReelOpts) => {
    const tr = trapById(o.trap);
    const out: string[] = [];
    if (o.coldOpen !== false) out.push(`${tr.result === 'CHECKMATE' ? 'Checkmate' : tr.result.toLowerCase()} in ${Math.ceil(tr.san.length / 2)} moves. Here's how.`);
    tr.steps.forEach((st) => { if (st.pause && o.pauses !== false) out.push(speakable(`${st.pause} Comment your guess.`)); out.push(speakable(st.text)); });
    out.push(speakable(`Save it for your next game. ${o.question}`));
    return out;
  };
  const vName = (o: TrapReelOpts) => o.voiceName ?? (premium ? 'premium' : 'ash');
  const prepareVoice = async (o: TrapReelOpts) => {
    const lines = [...new Set(linesFor(o))];
    const key = (t: string) => `${vName(o)}|${t}`;
    const todo = lines.filter((t) => !voiceMap.current.has(key(t)));
    let done = lines.length - todo.length, failed = 0, why = '';
    setVoicePrep({ done, total: lines.length });
    const one = async (t: string) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 30_000);
          const res = await apiFetch('/api/tts/speak', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, voice: vName(o), style: 'creator' }), signal: ac.signal }).finally(() => clearTimeout(to));
          if (!res.ok) { const d = await res.json().catch(() => null); why = d?.reason || `server error ${res.status}`; if (res.status === 502 && attempt >= 1) break; throw new Error('tts'); }
          const url = URL.createObjectURL(await res.blob());
          const len = await new Promise<number>((ok) => { const a = new Audio(url); a.onloadedmetadata = () => ok(a.duration || 0); a.onerror = () => ok(0); });
          voiceMap.current.set(key(t), { url, len });
          return;
        } catch (e) { if ((e as Error)?.name === 'AbortError') why = 'the voice service took too long'; await new Promise((ok) => setTimeout(ok, 500 * (attempt + 1))); }
      }
      failed++;
    };
    const queue = [...todo];
    await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) { await one(queue.shift()!); done++; setVoicePrep({ done, total: lines.length }); } }));
    setVoicePrep(null);
    setVoiceNote(failed ? `${failed} of ${lines.length} voice lines couldn't be made${why ? ` (${why})` : ''}.${render ? '' : ' The preview reads those with your phone’s own voice; MP4s will be silent there.'}` : null);
  };
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
    clear(); voiceAudio.current?.pause();
    const id = ++playId.current;
    if (o.voice === false) { run(onDone, o); return; }
    // Start as soon as the first lines are ready (or after 4 seconds at most); the rest
    // keep coming in while it plays, and the timing leaves room for them.
    const lines = linesFor(o);
    const ready = (n: number) => lines.slice(0, n).every((t) => voiceMap.current.has(`${vName(o)}|${t}`));
    if (ready(lines.length)) { run(onDone, o); return; }
    setScene('idle');
    const prep = prepareVoice(o);
    let started = false;
    const go = () => { if (started || id !== playId.current) return; started = true; run(onDone, o); };
    const poll = setInterval(() => { if (id !== playId.current) { clearInterval(poll); return; } if (ready(2)) { clearInterval(poll); go(); } }, 150);
    timers.current.push(setTimeout(() => { clearInterval(poll); go(); }, render ? 60_000 : 4000));
    void prep.then(() => { clearInterval(poll); go(); });
  };
  const run = (onDone?: () => void, o: TrapReelOpts = opts) => {
    clear();
    const tr = trapById(o.trap);
    // Speak a line now; returns how long it lasts (ms), 0 without the voiceover.
    // How long a line lasts: its real length when made, otherwise an estimate (so a line that
    // arrives a moment late still fits).
    const vlen = (text: string) => { if (o.voice === false) return 0; const v = voiceMap.current.get(`${vName(o)}|${text}`); return v ? Math.round(v.len * 1000) : text.length * 62; };
    const say = (text: string) => {
      if (o.voice === false) return;
      const v = voiceMap.current.get(`${vName(o)}|${text}`);
      if (v) { voiceAudio.current?.pause(); try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } voiceAudio.current = mus().playVoice(v.url); return; }
      // The narrator couldn't make this line: in the preview, read it with the device's voice.
      if (!render && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; window.speechSynthesis.speak(u); } catch { /* no voice */ }
      }
    };
    setStepIdx(0); setPauseLeft(0); setCallout(null);
    try { const m = mus(); routeSoundsTo(m.unlock(), m.sfx); m.stop(); if (o.music !== 'off') m.start(o.music); } catch { /* ignore */ }
    const c = new Chess(); const vm = tr.san.map((san) => c.move(san));
    let t = 0;
    // Cold open: the ending first ("CHECKMATE in 7"), then "here's how".
    if (o.coldOpen !== false) {
      setScene('cold'); setPly(tr.san.length);
      const coldLine = `${tr.result === 'CHECKMATE' ? 'Checkmate' : tr.result.toLowerCase()} in ${Math.ceil(tr.san.length / 2)} moves. Here's how.`;
      at(60, () => { mus().accent('impact'); say(coldLine); });
      t = Math.max(2600, vlen(coldLine) + 500);
      at(t, () => { setScene('play'); setPly(0); mus().accent('whoosh'); });
    } else { setScene('play'); setPly(0); at(80, () => mus().accent('riser')); }
    const intro = speakable(tr.steps[0].text);
    at(t + 50, () => say(intro));
    t += Math.max(1900, tr.steps[0].text.length * READ_MS[o.speed] * 0.8, vlen(intro) + 350);
    let prev = 0;
    tr.steps.forEach((st, i) => {
      if (i === 0) return;
      at(t, () => { setStepIdx(i); setCallout(null); if (st.kind === 'bait') mus().accent('whoosh'); });
      // Pause and ask before the trap: "What's the trick? 3, 2, 1…"
      if (st.pause && o.pauses !== false) {
        const q = speakable(`${st.pause} Comment your guess.`);
        const span = Math.max(3000, vlen(q) + 400);
        const tick = span / 3;
        at(t, () => { setPauseLeft(3); mus().accent('riser'); say(q); });
        at(t + tick, () => { setPauseLeft(2); mus().accent('tick'); });
        at(t + tick * 2, () => { setPauseLeft(1); mus().accent('tick'); });
        at(t + span, () => setPauseLeft(0));
        t += span + 150;
      }
      const line = speakable(st.text);
      at(t + 100, () => say(line));
      const key = st.kind === 'bait' || st.kind === 'trap' || st.kind === 'win';
      const ms = key ? MOVE_MS[o.speed] + 120 : Math.round(MOVE_MS[o.speed] * 0.8);
      for (let p = prev; p < st.upto; p++) {
        const when = t + 250 + (p - prev) * ms;
        at(when, () => {
          setPly(p + 1);
          const m = vm[p];
          playMoveSound(m.san.includes('#') || m.san.includes('+') ? 'check' : m.captured ? 'capture' : m.flags.includes('k') || m.flags.includes('q') ? 'castle' : 'move');
          if (p + 1 === st.upto && key) {
            setCallout({ san: m.san + (st.kind === 'bait' ? '??' : st.kind === 'trap' ? '!!' : ''), kind: st.kind });
            if (st.kind === 'bait') setShake((x) => x + 1);
            mus().accent('impact');
          }
        });
        if (p + 1 === st.upto && key) at(when + 1400, () => setCallout(null));
      }
      const moving = (st.upto - prev) * ms;
      const hold = Math.max(key ? 2000 : 1150, st.text.length * READ_MS[o.speed] - moving * 0.5);
      t += Math.max(250 + moving + hold, vlen(line) + 450);
      prev = st.upto;
    });
    at(t, () => { setScene('stamp'); setCallout(null); mus().accent('impact'); });
    const outro = speakable(`Save it for your next game. ${o.question}`);
    at(t + 1900, () => { setScene('end'); mus().accent('chime'); say(outro); });
    at(t + 1900 + Math.max(3400, vlen(outro) + 600), () => { music.current?.stop(); onDone?.(); });
  };
  useEffect(() => { if (!render) play(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const enterClean = () => { clear(); music.current?.stop(); setClean(true); setBlank(true); setScene('idle'); at(5000, () => { setBlank(false); play(); }); };

  useEffect(() => {
    if (!render) return;
    const w = window as unknown as { __studioRender?: Record<string, unknown> };
    w.__studioRender = { ready: opts.voice === false, done: false, start: () => {
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
      run(() => setTimeout(() => {
        if (rec.current?.state === 'recording') rec.current.stop();
        else w.__studioRender = { ...(w.__studioRender ?? {}), endedAt: Date.now(), done: true };
      }, 300));
    } };
    // The renderer waits for "ready": the whole voiceover is made first.
    if (opts.voice !== false) void prepareVoice(opts).then(() => { if (w.__studioRender) w.__studioRender.ready = true; });
  }, [render]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { voiceAudio.current?.pause(); try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }, []);

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
  // This step's arrows and lit squares, once its moves are on the board.
  const showVis = scene === 'play' && atStepEnd && !pauseLeft;
  const arrows = showVis ? (step.arrows ?? []).map((a) => { const [mv, col] = a.split(':'); return { from: mv.slice(0, 2), to: mv.slice(2, 4), color: TONE[col ?? 'green'] ?? TONE.green }; }) : [];
  const marks = showVis && step.marks?.length ? Object.fromEntries(step.marks.map((m) => { const [sq, col = 'red', label = ''] = m.split(':'); const c = TONE[col] ?? TONE.red; return [sq, { text: label, color: c, tint: `${c}55`, strong: true }]; })) : undefined;
  const k = KIND[step.kind];
  const showing = scene === 'play' || scene === 'stamp' || scene === 'cold';
  const kindColor = k?.color ?? G;

  const playScene = (
    <div className="flex h-full flex-col px-[4cqw] pb-[6cqh] pt-[4.5cqh]">
      {/* Header: the hook, then the trap's name and opening. */}
      <div className="text-center">
        <p className="font-black leading-[1.05]" style={{ fontSize: scene === 'cold' || stepIdx === 0 ? '4.6cqh' : '3.2cqh', color: TEXT, letterSpacing: '-0.02em', transition: 'font-size .35s' }}>{brand(opts.hook)}</p>
        <p className="mt-[0.8cqh] font-black uppercase tracking-[0.12em]" style={{ fontSize: '1.8cqh', color: G }}>🪤 {trap.name} · {trap.opening}</p>
      </div>
      <div className="relative mt-[1.6cqh]">
        <motion.div key={`sh${shake}`} animate={shake ? { x: [0, -10, 9, -6, 4, 0] } : undefined} transition={{ duration: 0.4 }}>
          <LookOverride look={look}><ChessBoard fen={game.fen()} lastMove={lastMove} moveQuality={scene === 'cold' ? null : quality} arrows={arrows} squareMarks={marks} flipped={trap.trapper === 'b'} maxWidthOverride="100%" suppressConfirmMoves animationMs={240} /></LookOverride>
        </motion.div>
        {/* Progress through the line. */}
        {scene === 'play' && <div className="absolute inset-x-0 -top-[1.2cqh] h-[0.7cqh] overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${(ply / trap.san.length) * 100}%`, background: G }} /></div>}
        {/* The big move call-out on key moves: ?? red, !! green, # gold. */}
        <AnimatePresence>
          {callout && scene === 'play' && !pauseLeft && (
            <motion.div key={callout.san} initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: 'spring', stiffness: 320, damping: 16 }}
              className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex justify-center">
              <span className="rounded-[1.6cqh] px-[4cqw] py-[0.8cqh] font-black leading-none" style={{ fontSize: '7cqh', color: '#fff', background: callout.kind === 'bait' ? RED : callout.kind === 'trap' ? G : GOLD, boxShadow: '0 10px 40px rgba(0,0,0,.6)', textShadow: '0 2px 0 rgba(0,0,0,.25)' }}>{callout.san}</span>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Pause and ask. */}
        <AnimatePresence>
          {pauseLeft > 0 && scene === 'play' && (
            <motion.div key="pause" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-[1.6cqh] rounded-[1cqh] px-[5cqw] text-center" style={{ background: 'rgba(8,12,13,.72)' }}>
              <p className="font-black leading-tight" style={{ fontSize: '3.6cqh', color: TEXT }}>{step.pause}</p>
              <motion.span key={pauseLeft} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid place-items-center rounded-full font-black" style={{ width: '10cqh', height: '10cqh', fontSize: '5.4cqh', background: pauseLeft === 1 ? RED : GOLD, color: '#111' }}>{pauseLeft}</motion.span>
              <p className="font-black" style={{ fontSize: '2.4cqh', color: G }}>Comment your guess 👇</p>
            </motion.div>
          )}
        </AnimatePresence>
        {scene === 'cold' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }} className="pointer-events-none absolute inset-x-0 bottom-[6%] z-20 flex justify-center">
            <span className="rounded-full bg-black/75 px-[4cqw] py-[0.8cqh] font-black" style={{ fontSize: '2.8cqh', color: TEXT }}>Here’s how it happens 👇</span>
          </motion.div>
        )}
        {moveLabel && <span className="absolute left-[1.5cqw] top-[1.5cqw] rounded-full bg-black/70 px-[2.4cqw] py-[0.4cqh] font-black tabular-nums" style={{ fontSize: '2cqh', color: TEXT }}>{moveLabel}</span>}
        <AnimatePresence>
          {(scene === 'stamp' || scene === 'cold') && (
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
          <motion.div key={scene === 'cold' ? 'cold' : stepIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}
            className="rounded-[1.8cqh] px-[4cqw] py-[1.6cqh]" style={{ background: '#141D1F', border: `2px solid ${k?.color ?? '#243033'}` }}>
            {k && scene !== 'cold' && <p className="mb-[0.5cqh] font-black uppercase tracking-[0.1em]" style={{ fontSize: '1.7cqh', color: k.color }}>{k.label}</p>}
            <p className="font-extrabold leading-[1.22]" style={{ fontSize: '2.7cqh', color: TEXT }}>{scene === 'cold' ? `${trap.result === 'CHECKMATE' ? 'Checkmate' : trap.result.charAt(0) + trap.result.slice(1).toLowerCase()} in ${Math.ceil(trap.san.length / 2)} moves. Watch the setup, the mistake and the trap.` : richText(step.text, kindColor)}</p>
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
      {!blank && (showing ? playScene : scene === 'end' ? end : voicePrep ? <div className="grid h-full place-items-center"><Loader2 className="h-8 w-8 animate-spin text-white/50" /></div> : null)}
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
          <p className="text-[12.5px] text-white/60">Opens on the ending ("CHECKMATE in 7"), then plays the trap from move 1 and explains each step under the board, with arrows and lit squares showing the idea: the setup, the mistake (red ??), the trap (green !!) and the win (gold). Before the trap it freezes and asks "What's the trick? 3, 2, 1…" so people comment their guess. The trapping side faces the viewer. Every line is checked move by move.</p>
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
          <div className="flex flex-wrap gap-1.5">
            {([['voice', 'Voiceover explains it 🎙️'], ['coldOpen', 'Open on the ending'], ['pauses', 'Pause & guess before the trap']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setOpts({ ...opts, [key]: opts[key] === false })} className="rounded-md px-2.5 py-1 text-[12px] font-bold" style={{ background: opts[key] !== false ? G : 'rgba(255,255,255,.07)' }}>{opts[key] !== false ? '✓ ' : ''}{label}</button>
            ))}
          </div>
          {voicePrep && <p className="flex items-center gap-1.5 text-[12px] text-white/60"><Loader2 size={13} className="animate-spin" />Making the voiceover… {voicePrep.done}/{voicePrep.total}</p>}
          {voiceNote && <p className="text-[12px] text-[#E8B447]">{voiceNote}</p>}
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
