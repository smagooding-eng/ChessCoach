import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, Search, ExternalLink, Mail, Copy, Check, X, Plus, Upload, ChevronDown, Sparkles, Send } from 'lucide-react';
import { apiFetch } from '@/lib/api';

// Admin › Growth › Competitor backlinks ("link gap"): sites that link to
// chess tools like ChessScout but not to ChessScout. Claude searches the web
// for each competitor's backlinks, the server opens every page to confirm the
// link and find a published contact email, and the list is ranked by how many
// competitors a site links to. Ahrefs / Semrush exports can be pasted in too.

interface Target {
  id: number; url: string; host: string; title: string | null; kind: string | null; competitors: string[];
  verified: boolean | null; linksUs: boolean; email: string | null; emailSource: string | null;
  status: string; notes: string | null; draftSubject: string | null; draftBody: string | null; source: string; foundAt: string;
  sentAt?: string | null; sentTo?: string | null; openedAt?: string | null;
}
interface RunState { running: boolean; step: string; found: number; checked: number; error: string | null }

const CARD: React.CSSProperties = { background: '#302e2b', border: '1px solid rgba(255,255,255,0.05)' };
const INNER: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' };
const GREEN = '#81B64C', MUTED = '#9e9b98', TEXT = '#F5F7F6', GOLD = '#E8B447';
const STATUS_LABEL: Record<string, string> = { new: 'New', contacted: 'Contacted', replied: 'Replied', won: 'Linked to us', skipped: 'Skipped' };

const gmailUrl = (to: string, subject: string, body: string) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export function BacklinkGapPanel() {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [newComp, setNewComp] = useState('');
  const [run, setRun] = useState<RunState | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState<'open' | 'contacted' | 'won' | 'all'>('open');
  const [importOpen, setImportOpen] = useState(false);
  const [impComp, setImpComp] = useState('');
  const [impText, setImpText] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Sending with Resend (same daily limit as club outreach).
  const [toEdit, setToEdit] = useState<Record<number, string>>({});
  const [replyTo, setReplyToState] = useState(() => { try { return localStorage.getItem('cs_backlink_replyto') || ''; } catch { return ''; } });
  const setReplyTo = (v: string) => { setReplyToState(v); try { localStorage.setItem('cs_backlink_replyto', v); } catch { /* ignore */ } };
  const [limit, setLimit] = useState<{ remaining: number; limit: number } | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const loadLimit = useCallback(async () => {
    try { const r = await apiFetch('/api/admin/backlinks/send-limit', { credentials: 'include' }); if (r.ok) setLimit(await r.json()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { if (open) void loadLimit(); }, [open, loadLimit]);
  const editDraft = (t: Target, patch: Partial<Pick<Target, 'draftSubject' | 'draftBody'>>) => setTargets((ts) => ts.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
  const send = async (t: Target) => {
    const to = (toEdit[t.id] ?? t.email ?? '').trim();
    if (!to) { setMsg('Add an email address first (from their contact page).'); return; }
    if (!confirm(`Send this email to ${to} from ChessScout via Resend?`)) return;
    setSendingId(t.id); setMsg('');
    try {
      const r = await apiFetch(`/api/admin/backlinks/${t.id}/send`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject: t.draftSubject, body: t.draftBody, replyTo: replyTo || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || 'Could not send'); return; }
      setTargets((ts) => ts.map((x) => (x.id === t.id ? { ...x, status: x.status === 'new' ? 'contacted' : x.status, sentAt: new Date().toISOString(), sentTo: d.sentTo } : x)));
      setMsg(`Sent to ${d.sentTo}.`);
      void loadLimit();
    } finally { setSendingId(null); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/admin/backlinks', { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setTargets(d.targets ?? []); setCompetitors(d.competitors ?? []); setRun(d.run ?? null); }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);
  // While a run is going, refresh every few seconds.
  useEffect(() => {
    if (!run?.running) return;
    const t = setInterval(() => { void load(); }, 3500);
    return () => clearInterval(t);
  }, [run?.running, load]);

  const saveCompetitors = async (list: string[]) => {
    const r = await apiFetch('/api/admin/backlinks/competitors', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ competitors: list }) });
    if (r.ok) setCompetitors((await r.json()).competitors ?? list);
  };
  const startRun = async () => {
    setMsg('');
    const r = await apiFetch('/api/admin/backlinks/run', { method: 'POST', credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (!d.started) setMsg('A run is already going.');
    setRun(d.run ?? null);
  };
  const doImport = async () => {
    setMsg('');
    const r = await apiFetch('/api/admin/backlinks/import', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ competitor: impComp, text: impText }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(d.error || 'Could not import'); return; }
    setMsg(`Imported ${d.added} pages. Checking them now…`); setImpText(''); setImportOpen(false);
    void load();
  };
  const setStatus = async (t: Target, status: string) => {
    setTargets((ts) => ts.map((x) => (x.id === t.id ? { ...x, status } : x)));
    await apiFetch(`/api/admin/backlinks/${t.id}/status`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  };
  const draft = async (t: Target) => {
    setBusy(t.id);
    try {
      const r = await apiFetch(`/api/admin/backlinks/${t.id}/draft`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: 'Shann' }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || 'Could not draft'); return; }
      setTargets((ts) => ts.map((x) => (x.id === t.id ? { ...x, draftSubject: d.subject, draftBody: d.body } : x)));
    } finally { setBusy(null); }
  };
  const copy = async (key: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ } };

  // The gap: every competitor a whole site links to (across its pages).
  const siteComps = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const t of targets) { const s = m.get(t.host) ?? new Set<string>(); t.competitors.forEach((c) => s.add(c)); m.set(t.host, s); }
    return m;
  }, [targets]);
  const shown = useMemo(() => {
    const list = targets.filter((t) => filter === 'all' ? true
      : filter === 'open' ? (t.status === 'new' && !t.linksUs && t.verified !== false)
      : filter === 'contacted' ? (t.status === 'contacted' || t.status === 'replied')
      : (t.status === 'won' || t.linksUs));
    const score = (t: Target) => (siteComps.get(t.host)?.size ?? 0) * 10 + (t.verified ? 5 : 0) + (t.email ? 3 : 0);
    return [...list].sort((a, b) => score(b) - score(a));
  }, [targets, filter, siteComps]);
  const counts = useMemo(() => ({
    open: targets.filter((t) => t.status === 'new' && !t.linksUs && t.verified !== false).length,
    contacted: targets.filter((t) => t.status === 'contacted' || t.status === 'replied').length,
    won: targets.filter((t) => t.status === 'won' || t.linksUs).length,
    all: targets.length,
  }), [targets]);

  return (
    <div className="mt-4 rounded-xl p-4" style={CARD}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: 'rgba(129,182,76,.18)' }}><Link2 size={18} color={GREEN} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-black" style={{ color: TEXT }}>Competitor backlinks</span>
          <span className="block text-[12px]" style={{ color: MUTED }}>Sites that link to tools like ChessScout, but not to ChessScout. Ranked by how many competitors they link to.</span>
        </span>
        <ChevronDown size={18} color={MUTED} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {/* Competitors */}
          <div className="rounded-lg p-3" style={INNER}>
            <p className="mb-2 text-[11px] font-black uppercase tracking-wider" style={{ color: MUTED }}>Competitors to check</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {competitors.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-bold" style={{ background: 'rgba(255,255,255,.07)', color: TEXT }}>
                  {c}
                  <button onClick={() => void saveCompetitors(competitors.filter((x) => x !== c))} aria-label={`Remove ${c}`}><X size={12} color={MUTED} /></button>
                </span>
              ))}
              <form onSubmit={(e) => { e.preventDefault(); if (newComp.trim()) { void saveCompetitors([...competitors, newComp.trim()]); setNewComp(''); } }} className="inline-flex items-center gap-1">
                <input value={newComp} onChange={(e) => setNewComp(e.target.value)} placeholder="add a domain" className="w-36 rounded-full bg-black/30 px-3 py-1 text-[12.5px] text-white placeholder:text-white/35" />
                <button type="submit" className="grid h-6 w-6 place-items-center rounded-full" style={{ background: GREEN }} aria-label="Add"><Plus size={13} color="#fff" /></button>
              </form>
            </div>
            <p className="mt-2 text-[11.5px]" style={{ color: MUTED }}>Pick tools close to ChessScout (game review, coaching, scouting, scanning). Giants like Chess.com and Lichess have too many links to be useful.</p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void startRun()} disabled={!!run?.running} className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-black text-white disabled:opacity-60" style={{ background: GREEN }}>
              {run?.running ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Find backlinks
            </button>
            <button onClick={() => setImportOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold" style={{ ...INNER, color: TEXT }}>
              <Upload size={15} /> Paste an Ahrefs / Semrush export
            </button>
            {loading && <Loader2 size={15} className="animate-spin" color={MUTED} />}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: MUTED }}>
            <span>Replies go to</span>
            <input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="your email (optional)" className="w-52 rounded-lg bg-black/30 px-2.5 py-1.5 text-[12.5px] text-white placeholder:text-white/35" />
            {limit && <span>· Resend: {limit.remaining} of {limit.limit} left today (shared with club outreach)</span>}
          </div>
          {run && (run.running || run.step || run.error) && (
            <p className="text-[12.5px]" style={{ color: run.error ? '#FF7A80' : MUTED }}>{run.error ?? `${run.step}${run.running ? ` (${run.found} found, ${run.checked} checked)` : ''}`}</p>
          )}
          {msg && <p className="text-[12.5px]" style={{ color: GOLD }}>{msg}</p>}

          {importOpen && (
            <div className="space-y-2 rounded-lg p-3" style={INNER}>
              <p className="text-[12.5px]" style={{ color: MUTED }}>In Ahrefs or Semrush, open the competitor's backlinks report, export it (CSV), and paste it here. Only the page URLs are used.</p>
              <input value={impComp} onChange={(e) => setImpComp(e.target.value)} placeholder="Competitor (e.g. aimchess.com)" className="w-full rounded-lg bg-black/30 px-3 py-2 text-[13px] text-white placeholder:text-white/35" />
              <textarea value={impText} onChange={(e) => setImpText(e.target.value)} rows={5} placeholder="Paste the export here" className="w-full rounded-lg bg-black/30 px-3 py-2 font-mono text-[12px] text-white placeholder:text-white/35" />
              <button onClick={() => void doImport()} className="rounded-lg px-3.5 py-2 text-[13px] font-black text-white" style={{ background: GREEN }}>Import and check</button>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-1.5">
            {([['open', 'Opportunities'], ['contacted', 'Contacted'], ['won', 'Link to us'], ['all', 'All']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className="rounded-full px-3 py-1.5 text-[12.5px] font-black"
                style={filter === k ? { background: GREEN, color: '#fff' } : { background: 'rgba(255,255,255,.06)', color: MUTED }}>
                {label} · {counts[k]}
              </button>
            ))}
          </div>

          {/* Targets */}
          {shown.length === 0 ? (
            <p className="py-6 text-center text-[13px]" style={{ color: MUTED }}>
              {targets.length ? 'Nothing here yet.' : 'No pages yet. Tap "Find backlinks" (it takes a few minutes) or paste an export.'}
            </p>
          ) : (
            <div className="space-y-2">
              {shown.map((t) => {
                const comps = [...(siteComps.get(t.host) ?? new Set(t.competitors))];
                return (
                  <div key={t.id} className="rounded-lg p-3" style={INNER}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-black" style={{ color: TEXT }}>{t.title || t.host}</p>
                        <a href={t.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate text-[12px] font-bold" style={{ color: GREEN }}>
                          {t.host}<ExternalLink size={11} />
                        </a>
                      </div>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: comps.length >= 2 ? 'rgba(232,180,71,.18)' : 'rgba(255,255,255,.06)', color: comps.length >= 2 ? GOLD : MUTED }}>
                        {comps.length} competitor{comps.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px] font-bold">
                      {t.kind && <span className="rounded px-1.5 py-0.5 capitalize" style={{ background: 'rgba(255,255,255,.06)', color: MUTED }}>{t.kind}</span>}
                      <span className="rounded px-1.5 py-0.5" style={{ background: 'rgba(255,255,255,.06)', color: MUTED }}>Links to {comps.join(', ')}</span>
                      {t.verified === true && <span className="rounded px-1.5 py-0.5" style={{ background: 'rgba(129,182,76,.15)', color: GREEN }}>✓ link confirmed</span>}
                      {t.verified === false && <span className="rounded px-1.5 py-0.5" style={{ background: 'rgba(255,255,255,.06)', color: MUTED }}>no link found on the page</span>}
                      {t.verified == null && <span className="rounded px-1.5 py-0.5" style={{ background: 'rgba(255,255,255,.06)', color: MUTED }}>not checked yet</span>}
                      {t.linksUs && <span className="rounded px-1.5 py-0.5" style={{ background: 'rgba(129,182,76,.25)', color: '#fff' }}>Already links to ChessScout</span>}
                      {t.status !== 'new' && <span className="rounded px-1.5 py-0.5" style={{ background: 'rgba(232,180,71,.15)', color: GOLD }}>{STATUS_LABEL[t.status] ?? t.status}</span>}
                      {t.sentAt && <span className="rounded px-1.5 py-0.5" style={{ background: 'rgba(129,182,76,.15)', color: GREEN }}>Sent {new Date(t.sentAt).toLocaleDateString()}{t.openedAt ? ' · opened' : ''}</span>}
                    </div>
                    <p className="mt-2 text-[12.5px]" style={{ color: t.email ? TEXT : MUTED }}>
                      <Mail size={12} className="mr-1 inline" />{t.email ?? 'No published email found: use the site\'s contact page or form.'}
                    </p>

                    {t.draftBody != null && (
                      <div className="mt-2 space-y-1.5 rounded-lg p-2.5" style={{ background: 'rgba(0,0,0,.25)' }}>
                        <input value={toEdit[t.id] ?? t.email ?? ''} onChange={(e) => setToEdit((m) => ({ ...m, [t.id]: e.target.value }))} placeholder="To: email address"
                          className="w-full rounded-md bg-black/30 px-2.5 py-1.5 text-[12.5px] text-white placeholder:text-white/35" />
                        <input value={t.draftSubject ?? ''} onChange={(e) => editDraft(t, { draftSubject: e.target.value })} placeholder="Subject"
                          className="w-full rounded-md bg-black/30 px-2.5 py-1.5 text-[12.5px] font-bold text-white placeholder:text-white/35" />
                        <textarea value={t.draftBody} onChange={(e) => editDraft(t, { draftBody: e.target.value })} rows={8}
                          className="w-full rounded-md bg-black/30 px-2.5 py-1.5 text-[12.5px] leading-snug text-white" />
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <button onClick={() => void send(t)} disabled={sendingId === t.id || !(t.draftSubject ?? '').trim() || !(t.draftBody ?? '').trim()}
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-black text-white disabled:opacity-50" style={{ background: GREEN }}>
                            {sendingId === t.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}{t.sentAt ? 'Send again with Resend' : 'Send with Resend'}
                          </button>
                          <button onClick={() => void copy(`d${t.id}`, `${t.draftSubject}\n\n${t.draftBody}`)} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-bold" style={{ background: 'rgba(255,255,255,.08)', color: TEXT }}>
                            {copied === `d${t.id}` ? <Check size={12} /> : <Copy size={12} />}Copy
                          </button>
                          {t.email && (
                            <a href={gmailUrl(t.email, t.draftSubject ?? '', t.draftBody)} target="_blank" rel="noopener noreferrer" onClick={() => { if (t.status === 'new') void setStatus(t, 'contacted'); }}
                              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-bold" style={{ background: 'rgba(255,255,255,.08)', color: TEXT }}>
                              <Mail size={12} />Open in Gmail
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.draftBody == null && (
                        <button onClick={() => editDraft(t, { draftSubject: 'ChessScout.net for your page', draftBody: '' })} className="rounded-md px-2.5 py-1.5 text-[12px] font-bold" style={{ background: 'rgba(255,255,255,.06)', color: MUTED }}>Write my own</button>
                      )}
                      <button onClick={() => void draft(t)} disabled={busy === t.id} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-black disabled:opacity-60" style={{ background: 'rgba(129,182,76,.18)', color: GREEN }}>
                        {busy === t.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}{t.draftBody ? 'Redraft' : 'Draft email'}
                      </button>
                      {(['contacted', 'replied', 'won', 'skipped'] as const).map((s) => (
                        <button key={s} onClick={() => void setStatus(t, t.status === s ? 'new' : s)} className="rounded-md px-2.5 py-1.5 text-[12px] font-bold"
                          style={t.status === s ? { background: GOLD, color: '#1A1205' } : { background: 'rgba(255,255,255,.06)', color: MUTED }}>
                          {STATUS_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
