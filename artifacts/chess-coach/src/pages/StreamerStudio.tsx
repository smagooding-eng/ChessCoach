// Streamer Studio (admin-only, Features in Development).
// A stage the streamer arranges: board (a ChessScout page or any captured window),
// camera (raw, face-hidden or a live avatar), and a name tag. Voice changer on the mic.
// Record to a file here; stream through OBS / Discord using Go live (full screen).
// Everything runs in the browser: no server changes.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as RPointerEvent, ReactNode } from 'react';
import { Link } from 'wouter';
import { RD } from '@/lib/redesignTheme';
import { VoiceChanger, VOICE_PRESETS, VOICE_GROUPS, DEFAULT_CUSTOM, type VoicePreset, type CustomVoice } from '@/lib/streamer/voiceChanger';
import { FaceTracker, type FacePose } from '@/lib/streamer/faceTracker';
import {
  AVATARS, drawAvatar, preloadPieceAvatars, HATS, EYEWEAR, HAIR_STYLES, FACIAL_HAIR, SKIN_TONES, HAIR_COLORS, EYE_COLORS, SHIRT_COLORS, DEFAULT_PERSON, OUTFITS, CHARACTER_EXTRAS,
  type AvatarId, type AvatarPose, type Hat, type Eyewear, type PersonLook,
} from '@/lib/streamer/avatars';
import { cartoonFromCamera } from '@/lib/streamer/cartoonMe';
import {
  TOON_STYLES, TOON_CREDITS, TOON_TOPS, TOON_FACIAL, TOON_CLOTHES, TOON_GLASSES, TOON_SKINS, DEFAULT_TOON_CUSTOM,
  loadToons, toonThumb, warmToon, drawToon, toonFromPerson, type ToonPick, type ToonCustom,
} from '@/lib/streamer/toonAvatars';
import { Avatar3D, loadThree, saveAvatarFile, loadAvatarFile, clearAvatarFile } from '@/lib/streamer/avatar3d';
import { drawComposite, drawBoardPanel, headSizes, type BoardFeed, type TextRun } from '@/lib/streamer/compositor';
import { CloudRecorder, type RecStatus } from '@/lib/streamer/recorder';
import { LiveHost } from '@/lib/streamer/live';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { useLichessGame } from '@/components/watch/LiveVideo';
import { useSettings, PIECE_SHAPES } from '@/context/SettingsContext';

type PanelId = 'board' | 'cam' | 'tag' | 'head';
interface Rect { x: number; y: number; w: number; h: number; z: number; hidden?: boolean; round?: boolean }
type Layout = Record<PanelId, Rect>;
type Aspect = '9:16' | '16:9';
type Disguise = 'none' | 'avatar' | 'pixelate' | 'blur';
type Bg = 'brand' | 'blur' | 'room' | 'color';
type Tab = 'layout' | 'board' | 'camera' | 'voice' | 'videos' | 'live';

interface Settings {
  aspect: Aspect; preset: string; layout: Layout;
  boardSource: 'app' | 'screen' | 'follow'; followUser: string; appPath: string; zoom: number; panX: number; panY: number;
  frame: 'auto' | 'manual'; framePad: 'board' | 'players';
  camOn: boolean; camId: string; facing: 'user' | 'environment'; mirror: boolean;
  disguise: Disguise; avatar: AvatarId | 'toon' | '3d'; toon: ToonPick; toonShuffle: number; bg: Bg; bgColor: string; avatarScale: number;
  hat: Hat; eyewear: Eyewear; person: PersonLook; customVoice: CustomVoice; personStyle: 'cartoon' | 'real';
  voice: VoicePreset; pitch: number; micId: string; output: string;
  name: string; subtitle: string;
  // Headline panel: "The road to 1500 ELO" with the real rating under it.
  headline: string; goal: number; ratingFrom: string; manualRating: number;
  broadcast: boolean; recordLive: boolean; title: string;
}

const PRESETS: Record<Aspect, { id: string; label: string; layout: Layout }[]> = {
  '9:16': [
    { id: 'board-top', label: 'Board top · camera bottom', layout: { head: { x: 0, y: 0, w: 100, h: 8, z: 4 }, board: { x: 0, y: 8, w: 100, h: 56.25, z: 1 }, cam: { x: 0, y: 64.25, w: 100, h: 28.75, z: 2 }, tag: { x: 0, y: 93, w: 100, h: 7, z: 3 } } },
    { id: 'board-bottom', label: 'Camera top · board bottom', layout: { tag: { x: 0, y: 0, w: 100, h: 7, z: 3 }, head: { x: 0, y: 7, w: 100, h: 8, z: 4 }, cam: { x: 0, y: 15, w: 100, h: 28.75, z: 2 }, board: { x: 0, y: 43.75, w: 100, h: 56.25, z: 1 } } },
    { id: 'pip', label: 'Big board · round camera', layout: { cam: { x: 4, y: 2.5, w: 40, h: 22.5, z: 2, round: true }, head: { x: 47, y: 2, w: 50, h: 8, z: 4 }, tag: { x: 47, y: 11, w: 50, h: 8.5, z: 3 }, board: { x: 0, y: 28, w: 100, h: 56.25, z: 1 } } },
  ],
  '16:9': [
    { id: 'board-left', label: 'Board left · camera right', layout: { board: { x: 0, y: 0, w: 56.25, h: 100, z: 1 }, head: { x: 56.25, y: 0, w: 43.75, h: 16, z: 4 }, cam: { x: 56.25, y: 16, w: 43.75, h: 70, z: 2 }, tag: { x: 56.25, y: 86, w: 43.75, h: 14, z: 3 } } },
    { id: 'board-right', label: 'Camera left · board right', layout: { head: { x: 0, y: 0, w: 43.75, h: 16, z: 4 }, cam: { x: 0, y: 16, w: 43.75, h: 70, z: 2 }, tag: { x: 0, y: 86, w: 43.75, h: 14, z: 3 }, board: { x: 43.75, y: 0, w: 56.25, h: 100, z: 1 } } },
    { id: 'pip', label: 'Board centre · camera corner', layout: { board: { x: 21.875, y: 0, w: 56.25, h: 100, z: 1 }, head: { x: 1.5, y: 3, w: 19, h: 18, z: 4 }, cam: { x: 79, y: 3, w: 19.5, h: 34.67, z: 2 }, tag: { x: 1.5, y: 84, w: 19, h: 13, z: 3 } } },
  ],
};

const APP_PAGES: { path: string; label: string }[] = [
  { path: '/live', label: 'Live game' },
  { path: '/play-now', label: 'Quick bot game' },
  { path: '/games', label: 'Game reviews' },
  { path: '/lookup', label: 'Game lookup' },
  { path: '/lichess', label: 'Lichess' },
  { path: '/play', label: 'Play the computer' },
  { path: '/tournaments', label: 'Tournaments' },
  { path: '/tactics', label: 'Tactics' },
];

const DEFAULTS: Settings = {
  aspect: '9:16', preset: 'board-top', layout: PRESETS['9:16'][0].layout,
  boardSource: 'app', followUser: '', appPath: '/live', zoom: 1, panX: 0, panY: 0,
  frame: 'auto', framePad: 'players',
  camOn: false, camId: '', facing: 'user', mirror: true,
  disguise: 'avatar', avatar: 'toon', toon: { style: 'avataaars', seed: 'avataaars-0-3', custom: null }, toonShuffle: 0, hat: 'none', eyewear: 'none', person: DEFAULT_PERSON, customVoice: DEFAULT_CUSTOM, personStyle: 'cartoon', bg: 'brand', bgColor: '#121B1D', avatarScale: 1.3,
  voice: 'off', pitch: 0, micId: '', output: 'none',
  name: 'Anonymous Knight', subtitle: 'Playing on chessscout.net',
  headline: 'The road to 1500 ELO', goal: 1500, ratingFrom: 'auto', manualRating: 0,
  broadcast: true, recordLive: true, title: '',
};
const KEY = 'cs_streamer_v2';
const VIRTUAL_W = 430; // the app is laid out like a phone inside the board panel
const VIRTUAL_H = 1000;
const BG = '#050A0B', CARD = '#0D1516', CARD_LIGHT = '#121B1D'; // solid, never see-through
const IS_PHONE = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      const merged = { ...DEFAULTS, ...saved };
      if (!saved.toon) merged.avatar = 'toon'; // first time with the new cartoon characters
      if (!merged.layout.head) {
        // first time with the headline: a ready-made layout makes room for it; your own arrangement gets it on top
        const pre = PRESETS[merged.aspect]?.find((p) => p.id === merged.preset);
        merged.layout = pre ? pre.layout : { ...merged.layout, head: { x: 0, y: 0, w: 100, h: 8, z: 9 } };
      }
      return merged;
    }
  } catch { /* ignore */ }
  return DEFAULTS;
}

const card: CSSProperties = { background: CARD, border: `1px solid ${RD.border}`, borderRadius: 14 };

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="px-3 py-2 rounded-xl text-[13px] font-semibold transition-colors"
      style={on ? { background: RD.green, color: '#06110A' } : { background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }}>
      {children}
    </button>
  );
}
function Label({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-wider mt-4 mb-2" style={{ color: RD.muted }}>{children}</p>;
}
function Note({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-relaxed mt-2" style={{ color: RD.muted }}>{children}</p>;
}

export default function StreamerStudio() {
  const [s, setS] = useState<Settings>(loadSettings);
  const sRef = useRef(s); sRef.current = s;
  const set = useCallback((patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch })), []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }, [s]);

  const [tab, setTab] = useState<Tab>('layout');
  const [edit, setEdit] = useState(false);
  const [clean, setClean] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [outs, setOuts] = useState<MediaDeviceInfo[]>([]);
  const [trackStatus, setTrackStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [voiceOn, setVoiceOn] = useState(false);
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState<{ start: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [screenOn, setScreenOn] = useState(false);

  const areaRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 360, h: 640 });
  const camVideo = useRef<HTMLVideoElement>(null);
  const camCanvas = useRef<HTMLCanvasElement>(null);
  const screenVideo = useRef<HTMLVideoElement>(null);
  const camStream = useRef<MediaStream | null>(null);
  const boardFrame = useRef<HTMLIFrameElement>(null);
  const [boardBox, setBoardBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Your ChessScout ratings, refreshed every 30s so the headline moves as games finish.
  const [ratings, setRatings] = useState<Record<string, { rating: number; gamesPlayed: number }> | null>(null);
  const ratingStart = useRef<Record<string, number>>({});
  // Lichess ratings too (most of your rated games may be on Lichess): your linked Lichess name, or the one you follow.
  const { authUser } = useUser();
  const lichessName = (s.followUser.trim() || authUser?.lichessUsername || '').toLowerCase();
  const [lichessRatings, setLichessRatings] = useState<Record<string, { rating: number; games: number; prov?: boolean }> | null>(null);
  useEffect(() => {
    if (!lichessName || !s.ratingFrom.startsWith('lichess:')) return;
    let gone = false;
    const load = () => fetch(`https://lichess.org/api/user/${encodeURIComponent(lichessName)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { perfs?: Record<string, { rating: number; games: number; prov?: boolean }> } | null) => { if (!gone && d?.perfs) setLichessRatings(d.perfs); })
      .catch(() => { /* keep the last one */ });
    void load();
    const id = window.setInterval(load, 30_000);
    return () => { gone = true; window.clearInterval(id); };
  }, [lichessName, s.ratingFrom]);
  const [peek, setPeek] = useState(false); // show the whole page for a moment (pick a game, change opponent)
  const peekRef = useRef(peek); peekRef.current = peek;
  const screenStream = useRef<MediaStream | null>(null);
  const tracker = useRef(new FaceTracker());
  const voice = useRef(new VoiceChanger());
  const recRef = useRef<{ rec: MediaRecorder; streams: MediaStream[]; ctx: AudioContext | null } | null>(null);
  const cloudRec = useRef<CloudRecorder | null>(null);
  const [cloud, setCloud] = useState<(RecStatus & { start: number }) | null>(null);
  const host = useRef(new LiveHost());
  const [watching, setWatching] = useState<number | null>(null);
  const feed = useRef<{ fen: string; flipped: boolean; last: string; top?: string; bottom?: string } | null>(null);
  const outCanvas = useRef<HTMLCanvasElement>(null);
  const { boardColors, pieceShape } = useSettings();
  const looks = useRef({ light: '#eeeed2', dark: '#769656', pieceSrc: (k: string) => `/pieces/ink-cream/${k}.webp?v=1` });
  {
    const hex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v);
    const info = PIECE_SHAPES[pieceShape];
    looks.current = {
      light: hex(boardColors?.light) ? boardColors.light : '#eeeed2',
      dark: hex(boardColors?.dark) ? boardColors.dark : '#769656',
      pieceSrc: !info || pieceShape === 'default'
        ? (k: string) => `/pieces/ink-cream/${k}.webp?v=1`
        : info.raster ? (k: string) => `/pieces/${pieceShape}/${k}.webp?v=${info.version ?? 1}` : (k: string) => `/pieces/${pieceShape}/${k}.svg`,
    };
  }
  useEffect(() => { preloadPieceAvatars(); }, []);
  const [toonsReady, setToonsReady] = useState(false);
  useEffect(() => { void loadToons().then((l) => setToonsReady(!!l)); }, []);
  useEffect(() => { if (toonsReady) warmToon(s.toon); }, [toonsReady, s.toon]);



  const flash = useCallback((m: string) => { setMsg(m); window.setTimeout(() => setMsg((x) => (x === m ? null : x)), 6000); }, []);

  // ---- realistic 3D avatar (file kept on this device) ----
  const a3d = useRef<Avatar3D | null>(null);
  const [a3dState, setA3dState] = useState<{ status: 'none' | 'loading' | 'ready' | 'failed'; name?: string; shapes?: number }>({ status: 'none' });
  const openAvatar3D = useCallback(async (name: string, data: ArrayBuffer) => {
    setA3dState({ status: 'loading', name });
    const T = await loadThree();
    if (!T) { setA3dState({ status: 'failed', name }); return false; }
    a3d.current ??= new Avatar3D(T);
    const ok = await a3d.current.load(data.slice(0));
    setA3dState({ status: ok ? 'ready' : 'failed', name, shapes: a3d.current.faceShapes });
    return ok;
  }, []);
  useEffect(() => {
    if (s.avatar !== '3d' || a3dState.status !== 'none') return;
    void loadAvatarFile().then((f) => { if (f) void openAvatar3D(f.name, f.data); });
  }, [s.avatar, a3dState.status, openAvatar3D]);
  const pick3D = useCallback(async (file: File) => {
    if (file.size > 60 * 1024 * 1024) { flash('That file is over 60 MB. Export a lighter version (fewer textures or a smaller texture size).'); return; }
    const data = await file.arrayBuffer();
    const ok = await openAvatar3D(file.name, data);
    if (ok) { await saveAvatarFile(file.name, data).catch(() => undefined); set({ avatar: '3d', disguise: 'avatar' }); }
    else flash('Couldn’t open that file. Use a .glb (or .vrm) 3D avatar.');
  }, [openAvatar3D, flash, set]);
  useEffect(() => () => a3d.current?.dispose(), []);

  // ---- stage size: keep the aspect, fit the space ----
  useEffect(() => {
    const el = areaRef.current; if (!el) return undefined;
    const fit = () => {
      const ar = s.aspect === '9:16' ? 9 / 16 : 16 / 9;
      const cw = el.clientWidth, ch = el.clientHeight;
      let w = cw, h = cw / ar;
      if (h > ch) { h = ch; w = ch * ar; }
      setStage({ w: Math.floor(w), h: Math.floor(h) });
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [s.aspect, clean]);

  // ---- devices ----
  const refreshDevices = useCallback(async () => {
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      setCams(d.filter((x) => x.kind === 'videoinput'));
      setMics(d.filter((x) => x.kind === 'audioinput'));
      setOuts(d.filter((x) => x.kind === 'audiooutput'));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { void refreshDevices(); }, [refreshDevices]);

  // ---- camera ----
  const stopCam = useCallback(() => {
    camStream.current?.getTracks().forEach((t) => t.stop()); camStream.current = null;
    if (camVideo.current) camVideo.current.srcObject = null;
  }, []);
  useEffect(() => {
    if (!s.camOn) { stopCam(); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        stopCam();
        const video: MediaTrackConstraints = s.camId && !IS_PHONE
          ? { deviceId: { exact: s.camId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: s.facing, width: { ideal: 1280 }, height: { ideal: 720 } };
        const st = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        if (cancelled) { st.getTracks().forEach((t) => t.stop()); return; }
        camStream.current = st;
        if (camVideo.current) { camVideo.current.srcObject = st; await camVideo.current.play().catch(() => undefined); }
        void refreshDevices();
      } catch {
        flash('Camera blocked or not found. Allow camera access in the browser and try again.');
        set({ camOn: false });
      }
    })();
    return () => { cancelled = true; };
  }, [s.camOn, s.camId, s.facing, stopCam, refreshDevices, flash, set]);
  useEffect(() => () => {
    stopCam(); host.current.stop(); void cloudRec.current?.stop();
    voice.current.stop(); tracker.current.close(); screenStream.current?.getTracks().forEach((t) => t.stop());
  }, [stopCam]);

  // ---- face tracker: only loaded when a disguise needs it ----
  useEffect(() => {
    if (!s.camOn || s.disguise === 'none') return;
    if (tracker.current.status === 'ready' || tracker.current.status === 'loading') return;
    setTrackStatus('loading');
    void tracker.current.load().then((ok) => setTrackStatus(ok ? 'ready' : 'failed'));
  }, [s.camOn, s.disguise]);

  // ---- voice ----
  const startVoice = useCallback(async () => {
    try {
      voice.current.setPreset(sRef.current.voice, sRef.current.pitch, sRef.current.customVoice);
      await voice.current.start(sRef.current.micId || undefined);
      await voice.current.setOutput(sRef.current.output);
      setVoiceOn(true); void refreshDevices();
    } catch { flash('Microphone blocked or not found. Allow mic access in the browser and try again.'); setVoiceOn(false); }
  }, [flash, refreshDevices]);
  const stopVoice = useCallback(() => { voice.current.stop(); setVoiceOn(false); }, []);
  const [testing, setTesting] = useState<'rec' | 'play' | null>(null);
  const [making, setMaking] = useState(false);
  const cartoonMe = useCallback(async () => {
    setMaking(true);
    try {
      if (!sRef.current.camOn || sRef.current.disguise !== 'avatar') set({ camOn: true, disguise: 'avatar' });
      const t0 = performance.now();
      // wait for the camera and face tracking, then a fresh look at the face
      while (performance.now() - t0 < 15000) {
        await new Promise((r) => window.setTimeout(r, 300));
        const tr = tracker.current;
        if (tr.status === 'failed') break;
        if (tr.lastLandmarks && performance.now() - tr.lastAt < 400 && camVideo.current && camVideo.current.videoWidth) {
          await new Promise((r) => window.setTimeout(r, 600)); // let the camera settle its exposure
          const look = cartoonFromCamera(camVideo.current, tr.lastLandmarks, sRef.current.person);
          if (look) {
            const custom = toonFromPerson(look, sRef.current.toon.custom ?? DEFAULT_TOON_CUSTOM);
            set({ person: look, avatar: 'toon', toon: { style: 'avataaars', seed: sRef.current.toon.style === 'avataaars' ? sRef.current.toon.seed : 'avataaars-me', custom } });
            flash('Made a cartoon of you. Fine-tune it under “Customise”.');
            return;
          }
        }
      }
      flash('Couldn’t see your face clearly. Face the camera in good light and try again.');
    } finally { setMaking(false); }
  }, [set, flash]);
  const testVoice = useCallback(async () => {
    if (!voice.current.running) await startVoice();
    const track = voice.current.stream?.getAudioTracks()[0];
    if (!track || typeof MediaRecorder === 'undefined') return;
    const rec = new MediaRecorder(new MediaStream([track]));
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    rec.onstop = () => {
      const url = URL.createObjectURL(new Blob(parts, { type: rec.mimeType || 'audio/webm' }));
      const a = new Audio(url); setTesting('play');
      a.onended = () => { setTesting(null); URL.revokeObjectURL(url); };
      void a.play().catch(() => setTesting(null));
    };
    setTesting('rec'); rec.start(); window.setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 4000);
  }, [startVoice]);
  useEffect(() => { voice.current.setPreset(s.voice, s.pitch, s.customVoice); }, [s.voice, s.pitch, s.customVoice]);
  useEffect(() => { void voice.current.setOutput(s.output); }, [s.output, voiceOn]);
  useEffect(() => { if (voiceOn) void startVoice(); }, [s.micId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- screen capture board ----
  const pickScreen = useCallback(async () => {
    try {
      const md = navigator.mediaDevices as unknown as { getDisplayMedia?: (c: object) => Promise<MediaStream> };
      if (!md.getDisplayMedia) { flash('This browser can’t capture other windows. Use a computer with Chrome or Edge, or pick a ChessScout page.'); return; }
      const st = await md.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      screenStream.current?.getTracks().forEach((t) => t.stop());
      setClip((old) => { if (old) URL.revokeObjectURL(old.url); return null; });
      if (screenVideo.current) { screenVideo.current.removeAttribute('src'); screenVideo.current.loop = false; }
      screenStream.current = st; setScreenOn(true);
      st.getVideoTracks()[0]?.addEventListener('ended', () => { setScreenOn(false); screenStream.current = null; });
      if (screenVideo.current) { screenVideo.current.srcObject = st; await screenVideo.current.play().catch(() => undefined); }
    } catch { /* cancelled */ }
  }, [flash]);
  useEffect(() => {
    if (s.boardSource === 'screen' && !clip && screenVideo.current && screenStream.current && screenVideo.current.srcObject !== screenStream.current) {
      screenVideo.current.srcObject = screenStream.current; void screenVideo.current.play().catch(() => undefined);
    }
  });

  // ---- a screen recording as the board (phones can't capture other apps live) ----
  const clipInput = useRef<HTMLInputElement>(null);
  const [clip, setClip] = useState<{ url: string; name: string } | null>(null);
  const [clipPlaying, setClipPlaying] = useState(false);
  const [clipLoop, setClipLoop] = useState(true);
  const pickClip = useCallback(async (f: File | undefined) => {
    if (!f) return;
    screenStream.current?.getTracks().forEach((t) => t.stop()); screenStream.current = null;
    setClip((old) => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(f), name: f.name }; });
    setScreenOn(true);
  }, []);
  useEffect(() => {
    const v = screenVideo.current;
    if (!v || !clip || s.boardSource !== 'screen') return;
    if (v.srcObject) v.srcObject = null;
    if (v.src !== clip.url) { v.src = clip.url; v.currentTime = 0; }
    v.loop = clipLoop;
    const on = () => setClipPlaying(!v.paused);
    v.addEventListener('play', on); v.addEventListener('pause', on); v.addEventListener('ended', on);
    void v.play().catch(() => undefined);
    return () => { v.removeEventListener('play', on); v.removeEventListener('pause', on); v.removeEventListener('ended', on); };
  }, [clip, s.boardSource]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (screenVideo.current) screenVideo.current.loop = clipLoop; }, [clipLoop]);
  const clipCmd = (c: 'toggle' | 'restart') => {
    const v = screenVideo.current; if (!v) return;
    if (c === 'restart') { v.currentTime = 0; void v.play().catch(() => undefined); }
    else if (v.paused) void v.play().catch(() => undefined); else v.pause();
  };

  // ---- follow a live Lichess game (played in the Lichess app or anywhere) ----
  const [followGame, setFollowGame] = useState<string | null>(null);
  const [followNote, setFollowNote] = useState('');
  const lichess = useLichessGame(s.boardSource === 'follow' ? followGame : null);
  useEffect(() => {
    const u = s.followUser.trim().toLowerCase();
    if (s.boardSource !== 'follow' || !u || (followGame && !lichess?.ended)) return;
    let gone = false;
    const check = async () => {
      try {
        const r = await fetch(`https://lichess.org/api/users/status?ids=${encodeURIComponent(u)}&withGameIds=true`);
        const d = (await r.json()) as { id: string; playingId?: string; online?: boolean }[];
        if (gone) return;
        const me = d.find((x) => x.id === u);
        if (!me) { setFollowNote(`No Lichess player called ${s.followUser.trim()}.`); return; }
        if (me.playingId && me.playingId !== followGame) { setFollowGame(me.playingId); setFollowNote(''); }
        else if (!me.playingId) setFollowNote(`Waiting for ${s.followUser.trim()} to start a game on Lichess…`);
      } catch { if (!gone) setFollowNote('Can’t reach Lichess right now. Trying again…'); }
    };
    // After a game ends, keep the final position up for a moment, then look for the next game.
    const first = window.setTimeout(check, lichess?.ended ? 8000 : 0);
    const id = window.setInterval(check, 6000);
    return () => { gone = true; window.clearTimeout(first); window.clearInterval(id); };
  }, [s.boardSource, s.followUser, followGame, lichess?.ended]);
  useEffect(() => {
    if (s.boardSource !== 'follow') return;
    if (!lichess) { feed.current = null; return; }
    const u = s.followUser.trim().toLowerCase();
    const blackIsMe = (lichess.black?.name ?? '').toLowerCase() === u;
    const tag = (p: typeof lichess.white) => (p ? `${p.title ? p.title + ' ' : ''}${p.name}${p.rating ? ` (${p.rating})` : ''}` : '');
    feed.current = {
      fen: lichess.fen, flipped: blackIsMe, last: lichess.last ? lichess.last.from + lichess.last.to : '',
      top: blackIsMe ? tag(lichess.white) : tag(lichess.black), bottom: blackIsMe ? tag(lichess.black) : tag(lichess.white),
    };
  }, [lichess, s.boardSource, s.followUser]);
  // ---- reviews: open a game's review right in the board panel ----
  const [reviewBusy, setReviewBusy] = useState(false);
  const openReview = (id: number | string) => set({ boardSource: 'app', appPath: `/games/${id}` });
  const reviewLatest = async () => {
    setReviewBusy(true);
    try {
      const r = await apiFetch('/api/games?limit=1', { credentials: 'include' });
      const d = r.ok ? await r.json() : null;
      const id = d?.games?.[0]?.id;
      if (id) openReview(id); else flash('No games in your account yet. Play one, then review it here.');
    } catch { flash('Couldn’t load your games. Try again.'); }
    finally { setReviewBusy(false); }
  };
  // A Lichess game you just played: bring it into your games, then open its review.
  const reviewFollowed = async () => {
    if (!followGame) return;
    setReviewBusy(true);
    try {
      const pgn = await fetch(`https://lichess.org/game/export/${encodeURIComponent(followGame)}?clocks=false&evals=false`).then((r) => (r.ok ? r.text() : ''));
      if (!pgn.trim()) throw new Error('Lichess didn’t send the game. Try again in a moment.');
      const r = await apiFetch('/api/games/import-pgn', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pgn }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Couldn’t add the game to your account.');
      const id = d.ids?.[0];
      if (!id) throw new Error(d.notYours ? 'That game isn’t yours (link this Lichess username to your account first).' : 'Couldn’t add the game to your account.');
      openReview(id);
    } catch (e) { flash(e instanceof Error ? e.message : 'Couldn’t open the review.'); }
    finally { setReviewBusy(false); }
  };

  // The stage's own view of the followed board (the recording draws the same thing).
  const followCanvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (s.boardSource !== 'follow') return undefined;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cv = followCanvas.current; if (!cv) return;
      const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const c = cv.getContext('2d'); if (!c) return;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const f = feed.current;
      if (f) drawBoardPanel(c, { kind: 'fen', ...f }, 0, 0, w, h, looks.current);
      else { c.fillStyle = '#050A0B'; c.fillRect(0, 0, w, h); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s.boardSource]);

  // ---- auto-frame: find the chessboard inside the ChessScout page and fit it to the panel ----
  useEffect(() => {
    if (s.boardSource !== 'app') { setBoardBox(null); if (s.boardSource !== 'follow') feed.current = null; return undefined; }
    const id = window.setInterval(() => {
      try {
        const doc = boardFrame.current?.contentDocument;
        if (!doc) return;
        let best: { x: number; y: number; w: number; h: number } | null = null;
        let bestEl: Element | null = null;
        doc.querySelectorAll('.cs-board-fit, [data-boardid]').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width < 120) return;
          if (!best || r.width > best.w) { best = { x: r.left, y: r.top, w: r.width, h: r.width }; bestEl = el; }
        });
        // the live position, for the recorded / broadcast board (and its move sounds)
        const be = bestEl as HTMLElement | null;
        const fen = be?.getAttribute('data-fen');
        if (be && fen) {
          const prev = feed.current, place = fen.split(' ')[0];
          if (prev && prev.fen.split(' ')[0] !== place && voice.current.running) {
            const count = (f: string) => f.split(' ')[0].replace(/[^a-z]/gi, '').length;
            voice.current.sfx(count(fen) < count(prev.fen) ? 'capture' : 'move');
          }
          feed.current = { fen, flipped: be.getAttribute('data-flipped') === '1', last: be.getAttribute('data-last') || '' };
        } else feed.current = null;
        // keep the board inside the page's view when we're fitting it
        const found = best as { x: number; y: number; w: number; h: number } | null;
        const vh = boardFrame.current?.clientHeight ?? VIRTUAL_H;
        if (found && bestEl && !peekRef.current && vh >= VIRTUAL_H - 1 && (found.y < 0 || found.y + found.h > vh)) {
          (bestEl as Element).scrollIntoView({ block: 'center' });
          return;
        }
        if (sRef.current.frame !== 'auto') { setBoardBox(null); return; }
        setBoardBox((prev) => {
          const b = best as { x: number; y: number; w: number; h: number } | null;
          if (!b) return null;
          if (prev && Math.abs(prev.x - b.x) < 1 && Math.abs(prev.y - b.y) < 1 && Math.abs(prev.w - b.w) < 1) return prev;
          return b;
        });
      } catch { /* not loaded yet */ }
    }, 250);
    return () => window.clearInterval(id);
  }, [s.boardSource, s.frame, s.appPath]);

  useEffect(() => {
    let gone = false;
    const load = () => apiFetch('/api/live/ratings', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { ratings?: Record<string, { rating: number; gamesPlayed: number }> } | null) => { if (!gone && d?.ratings) setRatings(d.ratings); })
      .catch(() => { /* keep the last one */ });
    void load();
    const id = window.setInterval(load, 30_000);
    return () => { gone = true; window.clearInterval(id); };
  }, []);
  const headRef = useRef<{ title: string; runs: TextRun[] } | null>(null);
  const headLine = (() => {
    let key = s.ratingFrom, value: number | null = null;
    if (s.ratingFrom === 'manual') value = s.manualRating > 0 ? s.manualRating : null;
    else if (s.ratingFrom.startsWith('lichess:')) { const pf = lichessRatings?.[s.ratingFrom.slice(8)]; value = pf ? pf.rating : null; }
    else if (ratings) {
      if (s.ratingFrom === 'auto') {
        let best: [string, { rating: number; gamesPlayed: number }] | null = null;
        for (const e of Object.entries(ratings)) if (e[1].gamesPlayed > 0 && (!best || e[1].gamesPlayed > best[1].gamesPlayed)) best = e;
        if (best) { key = best[0]; value = best[1].rating; }
      } else if (ratings[s.ratingFrom]) value = ratings[s.ratingFrom].rating;
    }
    if (value == null) return [] as TextRun[];
    if (ratingStart.current[key] == null) ratingStart.current[key] = value;
    const diff = value - ratingStart.current[key];
    const runs: TextRun[] = [{ text: `${value} ELO`, color: RD.green }];
    if (s.goal > value) runs.push({ text: `  ·  ${s.goal - value} to go`, color: '#C9D1CE' });
    else if (s.goal > 0) runs.push({ text: '  ·  goal reached!', color: '#F5C542' });
    if (diff !== 0) runs.push({ text: `  ·  ${diff > 0 ? '▲' : '▼'}${Math.abs(diff)} this stream`, color: diff > 0 ? RD.green : '#FF6B6B' });
    return runs;
  })();
  headRef.current = s.headline.trim() || headLine.length ? { title: s.headline.trim(), runs: headLine } : null;

  // ---- the composite stage canvas (what's recorded and broadcast) ----
  useEffect(() => {
    let raf = 0, lastDraw = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - lastDraw < 32) return; // ~30 fps
      lastDraw = t;
      const cv = outCanvas.current; if (!cv) return;
      const st = sRef.current;
      const W = st.aspect === '9:16' ? 720 : 1280, H = st.aspect === '9:16' ? 1280 : 720;
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const c = cv.getContext('2d'); if (!c) return;
      let board: BoardFeed = { kind: 'none' };
      if (st.boardSource === 'screen' && screenVideo.current && screenVideo.current.videoWidth) board = { kind: 'video', video: screenVideo.current, zoom: st.zoom, panX: st.panX, panY: st.panY };
      else if ((st.boardSource === 'app' || st.boardSource === 'follow') && feed.current) board = { kind: 'fen', ...feed.current };
      drawComposite(c, W, H, {
        layout: st.layout, board, cam: camCanvas.current, name: st.name, subtitle: st.subtitle,
        light: looks.current.light, dark: looks.current.dark, pieceSrc: looks.current.pieceSrc,
        live: host.current.live, head: headRef.current,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Stage video + the changed voice (turns the mic on if it's off). */
  const stageStream = useCallback(async (): Promise<MediaStream | null> => {
    const cv = outCanvas.current as (HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }) | null;
    if (!cv?.captureStream) { flash('This browser can’t record the stage. Try Chrome.'); return null; }
    if (!voice.current.running) await startVoice();
    const ms = cv.captureStream(30);
    const a = voice.current.stream?.getAudioTracks()[0];
    if (a) ms.addTrack(a); else flash('No microphone: recording without sound. Allow the mic in the Voice tab.');
    return ms;
  }, [flash, startVoice]);

  // ---- camera canvas render loop ----
  useEffect(() => {
    let raf = 0;
    const pose: AvatarPose = { x: 0, y: 0, size: 0, roll: 0, yaw: 0, pitch: 0, mouth: 0, blinkL: 0, blinkR: 0, smile: 0, t: 0 };
    let lastSeen = 0, nextBlink = performance.now() + 2500, blinkUntil = 0;
    const tiny = document.createElement('canvas');
    const tctx = tiny.getContext('2d');
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cv = camCanvas.current, vid = camVideo.current, st = sRef.current;
      if (!cv || !tctx) return;
      const box = cv.parentElement; if (!box) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(2, Math.round(box.clientWidth * dpr)), H = Math.max(2, Math.round(box.clientHeight * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const c = cv.getContext('2d'); if (!c) return;
      const t = performance.now();
      const hasVideo = !!(st.camOn && vid && vid.readyState >= 2 && vid.videoWidth);
      const vw = hasVideo && vid ? vid.videoWidth : 16, vh = hasVideo && vid ? vid.videoHeight : 9;
      const sc = Math.max(W / vw, H / vh), ox = (W - vw * sc) / 2, oy = (H - vh * sc) / 2;
      const mirror = st.mirror && st.facing === 'user';

      // video frame, cover-fitted, mirrored when it's a selfie camera
      const drawVideo = (blurDiv = 0) => {
        if (!hasVideo || !vid) return;
        c.save();
        if (mirror) c.setTransform(-1, 0, 0, 1, W, 0);
        if (blurDiv > 0) {
          tiny.width = Math.max(4, Math.round(W / blurDiv)); tiny.height = Math.max(4, Math.round(H / blurDiv));
          tctx.drawImage(vid, ox / blurDiv, oy / blurDiv, (vw * sc) / blurDiv, (vh * sc) / blurDiv);
          c.imageSmoothingEnabled = true; c.drawImage(tiny, 0, 0, W, H);
        } else c.drawImage(vid, ox, oy, vw * sc, vh * sc);
        c.restore();
      };
      const brand = () => {
        if (st.bg === 'color') { c.fillStyle = st.bgColor; c.fillRect(0, 0, W, H); return; }
        const g = c.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
        g.addColorStop(0, '#16302a'); g.addColorStop(0.55, '#0B1213'); g.addColorStop(1, '#050A0B');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        const sq = Math.max(W, H) / 10; c.fillStyle = 'rgba(129,182,76,.05)';
        for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) if ((i + j) % 2) c.fillRect(i * sq, j * sq, sq, sq);
      };

      // face pose (canvas pixels), smoothed
      let face: FacePose | null = null;
      if (hasVideo && vid && st.disguise !== 'none' && tracker.current.status === 'ready') face = tracker.current.detect(vid);
      if (face) {
        lastSeen = t;
        const fx = ox + face.x * sc, fy = oy + face.y * sc;
        const tx = mirror ? W - fx : fx, roll = mirror ? -face.roll : face.roll, yaw = mirror ? -face.yaw : face.yaw;
        const k = pose.size ? 0.55 : 1;
        pose.x += (tx - pose.x) * k; pose.y += (fy - pose.y) * k; pose.size += (face.size * sc * st.avatarScale - pose.size) * k;
        pose.roll += (roll - pose.roll) * k; pose.yaw += (yaw - pose.yaw) * k; pose.pitch += (face.pitch - pose.pitch) * k;
        pose.mouth = face.mouth; pose.blinkL = face.blinkL; pose.blinkR = face.blinkR; pose.smile = face.smile;
        pose.brow = (pose.brow ?? 0) + (face.brow - (pose.brow ?? 0)) * 0.5;
        pose.lookX = mirror ? -face.lookX : face.lookX; pose.lookY = face.lookY;
      }
      const tracked = t - lastSeen < 450;
      const vlevel = voice.current.running ? voice.current.level() : 0;

      if (st.disguise === 'none') {
        if (hasVideo) drawVideo(); else brand();
      } else if (!tracked) {
        // Privacy shield: no face found -> never show the raw camera.
        if (st.disguise === 'avatar' && st.bg !== 'room' && st.bg !== 'blur') brand();
        else if (hasVideo) drawVideo(40); else brand();
      } else if (st.disguise === 'avatar') {
        if (st.bg === 'room') drawVideo(); else if (st.bg === 'blur') drawVideo(28); else brand();
      } else {
        drawVideo();
        // hide the face region: ellipse in the (mirrored) video space
        const r = pose.size * 0.62;
        c.save(); c.beginPath(); c.ellipse(pose.x, pose.y, r, r * 1.3, pose.roll, 0, Math.PI * 2); c.clip();
        drawVideo(st.disguise === 'pixelate' ? Math.max(6, r / 7) : Math.max(10, r / 3));
        c.restore();
      }

      if (st.disguise === 'avatar') {
        if (!tracked) {
          // idle avatar driven by the voice
          const tx = W / 2 + Math.sin(t / 1400) * W * 0.015, ty = H * 0.47 + Math.sin(t / 900) * H * 0.008;
          const size = Math.min(W, H) * 0.42;
          const k = pose.size ? 0.08 : 1;
          pose.x += (tx - pose.x) * k; pose.y += (ty - pose.y) * k; pose.size += (size - pose.size) * k;
          pose.roll *= 0.9; pose.yaw = Math.sin(t / 2100) * 0.25; pose.pitch *= 0.9; pose.smile = 0.3;
          if (t > nextBlink) { blinkUntil = t + 140; nextBlink = t + 2500 + Math.random() * 3000; }
          pose.blinkL = pose.blinkR = t < blinkUntil ? 1 : 0;
          pose.mouth = Math.min(1, vlevel * 1.8);
        } else if (pose.mouth < 0.1 && vlevel > 0.15) pose.mouth = Math.min(1, vlevel * 1.5);
        pose.t = t / 1000;
        if (st.avatar === '3d' && a3d.current?.status === 'ready') {
          const rw = Math.round(W * 0.8), rh = Math.round(H * 0.8);
          const img = a3d.current.render(rw, rh, st.avatarScale / 1.3, {
            yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll, t: pose.t, mirror, tracked,
            voice: vlevel, blinkL: pose.blinkL, blinkR: pose.blinkR,
          }, tracked ? tracker.current.lastBlendshapes : {});
          c.drawImage(img, 0, 0, W, H);
        } else if (st.avatar === 'toon' || st.avatar === '3d') drawToon(c, st.toon, pose);
        else drawAvatar(c, st.avatar, pose, { person: st.person, hat: st.hat, eyewear: st.eyewear, style: st.personStyle });
      }

      if (!hasVideo && st.disguise !== 'avatar') {
        c.fillStyle = RD.muted; c.font = `${Math.round(H * 0.06)}px "DM Sans", sans-serif`; c.textAlign = 'center';
        c.fillText(st.camOn ? 'Starting camera…' : 'Camera off', W / 2, H / 2);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // voice meter + recording clock
  useEffect(() => {
    const id = window.setInterval(() => { setLevel(voice.current.running ? voice.current.level() : 0); setNow(Date.now()); }, 120);
    return () => window.clearInterval(id);
  }, []);

  // ---- recording to chessscout.net (stage canvas + voice; works on phones too) ----
  const [videosKey, setVideosKey] = useState(0);
  const startCloudRecording = useCallback(async () => {
    if (cloudRec.current) return;
    if (typeof MediaRecorder === 'undefined') { flash('This browser can’t record. Try Chrome.'); return; }
    setEdit(false);
    const ms = await stageStream(); if (!ms) return;
    const start = Date.now();
    const title = sRef.current.title || `${sRef.current.name} · ${new Date().toLocaleString()}`;
    const r = new CloudRecorder(ms, title, (st) => {
      setCloud({ ...st, start });
      if (st.message) flash(st.message);
      if (st.phase === 'saved' || st.phase === 'downloaded' || st.phase === 'error') {
        cloudRec.current = null; ms.getVideoTracks().forEach((t) => t.stop());
        window.setTimeout(() => setCloud(null), 4000);
        setVideosKey((k) => k + 1);
        if (st.phase === 'saved') flash('Saved to chessscout.net: find it in the Videos tab.');
      }
    });
    cloudRec.current = r;
    await r.start();
  }, [flash, stageStream]);
  const stopCloudRecording = useCallback(async () => { const r = cloudRec.current; if (r) await r.stop(); }, []);

  // ---- recording (Chrome/Edge: this tab, cropped to the stage) ----
  const stopRecording = useCallback(() => { const r = recRef.current; if (r && r.rec.state !== 'inactive') r.rec.stop(); }, []);
  const startRecording = useCallback(async (withTabAudio: boolean) => {
    const md = navigator.mediaDevices as unknown as { getDisplayMedia?: (c: object) => Promise<MediaStream> };
    if (!md.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      flash('Recording here needs Chrome or Edge on a computer. On a phone: tap Go live and use your phone’s screen recorder.');
      return;
    }
    setEdit(false);
    let disp: MediaStream;
    try {
      disp = await md.getDisplayMedia({ video: { frameRate: 30 }, audio: withTabAudio, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' });
    } catch { return; }
    const vt = disp.getVideoTracks()[0] as MediaStreamTrack & { cropTo?: (t: unknown) => Promise<void> };
    const CropTarget = (window as unknown as { CropTarget?: { fromElement: (e: Element) => Promise<unknown> } }).CropTarget;
    if (CropTarget && vt.cropTo && stageRef.current) {
      try { await vt.cropTo(await CropTarget.fromElement(stageRef.current)); } catch { /* records the whole tab */ }
    } else flash('Your browser records the whole tab (not just the stage). Chrome crops to the stage automatically.');

    const tracks: MediaStreamTrack[] = [vt];
    let ctx: AudioContext | null = null;
    const vs = voice.current.stream;
    const tabAudio = disp.getAudioTracks()[0];
    if (vs && tabAudio) {
      ctx = new AudioContext(); const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(vs).connect(dest); ctx.createMediaStreamSource(new MediaStream([tabAudio])).connect(dest);
      tracks.push(dest.stream.getAudioTracks()[0]);
    } else if (vs) tracks.push(vs.getAudioTracks()[0]);
    else if (tabAudio) tracks.push(tabAudio);

    const types = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
    const mimeType = types.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    const rec = new MediaRecorder(new MediaStream(tracks), mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      disp.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      recRef.current = null; setRecording(null);
      const type = rec.mimeType || 'video/webm';
      const blob = new Blob(chunks, { type });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chessscout-stream-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    };
    vt.addEventListener('ended', () => { if (rec.state !== 'inactive') rec.stop(); });
    rec.start(1000);
    recRef.current = { rec, streams: [disp], ctx };
    setRecording({ start: Date.now() });
  }, [flash]);

  // ---- Go live: stage only, full screen. Esc, the back gesture or a double-tap top-right exits ----
  const [hint, setHint] = useState(false);
  const goLive = useCallback(async () => {
    setEdit(false); setPeek(false); setClean(true); setHint(true);
    window.setTimeout(() => setHint(false), 3000);
    const st = sRef.current;
    if (st.broadcast || st.recordLive) {
      void (async () => {
        if (st.broadcast && !host.current.live) {
          const ms = await stageStream();
          if (ms) {
            host.current.onChange = (n) => setWatching(n);
            try { await host.current.start(ms, st.name, st.title); setWatching(0); }
            catch { flash('Couldn’t go live on chessscout.net right now.'); }
          }
        }
        if (st.recordLive) await startCloudRecording();
      })();
    }
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      if (IS_PHONE && o?.lock) await o.lock(sRef.current.aspect === '16:9' ? 'landscape' : 'portrait').catch(() => undefined);
    } catch { /* fullscreen not allowed here: the stage still fills the window */ }
  }, [stageStream, startCloudRecording, flash]);
  const endLive = useCallback(() => {
    setClean(false);
    if (host.current.live) { host.current.stop(); setWatching(null); }
    if (cloudRec.current && sRef.current.recordLive) void cloudRec.current.stop();
    try { (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.(); } catch { /* ignore */ }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') endLive(); };
    const fs = () => { if (!document.fullscreenElement) endLive(); };
    window.addEventListener('keydown', k); document.addEventListener('fullscreenchange', fs);
    return () => { window.removeEventListener('keydown', k); document.removeEventListener('fullscreenchange', fs); };
  }, [endLive]);

  // ---- layout editing (drag / resize in % of the stage) ----
  const drag = useRef<{ id: PanelId; mode: 'move' | 'size'; sx: number; sy: number; r: Rect } | null>(null);
  const onDown = (id: PanelId, mode: 'move' | 'size') => (e: RPointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    drag.current = { id, mode, sx: e.clientX, sy: e.clientY, r: { ...sRef.current.layout[id] } };
    const move = (ev: PointerEvent) => {
      const d = drag.current; if (!d) return;
      const dx = ((ev.clientX - d.sx) / stage.w) * 100, dy = ((ev.clientY - d.sy) / stage.h) * 100;
      const r = { ...d.r };
      if (d.mode === 'move') { r.x = Math.round(Math.max(-r.w + 5, Math.min(95, d.r.x + dx)) * 4) / 4; r.y = Math.round(Math.max(-r.h + 5, Math.min(95, d.r.y + dy)) * 4) / 4; }
      else { r.w = Math.round(Math.max(8, d.r.w + dx) * 4) / 4; r.h = Math.round(Math.max(5, d.r.h + dy) * 4) / 4; }
      setS((p) => ({ ...p, preset: 'custom', layout: { ...p.layout, [d.id]: r } }));
    };
    const up = () => { drag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const toFront = (id: PanelId) => setS((p) => {
    const top = Math.max(...Object.values(p.layout).map((r) => r.z)) + 1;
    return { ...p, preset: 'custom', layout: { ...p.layout, [id]: { ...p.layout[id], z: top } } };
  });
  const toggleHidden = (id: PanelId) => setS((p) => ({ ...p, layout: { ...p.layout, [id]: { ...p.layout[id], hidden: !p.layout[id].hidden } } }));

  // ---- the stage ----
  const px = (r: Rect) => ({ left: (r.x / 100) * stage.w, top: (r.y / 100) * stage.h, width: (r.w / 100) * stage.w, height: (r.h / 100) * stage.h });
  const boardRect = px(s.layout.board);
  const z = s.zoom;
  // screen capture: zoom + pan inside the panel
  const offX = -(boardRect.width * z - boardRect.width) * s.panX, offY = -(boardRect.height * z - boardRect.height) * s.panY;
  // ChessScout page: auto-fit the board (plus the player bars), or zoom/pan by hand
  let ifScale = (boardRect.width / VIRTUAL_W) * z, ifLeft = 0, ifTop = 0, ifH = VIRTUAL_H;
  const fitBoard = s.frame === 'auto' && !!boardBox && !peek;
  if (s.frame === 'auto' && !fitBoard) {
    // no game on screen (lobby, picking an opponent) or peeking: show the page itself, scrollable, at phone width
    ifScale = boardRect.width / VIRTUAL_W;
    ifH = VIRTUAL_W * (boardRect.height / Math.max(1, boardRect.width));
  } else if (fitBoard && boardBox) {
    const pad = s.framePad === 'players' ? boardBox.w * 0.17 : 0;
    const r = { x: boardBox.x, y: boardBox.y - pad, w: boardBox.w, h: boardBox.h + pad * 2 };
    ifScale = Math.min(boardRect.width / r.w, boardRect.height / r.h);
    ifLeft = boardRect.width / 2 - (r.x + r.w / 2) * ifScale;
    ifTop = boardRect.height / 2 - (r.y + r.h / 2) * ifScale;
  } else {
    ifLeft = Math.min(0, -(VIRTUAL_W * ifScale - boardRect.width) * s.panX);
    ifTop = Math.min(0, -(VIRTUAL_H * ifScale - boardRect.height) * s.panY);
  }
  const panel = (id: PanelId, label: string, children: ReactNode) => {
    const r = s.layout[id];
    if (r.hidden && !edit) return null;
    return (
      <div key={id} className="absolute overflow-hidden" style={{ ...px(r), zIndex: r.z, opacity: r.hidden ? 0.35 : 1, borderRadius: r.round ? '50%' : 0, boxShadow: r.round ? `0 0 0 3px ${RD.green}, 0 8px 24px rgba(0,0,0,.6)` : undefined }}>
        {children}
        {edit && (
          <div className="absolute inset-0" style={{ outline: `2px dashed ${RD.green}`, outlineOffset: -2, background: 'rgba(5,10,11,.25)', cursor: 'move', touchAction: 'none' }}
            onPointerDown={onDown(id, 'move')}>
            <div className="absolute top-1 left-1 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold" style={{ background: RD.green, color: '#06110A' }}>{label}</span>
              <button className="px-2 py-0.5 rounded-md text-[11px] font-bold" style={{ background: CARD_LIGHT, color: RD.text }} onClick={() => toFront(id)}>Front</button>
              <button className="px-2 py-0.5 rounded-md text-[11px] font-bold" style={{ background: CARD_LIGHT, color: RD.text }} onClick={() => toggleHidden(id)}>{r.hidden ? 'Show' : 'Hide'}</button>
            </div>
            <div className="absolute right-0 bottom-0 w-6 h-6" style={{ background: RD.green, borderTopLeftRadius: 8, cursor: 'nwse-resize', touchAction: 'none' }}
              onPointerDown={onDown(id, 'size')} />
          </div>
        )}
      </div>
    );
  };

  const stageEl = (
    <div ref={stageRef} className="relative overflow-hidden" style={{ width: stage.w, height: stage.h, background: `radial-gradient(120% 60% at 50% 0%, #16302a 0%, ${BG} 60%)`, borderRadius: clean ? 0 : 12, boxShadow: clean ? 'none' : `0 0 0 1px ${RD.border}` }}>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 pointer-events-none" style={{ height: Math.max(28, stage.h * 0.07), color: RD.text, fontWeight: 800, fontSize: Math.max(12, stage.w * 0.045) }}>
        <img src="/icons/icon-192.png" alt="" style={{ height: '62%', borderRadius: '22%' }} />
        <span>chess<span style={{ color: RD.green }}>scout</span>.net</span>
      </div>
      {panel('board', 'Board', s.boardSource === 'follow' ? (
        <div className="absolute inset-0" style={{ background: '#050A0B' }}>
          <canvas ref={followCanvas} className="absolute inset-0 w-full h-full" />
          {lichess?.ended && !edit && !recording && !clean && (
            <button onClick={() => void reviewFollowed()} disabled={reviewBusy} className="absolute top-1.5 right-1.5 z-10 px-2.5 py-1 rounded-lg text-[11px] font-bold disabled:opacity-60"
              style={{ background: RD.green, color: '#06110A' }}>{reviewBusy ? 'Opening…' : '🔎 Review this game'}</button>
          )}
          {!lichess && (
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-4 text-center text-[13px] font-semibold" style={{ color: RD.muted }}>
              {s.followUser.trim() ? (followNote || 'Looking for the game on Lichess…') : 'Type a Lichess username in Board settings.'}
            </p>
          )}
        </div>
      ) : s.boardSource === 'app' ? (
        <div className="absolute inset-0 overflow-hidden" style={{ background: '#050A0B' }}>
          {s.frame === 'auto' && boardBox && !clean && !recording && !edit && (
            <button onClick={() => setPeek((v) => !v)} className="absolute top-1.5 right-1.5 z-10 px-2.5 py-1 rounded-lg text-[11px] font-bold"
              style={{ background: peek ? RD.green : CARD, color: peek ? '#06110A' : RD.text, border: `1px solid ${RD.border}` }}>
              {peek ? '⊡ Fit board' : '⤢ Whole page'}
            </button>
          )}
          <iframe ref={boardFrame} title="Board" src={s.appPath} allow="autoplay; clipboard-write"
            style={{ position: 'absolute', left: ifLeft, top: ifTop, width: VIRTUAL_W, height: ifH, border: 0, transform: `scale(${ifScale})`, transformOrigin: '0 0', pointerEvents: edit ? 'none' : 'auto' }} />
        </div>
      ) : (
        <div className="absolute inset-0 overflow-hidden flex items-center justify-center" style={{ background: '#050A0B' }}>
          <video ref={screenVideo} muted playsInline
            style={{ position: 'absolute', left: offX, top: offY, width: boardRect.width * z, height: boardRect.height * z, objectFit: 'contain', display: screenOn ? 'block' : 'none' }} />
          {!screenOn && (IS_PHONE
            ? <button onClick={() => clipInput.current?.click()} className="px-4 py-3 rounded-xl font-bold text-sm" style={{ background: RD.green, color: '#06110A' }}>Pick a screen recording</button>
            : <button onClick={pickScreen} className="px-4 py-3 rounded-xl font-bold text-sm" style={{ background: RD.green, color: '#06110A' }}>Pick a window or tab to show</button>)}
          {clip && !edit && !recording && !clean && (
            <div className="absolute bottom-1.5 right-1.5 z-10 flex gap-1">
              <button onClick={() => clipCmd('toggle')} className="px-2.5 py-1 rounded-lg text-[11px] font-bold" style={{ background: CARD, color: RD.text, border: `1px solid ${RD.border}` }}>{clipPlaying ? '⏸' : '▶'}</button>
              <button onClick={() => clipCmd('restart')} className="px-2.5 py-1 rounded-lg text-[11px] font-bold" style={{ background: CARD, color: RD.text, border: `1px solid ${RD.border}` }}>⟲</button>
            </div>
          )}
        </div>
      ))}
      {panel('cam', 'Camera', (
        <div className="absolute inset-0" style={{ background: '#050A0B' }}>
          <canvas ref={camCanvas} className="absolute inset-0 w-full h-full" />
        </div>
      ))}
      {headRef.current && panel('head', 'Headline', (() => {
        const hr = px(s.layout.head), fz = headSizes(hr.width, hr.height);
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-[4%] text-center leading-tight" style={{ background: CARD, borderBottom: `${Math.max(2, hr.height * 0.035)}px solid ${RD.green}` }}>
            {s.headline.trim() && <p className="w-full truncate font-black uppercase" style={{ color: RD.text, fontSize: fz.title }}>{s.headline.trim()}</p>}
            {headLine.length > 0 && <p className="w-full truncate font-extrabold" style={{ fontSize: fz.line }}>{headLine.map((r, i) => <span key={i} style={{ color: r.color, whiteSpace: 'pre' }}>{r.text}</span>)}</p>}
          </div>
        );
      })())}
      {panel('tag', 'Name tag', (
        <div className="absolute inset-0 flex items-center gap-[3%] px-[4%]" style={{ background: CARD, borderTop: `2px solid ${RD.green}` }}>
          <img src="/icons/icon-192.png" alt="" className="rounded-[22%] shrink-0" style={{ height: '62%', aspectRatio: '1' }} />
          <div className="min-w-0 leading-tight">
            <p className="font-extrabold truncate" style={{ color: RD.text, fontSize: Math.max(11, Math.min(px(s.layout.tag).height * 0.3, px(s.layout.tag).width * 0.07)) }}>{s.name}</p>
            <p className="font-semibold truncate" style={{ color: RD.green, fontSize: Math.max(9, Math.min(px(s.layout.tag).height * 0.2, px(s.layout.tag).width * 0.05)) }}>{s.subtitle}</p>
          </div>
          {recording && <span className="ml-auto shrink-0 w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: RD.red }} />}
        </div>
      ))}
    </div>
  );

  // hidden video element that feeds the camera canvas
  const hiddenVideo = (<>
    <video ref={camVideo} muted playsInline style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', left: -10, top: -10 }} />
    <canvas ref={outCanvas} width={720} height={1280} style={{ position: 'fixed', width: 2, height: 2, opacity: 0.01, pointerEvents: 'none', left: 0, top: 0 }} />
  </>);


  const elapsed = recording ? Math.floor((now - recording.start) / 1000) : 0;
  const cloudElapsed = cloud ? Math.floor((now - cloud.start) / 1000) : 0;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'layout', label: 'Layout' }, { id: 'board', label: 'Board' }, { id: 'camera', label: 'Face' }, { id: 'voice', label: 'Voice' }, { id: 'videos', label: 'Videos' }, { id: 'live', label: 'Go live' },
  ];

  return (
    <div className={clean ? 'fixed inset-0 z-[200] flex' : 'min-h-screen lg:h-screen flex flex-col lg:flex-row relative z-0'} style={{ background: clean ? '#000' : BG, color: RD.text }}>
      {hiddenVideo}
      <div className={clean ? 'flex-1 flex flex-col min-w-0' : 'flex flex-col lg:flex-1 min-w-0 p-3 gap-3'}>
        {!clean && <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin" className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: CARD_LIGHT, color: RD.text }}>← Admin</Link>
          <h1 className="font-extrabold text-lg">Streamer Studio</h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: RD.gold, color: '#050A0B' }}>IN DEVELOPMENT</span>
          <div className="w-full sm:w-auto sm:ml-auto flex gap-2">
            <button onClick={() => setEdit((v) => !v)} className="px-3 py-1.5 rounded-lg text-sm font-bold" style={edit ? { background: RD.green, color: '#06110A' } : { background: CARD_LIGHT, color: RD.text }}>{edit ? 'Done' : 'Move & resize'}</button>
            <button onClick={() => void goLive()} className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: RD.red, color: '#fff' }}>◉ Go live</button>
            {recording
              ? <button onClick={stopRecording} className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: RD.red, color: '#fff' }}>■ Stop {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</button>
              : cloud && cloud.phase === 'recording'
                ? <button onClick={() => void stopCloudRecording()} className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: RD.red, color: '#fff' }}>■ Stop {Math.floor(cloudElapsed / 60)}:{String(cloudElapsed % 60).padStart(2, '0')}</button>
                : cloud && cloud.phase === 'saving'
                  ? <span className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: CARD_LIGHT, color: RD.text }}>Saving… {cloud.uploadedMB.toFixed(1)} MB</span>
                  : <button onClick={() => void startCloudRecording()} className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: RD.green, color: '#06110A' }}>● Record</button>}
          </div>
        </div>}
        {!clean && msg && <div className="text-sm px-3 py-2 rounded-lg" style={card}>{msg}</div>}
        <div ref={areaRef} className={clean ? 'flex-1 flex items-center justify-center' : 'flex-1 flex items-center justify-center min-h-[60vh] lg:min-h-0'}>{stageEl}</div>
      </div>
      {clean && <button aria-label="Exit" onDoubleClick={endLive} className="absolute top-0 right-0 w-20 h-20 opacity-0" />}
      {clean && (watching !== null || (cloud && cloud.phase === 'recording')) && (
        <div className="absolute top-2 left-2 flex gap-1.5 pointer-events-none">
          {watching !== null && <span className="px-2 py-1 rounded-md text-[11px] font-extrabold" style={{ background: RD.red, color: '#fff' }}>● LIVE · {watching} watching</span>}
          {cloud && cloud.phase === 'recording' && <span className="px-2 py-1 rounded-md text-[11px] font-extrabold" style={{ background: CARD, color: RD.text }}>REC {Math.floor(cloudElapsed / 60)}:{String(cloudElapsed % 60).padStart(2, '0')}</span>}
        </div>
      )}
      {clean && hint && <div className="absolute top-3 inset-x-0 mx-auto w-fit max-w-[90%] text-center text-[13px] font-semibold px-3 py-2 rounded-lg pointer-events-none" style={{ background: CARD, color: RD.text, border: `1px solid ${RD.border}` }}>You’re in Go live view. To leave: swipe back, press Esc, or double-tap the top-right corner.</div>}

      {!clean && <aside className="lg:w-[380px] lg:h-screen lg:overflow-y-auto p-3 pt-0 lg:pt-3 shrink-0">
        <div className="flex gap-1 p-1 mb-3" style={card}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'live') void goLive(); }} className="flex-1 py-2 rounded-[10px] text-[12px] font-bold whitespace-nowrap"
              style={tab === t.id ? { background: RD.green, color: '#06110A' } : { color: RD.muted }}>{t.label}</button>
          ))}
        </div>
        <div className="p-4" style={card}>
          {tab === 'layout' && (<>
            <Label>Screen shape</Label>
            <div className="flex flex-wrap gap-2">
              <Chip on={s.aspect === '9:16'} onClick={() => set({ aspect: '9:16', preset: PRESETS['9:16'][0].id, layout: PRESETS['9:16'][0].layout })}>📱 Vertical 9:16</Chip>
              <Chip on={s.aspect === '16:9'} onClick={() => set({ aspect: '16:9', preset: PRESETS['16:9'][0].id, layout: PRESETS['16:9'][0].layout })}>🖥️ Wide 16:9</Chip>
            </div>
            <Note>Vertical for TikTok, Shorts and Reels. Wide for YouTube and Twitch.</Note>
            <Label>Layout</Label>
            <div className="flex flex-col gap-2">
              {PRESETS[s.aspect].map((p) => <Chip key={p.id} on={s.preset === p.id} onClick={() => set({ preset: p.id, layout: p.layout })}>{p.label}</Chip>)}
              {s.preset === 'custom' && <Chip on onClick={() => undefined}>✋ Your own arrangement</Chip>}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip on={!!s.layout.cam.round} onClick={() => set({ preset: 'custom', layout: { ...s.layout, cam: { ...s.layout.cam, round: !s.layout.cam.round } } })}>◯ Round camera</Chip>
            </div>
            <Note>Tap <b>Move &amp; resize</b> to drag the board, camera and name tag anywhere, resize them from the corner, bring one to the front, or hide one.</Note>
            <Label>Name tag</Label>
            <input value={s.name} onChange={(e) => set({ name: e.target.value.slice(0, 40) })} placeholder="Stream name" className="w-full px-3 py-2 rounded-lg text-sm mb-2" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }} />
            <input value={s.subtitle} onChange={(e) => set({ subtitle: e.target.value.slice(0, 60) })} placeholder="Subtitle" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }} />
            <Note>Use a stream name, not your real one, to stay anonymous.</Note>
            <Label>Headline</Label>
            <input value={s.headline} onChange={(e) => set({ headline: e.target.value.slice(0, 50) })} placeholder="The road to 1500 ELO" className="w-full px-3 py-2 rounded-lg text-sm mb-2" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }} />
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[12.5px] font-semibold" style={{ color: RD.muted }}>Goal</span>
              <input type="number" inputMode="numeric" value={s.goal || ''} onChange={(e) => set({ goal: Math.max(0, Math.min(3500, Number(e.target.value) || 0)) })} className="w-24 px-3 py-2 rounded-lg text-sm" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }} />
              <button onClick={() => toggleHidden('head')} className="ml-auto px-3 py-2 rounded-xl text-[13px] font-semibold" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }}>{s.layout.head.hidden ? 'Show headline' : 'Hide headline'}</button>
            </div>
            <p className="text-[12px] font-semibold mb-1.5" style={{ color: RD.muted }}>Rating shown under it</p>
            <div className="flex flex-wrap gap-2">
              {[['auto', 'Most played'], ['blitz_5_0', '5 min'], ['blitz_5_3', '5 | 3'], ['rapid_10_0', '10 min'], ['rapid_15_0', '15 min'], ['daily', 'Daily'], ['manual', 'Type it in']].map(([id, label]) => (
                <Chip key={id} on={s.ratingFrom === id} onClick={() => set({ ratingFrom: id })}>{label}{ratings?.[id] ? ` · ${ratings[id].rating}` : ''}</Chip>
              ))}
              {[['lichess:rapid', 'Lichess rapid'], ['lichess:classical', 'Lichess classical'], ['lichess:blitz', 'Lichess blitz']].map(([id, label]) => (
                <Chip key={id} on={s.ratingFrom === id} onClick={() => set({ ratingFrom: id })}>{label}{lichessRatings?.[id.slice(8)] ? ` · ${lichessRatings[id.slice(8)].rating}` : ''}</Chip>
              ))}
            </div>
            {s.ratingFrom === 'manual' && (
              <input type="number" inputMode="numeric" value={s.manualRating || ''} onChange={(e) => set({ manualRating: Math.max(0, Math.min(3500, Number(e.target.value) || 0)) })} placeholder="e.g. your Chess.com rating" className="mt-2 w-full px-3 py-2 rounded-lg text-sm" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }} />
            )}
            <Note>Your real rating, updated every 30 seconds, so it moves on stream as you win or lose. Lichess options use {lichessName ? <b>{lichessName}</b> : 'your linked Lichess account'} (10+0 and 15+0 games on Lichess count as rapid). Pick “Type it in” for anywhere else.</Note>
          </>)}

          {tab === 'board' && (<>
            <Label>What shows in the board panel</Label>
            <div className="flex flex-wrap gap-2">
              <Chip on={s.boardSource === 'app'} onClick={() => set({ boardSource: 'app' })}>♞ ChessScout</Chip>
              <Chip on={s.boardSource === 'screen'} onClick={() => set({ boardSource: 'screen' })}>🪟 Another window</Chip>
              <Chip on={s.boardSource === 'follow'} onClick={() => set({ boardSource: 'follow' })}>♟ Live Lichess game</Chip>
            </div>
            <Label>Reviews &amp; lookup</Label>
            <div className="flex flex-wrap gap-2">
              <Chip on={false} onClick={() => void reviewLatest()}>{reviewBusy ? 'Opening…' : '🔎 Review my last game'}</Chip>
              <Chip on={s.boardSource === 'app' && s.appPath === '/games'} onClick={() => set({ boardSource: 'app', appPath: '/games' })}>📚 All game reviews</Chip>
              <Chip on={s.boardSource === 'app' && s.appPath === '/lookup'} onClick={() => set({ boardSource: 'app', appPath: '/lookup' })}>🔍 Game lookup</Chip>
            </div>
            <Note>Opens in the board panel, so viewers see it. Game lookup finds games between any two Chess.com players to break down on stream. Tap ⤢ Whole page on the panel to show the coach’s notes and move list too.</Note>
            <input ref={clipInput} type="file" accept="video/*" className="hidden" onChange={(e) => { void pickClip(e.target.files?.[0]); e.target.value = ''; }} />
            {s.boardSource === 'follow' ? (<>
              <Label>Lichess username</Label>
              <input value={s.followUser} onChange={(e) => { set({ followUser: e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30) }); setFollowGame(null); }} placeholder="Your Lichess username" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }} />
              <Note>Play in the Lichess app (or anywhere on Lichess) and your game shows here live, move by move, with your pieces and board colours. The next game appears by itself. Works on phones, in recordings and when you go live.</Note>
              {lichess && <Note>Showing: {lichess.white?.name ?? '?'} vs {lichess.black?.name ?? '?'}{lichess.ended ? ' (finished; the next game shows when it starts)' : ''}</Note>}
              {followGame && lichess?.ended && (
                <button onClick={() => void reviewFollowed()} disabled={reviewBusy} className="mt-2 w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-60" style={{ background: RD.green, color: '#06110A' }}>{reviewBusy ? 'Opening…' : '🔎 Review this game'}</button>
              )}
              <Note>Review opens the game in ChessScout’s game review, in the board panel. Switch back to ♟ Live Lichess game for your next one.</Note>
            </>) : s.boardSource === 'app' ? (<>
              <Label>Page</Label>
              <div className="flex flex-wrap gap-2">
                {APP_PAGES.map((p) => <Chip key={p.path} on={s.appPath === p.path} onClick={() => set({ appPath: p.path })}>{p.label}</Chip>)}
              </div>
              <Note>You play right inside the panel. It’s your normal ChessScout account.</Note>

              <Label>Framing</Label>
              <div className="flex flex-wrap gap-2">
                <Chip on={s.frame === 'auto' && s.framePad === 'players'} onClick={() => set({ frame: 'auto', framePad: 'players' })}>Board + names</Chip>
                <Chip on={s.frame === 'auto' && s.framePad === 'board'} onClick={() => set({ frame: 'auto', framePad: 'board' })}>Board only</Chip>
                <Chip on={s.frame === 'manual'} onClick={() => set({ frame: 'manual' })}>Whole page</Chip>
              </div>
              <Note>{s.frame === 'auto' ? (boardBox ? 'The board is found and fitted automatically, even when it moves.' : 'No game on screen yet: pick or start a game right in the panel, and the board fills the panel as soon as it starts. Use ⤢ Whole page on the panel any time to get back to the page.') : 'Zoom and move below to show the part of the page you want.'}</Note>
            </>) : (<>
              {!IS_PHONE && <button onClick={pickScreen} className="mt-3 w-full py-2.5 rounded-xl font-bold text-sm" style={{ background: RD.green, color: '#06110A' }}>{screenOn && !clip ? 'Pick a different window' : 'Pick a window or tab'}</button>}
              <button onClick={() => clipInput.current?.click()} className="mt-2 w-full py-2.5 rounded-xl font-bold text-sm" style={IS_PHONE ? { background: RD.green, color: '#06110A' } : { background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }}>{clip ? 'Pick a different screen recording' : '📼 Use a screen recording'}</button>
              {clip && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip on={clipPlaying} onClick={() => clipCmd('toggle')}>{clipPlaying ? '⏸ Pause' : '▶ Play'}</Chip>
                  <Chip on={false} onClick={() => clipCmd('restart')}>⟲ From the start</Chip>
                  <Chip on={clipLoop} onClick={() => setClipLoop((v) => !v)}>🔁 Loop</Chip>
                </div>
              )}
              <Note>{IS_PHONE
                ? 'Phones don’t let websites show other apps live. Record your game with the phone’s screen recorder (Chess.com app, anything), then pick that video here: it plays in the board panel while you react on camera and record. For a live game, use ♟ Live Lichess game.'
                : 'Show any chess site or app window, or a screen recording you made. Zoom and move below to frame just the board.'}{clip ? ` Playing: ${clip.name}` : ''}</Note>
            </>)}
            {(s.boardSource === 'screen' || s.frame === 'manual') && (<>
              <Label>Zoom &amp; frame</Label>
              <Slider label="Zoom" min={s.boardSource === 'app' ? 0.5 : 1} max={3} step={0.05} value={s.zoom} onChange={(v) => set({ zoom: v })} />
              <Slider label="Left ↔ right" min={0} max={1} step={0.01} value={s.panX} onChange={(v) => set({ panX: v })} />
              <Slider label="Up ↕ down" min={0} max={1} step={0.01} value={s.panY} onChange={(v) => set({ panY: v })} />
            </>)}
          </>)}

          {tab === 'camera' && (<>
            <Label>Camera</Label>
            <div className="flex flex-wrap gap-2">
              <Chip on={s.camOn} onClick={() => set({ camOn: !s.camOn })}>{s.camOn ? '📷 Camera on' : '📷 Turn camera on'}</Chip>
              {IS_PHONE
                ? <Chip on={false} onClick={() => set({ facing: s.facing === 'user' ? 'environment' : 'user' })}>{s.facing === 'user' ? '🤳 Front camera' : '📸 Back camera'}</Chip>
                : <Chip on={s.mirror} onClick={() => set({ mirror: !s.mirror })}>↔ Mirror</Chip>}
            </div>
            {!IS_PHONE && cams.length > 1 && (
              <select value={s.camId} onChange={(e) => set({ camId: e.target.value })} className="mt-2 w-full px-3 py-2 rounded-lg text-sm" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }}>
                <option value="">Default camera</option>
                {cams.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
              </select>
            )}
            <Note>No camera? Pick an avatar anyway: it talks along with your voice.</Note>

            <Label>Hide my face</Label>
            <div className="flex flex-wrap gap-2">
              <Chip on={s.disguise === 'avatar'} onClick={() => set({ disguise: 'avatar' })}>🎭 Avatar</Chip>
              <Chip on={s.disguise === 'pixelate'} onClick={() => set({ disguise: 'pixelate' })}>▦ Pixelate face</Chip>
              <Chip on={s.disguise === 'blur'} onClick={() => set({ disguise: 'blur' })}>◌ Blur face</Chip>
              <Chip on={s.disguise === 'none'} onClick={() => set({ disguise: 'none' })}>🙂 Show my face</Chip>
            </div>
            {s.disguise !== 'none' && s.camOn && (
              <Note>
                {trackStatus === 'loading' && 'Loading face tracking…'}
                {trackStatus === 'ready' && 'Face tracking on. If your face is ever lost, the camera is hidden until it’s found again.'}
                {trackStatus === 'failed' && 'Face tracking couldn’t load on this device, so your camera stays hidden and the avatar follows your voice.'}
              </Note>
            )}

            {s.disguise === 'avatar' && (<>
              <Label>Realistic 3D</Label>
              <Chip on={s.avatar === '3d'} onClick={() => set({ avatar: '3d' })}>🧑‍🚀 3D realistic (your own)</Chip>
              {s.avatar === '3d' && (
                <div className="mt-2 p-3 rounded-xl" style={{ background: CARD_LIGHT, border: `1px solid ${RD.border}` }}>
                  <label className="block w-full py-2.5 rounded-xl font-bold text-sm text-center cursor-pointer" style={{ background: RD.green, color: '#06110A' }}>
                    {a3dState.status === 'ready' ? 'Change 3D avatar file' : 'Upload a 3D avatar (.glb or .vrm)'}
                    <input type="file" accept=".glb,.vrm,model/gltf-binary" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick3D(f); e.target.value = ''; }} />
                  </label>
                  <Note>
                    {a3dState.status === 'loading' && `Opening ${a3dState.name ?? 'your avatar'}…`}
                    {a3dState.status === 'ready' && `${a3dState.name}: ${a3dState.shapes ? `${a3dState.shapes} face expressions found, so it blinks, talks and smiles with you.` : 'no face expressions in this file, so only the head moves.'}`}
                    {a3dState.status === 'failed' && 'That file didn’t open. Try exporting it again as .glb.'}
                    {a3dState.status === 'none' && 'No 3D avatar yet.'}
                  </Note>
                  <Note>
                    Make a realistic 3D you from a selfie in a free avatar maker such as <a className="underline" href="https://avaturn.me" target="_blank" rel="noreferrer">Avaturn</a> or <a className="underline" href="https://metaperson.avatarsdk.com" target="_blank" rel="noreferrer">MetaPerson Creator</a> (or an anime-style one in <a className="underline" href="https://vroid.com/en/studio" target="_blank" rel="noreferrer">VRoid Studio</a>), export it as a .glb or .vrm file, and upload it here. Pick one with ARKit face blendshapes for the best movement.
                    The file stays on this device.
                  </Note>
                  {a3dState.status === 'ready' && <button onClick={() => { void clearAvatarFile(); setA3dState({ status: 'none' }); set({ avatar: 'toon' }); }} className="mt-2 text-[12px] underline" style={{ color: RD.muted }}>Remove 3D avatar</button>}
                </div>
              )}
              <Label>Cartoon characters</Label>
              <div className="flex flex-wrap gap-1.5">
                {TOON_STYLES.map((t) => <Chip key={t.id} on={s.avatar === 'toon' && s.toon.style === t.id} onClick={() => set({ avatar: 'toon', toon: { style: t.id, seed: `${t.id}-${s.toonShuffle}-0`, custom: t.id === 'avataaars' ? s.toon.custom ?? null : null } })}>{t.label}</Chip>)}
              </div>
              <ToonGrid ready={toonsReady} style={s.toon.style} shuffle={s.toonShuffle} current={s.avatar === 'toon' ? s.toon : null}
                onPick={(seed) => set({ avatar: 'toon', toon: { style: s.toon.style, seed, custom: s.toon.style === 'avataaars' ? s.toon.custom ?? null : null } })}
                onShuffle={() => set({ toonShuffle: s.toonShuffle + 1 })} />
              <button onClick={() => void cartoonMe()} disabled={making} className="mt-3 w-full py-3 rounded-xl font-extrabold text-sm"
                style={{ background: making ? CARD_LIGHT : RD.gold, color: making ? RD.text : '#050A0B' }}>
                {making ? 'Looking at you… hold still' : '✨ Make a cartoon of me from my camera'}
              </button>
              <Note>Looks at your camera once and draws you as a cartoon: skin, hair, beard and clothes. The picture never leaves your device.</Note>
              {s.avatar === 'toon' && s.toon.style === 'avataaars' && (
                <ToonCustomiser value={s.toon.custom ?? DEFAULT_TOON_CUSTOM} on={!!s.toon.custom}
                  onToggle={(on) => set({ toon: { ...s.toon, custom: on ? (s.toon.custom ?? DEFAULT_TOON_CUSTOM) : null } })}
                  onChange={(c) => set({ toon: { ...s.toon, custom: c } })} />
              )}
              <details className="mt-4">
              <summary className="cursor-pointer text-[13px] font-bold py-2" style={{ color: RD.text }}>More avatars: chess pieces, classic cartoons, people</summary>
              <Label>Chess pieces</Label>
              <div className="grid grid-cols-6 gap-2">
                {AVATARS.filter((a) => a.group === 'piece').map((a) => <AvatarBtn key={a.id} id={a.id} label={a.label.split(' ')[1]} on={s.avatar === a.id} onClick={() => set({ avatar: a.id })} />)}
              </div>
              <Label>Cartoon</Label>
              <div className="grid grid-cols-5 gap-2">
                {AVATARS.filter((a) => a.group === 'cartoon').map((a) => <AvatarBtn key={a.id} id={a.id} label={a.label} on={s.avatar === a.id} onClick={() => set({ avatar: a.id })} />)}
              </div>
              <Label>Person</Label>
              <div className="grid grid-cols-5 gap-2">
                {AVATARS.filter((a) => a.group === 'person').map((a) => <AvatarBtn key={a.id} id={a.id} label={a.label} style={s.personStyle} person={a.id === 'me' ? s.person : undefined} on={s.avatar === a.id} onClick={() => set({ avatar: a.id })} />)}
              </div>
              <Label>Chess characters</Label>
              <div className="grid grid-cols-6 gap-2">
                {AVATARS.filter((a) => a.group === 'character').map((a) => <AvatarBtn key={a.id} id={a.id} label={a.label} style={s.personStyle} on={s.avatar === a.id}
                  onClick={() => set({ avatar: a.id, ...(CHARACTER_EXTRAS[a.id] ?? {}) })} />)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <span className="text-[12px] font-semibold" style={{ color: RD.muted }}>People style:</span>
                <Chip on={s.personStyle === 'cartoon'} onClick={() => set({ personStyle: 'cartoon' })}>✏️ Cartoon</Chip>
                <Chip on={s.personStyle === 'real'} onClick={() => set({ personStyle: 'real' })}>🖌️ Realistic</Chip>
              </div>
              <button onClick={() => void cartoonMe()} disabled={making} className="mt-3 w-full py-2.5 rounded-xl font-bold text-sm"
                style={{ background: making ? CARD_LIGHT : RD.gold, color: making ? RD.text : '#050A0B' }}>
                {making ? 'Looking at you… hold still' : '✨ Make an avatar from my camera'}
              </button>
              <Note>Looks at your camera once and builds a matching person (skin, hair, beard, eyes, shirt), cartoon or realistic. You can tweak it after. The picture never leaves your device.</Note>
              {s.avatar === 'me' && (<div className="mt-3 p-3 rounded-xl" style={{ background: CARD_LIGHT, border: `1px solid ${RD.border}` }}>
                <p className="text-[12px] font-bold mb-1">Make your own</p>
                <Swatches label="Skin" colors={SKIN_TONES} value={s.person.skin} onPick={(v) => set({ person: { ...s.person, skin: v } })} />
                <Label>Hair</Label>
                <div className="flex flex-wrap gap-1.5">{HAIR_STYLES.map((h) => <Chip key={h.id} on={s.person.hair === h.id} onClick={() => set({ person: { ...s.person, hair: h.id } })}>{h.label}</Chip>)}</div>
                <Swatches label="Hair colour" colors={HAIR_COLORS} value={s.person.hairColor} onPick={(v) => set({ person: { ...s.person, hairColor: v } })} />
                <Label>Facial hair</Label>
                <div className="flex flex-wrap gap-1.5">{FACIAL_HAIR.map((h) => <Chip key={h.id} on={s.person.facial === h.id} onClick={() => set({ person: { ...s.person, facial: h.id } })}>{h.label}</Chip>)}</div>
                <Swatches label="Eyes" colors={EYE_COLORS} value={s.person.eyes} onPick={(v) => set({ person: { ...s.person, eyes: v } })} />
                <Label>Outfit</Label>
                <div className="flex flex-wrap gap-1.5">{OUTFITS.map((h) => <Chip key={h.id} on={(s.person.outfit ?? 'tee') === h.id} onClick={() => set({ person: { ...s.person, outfit: h.id } })}>{h.label}</Chip>)}</div>
                <Swatches label="Outfit colour" colors={SHIRT_COLORS} value={s.person.shirt} onPick={(v) => set({ person: { ...s.person, shirt: v } })} />
              </div>)}
              <Label>Hat</Label>
              <div className="flex flex-wrap gap-1.5">{HATS.map((h) => <Chip key={h.id} on={s.hat === h.id} onClick={() => set({ hat: h.id })}>{h.emoji} {h.label}</Chip>)}</div>
              <Label>Glasses</Label>
              <div className="flex flex-wrap gap-1.5">{EYEWEAR.map((h) => <Chip key={h.id} on={s.eyewear === h.id} onClick={() => set({ eyewear: h.id })}>{h.emoji} {h.label}</Chip>)}</div>
              <Note>Hats and glasses work on these avatars, the chess pieces too.</Note>
              </details>
              <Slider label="Avatar size" min={0.8} max={2.2} step={0.05} value={s.avatarScale} onChange={(v) => set({ avatarScale: v })} />
              <p className="text-[10px] mt-2 leading-snug" style={{ color: RD.muted }}>{TOON_CREDITS}</p>
              <Label>Behind the avatar</Label>
              <div className="flex flex-wrap gap-2">
                <Chip on={s.bg === 'brand'} onClick={() => set({ bg: 'brand' })}>ChessScout</Chip>
                <Chip on={s.bg === 'color'} onClick={() => set({ bg: 'color' })}>Colour</Chip>
                <Chip on={s.bg === 'blur'} onClick={() => set({ bg: 'blur' })}>Blurred room</Chip>
                <Chip on={s.bg === 'room'} onClick={() => set({ bg: 'room' })}>My room</Chip>
              </div>
              {s.bg === 'color' && <input type="color" value={s.bgColor} onChange={(e) => set({ bgColor: e.target.value })} className="mt-2 w-16 h-9 rounded" />}
              <Note>For full anonymity keep ChessScout or a colour behind the avatar: nothing from your room is shown.</Note>
            </>)}
          </>)}

          {tab === 'voice' && (<>
            <Label>Microphone</Label>
            <div className="flex flex-wrap gap-2">
              {voiceOn ? <Chip on onClick={stopVoice}>🎙️ Mic on: tap to stop</Chip> : <Chip on={false} onClick={() => void startVoice()}>🎙️ Turn mic on</Chip>}
            </div>
            {mics.length > 1 && (
              <select value={s.micId} onChange={(e) => set({ micId: e.target.value })} className="mt-2 w-full px-3 py-2 rounded-lg text-sm" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }}>
                <option value="">Default microphone</option>
                {mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${i + 1}`}</option>)}
              </select>
            )}
            <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: CARD_LIGHT }}>
              <div className="h-full transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%`, background: RD.green }} />
            </div>
            <Label>Voice</Label>
            {VOICE_GROUPS.map((g) => (
              <div key={g.title} className="mb-2">
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: RD.muted }}>{g.title}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {g.ids.map((id) => { const v = VOICE_PRESETS.find((x) => x.id === id); return v ? <Chip key={id} on={s.voice === id} onClick={() => set({ voice: id })}>{v.emoji} {v.label}</Chip> : null; })}
                </div>
              </div>
            ))}
            {s.voice === 'custom' && (<div className="p-3 rounded-xl" style={{ background: CARD_LIGHT, border: `1px solid ${RD.border}` }}>
              <Slider label="Pitch (low ↔ high)" min={-1} max={1} step={0.05} value={s.customVoice.pitch} onChange={(v) => set({ customVoice: { ...s.customVoice, pitch: v } })} />
              <Slider label="Robot" min={0} max={1} step={0.05} value={s.customVoice.robot} onChange={(v) => set({ customVoice: { ...s.customVoice, robot: v } })} />
              <Slider label="Echo" min={0} max={1} step={0.05} value={s.customVoice.echo} onChange={(v) => set({ customVoice: { ...s.customVoice, echo: v } })} />
              <Slider label="Big room" min={0} max={1} step={0.05} value={s.customVoice.reverb} onChange={(v) => set({ customVoice: { ...s.customVoice, reverb: v } })} />
              <Slider label="Warble" min={0} max={1} step={0.05} value={s.customVoice.warble} onChange={(v) => set({ customVoice: { ...s.customVoice, warble: v } })} />
              <Slider label="Grit" min={0} max={1} step={0.05} value={s.customVoice.grit} onChange={(v) => set({ customVoice: { ...s.customVoice, grit: v } })} />
              <Slider label="Tone (warm ↔ bright)" min={-1} max={1} step={0.05} value={s.customVoice.tone} onChange={(v) => set({ customVoice: { ...s.customVoice, tone: v } })} />
            </div>)}
            <button onClick={() => void testVoice()} disabled={testing !== null} className="mt-3 w-full py-2.5 rounded-xl font-bold text-sm"
              style={{ background: testing ? CARD_LIGHT : RD.green, color: testing ? RD.text : '#06110A' }}>
              {testing === 'rec' ? '🔴 Say something… (4 seconds)' : testing === 'play' ? '🔊 Playing it back…' : '🎧 Test my voice'}
            </button>
            <Note>Records 4 seconds with the voice you picked and plays it back, so you can hear how you’ll sound without an echo.</Note>
            <Label>Send my changed voice to</Label>
            <select value={s.output} onChange={(e) => set({ output: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }}>
              <option value="none">Recordings only</option>
              <option value="default">My speakers / headphones (hear myself)</option>
              {outs.filter((d) => d.deviceId !== 'default').map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Output ${i + 1}`}</option>)}
            </select>
            <Note>
              To use the changed voice in Discord, OBS or YouTube: install a free virtual cable (VB-Cable on Windows, BlackHole on Mac),
              pick <b>CABLE Input</b> here, then pick <b>CABLE Output</b> as your microphone in that app. Only the changed voice leaves your computer.
              Use headphones if you choose your speakers, or you’ll hear an echo.
            </Note>
          </>)}

          {tab === 'videos' && <VideosPanel refreshKey={videosKey} onError={flash} />}

          {tab === 'live' && (<>
            <button onClick={() => void goLive()} className="w-full py-3 rounded-xl font-extrabold text-base" style={{ background: RD.red, color: '#fff' }}>◉ Go live (full screen)</button>
            <Label>When I go live</Label>
            <div className="flex flex-wrap gap-2">
              <Chip on={s.broadcast} onClick={() => set({ broadcast: !s.broadcast })}>📡 Stream on chessscout.net</Chip>
              <Chip on={s.recordLive} onClick={() => set({ recordLive: !s.recordLive })}>● Save a recording</Chip>
            </div>
            <input value={s.title} onChange={(e) => set({ title: e.target.value.slice(0, 80) })} placeholder="Stream title (optional)" className="mt-2 w-full px-3 py-2 rounded-lg text-sm" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }} />
            <Note>Viewers watch on chessscout.net (Admin → Live streams while this is in development). They see your stage and hear your changed voice; your mic turns on automatically. Recordings are saved to chessscout.net with sound and show up in the Videos tab.</Note>
            <Label>Record without going live</Label>
            <div className="flex flex-wrap gap-2">
              <Chip on={false} onClick={() => void startCloudRecording()}>● Record to chessscout.net</Chip>
              <Chip on={false} onClick={() => void startRecording(true)}>● Record this browser tab (computer)</Chip>
            </div>
            <Note>The browser-tab option downloads to your computer (Chrome or Edge: pick this tab when asked).</Note>
            <Label>Stream to YouTube or Twitch (works today)</Label>
            <Note>1. Tap <b>Go live</b> here (full screen). 2. In OBS add a <b>Window Capture</b> of this browser window. 3. Set OBS’s mic to the virtual cable (Voice tab). 4. Stream from OBS with your YouTube or Twitch key.</Note>
            <Label>Discord</Label>
            <Note>Tap <b>Go live</b>, then in Discord press <b>Share your screen</b> and pick this browser window. Set Discord’s input device to the virtual cable so friends hear the changed voice.</Note>
            <Label>Live straight from here: next phase</Label>
            <Note>Going live on chessscout.net, and to a connected YouTube channel without OBS, needs a streaming service (for example LiveKit or Cloudflare Stream). It isn’t connected yet.</Note>
          </>)}
        </div>
      </aside>}
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block mt-3">
      <span className="flex justify-between text-[12px] font-semibold mb-1" style={{ color: RD.muted }}><span>{label}</span><span>{value.toFixed(2)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: '#81B64C' }} />
    </label>
  );
}

function AvatarBtn({ id, label, on, onClick, person, style }: { id: AvatarId; label: string; on: boolean; onClick: () => void; person?: PersonLook; style?: 'cartoon' | 'real' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; const c = cv?.getContext('2d'); if (!cv || !c) return;
    c.clearRect(0, 0, cv.width, cv.height);
    const draw = () => { c.clearRect(0, 0, cv.width, cv.height); drawAvatar(c, id, { x: 48, y: 50, size: 44, roll: 0, yaw: 0, pitch: 0, mouth: 0, blinkL: 0, blinkR: 0, smile: 0.4, t: 0 }, { person, style }); };
    draw();
    const tm = window.setTimeout(draw, 700); // piece images may still be loading
    return () => window.clearTimeout(tm);
  }, [id, person, style]);
  return (
    <button onClick={onClick} title={label} className="rounded-xl overflow-hidden flex flex-col items-center pb-1"
      style={{ background: CARD_LIGHT, border: `2px solid ${on ? RD.green : 'transparent'}` }}>
      <canvas ref={ref} width={96} height={96} className="w-full aspect-square" />
      <span className="text-[10px] font-semibold truncate w-full text-center" style={{ color: on ? RD.green : RD.muted }}>{label}</span>
    </button>
  );
}

interface SavedVideo { id: string; title: string; mime: string; size_bytes: number | string; duration_ms: number; status: string; created_at: string; username?: string | null }

function VideosPanel({ refreshKey, onError }: { refreshKey: number; onError: (m: string) => void }) {
  const [list, setList] = useState<SavedVideo[] | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/admin/stream-recordings', { credentials: 'include' });
      const j = (await r.json()) as { recordings?: SavedVideo[]; error?: string };
      if (!r.ok) throw new Error(j.error || 'failed');
      setList(j.recordings ?? []);
    } catch { setList([]); onError('Couldn’t load your saved videos.'); }
  }, [onError]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const open = async (id: string, download: boolean) => {
    try {
      const r = await apiFetch(`/api/admin/stream-recordings/${id}/url${download ? '?download=1' : ''}`, { credentials: 'include' });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error || 'failed');
      if (download) { const a = document.createElement('a'); a.href = j.url; document.body.appendChild(a); a.click(); a.remove(); }
      else setPlaying({ id, url: j.url });
    } catch { onError('Couldn’t open that video.'); }
  };
  const del = async (id: string) => {
    try { await apiFetch(`/api/admin/stream-recordings/${id}`, { method: 'DELETE', credentials: 'include' }); } catch { /* ignore */ }
    setConfirmDel(null); if (playing?.id === id) setPlaying(null); void load();
  };
  const fmt = (ms: number) => { const sec = Math.round(ms / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  return (
    <div>
      <Label>Saved on chessscout.net</Label>
      {playing && (
        <video key={playing.url} src={playing.url} controls autoPlay playsInline className="w-full rounded-xl mb-3" style={{ background: '#000', maxHeight: '60vh' }} />
      )}
      {list === null && <Note>Loading…</Note>}
      {list && list.length === 0 && <Note>No videos yet. Press ● Record, or turn on “Save a recording” in Go live.</Note>}
      <div className="flex flex-col gap-2">
        {(list ?? []).map((v) => (
          <div key={v.id} className="p-3 rounded-xl" style={{ background: CARD_LIGHT, border: `1px solid ${RD.border}` }}>
            <p className="text-[13px] font-bold truncate">{v.title || 'Stream recording'}</p>
            <p className="text-[11px]" style={{ color: RD.muted }}>
              {new Date(v.created_at).toLocaleString()} · {v.status === 'ready' ? `${fmt(v.duration_ms)} · ${(Number(v.size_bytes) / 1048576).toFixed(1)} MB` : 'still uploading'}
            </p>
            {v.status === 'ready' && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => void open(v.id, false)} className="px-3 py-1.5 rounded-lg text-[12px] font-bold" style={{ background: RD.green, color: '#06110A' }}>▶ Play</button>
                <button onClick={() => void open(v.id, true)} className="px-3 py-1.5 rounded-lg text-[12px] font-bold" style={{ background: CARD, color: RD.text }}>⬇ Download</button>
                {confirmDel === v.id
                  ? <button onClick={() => void del(v.id)} className="px-3 py-1.5 rounded-lg text-[12px] font-bold ml-auto" style={{ background: RD.red, color: '#fff' }}>Tap again to delete</button>
                  : <button onClick={() => setConfirmDel(v.id)} className="px-3 py-1.5 rounded-lg text-[12px] font-bold ml-auto" style={{ background: CARD, color: RD.muted }}>Delete</button>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider mt-3 mb-1.5" style={{ color: RD.muted }}>{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((c) => (
          <button key={c} onClick={() => onPick(c)} aria-label={c} className="w-8 h-8 rounded-full"
            style={{ background: c, border: `3px solid ${value === c ? RD.green : 'rgba(255,255,255,.12)'}` }} />
        ))}
      </div>
    </div>
  );
}

function ToonGrid({ ready, style, shuffle, current, onPick, onShuffle }: { ready: boolean; style: ToonPick['style']; shuffle: number; current: ToonPick | null; onPick: (seed: string) => void; onShuffle: () => void }) {
  if (!ready) return <Note>Loading characters…</Note>;
  const seeds = Array.from({ length: 12 }, (_, i) => `${style}-${shuffle}-${i}`);
  return (
    <div className="mt-2">
      <div className="grid grid-cols-4 gap-2">
        {seeds.map((seed) => {
          const on = !!current && current.style === style && current.seed === seed;
          const src = toonThumb({ style, seed, custom: on ? current?.custom : null });
          return (
            <button key={seed} onClick={() => onPick(seed)} className="rounded-xl overflow-hidden aspect-square"
              style={{ background: '#e9edf2', border: `3px solid ${on ? RD.green : 'transparent'}` }}>
              {src && <img src={src} alt="" className="w-full h-full" />}
            </button>
          );
        })}
      </div>
      <button onClick={onShuffle} className="mt-2 w-full py-2 rounded-xl text-[13px] font-bold" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }}>🔀 Show me more</button>
    </div>
  );
}

function ToonCustomiser({ value, on, onToggle, onChange }: { value: ToonCustom; on: boolean; onToggle: (on: boolean) => void; onChange: (c: ToonCustom) => void }) {
  return (
    <div className="mt-3 p-3 rounded-xl" style={{ background: CARD_LIGHT, border: `1px solid ${RD.border}` }}>
      <div className="flex items-center gap-2">
        <p className="text-[13px] font-bold flex-1">Customise</p>
        <Chip on={on} onClick={() => onToggle(!on)}>{on ? 'On' : 'Off'}</Chip>
      </div>
      {on && (<>
        <Swatches label="Skin" colors={TOON_SKINS} value={value.skinColor} onPick={(v) => onChange({ ...value, skinColor: v })} />
        <Label>Hair</Label>
        <div className="flex flex-wrap gap-1.5">{TOON_TOPS.map((h) => <Chip key={h.id} on={value.top === h.id} onClick={() => onChange({ ...value, top: h.id })}>{h.label}</Chip>)}</div>
        <Swatches label="Hair colour" colors={HAIR_COLORS} value={value.hairColor} onPick={(v) => onChange({ ...value, hairColor: v })} />
        <Label>Facial hair</Label>
        <div className="flex flex-wrap gap-1.5">{TOON_FACIAL.map((h) => <Chip key={h.id} on={value.facialHair === h.id} onClick={() => onChange({ ...value, facialHair: h.id })}>{h.label}</Chip>)}</div>
        <Label>Glasses</Label>
        <div className="flex flex-wrap gap-1.5">{TOON_GLASSES.map((h) => <Chip key={h.id} on={value.accessories === h.id} onClick={() => onChange({ ...value, accessories: h.id })}>{h.label}</Chip>)}</div>
        <Label>Clothes</Label>
        <div className="flex flex-wrap gap-1.5">{TOON_CLOTHES.map((h) => <Chip key={h.id} on={value.clothing === h.id} onClick={() => onChange({ ...value, clothing: h.id })}>{h.label}</Chip>)}</div>
        <Swatches label="Clothes colour" colors={SHIRT_COLORS} value={value.clothesColor} onPick={(v) => onChange({ ...value, clothesColor: v })} />
      </>)}
    </div>
  );
}
