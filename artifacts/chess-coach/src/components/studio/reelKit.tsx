// Shared pieces for the promo reel makers: the 9:16 frame size (clean view and
// MP4 renders fit the screen instead of being cut off on tall phones), the
// caption box with a Copy button, and the board look ("remix the board").
import { useRef, useState } from 'react';
import { Copy, Check, Shuffle } from 'lucide-react';
import { randomLook, lookLabel, type BoardLook } from '@/context/SettingsContext';

/** The 9:16 frame. Full screen (clean view / render) fits inside the screen whatever its shape. */
export function reelFrameSize(full: boolean): React.CSSProperties {
  return full
    ? { aspectRatio: '9 / 16', height: 'min(100dvh, calc(100vw * 16 / 9))', width: 'auto', maxWidth: '100vw', containerType: 'size' }
    : { aspectRatio: '9 / 16', height: 'min(78dvh, 820px)', maxWidth: '100%', containerType: 'size' };
}

/** A caption you can edit and copy in one tap. */
export function CaptionBox({ text, label = 'Caption' }: { text: string; label?: string }) {
  const [edit, setEdit] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const value = edit ?? text;
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); }
    catch { const t = document.createElement('textarea'); t.value = value; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* ignore */ } t.remove(); }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="rounded-lg bg-white/5 p-2.5 ring-1 ring-white/10">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-white/50">{label}</span>
        <div className="flex gap-1.5">
          {edit != null && edit !== text && <button onClick={() => setEdit(null)} className="rounded-md px-2 py-1 text-[11.5px] font-bold text-white/55">Reset</button>}
          <button onClick={() => void copy()} className="inline-flex items-center gap-1 rounded-md bg-[#81B64C] px-2.5 py-1 text-[12px] font-black text-white">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy caption'}</button>
        </div>
      </div>
      <textarea value={value} onChange={(e) => setEdit(e.target.value)} rows={Math.min(9, value.split('\n').length + 2)}
        className="w-full resize-y rounded-md bg-transparent text-[12.5px] leading-snug text-white/80 outline-none" />
    </div>
  );
}

// ── Board look ──────────────────────────────────────────────────────────────
/** mine = your own board; fixed = one random look; scene / move = a new look each scene / each move. */
export type ReelLook = { mode: 'mine' | 'fixed' | 'scene' | 'move'; look?: BoardLook | null };
export const REEL_LOOK_DEFAULT: ReelLook = { mode: 'mine' };

/** The look for the current scene or move (stable while that key stays the same). */
export function useReelLook(rl: ReelLook | undefined, sceneKey: string | number, moveKey: string | number): BoardLook | null {
  const cache = useRef(new Map<string, BoardLook>());
  const r = rl ?? REEL_LOOK_DEFAULT;
  if (r.mode === 'mine') return null;
  if (r.mode === 'fixed') return r.look ?? null;
  const k = `${r.mode}:${r.mode === 'scene' ? sceneKey : `${sceneKey}/${moveKey}`}`;
  let l = cache.current.get(k);
  if (!l) { l = randomLook(); cache.current.set(k, l); }
  return l;
}

export function LookPicker({ value, onChange }: { value: ReelLook | undefined; onChange: (v: ReelLook) => void }) {
  const v = value ?? REEL_LOOK_DEFAULT;
  const opts: [ReelLook['mode'], string][] = [['mine', 'My board'], ['fixed', 'One look'], ['scene', 'New each scene'], ['move', 'New every move']];
  return (
    <div className="space-y-1">
      <p className="text-[12px] text-white/60">Board look (remix)</p>
      <div className="flex flex-wrap items-center gap-1">
        {opts.map(([m, l]) => (
          <button key={m} onClick={() => onChange({ mode: m, look: m === 'fixed' ? (v.mode === 'fixed' && v.look ? v.look : randomLook()) : null })}
            className="rounded-md px-2 py-1 text-[11.5px] font-bold" style={{ background: v.mode === m ? '#81B64C' : 'rgba(255,255,255,.07)', color: '#fff' }}>{l}</button>
        ))}
        {v.mode === 'fixed' && <button onClick={() => onChange({ mode: 'fixed', look: randomLook() })} className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11.5px] font-bold"><Shuffle size={12} />Another</button>}
      </div>
      {v.mode === 'fixed' && v.look && <p className="text-[11px] text-white/45">{lookLabel(v.look)}</p>}
    </div>
  );
}
