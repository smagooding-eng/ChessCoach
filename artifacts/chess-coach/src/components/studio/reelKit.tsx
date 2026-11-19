// Shared pieces for the promo reel makers: the 9:16 frame size (clean view and
// MP4 renders fit the screen instead of being cut off on tall phones), the
// caption box with a Copy button, and the board look ("remix the board").
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Shuffle } from 'lucide-react';
import { randomLook, lookLabel, BOARD_TEXTURES, type BoardLook } from '@/context/SettingsContext';
import { pieceImageUrls } from '@/components/RecoloredPieces';

/** The 9:16 frame. Full screen (clean view / render) fits inside the screen whatever its shape. */
export function reelFrameSize(full: boolean): React.CSSProperties {
  return full
    ? { aspectRatio: '9 / 16', height: 'min(100dvh, calc(100vw * 16 / 9))', width: 'auto', maxWidth: '100vw', containerType: 'size' }
    : { aspectRatio: '9 / 16', height: 'min(78dvh, 820px)', maxWidth: '100%', containerType: 'size' };
}

/** A caption you can edit and copy in one tap. */
// Every reel's caption asks for a comment, and an automatic DM sends the link (set up once
// in Buzzfy / Instagram: keyword REVIEW → the Instagram page). A link in a DM gets tapped far
// more than "link in bio", and it opens the page made for Instagram visitors.
export const DM_KEYWORD = 'REVIEW';
export const DM_LINK = 'https://chessscout.net/instagram?utm_source=instagram&utm_medium=dm&utm_campaign=comment_dm';
const DM_CTA = `💬 Comment ${DM_KEYWORD} and I'll DM you the free link`;
export const FIRST_COMMENT = `Want this for your own games? Comment ${DM_KEYWORD} 👇 and I'll send you the link. Free reviews of your Chess.com and Lichess games.`;
/** The caption with the comment-for-the-link line, right after the first paragraph. */
export const withDmCta = (caption: string) => {
  if (caption.includes(`Comment ${DM_KEYWORD}`)) return caption;
  const parts = caption.split('\n\n');
  parts.splice(Math.min(1, parts.length), 0, DM_CTA);
  return parts.join('\n\n');
};

export function CaptionBox({ text: raw, label = 'Caption', firstComment = true }: { text: string; label?: string; firstComment?: boolean }) {
  const isCaption = label === 'Caption';
  const text = isCaption ? withDmCta(raw) : raw;
  return (
    <>
      <CopyBox text={text} label={label} />
      {isCaption && firstComment && <div className="mt-2"><CopyBox text={FIRST_COMMENT} label="First comment (post it, then pin it)" /></div>}
    </>
  );
}

function CopyBox({ text, label }: { text: string; label: string }) {
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

// A look is only shown once its pictures (photo board, textures, piece sprites) have
// loaded: switching to one that hadn't showed an empty board or no pieces for a moment.
const loadedUrls = new Set<string>();
const keepDecoded: HTMLImageElement[] = [];
function lookUrls(l: BoardLook): string[] {
  const tex = BOARD_TEXTURES[l.boardTexture];
  const urls: string[] = [];
  if (tex?.boardImage) urls.push(tex.boardImage);
  for (const css of [tex?.backgroundImage, tex?.backgroundImageDark]) {
    for (const m of (css ?? '').matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) urls.push(m[1]);
  }
  return [...urls, ...pieceImageUrls(l.pieceShape)];
}
function loadUrl(url: string): Promise<void> {
  if (loadedUrls.has(url)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { void (img.decode?.() ?? Promise.resolve()).catch(() => {}).finally(() => { loadedUrls.add(url); keepDecoded.push(img); resolve(); }); };
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });
}
const prepareLook = (l: BoardLook) => Promise.all(lookUrls(l).map(loadUrl)).then(() => undefined);

/** The look for the current scene or move (stable while that key stays the same). New
 *  looks are got ready in the background; until the next one is ready the board keeps
 *  the one before, so it never shows half-loaded. */
export function useReelLook(rl: ReelLook | undefined, sceneKey: string | number, moveKey: string | number): BoardLook | null {
  const cache = useRef(new Map<string, BoardLook>());
  const ready = useRef<BoardLook[]>([]);
  const pending = useRef(0);
  const last = useRef<BoardLook | null>(null);
  const alive = useRef(true);
  const [, bump] = useState(0);
  const r = rl ?? REEL_LOOK_DEFAULT;
  const cycling = r.mode === 'scene' || r.mode === 'move';

  const topUp = () => {
    while (ready.current.length + pending.current < 4) {
      const l = randomLook();
      pending.current++;
      prepareLook(l)
        .then(() => { if (alive.current) { ready.current.push(l); bump((n) => n + 1); } })
        .catch(() => { /* a picture that won't load: skip that look */ })
        .finally(() => { pending.current--; if (alive.current) setTimeout(topUp, 0); });
    }
  };
  useEffect(() => {
    alive.current = true;
    if (cycling) topUp();
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycling]);
  const fixedLook = r.mode === 'fixed' ? r.look ?? null : null;
  useEffect(() => { if (fixedLook) void prepareLook(fixedLook).catch(() => {}); }, [fixedLook]);

  if (r.mode === 'mine') return null;
  if (r.mode === 'fixed') return fixedLook;
  const k = `${r.mode}:${r.mode === 'scene' ? sceneKey : `${sceneKey}/${moveKey}`}`;
  let l = cache.current.get(k);
  if (!l && ready.current.length) {
    l = ready.current.shift()!;
    cache.current.set(k, l);
    setTimeout(topUp, 0);
  }
  if (l) last.current = l;
  return last.current;
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

// ── Follow end card ─────────────────────────────────────────────────────────
// Every promo ends on the same 2.6-second card: follow, and the free AI game review
// link. It plays after the reel's own ending (in previews and MP4 renders).
export const FOLLOW_END_MS = 2600;
export const FOLLOW_HANDLE = '@chessscout.net3';
export const FREE_REVIEW_LINE = 'Free review of your game';
export const FREE_REVIEW_URL = 'chessscout.net/review';

/** play() calls end.reset() when it starts and end.finish(onDone) where it used to call onDone. */
export function useFollowEnd() {
  const [on, setOn] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return {
    on,
    reset: () => { if (t.current) clearTimeout(t.current); t.current = null; setOn(false); },
    finish: (onDone?: () => void) => { setOn(true); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => { t.current = null; onDone?.(); }, FOLLOW_END_MS); },
  };
}

/** The card itself, over the whole 9:16 frame (place it inside the frame element). */
export function FollowEndCard({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div key="followEnd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
          className="pointer-events-none absolute inset-0 z-[60] grid place-items-center" style={{ background: 'radial-gradient(ellipse at 50% 35%, #15301F 0%, #050A0B 70%)' }}>
          <motion.div initial={{ scale: 0.75, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="px-[8%] text-center">
            <motion.img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="" initial={{ rotate: -25, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.05 }}
              className="mx-auto mb-[2cqh] drop-shadow-2xl" style={{ width: '13cqh', height: '13cqh' }} />
            <p className="font-black leading-[1.05] text-white" style={{ fontSize: '5.4cqh' }}>Follow for more chess ♟️</p>
            <motion.p animate={{ scale: [1, 1.07, 1] }} transition={{ duration: 1.1, repeat: Infinity, delay: 0.5 }}
              className="mx-auto mt-[2.2cqh] w-fit rounded-full px-[1.1em] py-[0.4em] font-black text-white ring-2 ring-white"
              style={{ fontSize: '2.8cqh', background: 'linear-gradient(180deg,#9BCB62,#81B64C 55%,#5F8F36)', boxShadow: '0 0.2em 0 #3E6420, 0 0.5em 1.4em rgba(0,0,0,.45)' }}>Follow {FOLLOW_HANDLE}</motion.p>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="mt-[4cqh]">
              <p className="font-extrabold text-white/90" style={{ fontSize: '2.7cqh' }}>{FREE_REVIEW_LINE} 👇</p>
              <p className="mt-[0.6cqh] font-black" style={{ fontSize: '3.3cqh', color: '#B8E08C' }}>{FREE_REVIEW_URL}</p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
