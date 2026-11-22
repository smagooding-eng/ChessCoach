// Scheduled downtime, announced to members: public/maintenance.json (served by Cloudflare,
// so it still works while the API is down). Up to 7 days before: a slim banner with the
// time in their own time zone. During the window: an "upgrading" screen that reloads the
// app by itself once the server answers again.
import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';

// notice (+ optional until, a date): a general heads-up banner with no set time, e.g. "sometime this week"
type Plan = { start: string; end: string; message?: string; notice?: string; until?: string };
const G = '#81B64C', TEXT = '#F5F7F6', MUTED = '#87918E';

function useMaintenance(): Plan | null {
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => fetch(`${import.meta.env.BASE_URL}maintenance.json?t=${Math.floor(Date.now() / 300_000)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((p: Plan | null) => { if (live) setPlan((p?.start && p?.end) || p?.notice ? p : null); }).catch(() => {});
    void load();
    const t = window.setInterval(load, 10 * 60_000);
    return () => { live = false; window.clearInterval(t); };
  }, []);
  return plan;
}

const when = (d: Date) => d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const timeOnly = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function MaintenanceNotice() {
  const plan = useMaintenance();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  const start = plan ? new Date(plan.start) : null, end = plan ? new Date(plan.end) : null;
  const valid = !!start && !!end && !isNaN(+start) && !isNaN(+end);
  const inWindow = valid && now >= +start! && now < +end!;
  const overrun = valid && now >= +end! && now < +end! + 60 * 60_000; // up to an hour over, until the server is back

  // After the planned end: is the server answering? (checked right away, then every 20 s)
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!overrun && !inWindow) return undefined;
    let live = true;
    const ping = () => { if (Date.now() < +end!) return; fetch(apiUrl('/api/healthz'), { cache: 'no-store' }).then((r) => { if (live) setApiOk(r.ok); }).catch(() => { if (live) setApiOk(false); }); };
    ping();
    const t = window.setInterval(ping, 20_000);
    return () => { live = false; window.clearInterval(t); };
  }, [overrun, inWindow]); // eslint-disable-line react-hooks/exhaustive-deps
  const showScreen = inWindow || (overrun && apiOk !== true);
  useEffect(() => { if (showScreen) setShown(true); }, [showScreen]);
  // the screen was up and the server is back: fresh app
  useEffect(() => { if (shown && !showScreen && apiOk) window.location.reload(); }, [shown, showScreen, apiOk]);

  if (!valid) return null;
  if (showScreen) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" style={{ background: '#050A0B', color: TEXT }} role="status">
        <div className="w-full max-w-sm rounded-[22px] p-6 text-center" style={{ background: '#0D1516', border: '1px solid rgba(255,255,255,.08)' }}>
          <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="" className="mx-auto h-14 w-14" />
          <h1 className="mt-3 text-[22px] font-black">We’re upgrading ChessScout</h1>
          <p className="mt-2 text-[13.5px] leading-snug" style={{ color: MUTED }}>{plan!.message || 'Scheduled maintenance.'} We’ll be back by about <b style={{ color: TEXT }}>{timeOnly(end!)}</b>. This page will reload by itself.</p>
          <div className="mx-auto mt-4 h-1.5 w-40 overflow-hidden rounded-full" style={{ background: '#121B1D' }}>
            <i className="block h-full w-1/3 rounded-full" style={{ background: G, animation: 'csmaint 1.4s ease-in-out infinite' }} />
          </div>
          <style>{'@keyframes csmaint{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
          <p className="mt-4 text-[12px]" style={{ color: MUTED }}>Your games, reviews and progress are safe.</p>
        </div>
      </div>
    );
  }
  return null;
}

// The heads-up card, shown in the page (Home) rather than over it: a general notice ("sometime this
// week") or, from 7 days before a set window, the exact time in the member's own time zone.
export function MaintenanceBanner({ className = '' }: { className?: string }) {
  const plan = useMaintenance();
  const [now] = useState(Date.now());
  const start = plan?.start ? new Date(plan.start) : null, end = plan?.end ? new Date(plan.end) : null;
  const timed = !!start && !!end && !isNaN(+start) && !isNaN(+end) && now < +start && +start - now < 7 * 86400_000;
  const untilT = plan?.until ? +new Date(plan.until) : NaN;
  const general = !!plan?.notice && !(start && end) && (isNaN(untilT) || now < untilT);
  const text = timed ? `ChessScout will be offline ${when(start!)} – ${timeOnly(end!)} (your time). ${plan!.message ?? ''}` : general ? plan!.notice! : '';
  const key = text ? `cs_notice_hidden:${text}` : '';
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(!!key && localStorage.getItem(key) === '1'); } catch { /* storage off */ } }, [key]);
  if (!text || hidden) return null;
  const hide = () => { setHidden(true); try { localStorage.setItem(key, '1'); } catch { /* storage off */ } };
  return (
    <div className={`flex items-start gap-3 rounded-2xl px-3.5 py-3 ${className}`} style={{ background: '#302e2b', border: '1px solid rgba(255,255,255,.08)', color: TEXT }} role="status">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: '#E8A23A' }} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[12.5px] leading-snug">{timed && <b>Scheduled upgrade: </b>}{text}</p>
      <button type="button" onClick={hide} className="shrink-0 rounded-md p-1 text-[12px] font-bold" style={{ color: MUTED }} aria-label="Hide">✕</button>
    </div>
  );
}
