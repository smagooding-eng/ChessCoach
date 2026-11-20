// Streamer Studio (Pro members; the avatar characters and the voice changer are admin-only).
// A stage the streamer arranges: board (a ChessScout page or any captured window),
// camera (raw or face-hidden), and a name tag. Voice changer on the mic.
// Record to a file here; stream through OBS / Discord using Go live (full screen).
// Everything runs in the browser: no server changes.

import { BackLink } from '@/lib/navBack';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as RPointerEvent, ReactNode } from 'react';
import { Link } from 'wouter';
import { RD } from '@/lib/redesignTheme';
import { BG_PHOTOS } from '@/context/SettingsContext';

// A picture you upload as the background is kept on this device (not in the settings).
// Each account's Studio set-up (name, headline, layout, picture...) is its own: switching
// accounts on the same phone never carries one account's over to another.
let owner = '';
const BG_UPLOAD_KEY_LEGACY = 'cs_studio_bg_upload';
const bgUploadKey = () => `${BG_UPLOAD_KEY_LEGACY}:${owner}`;
const bgSrc = (v: string): string => { if (v !== 'upload') return v; try { return localStorage.getItem(bgUploadKey()) ?? ''; } catch { return ''; } };
const THEME_BGS = BG_PHOTOS.filter((b) => !!b.src);
import { VoiceChanger, VOICE_PRESETS, VOICE_GROUPS, DEFAULT_CUSTOM, type VoicePreset, type CustomVoice } from '@/lib/streamer/voiceChanger';
import { PersonSegmenter } from '@/lib/streamer/personSegmenter';
import { FaceTracker, type FacePose } from '@/lib/streamer/faceTracker';
import {
  MojiHead, loadThree, lookFromCamera, DEFAULT_MOJI, MOJI_SKINS, MOJI_HAIR_COLORS, MOJI_EYE_COLORS, MOJI_FRAMES, MOJI_HAIRS, MOJI_BEARDS, MOJI_MUSTACHES, MOJI_GLASSES,
  type MojiLook,
} from '@/lib/streamer/mojiHead';
import { SpriteAvatar } from '@/lib/streamer/spriteAvatar';
import { drawComposite, drawBoardPanel, drawReviewNotes, splitBoardPanel, headSizes, withPartnerPanel, type BoardFeed, type TextRun, type ReviewNotes } from '@/lib/streamer/compositor';
import { CoStreamLink, VoiceMixer } from '@/lib/streamer/costream';
import { CloudRecorder, type RecStatus } from '@/lib/streamer/recorder';
import { LiveHost } from '@/lib/streamer/live';
import { apiFetch } from '@/lib/api';
import { StudioRemote } from '@/components/studio/StudioRemote';
import { lastLichessGame, lastPlayedGame, saveLichessGame } from '@/lib/lastLichessGame';
import { useUser } from '@/hooks/use-user';
import { useLichessGame } from '@/components/watch/LiveVideo';
import { useSettings, PIECE_SHAPES } from '@/context/SettingsContext';

type PanelId = 'board' | 'cam' | 'tag' | 'head' | 'notes';
interface Rect { x: number; y: number; w: number; h: number; z: number; hidden?: boolean; round?: boolean }
type Layout = Record<PanelId, Rect>;
type BaseLayout = Omit<Layout, 'notes'> & { notes?: Rect };
/** Where the review notes go: the biggest empty strip across the board's width (never over the
 *  camera, headline or name tag); with no room at all, over the bottom of the board. */
function placeNotes(l: BaseLayout): Rect {
  const b = l.board;
  const others = (['cam', 'head', 'tag', 'board'] as const).map((k) => l[k]).filter((r) => r && !r.hidden && r.x < b.x + b.w && r.x + r.w > b.x);
  const free = (y: number) => !others.some((r) => y >= r.y && y < r.y + r.h);
  // the strip nearest the board wins when two are about as big
  const dist = (y: number, h: number) => Math.max(0, y - (b.y + b.h), b.y - (y + h));
  const score = (y: number, h: number) => Math.min(h, 12) - dist(y, h) * 0.05;
  let best = { y: 0, h: 0 }, run = -1;
  for (let y = 0; y <= 100; y += 0.5) {
    if (y < 100 && free(y)) { if (run < 0) run = y; }
    else if (run >= 0) { const h = y - run; if (h >= 5 && (best.h < 5 || score(run, h) > score(best.y, best.h))) best = { y: run, h }; run = -1; }
  }
  if (best.h >= 5) { const h = Math.min(12, best.h); return { x: b.x, y: best.y + (best.h - h) / 2, w: b.w, h, z: 6 }; }
  return { x: b.x, y: b.y + b.h - 12, w: b.w, h: 12, z: b.z };
}
function withNotes(l: BaseLayout): Layout {
  return l.notes ? (l as Layout) : { ...l, notes: placeNotes(l) };
}
type Aspect = '9:16' | '16:9';
type Disguise = 'none' | 'moji' | 'character' | 'pixelate' | 'blur';
type Bg = 'brand' | 'blur' | 'room' | 'color' | 'image';
type Tab = 'layout' | 'board' | 'camera' | 'voice' | 'videos' | 'live';

interface Settings {
  aspect: Aspect; preset: string; layout: Layout;
  boardSource: 'app' | 'screen' | 'follow'; followUser: string; appPath: string; zoom: number; panX: number; panY: number;
  frame: 'auto' | 'manual'; framePad: 'board' | 'players';
  camOn: boolean; camId: string; facing: 'user' | 'environment'; mirror: boolean;
  disguise: Disguise; moji: MojiLook; bg: Bg; bgColor: string; avatarScale: number; charScale: number; bgImage: string; charFollow?: boolean;
  customVoice: CustomVoice;
  voice: VoicePreset; pitch: number; micId: string; output: string;
  name: string; subtitle: string;
  // Headline panel: "The road to 1500 ELO" with the real rating under it.
  headline: string; goal: number; ratingFrom: string; manualRating: number;
  broadcast: boolean; recordLive: boolean; title: string;
}

const RAW_PRESETS: Record<Aspect, { id: string; label: string; layout: BaseLayout }[]> = {
  '9:16': [
    { id: 'board-top', label: 'Board top · camera bottom', layout: { head: { x: 0, y: 0, w: 100, h: 5, z: 4 }, board: { x: 0, y: 5, w: 100, h: 70, z: 1 }, cam: { x: 0, y: 75, w: 100, h: 19.5, z: 2 }, tag: { x: 0, y: 94.5, w: 100, h: 5.5, z: 3 } } },
    { id: 'board-bottom', label: 'Camera top · board bottom', layout: { tag: { x: 0, y: 0, w: 100, h: 5.5, z: 3 }, head: { x: 0, y: 5.5, w: 100, h: 5, z: 4 }, cam: { x: 0, y: 10.5, w: 100, h: 19.5, z: 2 }, board: { x: 0, y: 30, w: 100, h: 70, z: 1 } } },
    { id: 'pip', label: 'Big board · round camera', layout: { cam: { x: 3, y: 1.5, w: 28, h: 15.75, z: 2, round: true }, head: { x: 34, y: 2.5, w: 63, h: 6.5, z: 4 }, tag: { x: 34, y: 10, w: 63, h: 6.5, z: 3 }, board: { x: 0, y: 18, w: 100, h: 75, z: 1 } } },
  ],
  '16:9': [
    { id: 'board-left', label: 'Board left · camera right', layout: { board: { x: 0, y: 0, w: 56.25, h: 100, z: 1 }, head: { x: 56.25, y: 0, w: 43.75, h: 10, z: 4 }, cam: { x: 56.25, y: 10, w: 43.75, h: 81, z: 2 }, tag: { x: 56.25, y: 91, w: 43.75, h: 9, z: 3 } } },
    { id: 'board-right', label: 'Camera left · board right', layout: { head: { x: 0, y: 0, w: 43.75, h: 10, z: 4 }, cam: { x: 0, y: 10, w: 43.75, h: 81, z: 2 }, tag: { x: 0, y: 91, w: 43.75, h: 9, z: 3 }, board: { x: 43.75, y: 0, w: 56.25, h: 100, z: 1 } } },
    { id: 'pip', label: 'Board centre · camera corner', layout: { board: { x: 21.875, y: 0, w: 56.25, h: 100, z: 1 }, head: { x: 1.5, y: 3, w: 19, h: 18, z: 4 }, cam: { x: 79, y: 3, w: 19.5, h: 34.67, z: 2 }, tag: { x: 1.5, y: 84, w: 19, h: 13, z: 3 } } },
  ],
};

const PRESETS: Record<Aspect, { id: string; label: string; layout: Layout }[]> = {
  '9:16': RAW_PRESETS['9:16'].map((p) => ({ ...p, layout: withNotes(p.layout) })),
  '16:9': RAW_PRESETS['16:9'].map((p) => ({ ...p, layout: withNotes(p.layout) })),
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
  disguise: 'character', moji: DEFAULT_MOJI, customVoice: DEFAULT_CUSTOM, bg: 'brand', bgColor: '#121B1D', avatarScale: 1.3, charScale: 1.8, bgImage: '',
  voice: 'off', pitch: 0, micId: '', output: 'none',
  name: 'Anonymous Knight', subtitle: 'Playing on chessscout.net',
  headline: '', goal: 0, ratingFrom: 'auto', manualRating: 0,
  broadcast: true, recordLive: true, title: '',
};
const KEY_LEGACY = 'cs_streamer_v2';
const settingsKey = () => `${KEY_LEGACY}:${owner}`;
const VIRTUAL_W = 430; // the app is laid out like a phone inside the board panel
const VIRTUAL_H = 1000;
const BG = '#050A0B', CARD = '#0D1516', CARD_LIGHT = '#121B1D'; // solid, never see-through
const IS_PHONE = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Settings saved before they were per account were the admin's: only an admin account picks them up. */
function adoptLegacy(admin: boolean): void {
  try {
    if (!admin || localStorage.getItem(settingsKey())) return;
    const old = localStorage.getItem(KEY_LEGACY);
    if (old) localStorage.setItem(settingsKey(), old);
    const bg = localStorage.getItem(BG_UPLOAD_KEY_LEGACY);
    if (bg && !localStorage.getItem(bgUploadKey())) localStorage.setItem(bgUploadKey(), bg);
  } catch { /* storage off */ }
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(settingsKey());
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      const merged = { ...DEFAULTS, ...saved };
      if ((merged.disguise as string) === 'avatar') merged.disguise = 'moji'; // the old avatars became the 3D head
      // Once: your own character becomes the avatar (the 3D head stays one tap away).
      if (!(saved as { charV1?: number }).charV1) { if (merged.disguise === 'moji') merged.disguise = 'character'; (merged as { charV1?: number }).charV1 = 1; }
      merged.moji = { ...DEFAULT_MOJI, ...(saved.moji ?? {}) };
      if (!merged.layout.head) {
        // first time with the headline: a ready-made layout makes room for it; your own arrangement gets it on top
        const pre = PRESETS[merged.aspect]?.find((p) => p.id === merged.preset);
        merged.layout = pre ? pre.layout : { ...merged.layout, head: { x: 0, y: 0, w: 100, h: 8, z: 9 } };
      }
      // layouts saved before the review-notes panel, or with its first position (which could cover the camera)
      if (!(saved as { notesV2?: number }).notesV2) { merged.layout = { ...merged.layout, notes: placeNotes(merged.layout) }; (merged as { notesV2?: number }).notesV2 = 1; }
      if (!(saved as { roomV3?: number }).roomV3) {
        const pre = PRESETS[merged.aspect]?.find((p) => p.id === merged.preset);
        if (pre && merged.preset !== 'custom') merged.layout = pre.layout;
        (merged as { roomV3?: number }).roomV3 = 1;
      }
      merged.layout = withNotes(merged.layout);
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

/** Pro members and admins; everyone else gets a short note with the way to Pro (no popup). */
export default function StreamerStudioGate() {
  const { isPremium, authUser, isAuthLoading } = useUser();
  // Not Pro, but invited by the admin to stream together: the studio opens for that.
  const [guest, setGuest] = useState<boolean | null>(null);
  const needsCheck = !isAuthLoading && !!authUser && !isPremium && !authUser.isAdmin;
  useEffect(() => {
    if (!needsCheck) return;
    void apiFetch('/api/studio/access').then((r) => (r.ok ? r.json() : null)).then((d) => setGuest(!!d?.open)).catch(() => setGuest(false));
  }, [needsCheck]);
  if (isAuthLoading || (needsCheck && guest === null)) return null;
  if (!isPremium && !authUser?.isAdmin && !guest) {
    return (
      <div className="min-h-screen grid place-items-center p-6" style={{ background: BG, color: RD.text }}>
        <div className="w-full max-w-md rounded-2xl p-6 text-center" style={{ background: CARD, border: `1px solid ${RD.border}` }}>
          <h1 className="text-xl font-extrabold">Streamer Studio</h1>
          <p className="mt-2 text-sm" style={{ color: RD.muted }}>
            Stream and record your games with your board, camera and name on one stage, and co-stream a match with your opponent.
            Streamer Studio is part of ChessScout Pro.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/subscription?from=studio" className="rounded-xl px-4 py-2.5 text-sm font-extrabold" style={{ background: RD.green, color: '#06110A' }}>See Pro</Link>
            <Link href="/" className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: CARD_LIGHT, color: RD.text }}>Back</Link>
          </div>
        </div>
      </div>
    );
  }
  owner = authUser?.id ?? '';
  adoptLegacy(!!authUser?.isAdmin);
  return <StreamerStudio key={owner} admin={!!authUser?.isAdmin} />;
}

function StreamerStudio({ admin }: { admin: boolean }) {
  // Without admin: no avatar characters and no voice changer (settings saved on a shared
  // device by an admin don't carry them over either).
  const [s, setS] = useState<Settings>(() => {
    const x = loadSettings();
    if (admin) return x;
    // The old built-in headline ("The road to 1500 ELO") was the owner's own: nobody else starts with it.
    if (x.headline === 'The road to 1500 ELO') { x.headline = ''; if (x.goal === 1500) x.goal = 0; }
    return { ...x, disguise: x.disguise === 'character' || x.disguise === 'moji' ? 'none' : x.disguise, voice: 'off' };
  });
  const sRef = useRef(s); sRef.current = s;
  const set = useCallback((patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch })), []);
  const pinch = useRef<{ d: number; s: number } | null>(null);
  useEffect(() => { try { localStorage.setItem(settingsKey(), JSON.stringify(s)); } catch { /* ignore */ } }, [s]);

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
  // A game review's coach note and eval bar + names, copied from the page for a board-only view
  const [notes, setNotes] = useState<ReviewNotes | null>(null);
  const notesRef = useRef<ReviewNotes | null>(null); notesRef.current = notes;
  const showNotesRef = useRef(false);
  const notesCanvas = useRef<HTMLCanvasElement>(null);
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
  const segmenter = useRef(new PersonSegmenter());
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
  const flash = useCallback((m: string) => { setMsg(m); window.setTimeout(() => setMsg((x) => (x === m ? null : x)), 6000); }, []);
  const uploadBg = useCallback(async (f: File) => {
    if (!f.type.startsWith('image/')) { flash('Pick a picture (JPG, PNG or WebP).'); return; }
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
      const url = cv.toDataURL('image/jpeg', 0.86);
      localStorage.setItem(bgUploadKey(), url);
      set({ bg: 'image', bgImage: 'upload' });
    } catch { flash('That picture couldn’t be used. Try a smaller one.'); }
  }, [set, flash]);

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

  // ---- 3D cartoon head (three.js loads only when it's picked) ----
  const moji = useRef<MojiHead | null>(null);
  const [mojiStatus, setMojiStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  useEffect(() => {
    if (s.disguise !== 'moji' || moji.current) return;
    setMojiStatus('loading');
    void loadThree().then((T) => {
      if (!T) { setMojiStatus('failed'); return; }
      const h = new MojiHead(T);
      if (h.ok) { moji.current = h; setMojiStatus('ready'); } else setMojiStatus('failed');
    });
  }, [s.disguise]);
  useEffect(() => () => moji.current?.dispose(), []);

  // ---- your character (drawn from your character sheet), loaded when it's picked ----
  const sprite = useRef<SpriteAvatar | null>(null);
  const [spriteStatus, setSpriteStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  useEffect(() => {
    if (s.disguise !== 'character' || sprite.current) return;
    setSpriteStatus('loading');
    void SpriteAvatar.load().then((a) => { if (a) { sprite.current = a; setSpriteStatus('ready'); } else setSpriteStatus('failed'); });
  }, [s.disguise]);
  const [matching, setMatching] = useState(false);
  const matchMyLook = useCallback(async () => {
    setMatching(true);
    try {
      if (!sRef.current.camOn) set({ camOn: true });
      const t0 = performance.now();
      while (performance.now() - t0 < 15000) {
        await new Promise((r) => window.setTimeout(r, 300));
        const tr = tracker.current, v = camVideo.current;
        if (tr.status === 'failed') break;
        if (v && v.videoWidth && tr.lastLandmarks && performance.now() - tr.lastAt < 400) {
          await new Promise((r) => window.setTimeout(r, 700)); // let the camera settle its exposure
          const look = tr.lastLandmarks ? lookFromCamera(v, tr.lastLandmarks, sRef.current.moji) : null;
          if (look) { set({ moji: look, disguise: 'moji' }); flash('Matched your skin, hair and facial hair. Fine-tune anything below.'); return; }
        }
      }
      flash('Couldn’t see your face clearly. Face the camera in good light and try again.');
    } finally { setMatching(false); }
  }, [set, flash]);

  // ---- face tracker: only loaded when a disguise needs it ----
  useEffect(() => {
    if (!s.camOn || s.disguise === 'none') return;
    if (tracker.current.status === 'ready' || tracker.current.status === 'loading') return;
    setTrackStatus('loading');
    void tracker.current.load().then((ok) => setTrackStatus(ok ? 'ready' : 'failed'));
  }, [s.camOn, s.disguise]);

  // ---- background behind you (not just behind a character): only loaded when it's needed ----
  const [segStatus, setSegStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  useEffect(() => {
    if (!s.camOn || s.bg === 'room' || !(s.disguise === 'none' || s.disguise === 'pixelate' || s.disguise === 'blur')) return;
    if (segmenter.current.status === 'ready' || segmenter.current.status === 'loading') return;
    setSegStatus('loading');
    void segmenter.current.load().then((ok) => setSegStatus(ok ? 'ready' : 'failed'));
  }, [s.camOn, s.bg, s.disguise]);

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

  // ---- co-streaming with the player you're facing ----
  // Your camera panel + voice go to them, theirs come to you (see lib/streamer/costream).
  const partnerVideo = useRef<HTMLVideoElement | null>(null);
  const partnerAudio = useRef<HTMLAudioElement>(null);
  const [hearPartner, setHearPartner] = useState(true);
  const [, setCoTick] = useState(0);
  const coLink = useRef<CoStreamLink | null>(null);
  if (!coLink.current) {
    coLink.current = new CoStreamLink(async () => {
      if (!voice.current.running) await startVoice();
      const cv = camCanvas.current as (HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }) | null;
      const out = new MediaStream();
      const v = cv?.captureStream?.(24).getVideoTracks()[0];
      if (v) out.addTrack(v);
      const a = voice.current.stream?.getAudioTracks()[0];
      if (a) out.addTrack(a);
      return out;
    });
  }
  const co = coLink.current;
  useEffect(() => {
    co.onChange = () => setCoTick((n) => n + 1);
    co.start();
    return () => { co.onChange = null; co.stop(); };
  }, [co]);
  const coPartner = co.state?.status === 'active' && co.partnerStream ? co.partnerStream : null;
  const coOnStage = !!coPartner && !edit; // laying out panels: your own camera panel only
  const coRef = useRef({ on: false, name: '' });
  coRef.current = { on: coOnStage, name: co.state?.partner ?? '' };
  useEffect(() => {
    if (partnerVideo.current && partnerVideo.current.srcObject !== coPartner) { partnerVideo.current.srcObject = coPartner; void partnerVideo.current.play().catch(() => {}); }
    if (partnerAudio.current && partnerAudio.current.srcObject !== coPartner) { partnerAudio.current.srcObject = coPartner; void partnerAudio.current.play().catch(() => {}); }
  }, [coPartner]);
  // Your mic restarted (or turned on) mid co-stream: reconnect so they hear the new one
  const lastVoiceOn = useRef(voiceOn);
  useEffect(() => {
    if (lastVoiceOn.current !== voiceOn) { lastVoiceOn.current = voiceOn; if (voiceOn) void co.refresh(); }
  }, [voiceOn, co]);
  // Both voices in what's recorded and broadcast
  const mixer = useRef(new VoiceMixer());
  useEffect(() => { mixer.current.setInputs([voice.current.stream, coPartner]); }, [voiceOn, coPartner]);
  useEffect(() => () => mixer.current.close(), []);
  // An opponent to invite: the live game you're in now (checked every few seconds)
  const [liveOpp, setLiveOpp] = useState<{ name: string; bot: boolean } | null>(null);
  const [inviteName, setInviteName] = useState('');
  useEffect(() => {
    let alive = true;
    const check = () => apiFetch('/api/live/active-game?keepBot=1', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        const g = d?.game; const col = d?.color;
        if (!g || g.status !== 'active') { setLiveOpp(null); return; }
        const opp = col === 'w' ? g.black : g.white;
        setLiveOpp(opp ? { name: opp.username, bot: !!opp.isBot } : null);
      })
      .catch(() => {});
    void check();
    const t = window.setInterval(check, 5000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);
  const [coBusy, setCoBusy] = useState(false);
  const coDo = async (f: () => Promise<unknown>) => {
    setCoBusy(true);
    try { await f(); } catch (e) { flash((e as Error).message || 'Something went wrong'); } finally { setCoBusy(false); }
  };
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
      // The game just finished in the board panel (Lichess, or ChessScout's own, bots
      // included, which "All games" leaves out) wins, unless a newer game is already saved.
      const last = lastLichessGame(), played = lastPlayedGame();
      const r = await apiFetch('/api/games?limit=1', { credentials: 'include' });
      const d = r.ok ? await r.json() : null;
      const top = d?.games?.[0] as { id: number; playedAt?: string } | undefined;
      const topAt = top?.playedAt ? new Date(top.playedAt).getTime() : 0;
      const newest = [
        last ? { at: last.at, open: async () => openReview(last.savedId ?? await saveLichessGame(last.id, last.side, true)) } : null,
        played ? { at: played.at, open: async () => openReview(played.savedId) } : null,
        top ? { at: topAt, open: async () => openReview(top.id) } : null,
      ].filter((x): x is { at: number; open: () => Promise<void> } => !!x).sort((a, b) => b.at - a.at)[0];
      if (newest) await newest.open();
      else flash('No games in your account yet. Play one, then review it here.');
    } catch (e) { flash(e instanceof Error ? e.message : 'Couldn’t load your games. Try again.'); }
    finally { setReviewBusy(false); }
  };
  // A Lichess game you just played: bring it into your games, then open its review.
  const reviewFollowed = async () => {
    if (!followGame) return;
    setReviewBusy(true);
    try {
      const u = s.followUser.trim().toLowerCase();
      const side = (lichess?.black?.name ?? '').toLowerCase() === u ? 'black' : (lichess?.white?.name ?? '').toLowerCase() === u ? 'white' : undefined;
      openReview(await saveLichessGame(followGame, side));
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
    if (s.boardSource !== 'app') { setBoardBox(null); setNotes(null); if (s.boardSource !== 'follow') feed.current = null; return undefined; }
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
          // the confirm-move clock lever under the board (Confirm Moves on), drawn under the board on stream
          const cfEl = doc.querySelector('[data-studio="confirm"]') as HTMLElement | null;
          const cfOk = !!cfEl && cfEl.getBoundingClientRect().height > 20;
          const confirm = cfOk ? {
            state: (cfEl!.getAttribute('data-state') || 'pending') as 'idle' | 'pending' | 'played',
            time: cfEl!.getAttribute('data-time') || '', san: cfEl!.getAttribute('data-san') || '',
            tone: (cfEl!.getAttribute('data-tone') || 'go') as 'go' | 'amber' | 'red',
          } : undefined;
          feed.current = { fen, flipped: be.getAttribute('data-flipped') === '1', last: be.getAttribute('data-last') || '', confirm };
        } else feed.current = null;
        // the confirm lever just under the board joins the fitted area (so it shows and can be tapped)
        {
          const bb = best as { x: number; y: number; w: number; h: number } | null;
          const cr = (doc.querySelector('[data-studio="confirm"]') as HTMLElement | null)?.getBoundingClientRect();
          if (bb && cr && cr.height > 20 && cr.top >= bb.y + bb.h - 4 && cr.top - (bb.y + bb.h) < bb.w * 0.4) bb.h = cr.bottom - bb.y;
        }
        // keep the board inside the page's view when we're fitting it
        const found = best as { x: number; y: number; w: number; h: number } | null;
        const vh = boardFrame.current?.clientHeight ?? VIRTUAL_H;
        if (found && bestEl && !peekRef.current && vh >= VIRTUAL_H - 1 && (found.y < 0 || found.y + found.h > vh)) {
          (bestEl as Element).scrollIntoView({ block: 'center' });
          return;
        }
        {
          const co = doc.querySelector('[data-studio="coach"]') as HTMLElement | null, ev = doc.querySelector('[data-studio="evalnames"]') as HTMLElement | null;
          let n: ReviewNotes | null = null;
          if (co || ev) {
            const ps = co ? [...co.querySelectorAll('p')] : [];
            const cpRaw = ev?.getAttribute('data-cp') ?? '';
            n = {
              title: (ps[0]?.textContent ?? '').trim(), text: co?.getAttribute('data-text') || (ps[1]?.textContent ?? '').replace(/\s*More$/, '').trim(),
              pros: (() => { try { return JSON.parse(co?.getAttribute('data-pros') || '[]') as string[]; } catch { return []; } })(),
              cons: (() => { try { return JSON.parse(co?.getAttribute('data-cons') || '[]') as string[]; } catch { return []; } })(),
              accent: co?.getAttribute('data-accent') || RD.green, glyph: co?.getAttribute('data-glyph') ?? '', glyphColor: co?.getAttribute('data-glyphcolor') ?? '',
              evalText: co?.getAttribute('data-eval') ?? '', cp: cpRaw === '' ? null : Number(cpRaw),
              white: ev?.getAttribute('data-white') ?? '', black: ev?.getAttribute('data-black') ?? '',
            };
          }
          setNotes((p) => (JSON.stringify(p) === JSON.stringify(n) ? p : n));
        }
        if (sRef.current.frame !== 'auto') { setBoardBox(null); return; }
        setBoardBox((prev) => {
          const b = best as { x: number; y: number; w: number; h: number } | null;
          if (!b) return null;
          if (prev && Math.abs(prev.x - b.x) < 1 && Math.abs(prev.y - b.y) < 1 && Math.abs(prev.w - b.w) < 1 && Math.abs(prev.h - b.h) < 1) return prev;
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
      const coNow = coRef.current;
      drawComposite(c, W, H, {
        layout: coNow.on ? withPartnerPanel(st.layout, W, H) : st.layout, board, cam: camCanvas.current, name: st.name, subtitle: st.subtitle,
        partner: coNow.on && partnerVideo.current ? { video: partnerVideo.current, name: coNow.name, myName: st.name } : null,
        light: looks.current.light, dark: looks.current.dark, pieceSrc: looks.current.pieceSrc,
        live: host.current.live, head: headRef.current, notes: showNotesRef.current ? notesRef.current : null,
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
    // Your voice, plus your co-stream partner's when you're streaming together
    const hasMic = !!voice.current.stream?.getAudioTracks()[0];
    mixer.current.setInputs([voice.current.stream, coLink.current?.partnerStream]);
    const a = mixer.current.track();
    if (a) ms.addTrack(a);
    if (!hasMic) flash('No microphone: recording without your voice. Allow the mic in the Voice tab.');
    return ms;
  }, [flash, startVoice]);

  // ---- camera canvas render loop ----
  useEffect(() => {
    let raf = 0;
    const pose = { x: 0, y: 0, size: 0, roll: 0 }; // where the face is, to hide it
    const ex = { yaw: 0, pitch: 0, mouth: 0, smile: 0, pucker: 0, blinkL: 0, blinkR: 0, brow: 0, browDown: 0, lookX: 0, lookY: 0, puck: 0, funnel: 0, roll: 0, stretch: 0 }; // for the 3D head, screen terms
    let lastSeen = 0, nextBlink = performance.now() + 2500, blinkUntil = 0;
    const bgPic: { src: string; img: HTMLImageElement | null } = { src: '', img: null };
    const tiny = document.createElement('canvas');
    const tctx = tiny.getContext('2d');
    const person = document.createElement('canvas');
    const pctx = person.getContext('2d');
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
      // You, cut out of your room (a background goes behind you): see lib/streamer/personSegmenter.
      const cutOut = st.bg !== 'room' && (st.disguise === 'none' || st.disguise === 'pixelate' || st.disguise === 'blur')
        && hasVideo && !!vid && segmenter.current.status === 'ready' && segmenter.current.update(vid) && !!pctx;
      const drawCamera = () => {
        if (!cutOut || !vid || !pctx) { drawVideo(); return; }
        if (st.bg === 'blur') drawVideo(40); else brand();
        if (person.width !== W || person.height !== H) { person.width = W; person.height = H; }
        pctx.save();
        pctx.clearRect(0, 0, W, H);
        if (mirror) pctx.setTransform(-1, 0, 0, 1, W, 0);
        pctx.drawImage(vid, ox, oy, vw * sc, vh * sc);
        pctx.globalCompositeOperation = 'destination-in';
        pctx.imageSmoothingEnabled = true;
        pctx.drawImage(segmenter.current.mask, ox, oy, vw * sc, vh * sc);
        pctx.restore();
        c.drawImage(person, 0, 0);
      };
      const brand = () => {
        if (st.bg === 'color') { c.fillStyle = st.bgColor; c.fillRect(0, 0, W, H); return; }
        if (st.bg === 'image' && st.bgImage) {
          const src = bgSrc(st.bgImage);
          if (bgPic.src !== src) { bgPic.src = src; bgPic.img = null; if (src) { const im = new Image(); im.onload = () => { if (bgPic.src === src) bgPic.img = im; }; im.src = src; } }
          const im = bgPic.img;
          if (im) { const k = Math.max(W / im.naturalWidth, H / im.naturalHeight); c.drawImage(im, (W - im.naturalWidth * k) / 2, (H - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k); return; }
        }
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
        const tx = mirror ? W - fx : fx, roll = mirror ? -face.roll : face.roll;
        const k = pose.size ? 0.55 : 1;
        pose.x += (tx - pose.x) * k; pose.y += (fy - pose.y) * k; pose.size += (face.size * sc * st.avatarScale - pose.size) * k;
        pose.roll += (roll - pose.roll) * k;
        const bs = tracker.current.lastBlendshapes ?? {};
        ex.yaw += ((mirror ? -face.yaw : face.yaw) - ex.yaw) * 0.6; ex.pitch += (face.pitch - ex.pitch) * 0.6;
        ex.mouth = face.mouth; ex.smile = face.smile; ex.brow += (face.brow - ex.brow) * 0.5;
        ex.pucker = Math.min(1, ((bs.mouthPucker ?? 0) + (bs.mouthFunnel ?? 0)) * 0.8);
        ex.browDown += (((bs.browDownLeft ?? 0) + (bs.browDownRight ?? 0)) / 2 - ex.browDown) * 0.5;
        // mouth shapes for the talking faces
        ex.puck = bs.mouthPucker ?? 0; ex.funnel = bs.mouthFunnel ?? 0;
        ex.roll = ((bs.mouthRollLower ?? 0) + (bs.mouthUpperUpLeft ?? 0) * 0.3 + (bs.mouthUpperUpRight ?? 0) * 0.3);
        ex.stretch = ((bs.mouthStretchLeft ?? 0) + (bs.mouthStretchRight ?? 0)) / 2;
        // MediaPipe's left/right are the picture's; a mirrored view swaps them on screen
        ex.blinkL = mirror ? face.blinkR : face.blinkL; ex.blinkR = mirror ? face.blinkL : face.blinkR;
        ex.lookX = mirror ? -face.lookX : face.lookX; ex.lookY = face.lookY;
      }
      const tracked = t - lastSeen < 450;

      if (st.disguise === 'none') {
        if (hasVideo) drawCamera(); else brand();
      } else if (st.disguise === 'character') {
        // Your character on the studio background (or your room / blurred room, with your face hidden).
        if (hasVideo && tracked && st.bg === 'room') {
          drawVideo();
          const r = pose.size * 0.62;
          c.save(); c.beginPath(); c.ellipse(pose.x, pose.y, r * 1.1, r * 1.4, pose.roll, 0, Math.PI * 2); c.clip(); drawVideo(Math.max(10, r / 3)); c.restore();
        } else if (hasVideo && (st.bg === 'blur' || st.bg === 'room')) drawVideo(40);
        else brand();
      } else if (!tracked) {
        // Privacy shield: no face found -> never show the raw camera.
        if (hasVideo) drawVideo(40); else brand();
      } else if (st.disguise === 'moji') {
        drawVideo();
        // blur the face underneath too, in case the head ever slips
        const r = pose.size * 0.62;
        c.save(); c.beginPath(); c.ellipse(pose.x, pose.y, r * 1.1, r * 1.4, pose.roll, 0, Math.PI * 2); c.clip();
        drawVideo(Math.max(10, r / 3));
        c.restore();
      } else {
        drawCamera();
        // hide the face region: ellipse in the (mirrored) video space
        const r = pose.size * 0.62;
        c.save(); c.beginPath(); c.ellipse(pose.x, pose.y, r, r * 1.3, pose.roll, 0, Math.PI * 2); c.clip();
        drawVideo(st.disguise === 'pixelate' ? Math.max(6, r / 7) : Math.max(10, r / 3));
        c.restore();
      }

      if (st.disguise === 'moji' && moji.current) {
        const head = moji.current;
        let S: number, cx: number, cy: number;
        if (tracked) {
          S = pose.size * 1.66; cx = pose.x; cy = pose.y;
        } else {
          // no face in view (or no camera): the head talks with your voice and blinks on its own
          const vlevel = voice.current.running ? voice.current.level() : 0;
          if (t > nextBlink) { blinkUntil = t + 140; nextBlink = t + 2500 + Math.random() * 3000; }
          const b = t < blinkUntil ? 1 : 0;
          Object.assign(ex, { yaw: Math.sin(t / 2100) * 0.22, pitch: Math.sin(t / 1700) * 0.08, mouth: Math.min(1, vlevel * 1.8), smile: 0.25, pucker: 0, blinkL: b, blinkR: b, brow: vlevel > 0.3 ? 0.3 : 0, lookX: 0, lookY: 0 });
          pose.roll *= 0.9;
          S = Math.min(W, H) * 0.95 * (st.avatarScale / 1.3); cx = W / 2; cy = H * 0.52;
        }
        const img = head.render(st.moji, { ...ex, roll: pose.roll });
        c.drawImage(img, cx - S / 2, cy - S / 2, S, S);
      }

      if (st.disguise === 'character' && sprite.current) {
        let S: number, cx: number, cy: number;
        const vlevel = voice.current.running ? voice.current.level() : 0;
        if (tracked && st.charFollow) { S = (pose.size / st.avatarScale) * 2.4 * st.charScale; cx = pose.x; cy = pose.y; }
        else if (tracked) {
          // kept in the middle: same size whether you lean in or sit back, only a slight sway with your head
          S = Math.min(W, H) * 0.8 * (st.charScale / 1.3);
          cx = W / 2 + Math.max(-0.04, Math.min(0.04, (pose.x - W / 2) / W * 0.12)) * W;
          cy = H * 0.5 + Math.max(-0.03, Math.min(0.03, (pose.y - H / 2) / H * 0.08)) * H;
        }
        else {
          // no face in view (or no camera): front-on, bouncing with your voice
          Object.assign(ex, { yaw: ex.yaw * 0.9, mouth: 0, smile: 0, blinkL: 0, blinkR: 0, browDown: 0, puck: 0, funnel: 0, roll: 0, stretch: 0 });
          pose.roll *= 0.9;
          S = Math.min(W, H) * 0.8 * (st.charScale / 1.3); cx = W / 2; cy = H * 0.5;
        }
        const spec = voice.current.running ? voice.current.spectrum() : undefined;
        sprite.current.draw(c, { yaw: ex.yaw, mouth: ex.mouth, smile: ex.smile, blinkL: ex.blinkL, blinkR: ex.blinkR, browDown: ex.browDown, voice: vlevel,
          pucker: ex.puck, funnel: ex.funnel, rollLower: ex.roll, stretch: ex.stretch, spec }, cx, cy, S, pose.roll, t);
      }

      if (!hasVideo && st.disguise !== 'moji' && st.disguise !== 'character') {
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
  // Board only on a game review: the coach's note and the eval bar + names get their own panel
  const showNotes = !!notes && s.boardSource === 'app' && fitBoard && s.framePad === 'board';
  showNotesRef.current = showNotes;
  const split = showNotes ? splitBoardPanel(boardRect.width, boardRect.height) : null;
  const notesPx = split ? { width: split.notes.w, height: split.notes.h } : null;
  useEffect(() => {
    const cv = notesCanvas.current; if (!cv || !notes || !notesPx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(2, Math.round(notesPx.width * dpr)), H = Math.max(2, Math.round(notesPx.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = cv.getContext('2d'); if (c) drawReviewNotes(c, notes, 0, 0, W, H);
  }, [notes, showNotes, notesPx?.width, notesPx?.height]); // eslint-disable-line react-hooks/exhaustive-deps
  if (s.frame === 'auto' && !fitBoard) {
    // no game on screen (lobby, picking an opponent) or peeking: show the page itself, scrollable, at phone width
    ifScale = boardRect.width / VIRTUAL_W;
    ifH = VIRTUAL_W * (boardRect.height / Math.max(1, boardRect.width));
  } else if (fitBoard && boardBox) {
    const pad = s.framePad === 'players' ? boardBox.w * 0.17 : 0;
    const r = { x: boardBox.x, y: boardBox.y - pad, w: boardBox.w, h: boardBox.h + pad * 2 };
    // with review notes the board fits its part of the panel; the notes take the rest
    const area = split ? split.board : { x: 0, y: 0, w: boardRect.width, h: boardRect.height };
    ifScale = Math.min(area.w / r.w, area.h / r.h);
    ifLeft = area.x + area.w / 2 - (r.x + r.w / 2) * ifScale;
    ifTop = area.y + area.h / 2 - (r.y + r.h / 2) * ifScale;
  } else {
    ifLeft = Math.min(0, -(VIRTUAL_W * ifScale - boardRect.width) * s.panX);
    ifTop = Math.min(0, -(VIRTUAL_H * ifScale - boardRect.height) * s.panY);
  }
  // Co-streaming: your camera panel shares its space with your partner's (not while laying out)
  const lay = coOnStage ? withPartnerPanel(s.layout, stage.w, stage.h) : s.layout;
  const partnerRect: Rect | undefined = coOnStage ? (lay as { partner?: Rect }).partner : undefined;
  const panel = (id: PanelId, label: string, children: ReactNode) => {
    const r = lay[id];
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
          {split && <canvas ref={notesCanvas} className="absolute z-[5] pointer-events-none" style={{ left: split.notes.x, top: split.notes.y, width: split.notes.w, height: split.notes.h }} />}
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
          <canvas ref={camCanvas} className="absolute inset-0 w-full h-full"
            // My character: scroll or pinch on the video to make him bigger or smaller
            onWheel={(e) => { if (sRef.current.disguise !== 'character') return; const v = sRef.current.charScale * (e.deltaY < 0 ? 1.06 : 1 / 1.06); set({ charScale: Math.min(3.2, Math.max(0.6, +v.toFixed(2))) }); }}
            onTouchStart={(e) => { if (e.touches.length === 2 && sRef.current.disguise === 'character') pinch.current = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), s: sRef.current.charScale }; }}
            onTouchMove={(e) => { const p = pinch.current; if (!p || e.touches.length !== 2) return; const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); set({ charScale: Math.min(3.2, Math.max(0.6, +(p.s * d / p.d).toFixed(2))) }); }}
            onTouchEnd={() => { pinch.current = null; }} />
          {coOnStage && <CoName name={s.name} round={!!lay.cam.round} />}
        </div>
      ))}
      {partnerRect && (
        <div className="absolute overflow-hidden" style={{ ...px(partnerRect), zIndex: partnerRect.z, borderRadius: partnerRect.round ? '50%' : 0, background: '#050A0B', boxShadow: partnerRect.round ? `0 0 0 3px ${RD.green}, 0 8px 24px rgba(0,0,0,.6)` : undefined }}>
          <video autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover"
            ref={(el) => { partnerVideo.current = el; if (el && el.srcObject !== coPartner) { el.srcObject = coPartner; void el.play().catch(() => {}); } }} />
          <CoName name={co.state?.partner ?? ''} round={!!partnerRect.round} />
        </div>
      )}
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
    {/* Your co-stream partner's voice, so you hear each other (mute it in Go live) */}
    <audio ref={partnerAudio} autoPlay muted={!hearPartner} />
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
          <BackLink fallback={admin ? '/admin' : '/'} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: CARD_LIGHT, color: RD.text }}>← {admin ? 'Admin' : 'Back'}</BackLink>
          <h1 className="font-extrabold text-lg">Streamer Studio</h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: RD.gold, color: '#050A0B' }}>BETA</span>
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
        {!clean && co.state && (
          <div className="flex flex-wrap items-center gap-2 text-sm px-3 py-2 rounded-lg" style={{ ...card, border: `1px solid ${co.state.status === 'active' ? RD.green : RD.border}` }}>
            {co.state.status === 'invited' && !co.state.invitedByMe && (<>
              <span className="flex-1 min-w-0"><b>{co.state.partner}</b> wants to stream this match together. You'll see and hear each other, and both of you appear on both streams.</span>
              <button disabled={coBusy} onClick={() => void coDo(() => co.accept(s.name))} className="px-3 py-1.5 rounded-lg font-bold disabled:opacity-60" style={{ background: RD.green, color: '#06110A' }}>Stream together</button>
              <button disabled={coBusy} onClick={() => void coDo(() => co.end())} className="px-3 py-1.5 rounded-lg font-bold disabled:opacity-60" style={{ background: CARD_LIGHT, color: RD.text }}>No thanks</button>
            </>)}
            {co.state.status === 'invited' && co.state.invitedByMe && (<>
              <span className="flex-1 min-w-0">Waiting for <b>{co.state.partner}</b> to accept in their Streamer Studio…</span>
              <button disabled={coBusy} onClick={() => void coDo(() => co.end())} className="px-3 py-1.5 rounded-lg font-bold disabled:opacity-60" style={{ background: CARD_LIGHT, color: RD.text }}>Cancel</button>
            </>)}
            {co.state.status === 'active' && (<>
              <span className="flex-1 min-w-0">
                🎙️ Streaming together with <b>{co.state.partner}</b> · {co.link === 'connected' ? 'connected' : co.link === 'failed' ? 'reconnecting…' : 'connecting…'}
              </span>
              <button onClick={() => setHearPartner((v) => !v)} className="px-3 py-1.5 rounded-lg font-bold" style={{ background: CARD_LIGHT, color: RD.text }}>{hearPartner ? `🔈 Mute ${co.state.partner}` : `🔇 Hear ${co.state.partner}`}</button>
              <button disabled={coBusy} onClick={() => void coDo(() => co.end())} className="px-3 py-1.5 rounded-lg font-bold disabled:opacity-60" style={{ background: CARD_LIGHT, color: RD.text }}>End co-stream</button>
            </>)}
          </div>
        )}
        <div ref={areaRef} className={clean ? 'flex-1 flex items-center justify-center' : 'flex-1 flex items-center justify-center min-h-[60vh] lg:min-h-0'}>{stageEl}</div>
        {!clean && s.boardSource === 'app' && (
          // Remote for games and reviews in the board panel: off the stream picture, big targets.
          <div className="shrink-0 flex justify-center">
            <StudioRemote frame={boardFrame} appPath={s.appPath} onOpen={(p) => { setPeek(false); set({ boardSource: 'app', appPath: p }); }}
              notesOn={s.framePad === 'board'} setNotesOn={(v) => set({ framePad: v ? 'board' : 'players' })}
              peek={peek} setPeek={setPeek}
              myNames={[authUser?.chesscomUsername, authUser?.lichessUsername, s.followUser].filter((x): x is string => !!x && !!x.trim())} />
          </div>
        )}
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
            <input value={s.headline} onChange={(e) => set({ headline: e.target.value.slice(0, 50) })} placeholder="Your headline, e.g. your goal for this stream" className="w-full px-3 py-2 rounded-lg text-sm mb-2" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }} />
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
              <Note>{s.frame === 'auto' ? (boardBox ? `The board is found and fitted automatically, even when it moves.${s.framePad === 'board' ? ' On a game review, the coach’s note, eval bar and names go in their own Review notes panel (move it in Edit layout).' : ''}` : 'No game on screen yet: pick or start a game right in the panel, and the board fills the panel as soon as it starts. Use ⤢ Whole page on the panel any time to get back to the page.') : 'Zoom and move below to show the part of the page you want.'}</Note>
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

            <Label>Hide my face</Label>
            <div className="flex flex-wrap gap-2">
              {admin && <Chip on={s.disguise === 'character'} onClick={() => set({ disguise: 'character' })}>🧔 My character</Chip>}
              {admin && <Chip on={s.disguise === 'moji'} onClick={() => set({ disguise: 'moji' })}>🙂 3D cartoon head</Chip>}
              <Chip on={s.disguise === 'pixelate'} onClick={() => set({ disguise: 'pixelate' })}>▦ Pixelate face</Chip>
              <Chip on={s.disguise === 'blur'} onClick={() => set({ disguise: 'blur' })}>◌ Blur face</Chip>
              <Chip on={s.disguise === 'none'} onClick={() => set({ disguise: 'none' })}>🙂 Show my face</Chip>
            </div>
            {s.disguise !== 'none' && s.camOn && (
              <Note>
                {trackStatus === 'loading' && 'Loading face tracking…'}
                {trackStatus === 'ready' && 'Face tracking on. If your face is ever lost, the camera is hidden until it’s found again.'}
                {trackStatus === 'failed' && 'Face tracking couldn’t load on this device, so your camera stays hidden.'}
              </Note>
            )}
            {s.disguise === 'character' && (
              <Note>
                {spriteStatus === 'loading' && 'Loading your character…'}
                {spriteStatus === 'failed' && 'Your character’s pictures couldn’t load. Check your connection and pick it again.'}
                {spriteStatus === 'ready' && 'Your character from your character sheet. Turn your head to turn his; smile, laugh, wink, look surprised or frown and he does too; he bounces when you talk. The background setting decides what’s behind him.'}
              </Note>
            )}
            {s.disguise === 'character' && (
              <div className="flex items-end gap-2">
                <button onClick={() => set({ charScale: Math.max(0.6, +(s.charScale - 0.15).toFixed(2)) })} aria-label="Smaller" className="mb-1 h-9 w-9 shrink-0 rounded-lg text-[18px] font-black" style={{ background: RD.cardLight, border: `1px solid ${RD.border}`, color: RD.text }}>−</button>
                <div className="min-w-0 flex-1"><Slider label="Character size" min={0.6} max={3.2} step={0.05} value={s.charScale} onChange={(v) => set({ charScale: v })} /></div>
                <button onClick={() => set({ charScale: Math.min(3.2, +(s.charScale + 0.15).toFixed(2)) })} aria-label="Bigger" className="mb-1 h-9 w-9 shrink-0 rounded-lg text-[18px] font-black" style={{ background: RD.cardLight, border: `1px solid ${RD.border}`, color: RD.text }}>＋</button>
              </div>
            )}
            {s.disguise === 'character' && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Chip on={!s.charFollow} onClick={() => set({ charFollow: false })}>⊙ Stay centred</Chip>
                <Chip on={!!s.charFollow} onClick={() => set({ charFollow: true })}>↔ Follow my head</Chip>
              </div>
            )}

            <Label>Background</Label>
            <p className="-mt-1 mb-2 text-[11.5px]" style={{ color: RD.muted }}>Behind you (your room is cut out), behind your character, and whenever the camera is off.</p>
            {s.camOn && s.bg !== 'room' && segStatus === 'loading' && <Note>Getting the background ready…</Note>}
            {s.camOn && s.bg !== 'room' && segStatus === 'failed' && <Note>The background couldn’t load on this device, so your room still shows. Check your connection and pick the background again.</Note>}
            <div className="flex flex-wrap gap-2">
              <Chip on={s.bg === 'brand'} onClick={() => set({ bg: 'brand' })}>♞ ChessScout</Chip>
              <Chip on={s.bg === 'room'} onClick={() => set({ bg: 'room' })}>🏠 My room</Chip>
              <Chip on={s.bg === 'blur'} onClick={() => set({ bg: 'blur' })}>◌ Blurred room</Chip>
              <Chip on={s.bg === 'color'} onClick={() => set({ bg: 'color' })}>🎨 Colour</Chip>
              <label className="cursor-pointer select-none rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors"
                style={s.bg === 'image' && s.bgImage === 'upload' ? { background: RD.green, color: '#06110A' } : { background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }}>🖼️ My picture
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadBg(f); }} />
              </label>
            </div>
            {s.bg === 'color' && <input type="color" value={s.bgColor} onChange={(e) => set({ bgColor: e.target.value })} className="mt-2 h-9 w-16 cursor-pointer rounded" />}
            {(s.bg === 'room' || s.bg === 'blur') && !s.camOn && <Note>Turn the camera on to see your room.</Note>}
            <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {THEME_BGS.map((b) => (
                <button key={b.id} onClick={() => set({ bg: 'image', bgImage: b.src! })} title={b.label} className="overflow-hidden rounded-lg"
                  style={{ aspectRatio: '16 / 10', outline: s.bg === 'image' && s.bgImage === b.src ? `2px solid ${RD.green}` : `1px solid ${RD.border}`, outlineOffset: s.bg === 'image' && s.bgImage === b.src ? 1 : 0 }}>
                  <img src={b.thumb ?? b.src} alt={b.label} loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            {s.disguise === 'moji' && (<>
              <Note>
                {mojiStatus === 'loading' && 'Loading the 3D head…'}
                {mojiStatus === 'failed' && 'This browser can’t draw 3D (WebGL is off), so the 3D head isn’t available here.'}
                {mojiStatus === 'ready' && 'Your head is swapped for a 3D cartoon that copies your face: turns, blinks, eyes, eyebrows, talking and smiling. With the camera off it talks with your voice.'}
              </Note>
              <button onClick={() => void matchMyLook()} disabled={matching} className="mt-2 w-full py-3 rounded-xl font-extrabold text-sm"
                style={{ background: matching ? CARD_LIGHT : RD.gold, color: matching ? RD.text : '#050A0B' }}>
                {matching ? 'Looking at you… hold still' : '✨ Match my look from the camera'}
              </button>
              <Label>Skin</Label>
              <Swatches colors={MOJI_SKINS} value={s.moji.skin} onPick={(v) => set({ moji: { ...s.moji, skin: v } })} />
              <Label>Hair</Label>
              <div className="flex flex-wrap gap-1.5">{MOJI_HAIRS.map((h) => <Chip key={h.id} on={s.moji.hair === h.id} onClick={() => set({ moji: { ...s.moji, hair: h.id } })}>{h.label}</Chip>)}</div>
              <Swatches colors={MOJI_HAIR_COLORS} value={s.moji.hairColor} onPick={(v) => set({ moji: { ...s.moji, hairColor: v } })} />
              <Label>Eyes</Label>
              <Swatches colors={MOJI_EYE_COLORS} value={s.moji.eyes} onPick={(v) => set({ moji: { ...s.moji, eyes: v } })} />
              <Label>Beard</Label>
              <div className="flex flex-wrap gap-1.5">{MOJI_BEARDS.map((h) => <Chip key={h.id} on={s.moji.beard === h.id} onClick={() => set({ moji: { ...s.moji, beard: h.id } })}>{h.label}</Chip>)}</div>
              <Label>Moustache</Label>
              <div className="flex flex-wrap gap-1.5">{MOJI_MUSTACHES.map((h) => <Chip key={h.id} on={s.moji.mustache === h.id} onClick={() => set({ moji: { ...s.moji, mustache: h.id } })}>{h.label}</Chip>)}</div>
              {(s.moji.beard !== 'none' || s.moji.mustache !== 'none') && (<>
                <Label>Facial hair colour</Label>
                <Swatches colors={MOJI_HAIR_COLORS} value={s.moji.beardColor} onPick={(v) => set({ moji: { ...s.moji, beardColor: v } })} />
              </>)}
              <Label>Glasses</Label>
              <div className="flex flex-wrap gap-1.5">{MOJI_GLASSES.map((h) => <Chip key={h.id} on={s.moji.glasses === h.id} onClick={() => set({ moji: { ...s.moji, glasses: h.id } })}>{h.label}</Chip>)}</div>
              {s.moji.glasses !== 'none' && <Swatches colors={MOJI_FRAMES} value={s.moji.frame} onPick={(v) => set({ moji: { ...s.moji, frame: v } })} />}
              <Slider label="Head size" min={0.9} max={1.9} step={0.05} value={s.avatarScale} onChange={(v) => set({ avatarScale: v })} />
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
            {admin && (<>
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
            <Label>{admin ? 'Send my changed voice to' : 'Send my voice to'}</Label>
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
          </>)}

          {tab === 'videos' && <VideosPanel refreshKey={videosKey} onError={flash} />}

          {tab === 'live' && (<>
            <Label>Stream together</Label>
            {co.state?.status === 'active' ? (
              <Note>You're co-streaming with <b>{co.state.partner}</b>: both of you appear on both streams, with both voices. {co.state.partnerLive ? `${co.state.partner} is live too; viewers can switch between your two views on chessscout.net/streams.` : ''}</Note>
            ) : co.state ? (
              <Note>{co.state.invitedByMe ? `Invite sent to ${co.state.partner}.` : `${co.state.partner} invited you: answer at the top of the studio.`}</Note>
            ) : admin ? (<>
              {liveOpp && !liveOpp.bot && (
                <button disabled={coBusy} onClick={() => void coDo(async () => { const who = await co.invite(s.name); flash(`Invite sent to ${who}. They accept in their Streamer Studio.`); })}
                  className="mb-2 w-full py-2.5 rounded-xl font-extrabold text-sm disabled:opacity-60" style={{ background: RD.green, color: '#06110A' }}>
                  Invite {liveOpp.name} to stream this match together
                </button>
              )}
              <form onSubmit={(e) => { e.preventDefault(); const u = inviteName.trim(); if (!u) return; void coDo(async () => { const who = await co.inviteUser(u, s.name); setInviteName(''); flash(`Invite sent to ${who}. They get a notification and answer in Streamer Studio.`); }); }} className="flex gap-2">
                <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Their username or email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  className="min-w-0 flex-1 px-3 py-2.5 rounded-lg text-sm" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }} />
                <button type="submit" disabled={coBusy || !inviteName.trim()} className="shrink-0 px-4 py-2.5 rounded-xl font-extrabold text-sm disabled:opacity-60" style={{ background: RD.green, color: '#06110A' }}>Invite</button>
              </form>
              <Note>Admin: invite any member to live stream with you, by their ChessScout, Chess.com or Lichess name. No game needed, and they don't need Pro: they get a notification, and Streamer Studio opens for them to accept. Use headphones so they don't hear themselves.</Note>
            </>) : liveOpp && !liveOpp.bot ? (<>
              <button disabled={coBusy} onClick={() => void coDo(async () => { const who = await co.invite(s.name); flash(`Invite sent to ${who}. They accept in their Streamer Studio.`); })}
                className="w-full py-2.5 rounded-xl font-extrabold text-sm disabled:opacity-60" style={{ background: RD.green, color: '#06110A' }}>
                Invite {liveOpp.name} to stream this match together
              </button>
              <Note>You'll see and hear each other, and both of you appear on both streams. They need Streamer Studio open (Pro) to accept. Use headphones so your partner doesn't hear themselves.</Note>
            </>) : (
              <Note>{liveOpp?.bot ? 'You’re playing a bot. ' : ''}Start a live game against a person (Board → Live game), then invite them here to stream the match together.</Note>
            )}
            <button onClick={() => void goLive()} className="w-full py-3 rounded-xl font-extrabold text-base" style={{ background: RD.red, color: '#fff' }}>◉ Go live (full screen)</button>
            <Label>When I go live</Label>
            <div className="flex flex-wrap gap-2">
              <Chip on={s.broadcast} onClick={() => set({ broadcast: !s.broadcast })}>📡 Stream on chessscout.net</Chip>
              <Chip on={s.recordLive} onClick={() => set({ recordLive: !s.recordLive })}>● Save a recording</Chip>
            </div>
            <input value={s.title} onChange={(e) => set({ title: e.target.value.slice(0, 80) })} placeholder="Stream title (optional)" className="mt-2 w-full px-3 py-2 rounded-lg text-sm" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }} />
            <Note>Viewers watch on chessscout.net/streams. They see your stage and hear your {admin ? 'changed ' : ''}voice; your mic turns on automatically. Recordings are saved to chessscout.net with sound and show up in the Videos tab.</Note>
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

function Swatches({ colors, value, onPick }: { colors: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {colors.map((c) => (
        <button key={c} onClick={() => onPick(c)} aria-label={c} className="w-8 h-8 rounded-full"
          style={{ background: c, border: value.toLowerCase() === c.toLowerCase() ? `3px solid ${RD.green}` : `2px solid ${RD.border}` }} />
      ))}
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

interface SavedVideo { id: string; title: string; mime: string; size_bytes: number | string; duration_ms: number; status: string; created_at: string; username?: string | null }

function VideosPanel({ refreshKey, onError }: { refreshKey: number; onError: (m: string) => void }) {
  const [list, setList] = useState<SavedVideo[] | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/stream-recordings', { credentials: 'include' });
      const j = (await r.json()) as { recordings?: SavedVideo[]; error?: string };
      if (!r.ok) throw new Error(j.error || 'failed');
      setList(j.recordings ?? []);
    } catch { setList([]); onError('Couldn’t load your saved videos.'); }
  }, [onError]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const open = async (id: string, download: boolean) => {
    try {
      const r = await apiFetch(`/api/stream-recordings/${id}/url${download ? '?download=1' : ''}`, { credentials: 'include' });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error || 'failed');
      if (download) { const a = document.createElement('a'); a.href = j.url; document.body.appendChild(a); a.click(); a.remove(); }
      else setPlaying({ id, url: j.url });
    } catch { onError('Couldn’t open that video.'); }
  };
  const del = async (id: string) => {
    try { await apiFetch(`/api/stream-recordings/${id}`, { method: 'DELETE', credentials: 'include' }); } catch { /* ignore */ }
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

/** A player's name on their camera panel while co-streaming (on screen; the stage canvas draws its own). */
function CoName({ name, round }: { name: string; round: boolean }) {
  if (!name) return null;
  return (
    <span className="absolute z-[3] max-w-[80%] truncate rounded-md px-2 py-0.5 text-[12px] font-extrabold pointer-events-none"
      style={{ background: 'rgba(5,10,11,.82)', color: '#F5F7F6', ...(round ? { left: '50%', bottom: '8%', transform: 'translateX(-50%)' } : { left: 6, bottom: 6 }) }}>
      {name}
    </span>
  );
}
