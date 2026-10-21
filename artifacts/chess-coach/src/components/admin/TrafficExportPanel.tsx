import { useState } from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

// Admin > Traffic & Funnel: download one JSON file with the traffic and
// funnel numbers for a date range, to share (e.g. with Claude) for
// analysis. Aggregates only -- the server never includes IPs, emails or
// user ids. Bundles the export endpoint with the panels' own data
// (site-wide stats, landing funnel, games played) so it's all in one file.

const GREEN = '#81B64C';
const MUTED = '#9e9b98';
const TZ_Q = `&tz=${new Date().getTimezoneOffset()}`;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PRESETS: { id: string; label: string; days: number | null }[] = [
  { id: '7', label: '7 days', days: 7 },
  { id: '30', label: '30 days', days: 30 },
  { id: '90', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];

async function getJson(url: string): Promise<unknown> {
  try {
    const r = await apiFetch(url, { credentials: 'include' });
    const d = await r.json().catch(() => null);
    return r.ok ? d : { error: (d as { error?: string } | null)?.error ?? `HTTP ${r.status}` };
  } catch (e) { return { error: e instanceof Error ? e.message : 'request failed' }; }
}

export function TrafficExportPanel() {
  const [preset, setPreset] = useState('30');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const build = async (): Promise<File | null> => {
    setBusy(true); setMsg(''); setFile(null);
    try {
      const p = PRESETS.find((x) => x.id === preset)!;
      const end = new Date();
      const start = p.days ? new Date(Date.now() - (p.days - 1) * 86_400_000) : new Date('2024-01-01T00:00:00');
      const q = `startDate=${ymd(start)}&endDate=${ymd(end)}${TZ_Q}`;
      const [traffic, stats, landingFunnel, gamesPlayed] = await Promise.all([
        getJson(`/api/admin/traffic-export?${q}`),
        getJson('/api/admin/stats'),
        getJson(`/api/admin/landing-funnel?${q}`),
        getJson('/api/admin/game-stats'),
      ]);
      if ((traffic as { error?: string })?.error) { setMsg(`Could not build the export: ${(traffic as { error: string }).error}`); return null; }
      const body = {
        ...(traffic as object),
        rangeLabel: p.label,
        siteWideStats: stats,
        landingFunnelByPlatform: landingFunnel,
        gamesPlayed,
      };
      const f = new File([JSON.stringify(body, null, 2)], `chessscout-traffic-${ymd(start)}_to_${ymd(end)}.json`, { type: 'application/json' });
      setFile(f);
      return f;
    } finally { setBusy(false); }
  };

  const download = async () => {
    const f = file ?? await build();
    if (!f) return;
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setMsg(`Downloaded ${f.name}. Attach it in a chat for analysis.`);
  };

  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator;
  const share = async () => {
    const f = file ?? await build();
    if (!f) return;
    try {
      if ((navigator as Navigator & { canShare?: (d: ShareData) => boolean }).canShare?.({ files: [f] })) {
        await navigator.share({ files: [f], title: f.name });
        setMsg('Shared.');
      } else { await download(); }
    } catch { /* share sheet closed */ }
  };

  return (
    <div className="rounded-xl p-4" style={{ background: '#302e2b', border: '1px solid rgba(255,255,255,0.05)' }}>
      <h2 className="text-base font-black mb-1 text-white">Export for analysis</h2>
      <p className="text-[11px] mb-3" style={{ color: MUTED }}>
        One file with daily visitors and page views, signups, the landing funnel (web and app), top, entry and exit pages,
        the pages new accounts first arrived on, busiest hours, referral conversions, site-wide stats and games played.
        Totals only: no IP addresses, emails or user ids.
      </p>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => { setPreset(p.id); setFile(null); }}
            className="rounded-lg px-2.5 py-1.5 text-xs font-bold"
            style={preset === p.id ? { background: GREEN, color: '#fff' } : { background: 'rgba(255,255,255,.06)', color: MUTED }}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={download} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold disabled:opacity-60" style={{ background: GREEN, color: '#fff' }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {busy ? 'Building…' : 'Download file'}
        </button>
        {canShare && (
          <button type="button" onClick={share} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold disabled:opacity-60" style={{ background: 'rgba(255,255,255,.08)', color: '#fff' }}>
            <Share2 size={14} /> Share file
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-[11px] font-semibold text-white">{msg}</p>}
    </div>
  );
}
