// Avatar Studio editor: live 3D preview + manual customisation + a selfie reference photo.
// Self-contained: give it a starting config and an onSave that persists it.
// The selfie is a REFERENCE ONLY. It stays in this browser tab (never uploaded) and is not
// used to build the 3D model; that needs an AI reconstruction service that isn't added yet.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RD } from '@/lib/redesignTheme';
import {
  defaultAvatar, normalizeAvatarConfig, sameAvatar, HAIR_STYLES, SKIN_SWATCHES, HAIR_SWATCHES, EYE_SWATCHES, SHIRT_SWATCHES,
  type AvatarConfig,
} from '@/lib/avatarStudio/avatarConfig';
import { AvatarPreview } from '@/lib/avatarStudio/avatarPreview';

const CARD = '#0D1516', CARD_LIGHT = '#121B1D'; // solid dark cards
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  initialConfig?: AvatarConfig;
  onSave: (config: AvatarConfig) => Promise<void>;
}

export default function AvatarStudio({ initialConfig = defaultAvatar, onSave }: Props) {
  const [config, setConfig] = useState<AvatarConfig>(() => normalizeAvatarConfig(initialConfig));
  const [savedConfig, setSavedConfig] = useState<AvatarConfig>(() => normalizeAvatarConfig(initialConfig));
  const [tab, setTab] = useState<'face' | 'hair' | 'style'>('face');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [save, setSave] = useState<{ state: SaveState; message?: string }>({ state: 'idle' });
  const [preview, setPreview] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [talking, setTalking] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<AvatarPreview | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const update = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => { setConfig((old) => ({ ...old, [key]: value })); setSave({ state: 'idle' }); };
  const dirty = !sameAvatar(config, savedConfig);

  // 3D preview: created once, updated as the config changes
  useEffect(() => {
    let alive = true;
    const el = host.current; if (!el) return undefined;
    void AvatarPreview.create(el).then((v) => {
      if (!alive) { v?.dispose(); return; }
      if (!v) { setPreview('failed'); return; }
      viewer.current = v; v.setConfig(config); setPreview('ready');
    });
    return () => { alive = false; viewer.current?.dispose(); viewer.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { viewer.current?.setConfig(config); }, [config]);
  useEffect(() => { if (viewer.current) viewer.current.talking = talking; }, [talking]);

  // the reference photo lives only as an object URL; release it when replaced or on leaving
  const photoRef = useRef<string | null>(null);
  useEffect(() => { photoRef.current = photo; }, [photo]);
  useEffect(() => () => { if (photoRef.current) URL.revokeObjectURL(photoRef.current); }, []);
  const pickPhoto = (file?: File) => {
    setPhotoError(null);
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type) && !file.type.startsWith('image/')) { setPhotoError('Please choose a photo (JPG, PNG or WebP).'); return; }
    if (file.size > MAX_PHOTO_BYTES) { setPhotoError('That photo is over 10 MB. Please choose a smaller one.'); return; }
    const url = URL.createObjectURL(file);
    setPhoto((old) => { if (old) URL.revokeObjectURL(old); return url; });
  };
  const removePhoto = () => setPhoto((old) => { if (old) URL.revokeObjectURL(old); return null; });

  const doSave = async () => {
    setSave({ state: 'saving' });
    try {
      const clean = normalizeAvatarConfig(config);
      await onSave(clean);
      setSavedConfig(clean);
      setSave({ state: 'saved', message: 'Avatar saved' });
    } catch (e) {
      setSave({ state: 'error', message: e instanceof Error ? e.message : 'Couldn’t save your avatar. Please try again.' });
    }
  };
  const saveLabel = save.state === 'saving' ? 'Saving…' : save.state === 'saved' && !dirty ? 'Saved ✓' : 'Save avatar';

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-extrabold tracking-[.18em]" style={{ color: RD.muted }}>YOUR DIGITAL IDENTITY</div>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight md:text-[36px]" style={{ color: RD.text }}>Avatar Studio</h1>
          <p className="text-[13px]" style={{ color: RD.muted }}>Make a character that feels like you.</p>
        </div>
        <button onClick={() => void doSave()} disabled={save.state === 'saving'} className="rounded-xl px-4 py-3 text-[14px] font-extrabold"
          style={{ background: RD.green, color: '#06110A', opacity: save.state === 'saving' ? 0.7 : 1 }}>{saveLabel}</button>
      </header>
      {save.state === 'error' && <div role="alert" className="mb-3 rounded-xl px-4 py-3 text-[13px] font-bold" style={{ background: '#3a1416', color: '#ffb4b4', border: '1px solid #6b2a2e' }}>{save.message}</div>}
      {save.state === 'saved' && !dirty && <div role="status" className="mb-3 rounded-xl px-4 py-3 text-[13px] font-bold" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }}>✓ {save.message}. It’ll be here next time you open the studio.</div>}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)]">
        {/* preview */}
        <div className="overflow-hidden rounded-2xl" style={{ background: CARD, border: `1px solid ${RD.border}` }}>
          <div className="flex justify-between px-4 py-3 text-[10px] font-extrabold tracking-[.1em]" style={{ color: RD.muted }}>
            <span>LIVE PREVIEW</span><span style={{ color: RD.green }}>● 3D</span>
          </div>
          <div className="relative h-[340px] md:h-[480px]">
            <div ref={host} className="absolute inset-0" aria-label="3D avatar preview. Drag to rotate." />
            {preview !== 'ready' && (
              <div className="absolute inset-0 grid place-items-center px-6 text-center text-[13px]" style={{ background: CARD_LIGHT, color: RD.muted }}>
                {preview === 'loading' ? 'Loading 3D preview…' : 'This browser can’t show 3D (WebGL is turned off). You can still choose and save your avatar.'}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[12px]" style={{ color: RD.muted }}>
            <span>Drag to rotate · scroll or pinch to zoom</span>
            <button onClick={() => setTalking((v) => !v)} className="rounded-lg px-2.5 py-1 font-bold" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }}>
              {talking ? '■ Stop talking demo' : '▶ Talking demo'}
            </button>
          </div>
        </div>

        {/* editor */}
        <div className="rounded-2xl p-4" style={{ background: CARD, border: `1px solid ${RD.border}` }}>
          <div className="rounded-xl p-3.5" style={{ background: CARD_LIGHT }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <strong className="block text-[13px]" style={{ color: RD.text }}>Start with a selfie</strong>
                <small className="mt-1 block text-[11px]" style={{ color: RD.muted }}>A reference photo to copy from while you customise.</small>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => cameraInput.current?.click()} className="rounded-lg px-2.5 py-2 text-[11px] font-bold md:hidden" style={{ background: CARD, color: RD.text, border: `1px solid ${RD.border}` }}>Take selfie</button>
                <button onClick={() => fileInput.current?.click()} className="rounded-lg px-2.5 py-2 text-[11px] font-bold" style={{ background: CARD, color: RD.text, border: `1px solid ${RD.border}` }}>Upload photo</button>
              </div>
              <input ref={fileInput} hidden type="file" accept="image/*" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              <input ref={cameraInput} hidden type="file" accept="image/*" capture="user" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            {photoError && <p role="alert" className="mt-2 text-[12px] font-bold" style={{ color: '#ffb4b4' }}>{photoError}</p>}
            {photo && (
              <div className="mt-3 flex items-center gap-3">
                <img src={photo} alt="Your reference photo" className="h-20 w-20 rounded-lg object-cover" />
                <span className="text-[11.5px] leading-snug" style={{ color: RD.muted }}>
                  Reference photo only. It stays on this device and isn’t uploaded or turned into the 3D model: building an avatar from a photo automatically isn’t available yet.
                </span>
                <button onClick={removePhoto} aria-label="Remove photo" className="ml-auto text-[20px] leading-none" style={{ color: RD.muted }}>×</button>
              </div>
            )}
          </div>

          <nav className="mt-4 flex gap-1.5 border-b" style={{ borderColor: RD.border }}>
            {(['face', 'hair', 'style'] as const).map((name) => (
              <button key={name} onClick={() => setTab(name)} className="px-4 py-3 text-[13px] font-bold"
                style={{ color: tab === name ? RD.text : RD.muted, borderBottom: `2px solid ${tab === name ? RD.green : 'transparent'}` }}>
                {name === 'face' ? 'Face' : name === 'hair' ? 'Hair' : 'Style'}
              </button>
            ))}
          </nav>
          <div className="min-h-[240px] py-1">
            {tab === 'face' && (<>
              <Control title="Skin tone"><Swatches colors={SKIN_SWATCHES} value={config.skinTone} onChange={(v) => update('skinTone', v)} /></Control>
              <Control title="Eye colour"><Swatches colors={EYE_SWATCHES} value={config.eyeColor} onChange={(v) => update('eyeColor', v)} /></Control>
              <Toggle label="Glasses" value={config.glasses} onChange={(v) => update('glasses', v)} />
            </>)}
            {tab === 'hair' && (<>
              <Control title="Hairstyle">
                <div className="flex flex-wrap gap-2">
                  {HAIR_STYLES.map((v) => (
                    <button key={v} onClick={() => update('hairStyle', v)} className="rounded-lg px-3 py-2 text-[12px] font-bold"
                      style={config.hairStyle === v ? { background: RD.green, color: '#06110A' } : { background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }}>
                      {v[0].toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
              </Control>
              <Control title="Hair colour"><Swatches colors={HAIR_SWATCHES} value={config.hairColor} onChange={(v) => update('hairColor', v)} /></Control>
              <Toggle label="Facial hair" value={config.beard} onChange={(v) => update('beard', v)} />
            </>)}
            {tab === 'style' && (<>
              <Control title="Shirt colour"><Swatches colors={SHIRT_SWATCHES} value={config.shirtColor} onChange={(v) => update('shirtColor', v)} /></Control>
              <button onClick={() => { setConfig(defaultAvatar); setSave({ state: 'idle' }); }} className="mt-4 rounded-lg px-3 py-2 text-[12px] font-bold" style={{ background: CARD_LIGHT, color: RD.text, border: `1px solid ${RD.border}` }}>Reset to default</button>
            </>)}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: RD.border }}>
            <span className="text-[11.5px]" style={{ color: RD.muted }}>{dirty ? 'You have unsaved changes.' : 'More options can be added over time.'}</span>
            <button onClick={() => void doSave()} disabled={save.state === 'saving'} className="rounded-xl px-4 py-2.5 text-[13px] font-extrabold" style={{ background: RD.green, color: '#06110A' }}>
              {save.state === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Control({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b py-4" style={{ borderColor: RD.border }}>
      <h3 className="mb-3 text-[12px] font-extrabold" style={{ color: RD.text }}>{title}</h3>
      {children}
    </section>
  );
}

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {colors.map((color) => (
        <button key={color} aria-label={`Choose ${color}`} aria-pressed={value === color} onClick={() => onChange(color)} className="h-8 w-8 rounded-full"
          style={{ background: color, boxShadow: value === color ? `0 0 0 2px ${CARD}, 0 0 0 4px ${RD.green}` : `0 0 0 1px ${RD.border}` }} />
      ))}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-4 text-[13px] font-bold" style={{ color: RD.text }}>
      <span>{label}</span>
      <input type="checkbox" className="peer sr-only" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-6 w-11 rounded-full transition-colors" style={{ background: value ? RD.green : CARD_LIGHT, border: `1px solid ${RD.border}` }}>
        <span className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all" style={{ left: value ? 22 : 3 }} />
      </span>
    </label>
  );
}
