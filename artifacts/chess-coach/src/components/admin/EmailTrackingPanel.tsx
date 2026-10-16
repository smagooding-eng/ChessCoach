import React, { useCallback, useEffect, useState } from 'react';
import { MailOpen, Loader2, RefreshCw, MousePointerClick } from 'lucide-react';
import { apiFetch } from '@/lib/api';

// Admin > Growth & Marketing: opens and clicks for emails we've sent
// (outreach through Resend or styled Gmail copies, reminders, broadcasts).

const CARD: React.CSSProperties = { background: '#302e2b', border: '1px solid rgba(255,255,255,0.05)' };
const INNER: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' };
const GREEN = '#81B64C';
const MUTED = '#9e9b98';

interface Row { kind: string; template: string | null; sent: number; recipients: number; opened: number; clicked: number; lastSent: string }
interface Recent { kind: string; template: string | null; email: string | null; subject: string | null; batchSize: number; sentAt: string; openedAt: string | null; openCount: number; clickedAt: string | null; clickCount: number; lastUrl: string | null }

const KIND: Record<string, string> = { outreach: 'Outreach', outreach_bcc: 'Outreach (Bcc batch)', drip: 'Reminder', broadcast: 'Broadcast' };
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

export function EmailTrackingPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ byTemplate: Row[]; recent: Recent[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch('/api/admin/email-tracking/summary', { credentials: 'include' }); if (r.ok) setData(await r.json()); } catch { /* ignore */ }
    setLoading(false);
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  return (
    <div className="rounded-2xl p-5 space-y-4" style={CARD}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-3 text-left">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: GREEN, color: '#fff' }}><MailOpen size={17} /></span>
            Email Opens & Clicks
          </h2>
          <p className="mt-1 text-xs" style={{ color: MUTED }}>Who opened the emails you've sent and clicked their links: outreach, reminders and broadcasts.</p>
        </div>
        <span className="mt-1 text-xs font-bold" style={{ color: GREEN }}>{open ? 'Hide' : 'Open'}</span>
      </button>
      {open && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[11px]" style={{ color: MUTED }}>
              Opens are approximate: Apple Mail can count an email as opened before it's read, and some apps block images. Gmail plain-text drafts aren't tracked; styled copies are.
            </p>
            <button onClick={load} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
            </button>
          </div>
          {!data ? (
            <div className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: MUTED }} /></div>
          ) : data.byTemplate.length === 0 ? (
            <p className="py-4 text-center text-sm" style={{ color: MUTED }}>No tracked emails yet. Emails sent from now on are tracked.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl" style={INNER}>
                <table className="w-full text-left text-xs">
                  <thead><tr className="text-white/50">
                    <th className="px-3 py-2 font-bold">Email</th><th className="px-3 py-2 font-bold">Sent</th>
                    <th className="px-3 py-2 font-bold">Opened</th><th className="px-3 py-2 font-bold">Clicked</th><th className="px-3 py-2 font-bold">Last sent</th>
                  </tr></thead>
                  <tbody>
                    {data.byTemplate.map((r) => (
                      <tr key={`${r.kind}:${r.template}`} className="border-t border-white/5 text-white">
                        <td className="px-3 py-2"><b>{r.template || '—'}</b><span className="block text-[10.5px]" style={{ color: MUTED }}>{KIND[r.kind] ?? r.kind}</span></td>
                        <td className="px-3 py-2">{r.sent}{r.recipients !== r.sent ? <span className="block text-[10.5px]" style={{ color: MUTED }}>{r.recipients} people</span> : null}</td>
                        <td className="px-3 py-2">{r.opened} <span style={{ color: MUTED }}>({pct(r.opened, r.sent)})</span></td>
                        <td className="px-3 py-2">{r.clicked} <span style={{ color: MUTED }}>({pct(r.clicked, r.sent)})</span></td>
                        <td className="px-3 py-2" style={{ color: MUTED }}>{new Date(r.lastSent).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Latest</p>
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {data.recent.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl px-3 py-2" style={INNER}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-white">{r.email || `${r.batchSize} recipients (Bcc)`}</p>
                      <p className="truncate text-[11px]" style={{ color: MUTED }}>{r.subject || r.template} · {KIND[r.kind] ?? r.kind} · {new Date(r.sentAt).toLocaleString()}</p>
                      {r.lastUrl && <p className="truncate text-[11px]" style={{ color: MUTED }}>Clicked: {r.lastUrl.replace(/^https?:\/\//, '').replace(/\?utm_[^ ]*$/, '')}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] font-bold">
                      <span className="inline-flex items-center gap-1" style={{ color: r.openedAt ? '#fff' : MUTED }}><MailOpen size={12} /> {r.openedAt ? `Opened${r.openCount > 1 ? ` ×${r.openCount}` : ''}` : 'Not opened'}</span>
                      {r.clickedAt && <span className="inline-flex items-center gap-1" style={{ color: GREEN }}><MousePointerClick size={12} /> Clicked{r.clickCount > 1 ? ` ×${r.clickCount}` : ''}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
