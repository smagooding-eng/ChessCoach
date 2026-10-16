import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Search, Mail, ExternalLink, X, Check, Plus, RotateCcw, ChevronRight, Ban } from 'lucide-react';
import { apiFetch } from '@/lib/api';

// Club Outreach (Admin > Growth & Marketing).
// Finds chess clubs, school/college clubs, leagues, associations, organizers
// and coaches that publish a contact email on their own website, then lets
// you write to them one at a time from your own Gmail with a template that's
// filled in for each organization. Each send is a real, personal email.

const CARD: React.CSSProperties = { background: '#302e2b', border: '1px solid rgba(255,255,255,0.05)' };
const INNER: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' };
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm outline-none bg-black/30 border border-white/10 text-white';
const LABEL = 'text-[11px] font-bold uppercase tracking-wider text-white/50';
const GREEN = '#81B64C';
const MUTED = '#9e9b98';

interface Contact {
  id: number; email: string; orgName: string; orgType: string | null; city: string | null; region: string | null; country: string | null;
  website: string | null; sourceUrl: string | null; status: string; notes: string | null; foundAt: string; contactedAt: string | null; contactedTemplate: string | null;
}
interface Run { id: number; startedAt: string; finishedAt: string | null; candidates: number; added: number; error: string | null; trigger: string; searches: string | null }

const STATUS_TABS: { id: string; label: string }[] = [
  { id: 'new', label: 'New' }, { id: 'contacted', label: 'Contacted' }, { id: 'replied', label: 'Replied' },
  { id: 'not_interested', label: 'Not interested' }, { id: 'all', label: 'All' },
];

const SITE = 'https://chessscout.net';
const utm = (path: string, campaign: string) => `${SITE}${path}${path.includes('?') ? '&' : '?'}utm_source=outreach&utm_medium=email&utm_campaign=${campaign}`;

interface Template { id: string; name: string; subject: string; body: string }

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'intro',
    name: 'Introduce ChessScout.net',
    subject: 'A free chess tool for {{org}} players',
    body: `Hi {{org}} team,

I'm {{sender}}, and I build ChessScout.net, a chess site made for club players. I thought it might be useful for your members{{inCity}}.

On ChessScout.net players can:
- play live and daily games against real opponents, or bots at their level
- get every game reviewed move by move, with the key moments and what to play instead
- scout an opponent's openings and habits before a match (works with Chess.com and Lichess accounts)

It's free to start: ${utm('/', 'club_intro')}

If it sounds useful, I'd be grateful if you shared it with your players. I'd also really like to hear what your club would want from a site like this.

Thanks,
{{sender}}
ChessScout.net
{{address}}

If you'd rather not hear from me again, just reply "no thanks" and I won't email you again.`,
  },
  {
    id: 'tournament',
    name: 'Advertise a tournament',
    subject: 'Run your next {{org}} tournament online, free',
    body: `Hi {{org}} team,

I'm {{sender}} from ChessScout.net. We've just made it easy for clubs to run online tournaments for their members, and I wanted to offer it to you.

It takes about a minute:
- choose arena (most points wins) or knockout
- pick live or daily games and the time control
- set the number of players, then share one link

Players join from the link, and pairings, clocks and standings are all handled for you. It's free.

Create one here: ${utm('/tournaments/new', 'club_tournament')}
{{tournamentLine}}
Happy to help set up the first one if you'd like; just reply with the format and time you have in mind.

Thanks,
{{sender}}
ChessScout.net
{{address}}

If you'd rather not hear from me again, just reply "no thanks" and I won't email you again.`,
  },
  {
    id: 'partner',
    name: 'Club partnership',
    subject: 'Partnering with {{org}}',
    body: `Hi {{org}} team,

I'm {{sender}}, the developer of ChessScout.net. I'm looking for a few clubs to work with closely as we grow, and {{org}} looked like a great fit.

What I can offer your club:
- free online tournaments for your members, set up and run on ChessScout.net (${utm('/tournaments/new', 'club_partner')})
- a coach-style review of every game your players play there
- a direct line to me for features your club needs

In return I'd love honest feedback, and for you to mention ChessScout.net to your members if they find it useful.

Would you be open to a quick chat?

Thanks,
{{sender}}
ChessScout.net
{{address}}

If you'd rather not hear from me again, just reply "no thanks" and I won't email you again.`,
  },
];

interface Settings { sender: string; gmail: string; address: string; tournamentLink: string }
const SETTINGS_KEY = 'cs_club_outreach_settings';
const TEMPLATES_KEY = 'cs_club_outreach_templates';

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; }
}
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } }

function fill(text: string, c: Contact, s: Settings): string {
  const place = c.city || c.region || '';
  return text
    .replace(/\{\{org\}\}/g, c.orgName)
    .replace(/\{\{city\}\}/g, place)
    .replace(/\{\{inCity\}\}/g, place ? ` in ${place}` : '')
    .replace(/\{\{sender\}\}/g, s.sender || 'Shann')
    .replace(/\{\{address\}\}/g, s.address || '')
    .replace(/\{\{tournamentLine\}\}/g, s.tournamentLink ? `\nWe're also running an open event your players are welcome to join: ${s.tournamentLink}\n` : '')
    .replace(/\n{3,}/g, '\n\n');
}

function gmailUrl(to: string, subject: string, body: string, account: string): string {
  const p = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body });
  if (account) p.set('authuser', account);
  return `https://mail.google.com/mail/?${p.toString()}`;
}
const mailtoUrl = (to: string, subject: string, body: string) =>
  `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export function ClubOutreachPanel() {
  const [tab, setTab] = useState('new');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [settings, setSettings] = useState<Settings>(() => load(SETTINGS_KEY, { sender: 'Shann', gmail: '', address: '', tournamentLink: '' }));
  const [overrides, setOverrides] = useState<Record<string, { subject: string; body: string }>>(() => load(TEMPLATES_KEY, {}));
  const [templateId, setTemplateId] = useState('intro');
  const [editing, setEditing] = useState(false);
  const [queue, setQueue] = useState<Contact[] | null>(null);
  const [qi, setQi] = useState(0);
  const [adding, setAdding] = useState(false);
  const [newContact, setNewContact] = useState({ orgName: '', email: '', city: '', website: '' });

  const templates = useMemo(() => DEFAULT_TEMPLATES.map((t) => ({ ...t, ...(overrides[t.id] ?? {}) })), [overrides]);
  const template = templates.find((t) => t.id === templateId) ?? templates[0];

  const loadData = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/admin/club-outreach?status=${tab}`, { credentials: 'include' });
      const d = await r.json();
      if (r.ok) {
        setContacts(d.contacts ?? []); setCounts(d.counts ?? {}); setRuns(d.runs ?? []); setRunning(!!d.running);
      } else setMsg(d.error || 'Could not load');
    } catch { setMsg('Could not load contacts'); }
    setLoading(false);
  }, [tab]);
  useEffect(() => { setLoading(true); setSelected(new Set()); void loadData(); }, [loadData]);
  // While a search runs, refresh every 10s.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(loadData, 10_000);
    return () => clearInterval(t);
  }, [running, loadData]);

  const updateSettings = (patch: Partial<Settings>) => { const next = { ...settings, ...patch }; setSettings(next); save(SETTINGS_KEY, next); };
  const updateTemplate = (patch: Partial<{ subject: string; body: string }>) => {
    const next = { ...overrides, [template.id]: { subject: template.subject, body: template.body, ...patch } };
    setOverrides(next); save(TEMPLATES_KEY, next);
  };
  const resetTemplate = () => { const next = { ...overrides }; delete next[template.id]; setOverrides(next); save(TEMPLATES_KEY, next); };

  const discover = async () => {
    setMsg('');
    const r = await apiFetch('/api/admin/club-outreach/discover', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ searches: 8 }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) { setRunning(true); setMsg('Searching… new contacts appear here as they are verified (a few minutes).'); void loadData(); }
    else setMsg(d.error || 'Could not start the search');
  };

  const setStatus = async (ids: number[], status: string, tpl?: string) => {
    if (!ids.length) return;
    await apiFetch('/api/admin/club-outreach/status', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, status, template: tpl }) }).catch(() => {});
  };
  const neverContact = async (c: Contact) => {
    if (!confirm(`Never contact ${c.email} again?`)) return;
    await apiFetch('/api/admin/club-outreach/dnc', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: c.email, reason: 'admin' }) }).catch(() => {});
    void loadData();
  };
  const addContact = async () => {
    const r = await apiFetch('/api/admin/club-outreach/contacts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newContact) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) { setNewContact({ orgName: '', email: '', city: '', website: '' }); setAdding(false); void loadData(); }
    else setMsg(d.error || 'Could not add');
  };

  const allSelected = contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(contacts.map((c) => c.id)));
  const toggle = (id: number) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const startQueue = () => {
    const list = contacts.filter((c) => selected.has(c.id));
    if (!list.length) return;
    if (!settings.address.trim()) { setMsg('Add your mailing address in Sender details first. Marketing emails must include one.'); setEditing(true); return; }
    setQueue(list); setQi(0);
  };
  const current = queue?.[qi] ?? null;
  const subject = current ? fill(template.subject, current, settings) : '';
  const body = current ? fill(template.body, current, settings) : '';
  const advance = () => {
    if (!queue) return;
    if (qi + 1 >= queue.length) { setQueue(null); setSelected(new Set()); void loadData(); }
    else setQi(qi + 1);
  };
  const sendWith = async (kind: 'gmail' | 'mailto') => {
    if (!current) return;
    if (kind === 'gmail') window.open(gmailUrl(current.email, subject, body, settings.gmail), '_blank', 'noopener');
    else window.location.href = mailtoUrl(current.email, subject, body);
    await setStatus([current.id], 'contacted', template.id);
    advance();
  };

  const contactedToday = contacts.filter((c) => c.contactedAt && new Date(c.contactedAt).toDateString() === new Date().toDateString()).length;
  const lastRun = runs[0];

  return (
    <div className="rounded-2xl p-5 space-y-4" style={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: GREEN, color: '#fff' }}><Building2 size={17} /></span>
            Club Outreach
          </h2>
          <p className="mt-1 text-xs" style={{ color: MUTED }}>
            Chess clubs, school and college clubs, leagues, associations, organizers and coaches that list a contact email on their own website.
            New ones are found every Monday; use the button for more. Each email goes out from your Gmail, one at a time.
          </p>
        </div>
        <button onClick={discover} disabled={running} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-60" style={{ background: GREEN, color: '#fff' }}>
          {running ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} {running ? 'Searching…' : 'Find new contacts'}
        </button>
      </div>

      {lastRun && (
        <p className="text-[11.5px]" style={{ color: MUTED }}>
          Last search {new Date(lastRun.startedAt).toLocaleString()} ({lastRun.trigger}): {lastRun.finishedAt ? `${lastRun.added} new contact${lastRun.added === 1 ? '' : 's'} from ${lastRun.candidates} organizations checked` : 'running…'}
          {lastRun.error ? ` · stopped: ${lastRun.error}` : ''}
        </p>
      )}
      {msg && <p className="rounded-lg px-3 py-2 text-xs font-semibold text-white" style={{ background: 'rgba(255,255,255,0.06)' }}>{msg}</p>}

      {/* Sender + template */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl p-3.5" style={INNER}>
          <button onClick={() => setEditing((e) => !e)} className="flex w-full items-center justify-between text-left">
            <span className="text-sm font-bold text-white">Sender details</span>
            <ChevronRight size={16} style={{ color: MUTED, transform: editing ? 'rotate(90deg)' : undefined }} />
          </button>
          {editing ? (
            <div className="space-y-2">
              <div><p className={LABEL}>Your name</p><input className={INPUT} value={settings.sender} onChange={(e) => updateSettings({ sender: e.target.value })} /></div>
              <div><p className={LABEL}>Gmail to send from</p><input className={INPUT} placeholder="you@gmail.com" value={settings.gmail} onChange={(e) => updateSettings({ gmail: e.target.value.trim() })} /></div>
              <div><p className={LABEL}>Mailing address (required by anti-spam law)</p><input className={INPUT} placeholder="Street, City, State ZIP (a PO box is fine)" value={settings.address} onChange={(e) => updateSettings({ address: e.target.value })} /></div>
              <div><p className={LABEL}>Tournament link to promote (optional)</p><input className={INPUT} placeholder="https://chessscout.net/tournaments/…" value={settings.tournamentLink} onChange={(e) => updateSettings({ tournamentLink: e.target.value.trim() })} /></div>
              <p className="text-[11px]" style={{ color: MUTED }}>Saved on this device.</p>
            </div>
          ) : (
            <p className="text-xs" style={{ color: MUTED }}>{settings.sender || 'No name'} · {settings.gmail || 'default Gmail account'} · {settings.address ? 'address set' : 'no mailing address yet'}</p>
          )}
        </div>
        <div className="space-y-2 rounded-xl p-3.5" style={INNER}>
          <p className="text-sm font-bold text-white">Template</p>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button key={t.id} onClick={() => setTemplateId(t.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold"
                style={templateId === t.id ? { background: GREEN, color: '#fff' } : { background: 'rgba(0,0,0,.3)', color: '#fff', border: '1px solid rgba(255,255,255,.1)' }}>{t.name}</button>
            ))}
          </div>
          <input className={INPUT} value={template.subject} onChange={(e) => updateTemplate({ subject: e.target.value })} />
          <textarea className={`${INPUT} min-h-[150px] font-mono text-[12px]`} value={template.body} onChange={(e) => updateTemplate({ body: e.target.value })} />
          <div className="flex items-center justify-between">
            <p className="text-[11px]" style={{ color: MUTED }}>Fills in: {'{{org}} {{city}} {{sender}} {{address}} {{tournamentLine}}'}</p>
            {overrides[template.id] && <button onClick={resetTemplate} className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: GREEN }}><RotateCcw size={11} /> Reset</button>}
          </div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_TABS.map((s) => {
          const n = s.id === 'all' ? Object.values(counts).reduce((a: number, b: number) => a + b, 0) : counts[s.id] ?? 0;
          return (
            <button key={s.id} onClick={() => setTab(s.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold"
              style={tab === s.id ? { background: 'rgba(255,255,255,.12)', color: '#fff' } : { color: MUTED }}>
              {s.label} <span className="opacity-70">{n}</span>
            </button>
          );
        })}
        <button onClick={() => setAdding((a) => !a)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold" style={{ color: GREEN }}>
          <Plus size={13} /> Add by hand
        </button>
      </div>

      {adding && (
        <div className="grid gap-2 rounded-xl p-3 sm:grid-cols-5" style={INNER}>
          <input className={INPUT} placeholder="Organization" value={newContact.orgName} onChange={(e) => setNewContact({ ...newContact, orgName: e.target.value })} />
          <input className={INPUT} placeholder="Contact email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
          <input className={INPUT} placeholder="City" value={newContact.city} onChange={(e) => setNewContact({ ...newContact, city: e.target.value })} />
          <input className={INPUT} placeholder="Website" value={newContact.website} onChange={(e) => setNewContact({ ...newContact, website: e.target.value })} />
          <button onClick={addContact} className="rounded-lg px-3 py-2 text-xs font-bold" style={{ background: GREEN, color: '#fff' }}>Add</button>
        </div>
      )}

      {/* Bulk bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5" style={INNER}>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-white">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-[#81B64C]" /> Select all
        </label>
        <span className="text-xs" style={{ color: MUTED }}>{selected.size} selected · {contactedToday} contacted today</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <button onClick={startQueue} disabled={!selected.size} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50" style={{ background: GREEN, color: '#fff' }}>
            <Mail size={13} /> Email selected
          </button>
          {tab !== 'replied' && (
            <button onClick={async () => { await setStatus([...selected], 'replied'); setSelected(new Set()); void loadData(); }} disabled={!selected.size}
              className="rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-50" style={{ background: 'rgba(255,255,255,.06)', color: '#fff' }}>Mark replied</button>
          )}
          {tab !== 'not_interested' && (
            <button onClick={async () => { await setStatus([...selected], 'not_interested'); setSelected(new Set()); void loadData(); }} disabled={!selected.size}
              className="rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-50" style={{ background: 'rgba(255,255,255,.06)', color: '#fff' }}>Not interested</button>
          )}
          {tab !== 'new' && (
            <button onClick={async () => { await setStatus([...selected], 'new'); setSelected(new Set()); void loadData(); }} disabled={!selected.size}
              className="rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-50" style={{ background: 'rgba(255,255,255,.06)', color: '#fff' }}>Back to new</button>
          )}
        </div>
      </div>
      <p className="text-[11px]" style={{ color: MUTED }}>
        Tip: keep it to a few dozen a day from a personal Gmail so your emails keep landing in inboxes. Anyone who replies "no thanks" goes on the never-contact list (the ⊘ button).
      </p>

      {/* List */}
      {loading ? (
        <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: MUTED }} /></div>
      ) : contacts.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: MUTED }}>{tab === 'new' ? 'No new contacts. Click "Find new contacts" to search.' : 'Nothing here yet.'}</p>
      ) : (
        <div className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-start gap-3 rounded-xl p-3" style={INNER}>
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="mt-1 h-4 w-4 shrink-0 accent-[#81B64C]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{c.orgName}</p>
                <p className="truncate text-[11.5px]" style={{ color: MUTED }}>
                  {[c.orgType, [c.city, c.region, c.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                </p>
                <p className="truncate text-[12px] text-white/80">{c.email}</p>
                <p className="flex flex-wrap gap-x-3 text-[11px]" style={{ color: MUTED }}>
                  {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">Website <ExternalLink size={10} /></a>}
                  {c.sourceUrl && c.sourceUrl.startsWith('http') && <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">Where the email is listed <ExternalLink size={10} /></a>}
                  {c.contactedAt && <span>Contacted {new Date(c.contactedAt).toLocaleDateString()}{c.contactedTemplate ? ` (${templates.find((t) => t.id === c.contactedTemplate)?.name ?? c.contactedTemplate})` : ''}</span>}
                </p>
              </div>
              <button onClick={() => neverContact(c)} title="Never contact" aria-label="Never contact" className="shrink-0 rounded-md p-1.5 hover:bg-white/5" style={{ color: MUTED }}><Ban size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {/* One-by-one sending */}
      {queue && current && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center p-0 sm:items-center sm:p-4" style={{ background: 'rgba(0,0,0,.6)' }}>
          <div className="max-h-[92vh] w-full max-w-[640px] space-y-3 overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: '#262421', border: '1px solid rgba(255,255,255,.1)' }}>
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm font-bold text-white">Email {qi + 1} of {queue.length}: {current.orgName}</p>
              <button onClick={() => { setQueue(null); void loadData(); }} aria-label="Close" className="p-1" style={{ color: MUTED }}><X size={18} /></button>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full" style={{ width: `${(qi / queue.length) * 100}%`, background: GREEN }} /></div>
            <p className="text-xs" style={{ color: MUTED }}>To: <span className="text-white">{current.email}</span></p>
            <p className="text-sm font-bold text-white">{subject}</p>
            <pre className="max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-lg p-3 text-[12.5px] text-white/85" style={{ background: 'rgba(0,0,0,.3)', fontFamily: 'inherit' }}>{body}</pre>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => sendWith('gmail')} className="inline-flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold" style={{ background: GREEN, color: '#fff' }}>
                <Mail size={15} /> Open in Gmail
              </button>
              <button onClick={() => sendWith('mailto')} className="rounded-xl py-3 text-sm font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>Mail app</button>
            </div>
            <div className="flex gap-2">
              <button onClick={advance} className="flex-1 rounded-xl py-2 text-xs font-bold" style={{ background: 'rgba(255,255,255,.05)', color: MUTED }}>Skip</button>
              <button onClick={async () => { await setStatus([current.id], 'not_interested'); advance(); }} className="flex-1 rounded-xl py-2 text-xs font-bold" style={{ background: 'rgba(255,255,255,.05)', color: MUTED }}>Not a fit</button>
            </div>
            <p className="flex items-center gap-1.5 text-[11px]" style={{ color: MUTED }}><Check size={12} /> Opening the draft marks it contacted. Review it and press Send in Gmail.</p>
          </div>
        </div>
      )}
    </div>
  );
}
