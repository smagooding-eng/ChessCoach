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
  AVATARS, drawAvatar, preloadPieceAvatars, HATS, EYEWEAR, HAIR_STYLES, FACIAL_HAIR, SKIN_TONES, HAIR_COLORS, EYE_COLORS, SHIRT_COLORS, DEFAULT_PERSON,
  type AvatarId, type AvatarPose, type Hat, type Eyewear, type PersonLook,
} from '@/lib/streamer/avatars';
import { drawComposite, type BoardFeed } from '@/lib/streamer/compositor';
import { CloudRecorder, type RecStatus } from '@/lib/streamer/recorder';
import { LiveHost } from '@/lib/streamer/live';
import { apiFetch } from '@/lib/api';
import { useSettings, PIECE_SHAPES } from '@/context/SettingsContext';

type PanelId = 'board' | 'cam' | 'tag';
interface Rect { x: number; y: number; w: number; h: number; z: number; hidden?: boolean; round?: boolean }
type Layout = Record<PanelId, Rect>;
type Aspect = '9:16' | '16:9';
type Disguise = 'none' | 'avatar' | 'pixelate' | 'blur';
type Bg = 'brand' | 'blur' | 'room' | 'color';
type Tab = 'layout' | 'board' | 'camera' | 'voice' | 'videos' | 'live';

interface Settings {
  aspect: Aspect; preset: string; layout: Layout;
  boardSource: 'app' | 'screen'; appPath: string; zoom: number; panX: number; panY: number;
  frame: 'auto' | 'manual'; framePad: 'board' | 'players';
  camOn: boolean; camId: string; facing: 'user' | 'environment'; mirror: boolean;
  disguise: Disguise; avatar: AvatarId; bg: Bg; bgColor: string; avatarScale: number;
  hat: Hat; eyewear: Eyewear; person: PersonLook; customVoice: CustomVoice;
  voice: VoicePreset; pitch: number; micId: string; output: string;
  name: string; subtitle: string;
  broadcast: boolean; recordLive: boolean; title: string;
}

const PRESETS: Record<Aspect, { id: string; label: string; layout: Layout }[]> = {
  '9:16': [
    { id: 'board-top', label: 'Board top · camera bottom', layout: { board: { x: 0, y: 0, w: 100, h: 56.25, z: 1 }, cam: { x: 0, y: 56.25, w: 100, h: 36.75, z: 2 }, tag: { x: 0, y: 93, w: 100, h: 7, z: 3 } } },
    { id: 'board-bottom', label: 'Camera top · board bottom', layout: { tag: { x: 0, y: 0, w: 100, h: 7, z: 3 }, cam: { x: 0, y: 7, w: 100, h: 36.75, z: 2 }, board: { x: 0, y: 43.75, w: 100, h: 56.25, z: 1 } } },
    { id: 'pip', label: 'Big board · round camera', layout: { cam: { x: 4, y: 2.5, w: 40, h: 22.5, z: 2, round: true }, tag: { x: 47, y: 9.5, w: 50, h: 8.5, z: 3 }, board: { x: 0, y: 28, w: 100, h: 56.25, z: 1 } } },
  ],
  '16:9': [
    { id: 'board-left', label: 'Board left · camera right', layout: { board: { x: 0, y: 0, w: 56.25, h: 100, z: 1 }, cam: { x: 56.25, y: 0, w: 43.75, h: 86, z: 2 }, tag: { x: 56.25, y: 86, w: 43.75, h: 14, z: 3 } } },
    { id: 'board-right', label: 'Camera left · board right', layout: { cam: { x: 0, y: 0, w: 43.75, h: 86, z: 2 }, tag: { x: 0, y: 86, w: 43.75, h: 14, z: 3 }, board: { x: 43.75, y: 0, w: 56.25, h: 100, z: 1 } } },
    { id: 'pip', label: 'Board centre · camera corner', layout: { board: { x: 21.875, y: 0, w: 56.25, h: 100, z: 1 }, cam: { x: 79, y: 3, w: 19.5, h: 34.67, z: 2 }, tag: { x: 1.5, y: 84, w: 19, h: 13, z: 3 } } },
  ],
};

const APP_PAGES: { path: string; label: string }[] = [
  { path: '/live', label: 'Live game' },
  { path: '/play-now', label: 'Quick bot game' },
  { path: '/lichess', label: 'Lichess' },
  { path: '/play', label: 'Play the computer' },
  { path: '/tournaments', label: 'Tournaments' },
  { path: '/tactics', label: 'Tactics' },
];

const DEFAULTS: Settings = {
  aspect: '9:16', preset: 'board-top', layout: PRESETS['9:16'][0].layout,
  boardSource: 'app', appPath: '/live', zoom: 1, panX: 0, panY: 0,
  frame: 'auto', framePad: 'players',
  camOn: false, camId: '', facing: 'user', mirror: true,
  disguise: 'avatar', avatar: 'wN', hat: 'none', eyewear: 'none', person: DEFAULT_PERSON, customVoice: DEFAULT_CUSTOM, bg: 'brand', bgColor: '#121B1D', avatarScale: 1.3,
  voice: 'off', pitch: 0, micId: '', output: 'none',
  name: 'Anonymous Knight', subtitle: 'Playing on chessscout.net',
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
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
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
  const feed = useRef<{ fen: string; flipped: boolean; last: string } | null>(null);
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

  const flash = useCallback((m: string) => { setMsg(m); window.setTimeout(() => setMsg((x) => (x === m ? null : x)), 6000); }, []);

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
      screenStream.current = st; setScreenOn(true);
      st.getVideoTracks()[0]?.addEventListener('ended', () => { setScreenOn(false); screenStream.current = null; });
      if (screenVideo.current) { screenVideo.current.srcObject = st; await screenVideo.current.play().catch(() => undefined); }
    } catch { /* cancelled */ }
  }, [flash]);
  useEffect(() => {
    if (s.boardSource === 'screen' && screenVideo.current && screenStream.current && screenVideo.current.srcObject !== screenStream.current) {
      screenVideo.current.srcObject = screenStream.current; void screenVideo.current.play().catch(() => undefined);
    }
  });

  // ---- auto-frame: find the chessboard inside the ChessScout page and fit it to the panel ----
  useEffect(() => {
    if (s.boardSource !== 'app') { setBoardBox(null); feed.current = null; return undefined; }
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
      else if (st.boardSource === 'app' && feed.current) board = { kind: 'fen', ...feed.current };
      drawComposite(c, W, H, {
        layout: st.layout, board, cam: camCanvas.current, name: st.name, subtitle: st.subtitle,
        light: looks.current.light, dark: looks.current.dark, pieceSrc: looks.current.pieceSrc,
        live: host.current.live,
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
        drawAvatar(c, st.avatar, pose, { person: st.person, hat: st.hat, eyewear: st.eyewear });
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
      {panel('board', 'Board', s.boardSource === 'app' ? (
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
          {!screenOn && <button onClick={pickScreen} className="px-4 py-3 rounded-xl font-bold text-sm" style={{ background: RD.green, color: '#06110A' }}>Pick a window or tab to show</button>}
        </div>
      ))}
      {panel('cam', 'Camera', (
        <div className="absolute inset-0" style={{ background: '#050A0B' }}>
          <canvas ref={camCanvas} className="absolute inset-0 w-full h-full" />
        </div>
      ))}
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
          </>)}

          {tab === 'board' && (<>
            <Label>What shows in the board panel</Label>
            <div className="flex flex-wrap gap-2">
              <Chip on={s.boardSource === 'app'} onClick={() => set({ boardSource: 'app' })}>♞ ChessScout</Chip>
              <Chip on={s.boardSource === 'screen'} onClick={() => set({ boardSource: 'screen' })}>🪟 Another window</Chip>
            </div>
            {s.boardSource === 'app' ? (<>
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
              <button onClick={pickScreen} className="mt-3 w-full py-2.5 rounded-xl font-bold text-sm" style={{ background: RD.green, color: '#06110A' }}>{screenOn ? 'Pick a different window' : 'Pick a window or tab'}</button>
              <Note>Show any chess site or app window (computer only). Zoom and move below to frame just the board.</Note>
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
                {AVATARS.filter((a) => a.group === 'person').map((a) => <AvatarBtn key={a.id} id={a.id} label={a.label} person={a.id === 'me' ? s.person : undefined} on={s.avatar === a.id} onClick={() => set({ avatar: a.id })} />)}
              </div>
              {s.avatar === 'me' && (<div className="mt-3 p-3 rounded-xl" style={{ background: CARD_LIGHT, border: `1px solid ${RD.border}` }}>
                <p className="text-[12px] font-bold mb-1">Make your own</p>
                <Swatches label="Skin" colors={SKIN_TONES} value={s.person.skin} onPick={(v) => set({ person: { ...s.person, skin: v } })} />
                <Label>Hair</Label>
                <div className="flex flex-wrap gap-1.5">{HAIR_STYLES.map((h) => <Chip key={h.id} on={s.person.hair === h.id} onClick={() => set({ person: { ...s.person, hair: h.id } })}>{h.label}</Chip>)}</div>
                <Swatches label="Hair colour" colors={HAIR_COLORS} value={s.person.hairColor} onPick={(v) => set({ person: { ...s.person, hairColor: v } })} />
                <Label>Facial hair</Label>
                <div className="flex flex-wrap gap-1.5">{FACIAL_HAIR.map((h) => <Chip key={h.id} on={s.person.facial === h.id} onClick={() => set({ person: { ...s.person, facial: h.id } })}>{h.label}</Chip>)}</div>
                <Swatches label="Eyes" colors={EYE_COLORS} value={s.person.eyes} onPick={(v) => set({ person: { ...s.person, eyes: v } })} />
                <Swatches label="Shirt" colors={SHIRT_COLORS} value={s.person.shirt} onPick={(v) => set({ person: { ...s.person, shirt: v } })} />
              </div>)}
              <Label>Hat</Label>
              <div className="flex flex-wrap gap-1.5">{HATS.map((h) => <Chip key={h.id} on={s.hat === h.id} onClick={() => set({ hat: h.id })}>{h.emoji} {h.label}</Chip>)}</div>
              <Label>Glasses</Label>
              <div className="flex flex-wrap gap-1.5">{EYEWEAR.map((h) => <Chip key={h.id} on={s.eyewear === h.id} onClick={() => set({ eyewear: h.id })}>{h.emoji} {h.label}</Chip>)}</div>
              <Note>Hats and glasses work on every avatar, the chess pieces too.</Note>
              <Slider label="Avatar size" min={0.8} max={2.2} step={0.05} value={s.avatarScale} onChange={(v) => set({ avatarScale: v })} />
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

function AvatarBtn({ id, label, on, onClick, person }: { id: AvatarId; label: string; on: boolean; onClick: () => void; person?: PersonLook }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; const c = cv?.getContext('2d'); if (!cv || !c) return;
    c.clearRect(0, 0, cv.width, cv.height);
    const draw = () => { c.clearRect(0, 0, cv.width, cv.height); drawAvatar(c, id, { x: 48, y: 50, size: 44, roll: 0, yaw: 0, pitch: 0, mouth: 0, blinkL: 0, blinkR: 0, smile: 0.4, t: 0 }, { person }); };
    draw();
    const tm = window.setTimeout(draw, 700); // piece images may still be loading
    return () => window.clearTimeout(tm);
  }, [id, person]);
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
