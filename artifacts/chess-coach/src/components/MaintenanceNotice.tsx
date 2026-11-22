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
  const [hidden, setHidden] = useState(false);
  const noticeKey = plan?.notice ? `cs_notice_hidden:${plan.notice}` : '';
  const [noticeHidden, setNoticeHidden] = useState(false);
  useEffect(() => { try { setNoticeHidden(!!noticeKey && localStorage.getItem(noticeKey) === '1'); } catch { /* storage off */ } }, [noticeKey]);
  const hideNotice = () => { setNoticeHidden(true); try { localStorage.setItem(noticeKey, '1'); } catch { /* storage off */ } };
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  const start = plan ? new Date(plan.start) : null, end = plan ? new Date(plan.end) : null;
  const valid = !!start && !!end && !isNaN(+start) && !isNaN(+end);
  const inWindow = valid && now >= +start! && now < +end!;
  const overrun = valid && now >= +end! && now < +end! + 60 * 60_000; // up to an hour over, until the server is back
  const before = valid && now < +start! && +start! - now < 7 * 86400_000;

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

  const untilT = plan?.until ? +new Date(plan.until) : NaN;
  const noticeOn = !!plan?.notice && !noticeHidden && (isNaN(untilT) || now < untilT);
  if (!valid) {
    if (!noticeOn) return null;
    return (
      <div className="fixed inset-x-0 top-0 z-[120] flex items-center justify-center gap-3 px-3 py-2 text-[12.5px]" style={{ background: '#0D1516', borderBottom: '1px solid rgba(255,255,255,.08)', color: TEXT, paddingTop: 'max(8px, env(safe-area-inset-top))' }} role="status">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: '#E8A23A' }} aria-hidden="true" />
        <span className="min-w-0">{plan!.notice}</span>
        <button type="button" onClick={hideNotice} className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-bold" style={{ color: MUTED }} aria-label="Hide">✕</button>
      </div>
    );
  }
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
  if (before && !hidden) {
    return (
      <div className="fixed inset-x-0 top-0 z-[120] flex items-center justify-center gap-3 px-3 py-2 text-[12.5px]" style={{ background: '#0D1516', borderBottom: '1px solid rgba(255,255,255,.08)', color: TEXT, paddingTop: 'max(8px, env(safe-area-inset-top))' }} role="status">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: '#E8A23A' }} aria-hidden="true" />
        <span className="min-w-0">
          <b>Scheduled upgrade:</b> ChessScout will be offline {when(start!)} – {timeOnly(end!)} (your time). {plan!.message}
        </span>
        <button type="button" onClick={() => setHidden(true)} className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-bold" style={{ color: MUTED }} aria-label="Hide">✕</button>
      </div>
    );
  }
  return null;
}
