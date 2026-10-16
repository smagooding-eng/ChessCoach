import React, { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

// Admin > Overview > Bots & Crawlers: who the bot traffic actually is.
// Grouped by IP for the last 7 days (with the user agent each one sent),
// then the latest individual visits.

interface Visit { kind: string; path: string; user_agent: string | null; ip_address: string | null; source: string; created_at: string }
interface IpRow { ip_address: string | null; kind: string; visits: string | number; user_agent: string | null; last_seen: string }

const CARD: React.CSSProperties = { background: '#302e2b', border: '1px solid rgba(255,255,255,0.08)' };
const MUTED = '#9e9b98';

export function BotVisitsPanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ recent: Visit[]; byIp: IpRow[] } | null>(null);
  useEffect(() => {
    apiFetch('/api/admin/bot-visits', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { recent: [], byIp: [] }))
      .then(setData)
      .catch(() => setData({ recent: [], byIp: [] }));
  }, []);
  const when = (s: string) => new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-2 sm:items-center" style={{ background: 'rgba(0,0,0,.7)' }} onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-[820px] overflow-y-auto rounded-2xl p-4 text-white" style={CARD} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black">Bots & crawlers</h2>
          <button onClick={onClose} aria-label="Close" className="p-1" style={{ color: MUTED }}><X size={20} /></button>
        </div>
        <p className="mb-4 text-xs" style={{ color: MUTED }}>
          "ChessScout's own tools" are our screenshot jobs and the Share Kit's screenshots. Search engines (Google, Bing) and link previews (Facebook, WhatsApp) are normal and good.
          An IP you don't recognise making many visits is worth a look: search the IP online to see who owns it.
        </p>
        {!data ? <Loader2 className="mx-auto animate-spin" /> : (
          <>
            <h3 className="mb-2 text-sm font-black uppercase tracking-wide" style={{ color: MUTED }}>Last 7 days, by IP</h3>
            <div className="mb-5 overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <table className="w-full text-left text-xs">
                <thead><tr style={{ color: MUTED }}><th className="p-2">IP</th><th className="p-2">Type</th><th className="p-2 text-right">Visits</th><th className="p-2">Last</th><th className="p-2">User agent</th></tr></thead>
                <tbody>
                  {data.byIp.length === 0 && <tr><td colSpan={5} className="p-3" style={{ color: MUTED }}>None yet.</td></tr>}
                  {data.byIp.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td className="p-2 font-mono">{r.ip_address || '—'}</td>
                      <td className="p-2 font-bold">{r.kind}</td>
                      <td className="p-2 text-right font-black">{Number(r.visits)}</td>
                      <td className="whitespace-nowrap p-2">{when(r.last_seen)}</td>
                      <td className="max-w-[320px] truncate p-2" title={r.user_agent ?? ''} style={{ color: MUTED }}>{r.user_agent || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mb-2 text-sm font-black uppercase tracking-wide" style={{ color: MUTED }}>Latest visits</h3>
            <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <table className="w-full text-left text-xs">
                <thead><tr style={{ color: MUTED }}><th className="p-2">When</th><th className="p-2">Type</th><th className="p-2">Page</th><th className="p-2">IP</th></tr></thead>
                <tbody>
                  {data.recent.map((v, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} title={v.user_agent ?? ''}>
                      <td className="whitespace-nowrap p-2">{when(v.created_at)}</td>
                      <td className="p-2 font-bold">{v.kind}</td>
                      <td className="max-w-[260px] truncate p-2">{v.path}</td>
                      <td className="p-2 font-mono">{v.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
