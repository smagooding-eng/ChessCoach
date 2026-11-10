// Content Studio: kids videos in the Chess for Kids look (the kids app's sky, buddies,
// board, bubble and confetti). Plays a script from kidsVideos.ts with the kids voice
// and playful music; Clean view for a phone screen recording, Record for Chrome on a
// computer, and the post caption to copy.
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, RotateCcw, Copy, Check, Video, Maximize2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { KidsBoard } from '@/components/kids/KidsBoard';
import { KidPiece, Cloud } from '@/components/kids/KidsArt';
import { KID_FONT, INK, useKidFont } from '@/components/kids/KidsChrome';
import { StudioMusic } from './studioMusic';
import { kidsScript, type KidsVideo, type KidsScene } from './kidsVideos';
import { reelFrameSize } from './reelKit';

const VOICES = [{ id: 'nova', label: 'Nova (warm)' }, { id: 'coral', label: 'Coral (bright)' }, { id: 'shimmer', label: 'Shimmer (soft)' }, { id: 'fable', label: 'Fable (storyteller)' }];
const PREF = 'cs_kids_studio';
type Prefs = { voice: boolean; voiceName: string; music: boolean };
const loadPrefs = (): Prefs => { try { return { voice: true, voiceName: 'nova', music: true, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch { return { voice: true, voiceName: 'nova', music: true }; } };

function Burst({ run }: { run: number }) {
  if (!run) return null;
  const colors = ['#FFC93C', '#FF6B9E', '#45D9F7', '#7BE07B', '#9479E0', '#FF9F1C'];
  return (
    <div key={run} className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center" aria-hidden="true">
      {Array.from({ length: 40 }, (_, i) => {
        const a = (i / 40) * Math.PI * 2 + (i % 3) * 0.2, d = 18 + ((i * 53) % 18);
        return <motion.span key={i} className="absolute block" style={{ width: '1.4cqh', height: i % 3 ? '2.2cqh' : '1.4cqh', background: colors[i % colors.length], borderRadius: i % 3 ? 3 : 999 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
          animate={{ x: `${Math.cos(a) * d}cqh`, y: [`0cqh`, `${Math.sin(a) * d - 8}cqh`, `${Math.sin(a) * d + 30}cqh`], opacity: [1, 1, 0], rotate: (i * 47) % 360 + 360, scale: 1 }}
          transition={{ duration: 1.7, ease: 'easeOut' }} />;
      })}
    </div>
  );
}

export function KidsStudio({ video, onClose }: { video: KidsVideo; onClose: () => void }) {
  useKidFont();
  const script = useMemo(() => kidsScript(video), [video]);
  const scenes = script?.scenes ?? [];
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => { const n = { ...p, [k]: v }; try { localStorage.setItem(PREF, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [burst, setBurst] = useState(0);
  const [clean, setClean] = useState(false);
  const [blank, setBlank] = useState(false);
  const [exitHint, setExitHint] = useState(0);
  const [copied, setCopied] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const music = useRef<StudioMusic | null>(null);
  const mus = () => (music.current ??= new StudioMusic());
  const voiceAudio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { music.current?.stop(); voiceAudio.current?.pause(); music.current?.dispose?.(); }, []);

  // ── The voiceover: every line made up front (kids style), with its length ──
  const urls = useRef(new Map<string, { url: string; len: number }>());
  const [prep, setPrep] = useState<{ done: number; total: number; failed: number } | null>(null);
  const vkey = (t: string) => `${prefs.voiceName}|${t}`;
  useEffect(() => {
    if (!prefs.voice) { setPrep(null); return; }
    let live = true;
    const lines = [...new Set(scenes.map((s) => s.say).filter((x): x is string => !!x))];
    const todo = lines.filter((t) => !urls.current.has(vkey(t)));
    let done = lines.length - todo.length, failed = 0;
    setPrep({ done, total: lines.length, failed });
    const one = async (t: string) => {
      for (let attempt = 0; attempt < 3 && live; attempt++) {
        try {
          const r = await apiFetch('/api/tts/speak', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, voice: prefs.voiceName, style: 'kids' }) });
          if (!r.ok) throw new Error('tts');
          const url = URL.createObjectURL(await r.blob());
          const len = await new Promise<number>((res) => { const a = new Audio(url); a.onloadedmetadata = () => res(a.duration || 0); a.onerror = () => res(0); });
          urls.current.set(vkey(t), { url, len });
          return;
        } catch { await new Promise((res) => setTimeout(res, 700 * (attempt + 1))); }
      }
      failed++;
    };
    void (async () => {
      const q = [...todo];
      await Promise.all(Array.from({ length: 3 }, async () => { while (live && q.length) { await one(q.shift()!); done++; if (live) setPrep({ done, total: lines.length, failed }); } }));
    })();
    return () => { live = false; };
  }, [prefs.voice, prefs.voiceName, scenes]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = !prefs.voice || !prep || prep.done >= prep.total;

  const dur = (s: KidsScene) => {
    const v = s.say && prefs.voice ? urls.current.get(vkey(s.say)) : undefined;
    const spoken = v?.len ? v.len * 1000 + 450 : s.say ? s.say.split(/\s+/).length * 330 + 700 : 0;
    return Math.max(s.ms ?? 1100, spoken);
  };

  // ── Playback ──
  const scene = scenes[Math.min(i, scenes.length - 1)];
  useEffect(() => {
    if (!playing || !scene) return;
    voiceAudio.current?.pause();
    const v = scene.say && prefs.voice ? urls.current.get(vkey(scene.say)) : undefined;
    if (v) voiceAudio.current = mus().playVoice(v.url);
    if (scene.sfx) mus().accent(scene.sfx);
    if (scene.confetti) setBurst(Date.now());
    const t = setTimeout(() => {
      if (i < scenes.length - 1) setI(i + 1);
      else { setPlaying(false); mus().stop(); }
    }, dur(scene));
    return () => clearTimeout(t);
  }, [playing, i]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = () => {
    mus().unlock(); setI(0); setPlaying(true);
    if (prefs.music) mus().start('playful'); else mus().stop();
  };
  const toggle = () => {
    if (playing) { setPlaying(false); voiceAudio.current?.pause(); mus().stop(); return; }
    if (i >= scenes.length - 1) { start(); return; }
    mus().unlock(); setPlaying(true); if (prefs.music) mus().start('playful');
  };

  // Clean view: 5 seconds of nothing (time to start the phone's screen recorder), then it plays.
  const blankT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterClean = () => {
    mus().unlock(); setPlaying(false); mus().stop(); setI(0); setClean(true); setBlank(true);
    blankT.current = setTimeout(() => { setBlank(false); start(); }, 5000);
  };
  const exitClean = () => { if (blankT.current) clearTimeout(blankT.current); setClean(false); setBlank(false); setPlaying(false); voiceAudio.current?.pause(); mus().stop(); };
  useEffect(() => { if (!exitHint) return; const t = setTimeout(() => setExitHint(0), 3500); return () => clearTimeout(t); }, [exitHint]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (clean) exitClean(); else onClose(); } if (e.key === ' ' && !clean) { e.preventDefault(); toggle(); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });

  // ── Record (Chrome on a computer: just the frame) ──
  const [recording, setRecording] = useState(false);
  const [recNote, setRecNote] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const record = async () => {
    if (recording) { recRef.current?.stop(); return; }
    setRecNote(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include' } as DisplayMediaStreamOptions);
      const [track] = stream.getVideoTracks();
      if (!stream.getAudioTracks().length) mus().stream.getAudioTracks().forEach((t) => stream.addTrack(t.clone()));
      const CT = (window as unknown as { CropTarget?: { fromElement: (el: Element) => Promise<unknown> } }).CropTarget;
      if (CT && frameRef.current && 'cropTo' in track) await (track as unknown as { cropTo: (t: unknown) => Promise<void> }).cropTo(await CT.fromElement(frameRef.current));
      else setRecNote('This browser records the whole tab; crop to the frame when you edit.');
      const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 12_000_000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop()); setRecording(false);
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: type || 'video/webm' }));
        a.download = `${script?.fileBase ?? 'chessscout-kids'}.${type.includes('mp4') ? 'mp4' : 'webm'}`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      };
      track.addEventListener('ended', () => { if (rec.state !== 'inactive') rec.stop(); });
      recRef.current = rec; rec.start(250); setRecording(true);
      setTimeout(start, 600);
    } catch { setRecNote('Recording needs Chrome on a computer. On a phone, use Clean view and your screen recorder.'); }
  };
  useEffect(() => {
    if (!recording || playing || i < scenes.length - 1) return;
    const t = setTimeout(() => recRef.current?.state === 'recording' && recRef.current.stop(), 600);
    return () => clearTimeout(t);
  }, [recording, playing, i, scenes.length]);

  if (!script || !scene) {
    return (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-black/80 text-white">
        <div className="text-center"><p className="mb-3 font-bold">That kids video couldn't be made.</p><button onClick={onClose} className="rounded-full bg-white/15 px-4 py-2">Close</button></div>
      </div>
    );
  }
  const w = script.world;
  const bubble = scene.show ?? scene.say;
  const frame = (
    <div ref={frameRef} className="relative overflow-hidden" onClick={() => clean && setExitHint(Date.now())}
      style={{ ...reelFrameSize(clean), fontFamily: KID_FONT, color: INK,
        background: `linear-gradient(180deg, #8FD0FF 0%, #B9DDFF 26%, ${w.color}66 70%, #FFE1EF 100%)`, borderRadius: clean ? 0 : 18 }}>
      {/* drifting clouds, like the kids app */}
      <motion.div className="pointer-events-none absolute" style={{ top: '3%', left: '-8%' }} animate={{ x: ['0cqh', '4cqh', '0cqh'] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}><Cloud width={150} /></motion.div>
      <motion.div className="pointer-events-none absolute" style={{ top: '11%', right: '-6%' }} animate={{ x: ['0cqh', '-3cqh', '0cqh'] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}><Cloud width={110} opacity={0.75} /></motion.div>
      <motion.div className="pointer-events-none absolute" style={{ bottom: '6%', left: '50%' }} animate={{ x: ['0cqh', '2.5cqh', '0cqh'] }} transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}><Cloud width={90} opacity={0.6} /></motion.div>

      {blank ? <div className="absolute inset-0 z-50 bg-black" /> : (<>
        {/* top: world chip */}
        <div className="absolute inset-x-[5%] top-[3.2%] flex items-center justify-between">
          <span className="rounded-full px-[1.6cqh] py-[0.6cqh] font-extrabold text-white shadow" style={{ background: w.color, fontSize: '2.1cqh' }}>{w.name}</span>
          <span className="rounded-full bg-white/80 px-[1.4cqh] py-[0.6cqh] font-extrabold" style={{ fontSize: '1.8cqh', color: '#6C51C2' }}>Chess for Kids</span>
        </div>
        {/* the buddy's bubble */}
        <div className="absolute inset-x-[5%] top-[9.5%] flex items-end gap-[1.4cqh]" style={{ minHeight: '16cqh' }}>
          <motion.div className="shrink-0" animate={{ y: ['0cqh', '-0.8cqh', '0cqh'], rotate: [0, -4, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
            <KidPiece type={scene.buddy} side="w" size="10cqh" mood={scene.mood ?? 'happy'} />
          </motion.div>
          <AnimatePresence mode="wait">
            {bubble && !scene.card && (
              <motion.div key={bubble} initial={{ opacity: 0, scale: 0.9, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                className="relative flex-1 rounded-[2.6cqh] bg-white px-[2cqh] py-[1.4cqh] font-bold leading-snug"
                style={{ fontSize: bubble.length > 90 ? '2.15cqh' : '2.6cqh', border: '0.35cqh solid #fff', boxShadow: '0 0.6cqh 0 rgba(47,34,87,0.12)' }}>
                <span className="absolute -left-[0.9cqh] bottom-[2cqh] h-[1.8cqh] w-[1.8cqh] rotate-45 bg-white" />
                {bubble}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* the board */}
        <div className="absolute inset-x-[5%] top-[30%] pointer-events-none">
          {scene.chip && <p className="mb-[0.8cqh] text-center font-extrabold" style={{ fontSize: '2cqh', color: INK }}>{scene.chip}</p>}
          <KidsBoard items={scene.items} frame={w.color} dots={scene.dots ? new Set(scene.dots) : undefined} found={scene.found ? new Set(scene.found) : undefined}
            hint={scene.hint ? new Set(scene.hint) : undefined} danger={scene.danger ?? null} bounce={scene.bounce ?? null} arrows={scene.arrows} onTap={() => {}} />
        </div>
        {/* the big word */}
        <AnimatePresence>
          {scene.big && !scene.card && (
            <motion.div key={`${i}-${scene.big.text}`} className="pointer-events-none absolute inset-x-0 top-[46%] z-30 text-center font-extrabold"
              initial={{ scale: 0.3, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 1.3, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 16 }}
              style={{ fontSize: /^\d$/.test(scene.big.text) ? '16cqh' : '9cqh', color: scene.big.color, WebkitTextStroke: '0.5cqh #fff', paintOrder: 'stroke', textShadow: '0 0.8cqh 0 rgba(47,34,87,0.25)' }}>
              {scene.big.text}
            </motion.div>
          )}
        </AnimatePresence>
        {/* footer */}
        <div className="absolute inset-x-0 bottom-[3%] text-center">
          <span className="rounded-full bg-white/85 px-[1.8cqh] py-[0.7cqh] font-extrabold" style={{ fontSize: '2cqh', color: '#6C51C2' }}>🎮 Play free · chessscout.net/kids</span>
        </div>
        {/* title and end cards */}
        <AnimatePresence>
          {scene.card && (
            <motion.div key={scene.card} className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-[2.4cqh] px-[7%] text-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ background: `radial-gradient(circle at 50% 42%, #FFFFFFEE 0%, ${w.color}EE 62%, ${w.color} 100%)` }}>
              <motion.div initial={{ scale: 0.2, rotate: -20 }} animate={{ scale: 1, rotate: 0, y: ['0cqh', '-1.4cqh', '0cqh'] }}
                transition={{ scale: { type: 'spring', stiffness: 260, damping: 12 }, y: { duration: 1.4, repeat: Infinity } }}>
                <KidPiece type={scene.buddy} side="w" size="22cqh" mood={scene.card === 'end' ? 'wow' : 'happy'} />
              </motion.div>
              <motion.p initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }}
                className="font-extrabold leading-[1.05]" style={{ fontSize: scene.card === 'title' ? '5.4cqh' : '4.6cqh', color: INK, textShadow: '0 0.5cqh 0 rgba(255,255,255,0.8)' }}>
                {scene.card === 'title' ? script.hook : 'Play free at chessscout.net/kids'}
              </motion.p>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }} className="rounded-full bg-white px-[2cqh] py-[0.8cqh] font-extrabold" style={{ fontSize: '2.4cqh', color: '#6C51C2' }}>
                {scene.card === 'title' ? `${w.buddy} · Pause & play along` : 'Follow for a new kids challenge every day! 🧒'}
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
        <Burst run={burst} />
      </>)}
      {clean && exitHint > 0 && (
        <div className="absolute right-[3%] top-[2%] z-50 flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); exitClean(); setTimeout(enterClean, 50); }} className="rounded-full bg-black/60 px-3 py-1.5 text-[13px] font-bold text-white">Replay</button>
          <button onClick={(e) => { e.stopPropagation(); exitClean(); }} className="rounded-full bg-black/60 px-3 py-1.5 text-[13px] font-bold text-white">Exit</button>
        </div>
      )}
    </div>
  );

  if (clean) return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">{frame}</div>;
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0B1112]/95 text-white">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 p-4 lg:flex-row lg:items-start">
        <div className="flex w-full items-center justify-between lg:hidden">
          <p className="font-black">{script.title}</p>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
        </div>
        {frame}
        <div className="w-full max-w-[420px] space-y-3">
          <div className="hidden items-center justify-between lg:flex">
            <p className="text-[17px] font-black">{script.title}</p>
            <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
          </div>
          {!ready && prep && <p className="text-[13px] text-[#E8B447]">Making the voiceover… {prep.done}/{prep.total}</p>}
          {prep && prep.failed > 0 && ready && <p className="text-[13px] text-[#F0605D]">{prep.failed} voice line{prep.failed > 1 ? 's' : ''} couldn't be made, so {prep.failed > 1 ? 'they play' : 'it plays'} silently.</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={toggle} disabled={!ready} className="flex items-center gap-1.5 rounded-full bg-[#81B64C] px-4 py-2 font-black disabled:opacity-50">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? 'Pause' : 'Play'}</button>
            <button onClick={start} disabled={!ready} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 font-bold disabled:opacity-50"><RotateCcw className="h-4 w-4" />Restart</button>
            <button onClick={enterClean} disabled={!ready} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 font-bold disabled:opacity-50"><Maximize2 className="h-4 w-4" />Clean view</button>
            <button onClick={() => void record()} disabled={!ready} className="flex items-center gap-1.5 rounded-full px-3 py-2 font-bold disabled:opacity-50" style={{ background: recording ? '#CA3431' : 'rgba(255,255,255,0.1)' }}><Video className="h-4 w-4" />{recording ? 'Stop' : 'Record'}</button>
          </div>
          {recNote && <p className="text-[12.5px] text-white/60">{recNote}</p>}
          <p className="text-[12.5px] text-white/55">Clean view: 5 seconds of black (start your screen recorder), then it plays full screen. Tap the video for Replay / Exit.</p>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-3 text-[13.5px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.voice} onChange={(e) => set('voice', e.target.checked)} />Kids voice</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.music} onChange={(e) => { set('music', e.target.checked); if (!e.target.checked) mus().stop(); else if (playing) mus().start('playful'); }} />Playful music</label>
            <select value={prefs.voiceName} onChange={(e) => set('voiceName', e.target.value)} className="col-span-2 rounded-lg bg-white/10 px-2 py-1.5">
              {VOICES.map((v) => <option key={v.id} value={v.id} className="text-black">{v.label}</option>)}
            </select>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <div className="mb-1.5 flex items-center justify-between"><p className="text-[12px] font-black uppercase tracking-wide text-white/60">Post caption</p>
              <button onClick={() => { void navigator.clipboard.writeText(script.caption).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-bold">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy'}</button></div>
            <p className="whitespace-pre-wrap text-[13px] text-white/80">{script.caption}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {scenes.map((s, n) => (
              <button key={n} onClick={() => { setPlaying(false); voiceAudio.current?.pause(); mus().stop(); setI(n); }}
                className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: n === i ? '#81B64C' : 'rgba(255,255,255,0.08)' }}>
                {s.card === 'title' ? 'Title' : s.card === 'end' ? 'End' : s.big?.text ?? n}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
