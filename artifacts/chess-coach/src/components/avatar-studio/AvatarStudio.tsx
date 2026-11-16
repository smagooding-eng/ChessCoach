// Avatar Studio: create and edit 3D characters. A large live viewport (drag to turn, zoom,
// front/side/rear, lighting and backdrops, expression tests, live face tracking and lip sync)
// with category panels that change the actual 3D model. Players can keep several characters.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { RD } from '@/lib/redesignTheme';
import {
  defaultAvatar, normalizeAvatarConfig, sameAvatar, HAIR_STYLES, BEARDS, MUSTACHES, BROWS, GLASSES, HEADWEAR, EXTRAS, OUTFITS,
  SKIN_SWATCHES, HAIR_SWATCHES, EYE_SWATCHES, OUTFIT_SWATCHES, ACCENT_SWATCHES, type AvatarConfig,
} from '@/lib/avatarStudio/avatarConfig';
import type { FaceShape } from '@/lib/avatarStudio/head/sdf';
import { AvatarViewer, ThumbMaker, LIGHTINGS, BACKDROPS, type Lighting, type Backdrop, type View } from '@/lib/avatarStudio/viewer';
import { listCharacters, createCharacter, updateCharacter, deleteCharacter, setActiveCharacter, type SavedCharacter } from '@/lib/avatarStudio/api';
import { measureGenerator, photoCanvas } from '@/lib/avatarStudio/selfie';
import { FaceTracker } from '@/lib/streamer/faceTracker';

const CARD = '#0D1516', CARD_LIGHT = '#121B1D'; // solid dark cards
type Cat = 'photo' | 'face' | 'eyes' | 'nose' | 'mouth' | 'ears' | 'skin' | 'hair' | 'facial' | 'glasses' | 'accessories' | 'outfit';
const CATS: { id: Cat; label: string; icon: string }[] = [
  { id: 'photo', label: 'Selfie', icon: '📷' }, { id: 'face', label: 'Face', icon: '🙂' }, { id: 'eyes', label: 'Eyes', icon: '👁️' },
  { id: 'nose', label: 'Nose', icon: '👃' }, { id: 'mouth', label: 'Mouth', icon: '👄' }, { id: 'ears', label: 'Ears', icon: '👂' },
  { id: 'skin', label: 'Skin', icon: '🎨' }, { id: 'hair', label: 'Hair', icon: '💇' }, { id: 'facial', label: 'Facial hair', icon: '🧔' },
  { id: 'glasses', label: 'Glasses', icon: '👓' }, { id: 'accessories', label: 'Accessories', icon: '🧢' }, { id: 'outfit', label: 'Outfit', icon: '👕' },
];
const EXPRESSIONS = [['smile', '😊 Smile'], ['laugh', '😂 Laugh'], ['wow', '😮 Wow'], ['wink', '😉 Wink'], ['angry', '😠 Angry'], ['sad', '😢 Sad'], ['talk', '🗣️ Talk']] as const;
const MAX_PHOTO = 12 * 1024 * 1024;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="border-b py-3" style={{ borderColor: RD.border }}><h3 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-wide" style={{ color: RD.muted }}>{title}</h3>{children}</section>;
}

export default function AvatarStudio() {
  // ── saved characters ──
  const [chars, setChars] = useState<SavedCharacter[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [name, setName] = useState('My character');
  const [config, setConfig] = useState<AvatarConfig>(defaultAvatar);
  const [saved, setSaved] = useState<{ config: AvatarConfig; name: string } | null>(null);
  const [save, setSave] = useState<{ state: 'idle' | 'saving' | 'saved' | 'error'; msg?: string }>({ state: 'idle' });
  const dirty = !saved || !sameAvatar(config, saved.config) || name !== saved.name;

  const load = useCallback(() => {
    setLoadError(null); setChars(null);
    listCharacters().then((list) => {
      setChars(list);
      const pick = list.find((c) => c.isActive) ?? list[0];
      if (pick) { setCurrentId(pick.id); setName(pick.name); setConfig(pick.config); setSaved({ config: pick.config, name: pick.name }); }
      else { setCurrentId(null); setName('My character'); setConfig(defaultAvatar); setSaved(null); }
    }).catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Couldn’t load your characters.'));
  }, []);
  useEffect(load, [load]);

  const doSave = async () => {
    setSave({ state: 'saving' });
    try {
      const clean = normalizeAvatarConfig(config);
      const c = currentId == null ? await createCharacter(name, clean) : await updateCharacter(currentId, { name, config: clean });
      setCurrentId(c.id); setSaved({ config: c.config, name: c.name });
      setChars((old) => { const rest = (old ?? []).filter((x) => x.id !== c.id); return [...rest, c].sort((a, b) => a.id - b.id); });
      setSave({ state: 'saved', msg: 'Saved' });
    } catch (e) { setSave({ state: 'error', msg: e instanceof Error ? e.message : 'Couldn’t save. Please try again.' }); }
  };
  const confirmLeave = () => !dirty || window.confirm('You have unsaved changes. Leave them?');
  const openChar = (c: SavedCharacter) => { if (!confirmLeave()) return; setCurrentId(c.id); setName(c.name); setConfig(c.config); setSaved({ config: c.config, name: c.name }); setSave({ state: 'idle' }); };
  const newChar = () => { if (!confirmLeave()) return; setCurrentId(null); setName(`Character ${(chars?.length ?? 0) + 1}`); setConfig(defaultAvatar); setSaved(null); setSave({ state: 'idle' }); setCat('photo'); };
  const duplicate = () => { setCurrentId(null); setName(`${name} copy`.slice(0, 40)); setSaved(null); setSave({ state: 'idle' }); };
  const remove = async () => {
    if (currentId == null) { newChar(); return; }
    if (!window.confirm(`Delete “${name}”? This can’t be undone.`)) return;
    try { await deleteCharacter(currentId); setSaved(null); load(); } catch (e) { setSave({ state: 'error', msg: e instanceof Error ? e.message : 'Couldn’t delete.' }); }
  };
  const makeActive = async () => {
    if (currentId == null) return;
    try { await setActiveCharacter(currentId); setChars((old) => (old ?? []).map((c) => ({ ...c, isActive: c.id === currentId }))); } catch { /* shown next load */ }
  };

  // ── viewport ──
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<AvatarViewer | null>(null);
  const [vstate, setVstate] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [building, setBuilding] = useState(false);
  const [lighting, setLighting] = useState<Lighting>('studio');
  const [backdrop, setBackdrop] = useState<Backdrop>('chessscout');
  useEffect(() => {
    let alive = true; const el = host.current; if (!el) return undefined;
    void AvatarViewer.create(el).then((v) => { if (!alive) { v?.dispose(); return; } if (!v) { setVstate('failed'); return; } viewer.current = v; setVstate('ready'); });
    return () => { alive = false; viewer.current?.dispose(); viewer.current = null; };
  }, []);
  // apply the look: quick draft while a slider moves, full detail when it settles
  const draftRef = useRef(false); const fullTimer = useRef(0);
  useEffect(() => {
    const v = viewer.current; if (!v || vstate !== 'ready') return;
    const draft = draftRef.current; draftRef.current = false;
    setBuilding(true);
    void v.setLook(config, draft).then(() => setBuilding(false));
    window.clearTimeout(fullTimer.current);
    if (draft) fullTimer.current = window.setTimeout(() => { setBuilding(true); void v.setLook(config, false).then(() => setBuilding(false)); }, 650);
  }, [config, vstate]);
  useEffect(() => { viewer.current?.setLighting(lighting); }, [lighting, vstate]);
  useEffect(() => { viewer.current?.setBackdrop(backdrop); }, [backdrop, vstate]);

  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) => { setConfig((c) => ({ ...c, [k]: v })); setSave({ state: 'idle' }); };
  const setShape = (k: keyof FaceShape, v: number) => { draftRef.current = true; setConfig((c) => ({ ...c, shape: { ...c.shape, [k]: v } })); setSave({ state: 'idle' }); };

  // ── live: face tracking + lip sync ──
  const [live, setLive] = useState<'off' | 'starting' | 'on' | 'failed'>('off');
  const liveRef = useRef<{ stream: MediaStream; video: HTMLVideoElement; tracker: FaceTracker; raf: number } | null>(null);
  const stopLive = useCallback(() => {
    const l = liveRef.current; if (l) { cancelAnimationFrame(l.raf); l.stream.getTracks().forEach((t) => t.stop()); l.tracker.close(); }
    liveRef.current = null; viewer.current?.setLiveFace(null); viewer.current?.setVoice(null); setLive('off');
  }, []);
  const startLive = async () => {
    setLive('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: true });
      const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream; await video.play();
      const tracker = new FaceTracker();
      if (!(await tracker.load())) throw new Error('tracking');
      viewer.current?.setVoice(stream);
      const tick = () => {
        const l = liveRef.current; if (!l) return;
        const f = tracker.detect(video);
        if (f) viewer.current?.setLiveFace(tracker.lastBlendshapes, { yaw: -f.yaw * 0.6, pitch: f.pitch * 0.35, roll: -f.roll });
        l.raf = requestAnimationFrame(tick);
      };
      liveRef.current = { stream, video, tracker, raf: requestAnimationFrame(tick) };
      setLive('on');
    } catch { setLive('failed'); }
  };
  useEffect(() => () => stopLive(), [stopLive]);

  // ── selfie ──
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoState, setPhotoState] = useState<{ state: 'idle' | 'working' | 'done' | 'error'; msg?: string; notes?: string[] }>({ state: 'idle' });
  const photoBlob = useRef<Blob | null>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  const pickPhoto = (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setPhotoState({ state: 'error', msg: 'Please choose a photo (JPG, PNG or WebP).' }); return; }
    if (f.size > MAX_PHOTO) { setPhotoState({ state: 'error', msg: 'That photo is over 12 MB. Please choose a smaller one.' }); return; }
    photoBlob.current = f; setPhoto((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); }); setPhotoState({ state: 'idle' });
  };
  const matchPhoto = async () => {
    if (!photoBlob.current) return;
    setPhotoState({ state: 'working' });
    try {
      const cv = await photoCanvas(photoBlob.current);
      const r = await measureGenerator.generate(cv, config);
      setConfig(r.config); setSave({ state: 'idle' }); setPhotoState({ state: 'done', notes: r.notes });
    } catch (e) { setPhotoState({ state: 'error', msg: e instanceof Error ? e.message : 'Couldn’t read that photo.' }); }
  };

  // ── option thumbnails, rendered from the real model ──
  const thumbs = useRef<ThumbMaker | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  useEffect(() => { let on = true; void ThumbMaker.create().then((t) => { if (on) thumbs.current = t; else t?.dispose(); }); return () => { on = false; thumbs.current?.dispose(); }; }, []);
  const [cat, setCat] = useState<Cat>('photo');
  const thumbFor = useCallback((field: keyof AvatarConfig, value: string, focus: 'face' | 'bust' = 'face') => {
    const look = normalizeAvatarConfig({ ...config, [field]: value, ...(field === 'headwear' && value !== 'none' ? {} : {}) });
    const key = JSON.stringify([field, value, look.shape, look.skinTone, look.hair, look.hairColor, look.beard, look.mustache, look.beardColor, look.glasses, look.glassesColor, look.headwear, look.headwearColor, look.extra, look.extraColor, look.outfit, look.outfitColor, look.brows]);
    return { key, look, focus };
  }, [config]);
  const want = useMemo(() => {
    const list: { field: keyof AvatarConfig; values: string[]; focus: 'face' | 'bust' }[] = [];
    if (cat === 'hair') list.push({ field: 'hair', values: HAIR_STYLES.map((x) => x.id), focus: 'face' });
    if (cat === 'facial') list.push({ field: 'beard', values: BEARDS.map((x) => x.id), focus: 'face' }, { field: 'mustache', values: MUSTACHES.map((x) => x.id), focus: 'face' });
    if (cat === 'eyes') list.push({ field: 'brows', values: BROWS.map((x) => x.id), focus: 'face' });
    if (cat === 'glasses') list.push({ field: 'glasses', values: GLASSES.map((x) => x.id), focus: 'face' });
    if (cat === 'accessories') list.push({ field: 'headwear', values: HEADWEAR.map((x) => x.id), focus: 'face' }, { field: 'extra', values: EXTRAS.map((x) => x.id), focus: 'bust' });
    if (cat === 'outfit') list.push({ field: 'outfit', values: OUTFITS.map((x) => x.id), focus: 'bust' });
    return list;
  }, [cat]);
  useEffect(() => {
    const t = thumbs.current; if (!t) return;
    t.clear();
    const timer = window.setTimeout(() => {
      for (const w of want) for (const v of w.values) {
        const { key, look, focus } = thumbFor(w.field, v, w.focus);
        t.request(key, look, focus, (url) => setThumbUrls((m) => ({ ...m, [`${String(w.field)}:${v}`]: url, [key]: url })));
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [want, thumbFor]);

  // ── UI ──
  if (loadError) return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl p-5 text-center" style={{ background: CARD, border: `1px solid ${RD.border}`, color: RD.text }}>
      <p className="mb-3 text-[14px]">{loadError}</p>
      <button onClick={load} className="rounded-xl px-4 py-2.5 text-[13px] font-extrabold" style={{ background: RD.green, color: '#06110A' }}>Try again</button>
    </div>
  );
  const optionGrid = (field: keyof AvatarConfig, list: { id: string; label: string }[]) => (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
      {list.map((o) => {
        const on = config[field] === o.id; const url = thumbUrls[`${String(field)}:${o.id}`];
        return (
          <button key={o.id} onClick={() => set(field, o.id as never)} aria-pressed={on} className="overflow-hidden rounded-xl text-left"
            style={{ background: CARD_LIGHT, border: `2px solid ${on ? RD.green : RD.border}` }}>
            <div className="grid aspect-square place-items-center" style={{ background: '#1a2324' }}>
              {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="text-[11px]" style={{ color: RD.muted }}>…</span>}
            </div>
            <div className="truncate px-2 py-1.5 text-[11.5px] font-bold" style={{ color: on ? RD.text : RD.muted }}>{o.label}</div>
          </button>
        );
      })}
    </div>
  );
  const slider = (label: string, k: keyof FaceShape, left: string, right: string) => (
    <label className="block py-2.5">
      <div className="mb-1.5 flex justify-between text-[12.5px] font-bold" style={{ color: RD.text }}><span>{label}</span><span style={{ color: RD.muted }}>{Math.round(config.shape[k] * 100)}</span></div>
      <input type="range" min={0} max={1} step={0.01} value={config.shape[k]} onChange={(e) => setShape(k, Number(e.target.value))} className="w-full accent-[#81B64C]" />
      <div className="flex justify-between text-[10.5px]" style={{ color: RD.muted }}><span>{left}</span><span>{right}</span></div>
    </label>
  );
  const swatches = (field: 'skinTone' | 'hairColor' | 'eyeColor' | 'beardColor' | 'glassesColor' | 'headwearColor' | 'extraColor' | 'outfitColor', colors: string[]) => (
    <div className="flex flex-wrap items-center gap-2">
      {colors.map((c) => <button key={c} aria-label={`Colour ${c}`} aria-pressed={config[field] === c} onClick={() => set(field, c)} className="h-8 w-8 rounded-full"
        style={{ background: c, boxShadow: config[field] === c ? `0 0 0 2px ${CARD}, 0 0 0 4px ${RD.green}` : `0 0 0 1px ${RD.border}` }} />)}
      <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full" title="Any colour" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
        <input type="color" value={config[field]} onChange={(e) => set(field, e.target.value)} className="absolute inset-0 opacity-0" />
      </label>
    </div>
  );
  const chip = (on: boolean) => ({ background: on ? RD.green : CARD_LIGHT, color: on ? '#06110A' : RD.text, border: `1px solid ${on ? RD.green : RD.border}` });
  const view = (v: View) => viewer.current?.view(v);

  return (
    <div className="mx-auto w-full max-w-[1400px]" style={{ color: RD.text }}>
      {/* top bar: characters and saving */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/profile" className="text-[13px] font-bold" style={{ color: RD.muted }}>← Profile</Link>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} aria-label="Character name"
          className="min-w-0 flex-1 rounded-xl px-3 py-2 text-[16px] font-extrabold outline-none sm:max-w-[260px]" style={{ background: CARD_LIGHT, border: `1px solid ${RD.border}`, color: RD.text }} />
        <button onClick={() => void doSave()} disabled={save.state === 'saving' || (!dirty && currentId != null)} className="rounded-xl px-4 py-2.5 text-[13px] font-extrabold"
          style={{ background: RD.green, color: '#06110A', opacity: save.state === 'saving' || (!dirty && currentId != null) ? 0.6 : 1 }}>
          {save.state === 'saving' ? 'Saving…' : !dirty && currentId != null ? 'Saved ✓' : currentId == null ? 'Save character' : 'Save changes'}
        </button>
      </div>
      {save.state === 'error' && <div role="alert" className="mb-3 rounded-xl px-4 py-2.5 text-[13px] font-bold" style={{ background: '#3a1416', color: '#ffb4b4', border: '1px solid #6b2a2e' }}>{save.msg}</div>}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {chars === null ? <span className="text-[12px]" style={{ color: RD.muted }}>Loading your characters…</span> : chars.map((c) => (
          <button key={c.id} onClick={() => openChar(c)} className="shrink-0 rounded-xl px-3 py-2 text-[12.5px] font-bold" style={chip(c.id === currentId)}>
            {c.isActive ? '★ ' : ''}{c.name}
          </button>
        ))}
        {currentId == null && chars !== null && <span className="shrink-0 rounded-xl px-3 py-2 text-[12.5px] font-bold" style={chip(true)}>{name} (new)</span>}
        <button onClick={newChar} className="shrink-0 rounded-xl px-3 py-2 text-[12.5px] font-bold" style={chip(false)}>＋ New</button>
        {currentId != null && <button onClick={duplicate} className="shrink-0 rounded-xl px-3 py-2 text-[12.5px] font-bold" style={chip(false)}>Duplicate</button>}
        {currentId != null && !chars?.find((c) => c.id === currentId)?.isActive && <button onClick={() => void makeActive()} className="shrink-0 rounded-xl px-3 py-2 text-[12.5px] font-bold" style={chip(false)}>★ Use as my avatar</button>}
        <button onClick={() => void remove()} className="shrink-0 rounded-xl px-3 py-2 text-[12.5px] font-bold" style={{ ...chip(false), color: '#ffb4b4' }}>Delete</button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
        {/* viewport */}
        <div className="relative flex flex-col overflow-hidden rounded-2xl lg:sticky lg:top-3 lg:h-[calc(100vh-150px)]" style={{ background: CARD, border: `1px solid ${RD.border}` }}>
          <div className="relative h-[56vh] min-h-[360px] lg:h-auto lg:min-h-0 lg:flex-1">
            <div ref={host} className="absolute inset-0" aria-label="3D character. Drag to turn, pinch or scroll to zoom." />
            <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 42%, transparent 52%, rgba(0,0,0,0.42) 100%)' }} />
            {vstate !== 'ready' && <div className="absolute inset-0 grid place-items-center px-6 text-center text-[13px]" style={{ background: CARD_LIGHT, color: RD.muted }}>
              {vstate === 'loading' ? 'Loading the 3D studio…' : 'This browser can’t show 3D (WebGL is turned off), so the studio can’t open here.'}</div>}
            {building && vstate === 'ready' && <div className="pointer-events-none absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: 'rgba(5,10,11,.75)', color: RD.text }}>Sculpting…</div>}
            {/* view and zoom */}
            <div className="absolute right-3 top-3 flex flex-col gap-1.5">
              <button onClick={() => viewer.current?.zoom(1)} aria-label="Zoom in" className="h-9 w-9 rounded-xl text-[18px] font-bold" style={chip(false)}>＋</button>
              <button onClick={() => viewer.current?.zoom(-1)} aria-label="Zoom out" className="h-9 w-9 rounded-xl text-[18px] font-bold" style={chip(false)}>－</button>
              <button onClick={() => viewer.current?.resetView()} aria-label="Reset view" className="h-9 w-9 rounded-xl text-[14px] font-bold" style={chip(false)}>⟲</button>
            </div>
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-end justify-between gap-2">
              <div className="flex gap-1.5">
                {([['front', 'Front'], ['three', '¾'], ['side', 'Side'], ['rear', 'Rear']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => view(v)} className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold" style={{ background: 'rgba(5,10,11,.78)', color: RD.text, border: `1px solid ${RD.border}` }}>{l}</button>
                ))}
              </div>
              <div className="flex gap-1.5">
                {BACKDROPS.map((b) => <button key={b.id} onClick={() => setBackdrop(b.id)} aria-label={`${b.label} backdrop`} className="h-7 w-7 rounded-full" style={{ background: b.css, boxShadow: backdrop === b.id ? `0 0 0 2px ${CARD}, 0 0 0 4px ${RD.green}` : `0 0 0 1px ${RD.border}` }} />)}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2.5" style={{ borderColor: RD.border }}>
            {EXPRESSIONS.map(([id, label]) => <button key={id} onClick={() => viewer.current?.playExpression(id)} className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold" style={chip(false)}>{label}</button>)}
            <span className="mx-1 h-5 w-px" style={{ background: RD.border }} />
            {LIGHTINGS.map((l) => <button key={l.id} onClick={() => setLighting(l.id)} className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold" style={chip(lighting === l.id)}>{l.label}</button>)}
            <button onClick={() => (live === 'on' ? stopLive() : void startLive())} className="ml-auto rounded-lg px-3 py-1.5 text-[11.5px] font-extrabold"
              style={live === 'on' ? { background: '#c0392b', color: '#fff' } : chip(false)}>
              {live === 'on' ? '● Live: tap to stop' : live === 'starting' ? 'Starting camera…' : '🎥 Try it live'}
            </button>
          </div>
          {live === 'on' && <p className="px-3 pb-2.5 text-[11.5px]" style={{ color: RD.muted }}>Your camera and mic drive the character on this device only. Nothing is recorded or sent.</p>}
          {live === 'failed' && <p className="px-3 pb-2.5 text-[11.5px]" style={{ color: '#ffb4b4' }}>Couldn’t start the camera or face tracking. Allow camera and microphone access and try again.</p>}
        </div>

        {/* editor */}
        <div className="rounded-2xl p-3" style={{ background: CARD, border: `1px solid ${RD.border}` }}>
          <nav className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {CATS.map((c) => <button key={c.id} onClick={() => setCat(c.id)} className="flex shrink-0 flex-col items-center rounded-xl px-2.5 py-2 text-[11px] font-bold" style={chip(cat === c.id)}>
              <span className="text-[18px] leading-none">{c.icon}</span><span className="mt-1">{c.label}</span></button>)}
          </nav>
          <div className="px-1">
            {cat === 'photo' && (<>
              <Section title="Start from a selfie">
                <p className="mb-3 text-[12.5px]" style={{ color: RD.muted }}>Your photo is measured on this device to match your face shape, skin, hair and facial hair. It isn’t uploaded.</p>
                <div className="flex flex-wrap gap-2">
                  <label className="cursor-pointer rounded-xl px-3 py-2.5 text-[12.5px] font-bold" style={chip(false)}>📷 Take a selfie<input type="file" accept="image/*" capture="user" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} /></label>
                  <label className="cursor-pointer rounded-xl px-3 py-2.5 text-[12.5px] font-bold" style={chip(false)}>🖼️ Upload a photo<input type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} /></label>
                </div>
                {photo && (
                  <div className="mt-3 flex items-center gap-3">
                    <img src={photo} alt="Your photo" className="h-24 w-24 rounded-xl object-cover" />
                    <div className="flex flex-col gap-2">
                      <button onClick={() => void matchPhoto()} disabled={photoState.state === 'working'} className="rounded-xl px-3 py-2.5 text-[13px] font-extrabold" style={{ background: RD.green, color: '#06110A' }}>
                        {photoState.state === 'working' ? 'Matching…' : '✨ Match my character to this photo'}
                      </button>
                      <button onClick={() => { setPhoto(null); photoBlob.current = null; setPhotoState({ state: 'idle' }); }} className="text-left text-[12px] underline" style={{ color: RD.muted }}>Remove photo</button>
                    </div>
                  </div>
                )}
                {photoState.state === 'error' && <p role="alert" className="mt-2 text-[12.5px] font-bold" style={{ color: '#ffb4b4' }}>{photoState.msg}</p>}
                {photoState.state === 'done' && <ul className="mt-2 list-disc pl-5 text-[12.5px]" style={{ color: RD.text }}>{photoState.notes?.map((n) => <li key={n}>{n}</li>)}</ul>}
                <p className="mt-3 text-[11.5px]" style={{ color: RD.muted }}>Coming later: an AI service that builds a fully personalised 3D model from your photo. It will ask before sending your photo anywhere.</p>
              </Section>
              <Section title="Or start from scratch">
                <button onClick={() => { setConfig(defaultAvatar); setSave({ state: 'idle' }); }} className="rounded-xl px-3 py-2.5 text-[12.5px] font-bold" style={chip(false)}>Reset to the default character</button>
              </Section>
            </>)}
            {cat === 'face' && <Section title="Face shape">
              {slider('Head width', 'headWidth', 'Narrow', 'Wide')}{slider('Head height', 'headHeight', 'Short', 'Long')}
              {slider('Jaw', 'jaw', 'Pointed', 'Square')}{slider('Chin', 'chin', 'Soft', 'Strong')}{slider('Cheeks', 'cheeks', 'Slim', 'Full')}
            </Section>}
            {cat === 'eyes' && (<>
              <Section title="Eyes">{slider('Size', 'eyeSize', 'Small', 'Big')}{slider('Spacing', 'eyeSpacing', 'Close', 'Wide')}{slider('Height', 'eyeHeight', 'Low', 'High')}</Section>
              <Section title="Eye colour">{swatches('eyeColor', EYE_SWATCHES)}</Section>
              <Section title="Eyebrows">{optionGrid('brows', BROWS)}{slider('Brow height', 'browHeight', 'Low', 'High')}</Section>
            </>)}
            {cat === 'nose' && <Section title="Nose">{slider('Size', 'noseSize', 'Small', 'Big')}{slider('Width', 'noseWidth', 'Narrow', 'Wide')}{slider('Length', 'noseLength', 'Short', 'Long')}</Section>}
            {cat === 'mouth' && <Section title="Mouth and lips">
              {slider('Width', 'mouthWidth', 'Narrow', 'Wide')}{slider('Lips', 'lipFullness', 'Thin', 'Full')}
              <label className="block py-2.5"><div className="mb-1.5 flex justify-between text-[12.5px] font-bold"><span>Lip colour</span><span style={{ color: RD.muted }}>{Math.round(config.lipTint * 100)}</span></div>
                <input type="range" min={0} max={1} step={0.01} value={config.lipTint} onChange={(e) => set('lipTint', Number(e.target.value))} className="w-full accent-[#81B64C]" /></label>
            </Section>}
            {cat === 'ears' && <Section title="Ears">{slider('Size', 'earSize', 'Small', 'Big')}</Section>}
            {cat === 'skin' && (<>
              <Section title="Skin tone">{swatches('skinTone', SKIN_SWATCHES)}</Section>
              <Section title="Details"><label className="flex items-center justify-between text-[13px] font-bold"><span>Freckles</span>
                <input type="checkbox" checked={config.freckles} onChange={(e) => set('freckles', e.target.checked)} className="h-5 w-5 accent-[#81B64C]" /></label></Section>
            </>)}
            {cat === 'hair' && (<>
              <Section title="Hairstyle">{optionGrid('hair', HAIR_STYLES)}</Section>
              <Section title="Hair colour">{swatches('hairColor', HAIR_SWATCHES)}</Section>
            </>)}
            {cat === 'facial' && (<>
              <Section title="Beard">{optionGrid('beard', BEARDS)}</Section>
              <Section title="Moustache">{optionGrid('mustache', MUSTACHES)}</Section>
              <Section title="Facial hair colour">{swatches('beardColor', HAIR_SWATCHES)}</Section>
            </>)}
            {cat === 'glasses' && (<>
              <Section title="Glasses">{optionGrid('glasses', GLASSES)}</Section>
              {config.glasses !== 'none' && <Section title="Frame colour">{swatches('glassesColor', ACCENT_SWATCHES)}</Section>}
            </>)}
            {cat === 'accessories' && (<>
              <Section title="Headwear">{optionGrid('headwear', HEADWEAR)}</Section>
              {config.headwear !== 'none' && <Section title="Headwear colour">{swatches('headwearColor', OUTFIT_SWATCHES)}</Section>}
              <Section title="Extras">{optionGrid('extra', EXTRAS)}</Section>
              {config.extra !== 'none' && <Section title="Extras colour">{swatches('extraColor', ACCENT_SWATCHES)}</Section>}
            </>)}
            {cat === 'outfit' && (<>
              <Section title="Outfit">{optionGrid('outfit', OUTFITS)}</Section>
              <Section title="Outfit colour">{swatches('outfitColor', OUTFIT_SWATCHES)}</Section>
            </>)}
          </div>
        </div>
      </div>
    </div>
  );
}
