// The 3-day Pro trial, offered at most once a day to members who can still take it: a pawn walks
// across three "days" and promotes to a queen, then the offer. Not a paywall: it shows
// once a day, closes with "Maybe later", and stops for good once they start the trial.
import { claimPopup, isNewMember, popupClosed } from '@/lib/popupGate';
import { VALUE_EVENT, type ValueMoment } from '@/lib/valueMoment';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Crown, X, Loader2 } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { apiFetch, apiFetchLocal } from '@/lib/api';
import { STUDIO_FRAME } from '@/lib/studioFrame';

// v2: the first version kept the offer hidden for 3 seconds behind its animation, so
// nearly everyone closed it unseen; members who didn't start get the fixed one once.
const SEEN = (uid: string) => `cs_trial_promo_v2:${uid}`;
const EVERY_MS = 3 * 24 * 60 * 60_000; // every few days, only after a review or a finished game
/** Shown in the last couple of minutes (the notifications nudge waits its turn). */
export const PROMO_OPEN_KEY = 'cs_promo_open_at';
// Places it would get in the way (sign-up, checkout, the free review page, the studio)
const SKIP = /^\/(setup|login|signup|subscription|pricing|review|admin|kids|embed)(\/|$)/;

const FEATURES = [
  'Your coach on every game you review',
  'Courses built from your own mistakes',
  'Deep weakness analysis across your games',
  'Coach scouting reports on any opponent',
];

type Price = { id: string; unit_amount: number; recurring?: { interval?: string } };
const track = (event: 'shown' | 'start' | 'dismiss' | 'checkout_failed') => {
  apiFetch('/api/trial/track', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }) }).catch(() => {});
};

export function TrialPromo() {
  const { authUser, isPremium, isSubscriptionLoaded } = useUser();
  const [path] = useLocation();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(3);
  const [price, setPrice] = useState<Price | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Only right after something worth having: the end of a game review, or a game played
  // here (live or against a practice bot). Never on its own, never mid-task.
  const [moment, setMoment] = useState<{ kind: ValueMoment; at: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setMoment({ kind: (e as CustomEvent<ValueMoment>).detail, at: Date.now() });
    window.addEventListener(VALUE_EVENT, on);
    return () => window.removeEventListener(VALUE_EVENT, on);
  }, []);
  const pathRef = useRef(path); pathRef.current = path;
  useEffect(() => {
    if (!moment) return;
    const path = pathRef.current;
    if (!authUser || !isSubscriptionLoaded || isPremium || open) return;
    if (isNewMember(authUser as never)) return; // not in their first days
    if (STUDIO_FRAME || window.self !== window.top || SKIP.test(path)) return;
    let seen = false;
    try { const at = Number(localStorage.getItem(SEEN(authUser.id)) || 0); seen = !!at && Date.now() - at < EVERY_MS; } catch { /* storage off */ }
    if (seen) return;
    let gone = false;
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch('/api/stripe/trial-offer', { credentials: 'include' });
        const d = r.ok ? await r.json() : null;
        if (gone || !d?.eligible || document.visibilityState !== 'visible') return;
        if (!claimPopup('pro_offer', authUser as never)) return;
        setDays(Number(d.days) || 3);
        try { localStorage.setItem(SEEN(authUser.id), String(Date.now())); localStorage.setItem(PROMO_OPEN_KEY, String(Date.now())); } catch { /* storage off */ }
        setOpen(true);
        track('shown');
        const p = await apiFetchLocal('/api/stripe/products').then((x) => (x.ok ? x.json() : null)).catch(() => null);
        const monthly = (p?.data?.[0]?.prices as Price[] | undefined)?.find((x) => x.recurring?.interval === 'month');
        if (!gone && monthly) setPrice(monthly);
      } catch { /* try again next visit */ }
    }, moment.kind === 'review' ? 1200 : 900);
    return () => { gone = true; clearTimeout(t); };
  }, [moment]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const close = () => { track('dismiss'); popupClosed('pro_offer'); setOpen(false); };
  const start = async () => {
    track('start');
    setBusy(true); setErr('');
    try {
      // The price hadn't loaded yet: get it now (this used to send them to the subscription
      // page instead, where most never tapped again).
      let p = price;
      if (!p) {
        const d = await apiFetchLocal('/api/stripe/products').then((x) => (x.ok ? x.json() : null)).catch(() => null);
        p = (d?.data?.[0]?.prices as Price[] | undefined)?.find((x) => x.recurring?.interval === 'month') ?? null;
        if (p) setPrice(p);
      }
      if (!p) { track('checkout_failed'); window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/subscription?offer=trial&from=promo`; return; }
      const r = await apiFetch('/api/stripe/checkout-trial', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: p.id, source: 'promo' }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.url) { window.location.href = d.url; return; }
      track('checkout_failed');
      setErr(d.error || 'Couldn’t start the free trial. Please try again.');
    } catch { track('checkout_failed'); setErr('Connection error. Please try again.'); }
    setBusy(false);
  };
  const after = price ? `then $${(price.unit_amount / 100).toFixed(price.unit_amount % 100 ? 2 : 0)}/month` : 'then Pro’s monthly price';

  return (
    <div className="tp-veil fixed inset-0 z-[90] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={`Try Pro free for ${days} days`}>
      <style>{CSS}</style>
      <div className="tp-card relative w-full max-w-[420px] overflow-hidden rounded-[24px]">
        <button onClick={close} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full" style={{ background: 'rgba(255,255,255,.06)', color: '#87918E' }}>
          <X size={18} />
        </button>

        {/* The scene: three days, a pawn walking to promotion */}
        <div className="tp-scene relative">
          <div className="tp-glow" />
          <div className="tp-board">
            {[1, 2, 3].map((d) => (
              <div key={d} className={`tp-sq tp-sq${d}`}>
                <span className="tp-day">Day {d}</span>
              </div>
            ))}
            <span className="tp-pawn" aria-hidden="true">{"\u265F\uFE0E"}</span>
            <span className="tp-queen" aria-hidden="true">{"\u265B\uFE0E"}</span>
            <span className="tp-ring" aria-hidden="true" />
            <span className="tp-ring tp-ring2" aria-hidden="true" />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <span key={i} className="tp-spark" style={{ ['--a' as string]: `${i * 45}deg` }} aria-hidden="true" />)}
          </div>
          <span className="tp-badge"><Crown size={13} /> PRO</span>
        </div>

        <div className="px-6 pb-6 pt-1 text-center">
          <p className="tp-in text-[11.5px] font-extrabold uppercase tracking-[.2em]" style={{ color: '#E8B447', animationDelay: '.1s' }}>
            {moment?.kind === 'review' ? 'Nice review · Free trial' : moment ? 'Good game · Free trial' : 'New · Free trial'}
          </p>
          <h2 className="tp-in mt-1.5 text-[28px] font-extrabold leading-[1.1] tracking-tight" style={{ color: '#F5F7F6', animationDelay: '.16s' }}>
            {days} days of Pro,<br />on us
          </h2>
          <ul className="mt-4 grid gap-2 text-left">
            {FEATURES.map((f, i) => (
              <li key={f} className="tp-in flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-[14px] font-semibold" style={{ background: '#121B1D', border: '1px solid rgba(255,255,255,.06)', color: '#E6EBE9', animationDelay: `${0.24 + i * 0.07}s` }}>
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black" style={{ background: '#81B64C', color: '#0B1213' }}>✓</span>
                {f}
              </li>
            ))}
          </ul>
          <button onClick={start} disabled={busy} className="tp-in tp-cta mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-[16px] font-extrabold disabled:opacity-70" style={{ animationDelay: '.5s' }}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Crown size={18} /> Start my {days} free days</>}
          </button>
          {err && <p className="mt-2 text-[12.5px]" style={{ color: '#FF9DA2' }}>{err}</p>}
          <p className="tp-in mt-3 text-[12px] leading-snug" style={{ color: '#87918E', animationDelay: '.56s' }}>
            Card required to start. You won’t be charged for {days} days, {after}. Cancelling during the trial ends Pro right away.
          </p>
          <button onClick={close} className="tp-in mt-2 text-[13.5px] font-bold" style={{ color: '#AEB6B3', animationDelay: '.6s' }}>Maybe later</button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.tp-veil { background: rgba(3,6,7,.8); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); animation: tpFade .35s ease both; }
.tp-card { background: #0D1516; border: 1px solid rgba(255,255,255,.08); box-shadow: 0 30px 80px -20px rgba(0,0,0,.8); animation: tpRise .5s cubic-bezier(.2,.9,.3,1.2) both; max-height: calc(100dvh - 32px); overflow-y: auto; }
.tp-scene { height: 190px; display: grid; place-items: center; background: radial-gradient(120% 90% at 50% 100%, #142224 0%, #0D1516 70%); }
.tp-glow { position: absolute; left: 50%; top: 58%; width: 220px; height: 120px; transform: translate(-50%,-50%); border-radius: 50%; background: radial-gradient(closest-side, rgba(232,180,71,.0), rgba(232,180,71,0)); animation: tpGlow 1.2s ease 1.9s both; }
.tp-board { position: relative; display: flex; gap: 0; border-radius: 10px; overflow: visible; box-shadow: 0 14px 30px -10px rgba(0,0,0,.7); }
.tp-sq { width: 76px; height: 76px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 5px; opacity: 0; animation: tpSq .4s ease both; }
.tp-sq1 { background: #E9D5AE; border-radius: 10px 0 0 10px; animation-delay: .2s; }
.tp-sq2 { background: #B58863; animation-delay: .32s; }
.tp-sq3 { background: #E9D5AE; border-radius: 0 10px 10px 0; animation-delay: .44s; }
.tp-day { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: rgba(11,18,19,.55); }
.tp-sq2 .tp-day { color: rgba(255,255,255,.7); }
.tp-pawn, .tp-queen { position: absolute; top: 4px; width: 76px; text-align: center; font-size: 50px; line-height: 60px; pointer-events: none; }
.tp-pawn { left: 0; color: #F5F7F6; text-shadow: 0 3px 0 #0B1213, 0 6px 14px rgba(0,0,0,.5); -webkit-text-stroke: 1.5px #0B1213; animation: tpWalk 1.5s ease .6s both; }
.tp-queen { left: 152px; color: #E8B447; -webkit-text-stroke: 1.5px #5A3F0A; text-shadow: 0 0 18px rgba(232,180,71,.75), 0 4px 0 #5A3F0A; opacity: 0; transform: scale(.3); animation: tpPromote .6s cubic-bezier(.2,.9,.3,1.4) 2.05s both, tpBob 2.4s ease-in-out 2.8s infinite; }
.tp-ring { position: absolute; left: 190px; top: 34px; width: 10px; height: 10px; margin: -5px; border-radius: 50%; border: 2px solid rgba(232,180,71,.9); opacity: 0; animation: tpRing .9s ease-out 2.05s both; }
.tp-ring2 { animation-delay: 2.2s; border-color: rgba(129,182,76,.8); }
.tp-spark { position: absolute; left: 190px; top: 34px; width: 6px; height: 6px; margin: -3px; border-radius: 50%; background: #E8B447; opacity: 0; animation: tpSpark .8s ease-out 2.1s both; }
.tp-badge { position: absolute; top: 18px; left: 50%; display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 900; letter-spacing: .1em; color: #0B1213; background: linear-gradient(180deg,#F2C55E,#D69E2E); transform: translateX(-50%) scale(.4); opacity: 0; animation: tpBadge .5s cubic-bezier(.2,.9,.3,1.5) 2.35s both; }
.tp-in { opacity: 0; animation: tpUp .45s ease both; }
.tp-cta { color: #fff; background: linear-gradient(180deg,#81B64C,#5F8F36); box-shadow: 0 12px 28px -10px rgba(129,182,76,.65); }
.tp-cta:not(:disabled) { animation: tpUp .45s ease both, tpPulse 2.4s ease-in-out 1.6s infinite; }
@keyframes tpFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes tpRise { from { opacity: 0; transform: translateY(26px) scale(.96) } to { opacity: 1; transform: none } }
@keyframes tpSq { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
@keyframes tpWalk {
  0% { transform: translate(0,0); opacity: 1 }
  14% { transform: translate(38px,-26px) } 28% { transform: translate(76px,0) }
  44% { transform: translate(76px,0) }
  58% { transform: translate(114px,-26px) } 72% { transform: translate(152px,0); opacity: 1 }
  88% { transform: translate(152px,0) scale(1.1); opacity: 1 }
  100% { transform: translate(152px,0) scale(.4); opacity: 0 }
}
@keyframes tpPromote { from { opacity: 0; transform: scale(.3) rotate(-12deg) } to { opacity: 1; transform: scale(1) } }
@keyframes tpBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
@keyframes tpRing { 0% { opacity: 0; transform: scale(1) } 4% { opacity: .95 } 100% { opacity: 0; transform: scale(14) } }
@keyframes tpSpark { 0% { opacity: 0; transform: rotate(var(--a)) translateX(0) } 4% { opacity: 1 } 100% { opacity: 0; transform: rotate(var(--a)) translateX(62px) } }
@keyframes tpGlow { to { background: radial-gradient(closest-side, rgba(232,180,71,.22), rgba(232,180,71,0)) } }
@keyframes tpBadge { from { opacity: 0; transform: translateX(-50%) scale(.4) } to { opacity: 1; transform: translateX(-50%) scale(1) } }
@keyframes tpUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
@keyframes tpPulse { 0%,100% { box-shadow: 0 12px 28px -10px rgba(129,182,76,.65) } 50% { box-shadow: 0 12px 34px -6px rgba(129,182,76,.95) } }
@media (prefers-reduced-motion: reduce) {
  .tp-veil, .tp-card, .tp-sq, .tp-in, .tp-cta, .tp-badge, .tp-queen { animation: none !important; opacity: 1 !important; transform: none !important; }
  .tp-badge { transform: translateX(-50%) !important; }
  .tp-pawn, .tp-ring, .tp-spark { display: none; }
}
`;
