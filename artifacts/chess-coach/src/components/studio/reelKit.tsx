// Shared pieces for the promo reel makers: the 9:16 frame size (clean view and
// MP4 renders fit the screen instead of being cut off on tall phones), the
// caption box with a Copy button, and the board look ("remix the board").
import { useEffect, useRef, useState } from 'react';
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
          <button onClick={() => void copy()} className="inline-flex items-center gap-1 rounded-md bg-[#81B64C] px-2.5 py-1 text-[12px] font-black text-white">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button>
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

// ── Engagement: one-tap comment prompts, share lines, pinned comments ──────
// Strangers rarely type chess notation mid-scroll; a one-tap answer (an emoji, a
// colour, a number) still counts as a comment. Pick one per reel; it shows on
// screen and leads the caption.
export type EngageKind = 'puzzle' | 'trap' | 'opening' | 'crowd' | 'promo';
export const ENGAGE_PROMPTS: { text: string; kinds: EngageKind[] }[] = [
  { text: 'Got it? Comment ✅ or ❌', kinds: ['puzzle', 'trap'] },
  { text: 'Comment 🔥 if you saw it', kinds: ['puzzle', 'trap'] },
  { text: 'Comment your move 👇', kinds: ['puzzle', 'crowd'] },
  { text: 'What would you play? 👇', kinds: ['puzzle', 'crowd', 'opening'] },
  { text: 'Most-liked comment gets played 👇', kinds: ['crowd'] },
  { text: 'White or Black? Who’s winning? 👇', kinds: ['crowd', 'trap', 'opening'] },
  { text: 'Rate yourself 1–10 👇', kinds: ['opening', 'puzzle'] },
  { text: 'Have you fallen for this? 👇', kinds: ['trap'] },
  { text: 'Which trap should we do next? 👇', kinds: ['trap'] },
  { text: 'Which would you try first? 👇', kinds: ['promo'] },
  { text: 'Tag a friend who falls for this 👀', kinds: ['trap', 'puzzle', 'opening'] },
  { text: 'Send this to your chess friend 👀', kinds: ['trap', 'puzzle', 'opening', 'promo', 'crowd'] },
  { text: '🔖 Save it for your next game', kinds: ['trap', 'opening'] },
  { text: 'Follow to play the next move 👇', kinds: ['crowd'] },
];

/** Pick a one-tap engagement line (or write your own). */
export function EngagePicker({ value, onChange, kind, label = 'Engagement line (on screen + first line of the caption)' }: { value: string | undefined; onChange: (v: string) => void; kind: EngageKind; label?: string }) {
  const list = ENGAGE_PROMPTS.filter((p) => p.kinds.includes(kind));
  return (
    <div className="space-y-1">
      <p className="text-[12px] text-white/60">{label}</p>
      <div className="flex flex-wrap gap-1">
        {list.map((p) => (
          <button key={p.text} onClick={() => onChange(p.text)} className="rounded-md px-2 py-1 text-left text-[11.5px] font-bold"
            style={{ background: value === p.text ? '#81B64C' : 'rgba(255,255,255,.07)', color: '#fff' }}>{p.text}</button>
        ))}
        <button onClick={() => onChange('')} className="rounded-md px-2 py-1 text-[11.5px] font-bold text-white/55" style={{ background: !value ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.04)' }}>None</button>
      </div>
      <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="…or write your own"
        className="w-full rounded-lg bg-white/5 px-3 py-1.5 text-[13px] font-bold text-white ring-1 ring-white/10" />
    </div>
  );
}

/** The engagement line as a pill near the bottom of the frame (end of the reel). */
export function EngageOverlay({ text, show }: { text?: string; show: boolean }) {
  if (!text || !show) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[7.5cqh] z-40 flex justify-center px-[5cqw]">
      <span className="rounded-full px-[4.5cqw] py-[1.2cqh] text-center font-black leading-tight shadow-2xl"
        style={{ fontSize: '2.8cqh', background: '#81B64C', color: '#fff', animation: 'csEngagePop .45s cubic-bezier(.2,1.4,.4,1) both' }}>{text}</span>
      <style>{'@keyframes csEngagePop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}'}</style>
    </div>
  );
}

/** The caption with the engagement line first (where it shows under the reel). */
export const withEngage = (engage: string | undefined, caption: string) => (engage ? `${engage}\n${caption}` : caption);

/** A pinned comment to post yourself right after the reel goes up. */
export function PinnedBox({ text }: { text: string }) {
  return <CaptionBox key={text} text={text} label="Pinned comment (post it, then pin it)" />;
}
/** "Answer 👇" with the answer pushed out of sight, so people tap to see it. */
export const hiddenAnswer = (answer: string) => `Answer 👇 (don't peek)\n.\n.\n.\n.\n.\n${answer}`;

// ── Back button ─────────────────────────────────────────────────────────────
// The makers open over the Content Studio without changing the page address, so
// the phone's back button used to leave the Studio (to the home page). While a
// maker is open it now adds a history step, and back just closes the maker.
export function useBackToClose(onClose: () => void, active = true) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const id = `cs${Math.random().toString(36).slice(2)}`;
    const prev = (window.history.state ?? {}) as Record<string, unknown>;
    window.history.pushState({ ...prev, csOverlay: id }, '');
    let popped = false;
    const onPop = () => { popped = true; ref.current(); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Closed with the X: take our history step back off.
      if (!popped && (window.history.state as Record<string, unknown> | null)?.csOverlay === id) window.history.back();
    };
  }, [active]);
}
