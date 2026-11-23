// Game alerts: a notification the moment a member's Chess.com / Lichess game is reviewed
// (the move that decided it). Asked for in the board set-up card, and again after every 5th
// game review while they're still off. Without notifications we email instead (see
// samedayNotify on the server: after the session, at most once a day).
import { claimPopup, popupClosed } from '@/lib/popupGate';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { useUser } from '@/hooks/use-user';
import { STUDIO_FRAME } from '@/lib/studioFrame';

const G = '#81B64C', TEXT = '#F5F7F6', MUTED = '#87918E', INNER = '#121B1D', LINE = 'rgba(255,255,255,.08)';
export const REVIEW_SEEN = 'cs:review-seen';
export const GAME_ALERTS_WHY = 'Get a notification the moment your Chess.com or Lichess game is reviewed: the move that decided it, while the game is still fresh.';

/** Turn on / on / blocked, for the set-up card and the prompt. */
export function GameAlertsRow({ compact = false }: { compact?: boolean }) {
  const p = usePushNotifications();
  const on = p.permission === 'granted' && p.isSubscribed;
  if (p.permission === 'unsupported') {
    return (
      <div className="rounded-[14px] p-3" style={{ background: INNER, border: `1px solid ${LINE}` }}>
        <b className="block text-[13.5px]" style={{ color: TEXT }}>Game alerts</b>
        <small className="block text-[11.5px] leading-snug" style={{ color: MUTED }}>
          This browser can’t show notifications{/iPhone|iPad/.test(navigator.userAgent) ? ' unless ChessScout is on your Home Screen (Share › Add to Home Screen)' : ''}. We’ll email you your game reviews instead.
        </small>
      </div>
    );
  }
  return (
    <div className="rounded-[14px] p-3" style={{ background: INNER, border: `1px solid ${LINE}` }}>
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[17px]" style={{ background: '#1A2224' }} aria-hidden="true">🔔</span>
        <span className="min-w-0 flex-1">
          <b className="block text-[13.5px]" style={{ color: TEXT }}>Game alerts</b>
          {!compact && <small className="block text-[11.5px] leading-snug" style={{ color: MUTED }}>{GAME_ALERTS_WHY}</small>}
        </span>
        {on
          ? <span className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-black" style={{ background: G, color: '#06110A' }}>✓ On</span>
          : <button type="button" disabled={p.loading} onClick={() => { void p.subscribe(); }}
              className="shrink-0 rounded-[10px] px-3 py-2 text-[12px] font-black disabled:opacity-60" style={{ background: G, color: '#06110A' }}>{p.loading ? 'Turning on…' : 'Turn on'}</button>}
      </div>
      {!on && p.error && <p className="mt-2 text-[11px] leading-snug" style={{ color: '#E8A23A' }}>{p.error}</p>}
      {!on && !p.error && <p className="mt-2 text-[11px]" style={{ color: MUTED }}>No notifications? We’ll email you instead, at most once a day.</p>}
    </div>
  );
}

/** After every 5th game they review, if alerts are still off: a short ask from the bottom. */
export function ReviewAlertsPrompt() {
  const { authUser } = useUser();
  const p = usePushNotifications();
  const [open, setOpen] = useState(false);
  const state = useRef({ on: false, denied: false, supported: true });
  state.current = { on: p.permission === 'granted' && p.isSubscribed, denied: p.permission === 'denied', supported: p.permission !== 'unsupported' };
  const uid = authUser?.id;
  const authUserRef = useRef(authUser); authUserRef.current = authUser;
  const closeAsk = () => { popupClosed('review_alerts'); setOpen(false); };
  useEffect(() => {
    if (!uid || STUDIO_FRAME || window.self !== window.top) return undefined;
    const key = `cs_reviews_seen:${uid}`, due = `cs_alerts_ask_due:${uid}`;
    let t: number | undefined;
    const onSeen = (e: Event) => {
      const id = String((e as CustomEvent<string>).detail ?? '');
      if (!id) return;
      let seen: string[] = [];
      try { seen = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* */ }
      if (!seen.includes(id)) {
        seen.push(id);
        try { localStorage.setItem(key, JSON.stringify(seen.slice(-200))); } catch { /* */ }
        if (seen.length % 5 === 0) try { localStorage.setItem(due, '1'); } catch { /* */ }
      }
      let isDue = false;
      try { isDue = localStorage.getItem(due) === '1'; } catch { /* */ }
      const s = state.current;
      if (!isDue || s.on || s.denied || !s.supported) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        // not on top of the Pro offer: wait for the next review instead
        try { if (Date.now() - Number(localStorage.getItem('cs_promo_open_at') || 0) < 2 * 60_000) return; } catch { /* */ }
        if (!claimPopup('review_alerts', authUserRef.current as never)) return; // stays due for the next review
        try { localStorage.removeItem(due); } catch { /* */ }
        setOpen(true);
      }, 2500);
    };
    window.addEventListener(REVIEW_SEEN, onSeen);
    return () => { window.removeEventListener(REVIEW_SEEN, onSeen); window.clearTimeout(t); };
  }, [uid]);
  useEffect(() => { if (open && p.permission === 'granted' && p.isSubscribed) { const t = setTimeout(() => setOpen(false), 1200); return () => clearTimeout(t); } return undefined; }, [open, p.permission, p.isSubscribed]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[94] flex items-end justify-center" style={{ background: 'rgba(3,6,7,.6)' }} onClick={(e) => { if (e.target === e.currentTarget) closeAsk(); }}
      role="dialog" aria-label="Turn on game alerts">
      <style>{'@keyframes csalert{from{transform:translateY(100%)}to{transform:none}}'}</style>
      <div className="relative w-full max-w-md rounded-t-[22px] p-4 pb-[calc(16px+env(safe-area-inset-bottom))]"
        style={{ background: '#0D1516', border: `1px solid ${LINE}`, color: TEXT, animation: 'csalert .3s cubic-bezier(.2,.8,.2,1)' }}>
        <button onClick={() => closeAsk()} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full" style={{ background: 'rgba(255,255,255,.06)', color: MUTED }}><X size={16} /></button>
        <p className="text-[11px] font-black uppercase tracking-[.14em]" style={{ color: G }}>Reviews, the moment you finish</p>
        <h2 className="mt-1 pr-8 text-[20px] font-black leading-tight">Want this after every game?</h2>
        <p className="mt-1 text-[12.5px] leading-snug" style={{ color: MUTED }}>{GAME_ALERTS_WHY} No need to come and look.</p>
        <div className="mt-3"><GameAlertsRow compact /></div>
        <button type="button" onClick={() => closeAsk()} className="mt-2 w-full py-2 text-center text-[12.5px] font-bold" style={{ color: MUTED }}>Not now</button>
      </div>
    </div>
  );
}
