import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Search, Mail, ExternalLink, X, Check, Plus, RotateCcw, ChevronRight, Ban, Copy } from 'lucide-react';
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

/** personal: filled in per club (one-by-one drafts). general: written for a Bcc batch. */
interface Template { id: string; name: string; kind: 'personal' | 'general'; subject: string; body: string }

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'intro',
    name: 'Introduce ChessScout.net',
    kind: 'personal',
    subject: "A free chess tool for {{org}}'s players",
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
    kind: 'personal',
    subject: "Run {{org}}'s next tournament online, free",
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
    kind: 'personal',
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
  {
    id: 'intro_general',
    name: 'Introduce ChessScout.net',
    kind: 'general',
    subject: 'A free chess tool for your club players',
    body: `Hi there,

I'm {{sender}}, and I build ChessScout.net, a chess site made for club players. I'm reaching out to a few chess clubs and organizers because I think it could be useful for your members.

On ChessScout.net players can:
- play live and daily games against real opponents, or bots at their level
- get every game reviewed move by move, with the key moments and what to play instead
- scout an opponent's openings and habits before a match (works with Chess.com and Lichess accounts)

It's free to start: ${utm('/', 'club_intro_bcc')}

If it sounds useful, I'd be grateful if you shared it with your players, and I'd love to hear what your club would want from a site like this.

Thanks,
{{sender}}
ChessScout.net
{{address}}

If you'd rather not hear from me again, just reply "no thanks" and I won't email you again.`,
  },
  {
    id: 'tournament_general',
    name: 'Advertise a tournament',
    kind: 'general',
    subject: 'Run your next club tournament online, free',
    body: `Hi there,

I'm {{sender}} from ChessScout.net. We've just made it easy for chess clubs to run online tournaments for their members, and I wanted to offer it to you.

It takes about a minute:
- choose arena (most points wins) or knockout
- pick live or daily games and the time control
- set the number of players, then share one link

Players join from the link, and pairings, clocks and standings are handled for you. It's free.

Create one here: ${utm('/tournaments/new', 'club_tournament_bcc')}
{{tournamentLine}}
Happy to help set up your first one; just reply with the format and time you have in mind.

Thanks,
{{sender}}
ChessScout.net
{{address}}

If you'd rather not hear from me again, just reply "no thanks" and I won't email you again.`,
  },
  {
    id: 'partner_general',
    name: 'Club partnership',
    kind: 'general',
    subject: 'Looking for a few chess clubs to partner with',
    body: `Hi there,

I'm {{sender}}, the developer of ChessScout.net. I'm looking for a few chess clubs to work with closely as we grow.

What I can offer your club:
- free online tournaments for your members, set up and run on ChessScout.net (${utm('/tournaments/new', 'club_partner_bcc')})
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
  {
    id: 'protournament',
    name: 'Pro tournaments (earn per signup)',
    kind: 'personal',
    subject: "Host {{org}}'s tournaments on ChessScout.net and earn per signup",
    body: `Hi {{org}} team,

I'm {{sender}} from ChessScout.net. Clubs can now run their own tournaments on our site, including Pro tournaments that help fund the club.

Here's how a Pro tournament works:
- you create it with a ChessScout Pro membership ($5/month) and pick arena or knockout, live or daily, the time control and up to 500 players
- players who are already Pro join free; everyone else joins by going Pro ($5/month)
- for every player who goes Pro to join, your club earns $1, paid out to you
- the money is yours to use however you like: club costs, prizes, snacks for club night

You can also run free tournaments for everyone, with your club's name and logo on the page.

Create one here: ${utm('/tournaments/new', 'club_protournament')}
{{tournamentLine}}
Happy to help set up your first one; just reply with what you have in mind.

Thanks,
{{sender}}
ChessScout.net
{{address}}

If you'd rather not hear from me again, just reply "no thanks" and I won't email you again.`,
  },
  {
    id: 'protournament_general',
    name: 'Pro tournaments (earn per signup)',
    kind: 'general',
    subject: 'Run club tournaments on ChessScout.net and earn per signup',
    body: `Hi there,

I'm {{sender}} from ChessScout.net. Chess clubs can now run their own tournaments on our site, including Pro tournaments that help fund the club.

Here's how a Pro tournament works:
- you create it with a ChessScout Pro membership ($5/month) and pick arena or knockout, live or daily, the time control and up to 500 players
- players who are already Pro join free; everyone else joins by going Pro ($5/month)
- for every player who goes Pro to join, your club earns $1, paid out to you
- the money is yours to use however you like: club costs, prizes, snacks for club night

You can also run free tournaments for everyone, with your club's name and logo on the page.

Create one here: ${utm('/tournaments/new', 'club_protournament_bcc')}
{{tournamentLine}}
Happy to help set up your first one; just reply with what you have in mind.

Thanks,
{{sender}}
ChessScout.net
{{address}}

If you'd rather not hear from me again, just reply "no thanks" and I won't email you again.`,
  },
];

interface Settings { sender: string; gmail: string; address: string; tournamentLink: string; batchSize: number; styled: boolean }
const SETTINGS_KEY = 'cs_club_outreach_settings';
const TEMPLATES_KEY = 'cs_club_outreach_templates';

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; }
}
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } }

/** Fills a template for one organization, or (c = null) generically for a BCC batch. */
function fill(text: string, c: Contact | null, s: Settings): string {
  const place = c ? (c.city || c.region || '') : '';
  return text
    .replace(/Hi \{\{org\}\} team,/g, c ? `Hi ${c.orgName} team,` : 'Hi there,')
    .replace(/\{\{org\}\}/g, c ? c.orgName : 'your club')
    .replace(/\{\{city\}\}/g, place)
    .replace(/\{\{inCity\}\}/g, place ? ` in ${place}` : '')
    .replace(/\{\{sender\}\}/g, s.sender || 'Shann')
    .replace(/\{\{address\}\}/g, s.address || '')
    .replace(/\{\{tournamentLine\}\}/g, s.tournamentLink ? `\nWe're also running an open event your players are welcome to join: ${s.tournamentLink}\n` : '')
    .replace(/\n{3,}/g, '\n\n');
}

// ── Opening a draft ─────────────────────────────────────────────────────────
// Gmail's web compose (desktop), the Gmail app (iPhone/iPad) or the phone's
// default mail app (mailto, which Android hands to Gmail). Links are real
// <a> elements so browsers never treat them as blocked pop-ups.

const enc = encodeURIComponent;
const IS_IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const IS_MOBILE = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

interface Draft { to?: string; bcc?: string[]; subject: string; body: string }

function gmailWebUrl(d: Draft, account: string): string {
  const q = [`view=cm`, `fs=1`, `tf=1`, `to=${enc(d.to ?? '')}`];
  if (d.bcc?.length) q.push(`bcc=${enc(d.bcc.join(','))}`);
  q.push(`su=${enc(d.subject)}`);
  if (d.body) q.push(`body=${enc(d.body)}`);
  return `https://mail.google.com/mail/u/${account ? enc(account) : '0'}/?${q.join('&')}`;
}
function gmailAppUrl(d: Draft): string {
  const q = [`to=${enc(d.to ?? '')}`];
  if (d.bcc?.length) q.push(`bcc=${enc(d.bcc.join(','))}`);
  q.push(`subject=${enc(d.subject)}`);
  if (d.body) q.push(`body=${enc(d.body)}`);
  return `googlegmail://co?${q.join('&')}`;
}
function mailtoUrl(d: Draft): string {
  const q: string[] = [];
  if (d.bcc?.length) q.push(`bcc=${d.bcc.map(enc).join(',')}`);
  q.push(`subject=${enc(d.subject)}`);
  if (d.body) q.push(`body=${enc(d.body)}`);
  return `mailto:${d.to ? enc(d.to) : ''}?${q.join('&')}`;
}

// ── Styled emails ───────────────────────────────────────────────────────────
// The same look as ChessScout's own emails. Gmail compose can't take HTML in
// a link, so the styled version is copied to the clipboard and pasted into
// the draft (it keeps its formatting).

const T = { bg: '#050A0B', card: '#0D1516', inner: '#121B1D', border: '#1E2829', green: '#81B64C', text: '#F5F7F6', muted: '#87918E', faint: '#5C6664' };
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const linkify = (x: string) => esc(x).replace(/(https?:\/\/[^\s<)]+)/g, (u) => `<a href="${u}" style="color:${T.green};text-decoration:none;font-weight:700;">${u.replace(/^https?:\/\//, '').replace(/\?utm_[^\s]*$/, '')}</a>`);

function ctaLabel(url: string): string {
  if (/\/tournaments\/new/.test(url)) return 'Create a tournament &rarr;';
  if (/\/tournaments\//.test(url)) return 'Join the tournament &rarr;';
  return 'Visit ChessScout.net &rarr;';
}

export function styledEmailHtml(text: string): string {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const optOutIdx = blocks.findIndex((b) => /rather not hear from me/i.test(b));
  const optOut = optOutIdx >= 0 ? blocks.splice(optOutIdx, 1)[0] : '';
  const sigIdx = blocks.findIndex((b) => /^(thanks|cheers|best),?/i.test(b));
  const sig = sigIdx >= 0 ? blocks.splice(sigIdx).join('\n') : '';
  const parts = blocks.map((b) => {
    const lines = b.split('\n');
    const firstBullet = lines.findIndex((l) => /^\s*[-•]\s+/.test(l));
    if (firstBullet >= 0 && lines.slice(firstBullet).every((l) => /^\s*[-•]\s+/.test(l))) {
      const lead = lines.slice(0, firstBullet);
      const items = lines.slice(firstBullet);
      return `${lead.length ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:15px;line-height:1.6;color:${T.muted};">${lead.map(linkify).join('<br>')}</p>` : ''}<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">${items.map((l) => `<tr><td valign="top" style="padding:9px 10px 3px 0;"><span style="display:inline-block;width:7px;height:7px;border-radius:7px;background:${T.green};"></span></td><td style="padding:2px 0;font-family:${FONT};font-size:15px;line-height:1.55;color:${T.text};">${linkify(l.replace(/^\s*[-•]\s+/, ''))}</td></tr>`).join('')}</table>`;
    }
    // A line ending in a ChessScout link becomes text + a green button.
    const m = b.match(/^([\s\S]*?)(https:\/\/chessscout\.net\S*)\s*$/);
    if (m && lines.length <= 2) {
      const lead = m[1].trim().replace(/[:\-–]\s*$/, '');
      return `${lead ? `<p style="margin:0 0 12px;font-family:${FONT};font-size:15px;line-height:1.6;color:${T.muted};">${esc(lead)}</p>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr><td bgcolor="${T.green}" style="border-radius:12px;background:${T.green};"><a href="${m[2]}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:800;color:#FFFFFF;text-decoration:none;">${ctaLabel(m[2])}</a></td></tr></table>`;
    }
    const isGreeting = /^(hi|hello|dear)\b/i.test(b) && lines.length === 1;
    return `<p style="margin:0 0 16px;font-family:${FONT};font-size:${isGreeting ? 17 : 15}px;line-height:1.6;color:${isGreeting ? T.text : T.muted};${isGreeting ? 'font-weight:800;' : ''}">${lines.map(linkify).join('<br>')}</p>`;
  });
  const sigHtml = sig ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${T.text};">${sig.split('\n').map((l, i) => i === 0 ? esc(l) : `<span style="color:${i === 1 ? T.text : T.muted};${i === 1 ? 'font-weight:800;' : ''}">${linkify(l)}</span>`).join('<br>')}</p>` : '';
  return `<div style="background:${T.bg};padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;margin:0 auto;">
<tr><td align="center" style="padding:0 0 18px;"><a href="${SITE}" style="text-decoration:none;font-family:${FONT};font-size:22px;font-weight:900;color:${T.text};"><img src="${SITE}/icons/icon-192.png" width="36" height="36" alt="" style="vertical-align:middle;border:0;border-radius:9px;margin-right:8px;">ChessScout<span style="color:${T.green};">.net</span></a></td></tr>
<tr><td bgcolor="${T.card}" style="background:${T.card};border:1px solid ${T.border};border-radius:20px;padding:28px 24px;">${parts.join('\n')}${sigHtml}</td></tr>
<tr><td align="center" style="padding:18px 10px 0;font-family:${FONT};">
<div style="font-size:13px;font-weight:800;color:${T.text};margin:0 0 6px;">Play smarter. <span style="color:${T.green};">Win more.</span></div>
${optOut ? `<div style="font-size:12px;line-height:1.5;color:${T.faint};">${esc(optOut)}</div>` : ''}
</td></tr></table></div>`;
}

/** Copies rich HTML (with a plain-text fallback) so it pastes formatted into Gmail. */
async function copyRich(html: string, plain: string): Promise<boolean> {
  try {
    const Item = (window as unknown as { ClipboardItem?: new (d: Record<string, Blob>) => unknown }).ClipboardItem;
    if (Item && navigator.clipboard && 'write' in navigator.clipboard) {
      await (navigator.clipboard as unknown as { write: (items: unknown[]) => Promise<void> }).write([
        new Item({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) }),
      ]);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.style.position = 'fixed'; div.style.left = '-9999px';
    document.body.appendChild(div);
    const range = document.createRange(); range.selectNodeContents(div);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    const ok = document.execCommand('copy');
    sel?.removeAllRanges(); div.remove();
    return ok;
  } catch { return false; }
}

/** Preview + the buttons that open a draft (Gmail web, Gmail app, mail app). */
function DraftActions({ draft, styled, account, onOpened }: { draft: Draft; styled: boolean; account: string; onOpened: () => void }) {
  const [copiedStyled, setCopiedStyled] = useState(false);
  const html = useMemo(() => styledEmailHtml(draft.body), [draft.body]);
  // Styled: open the draft without a body and paste the copied email into it.
  const open: Draft = styled ? { ...draft, body: '' } : draft;
  const copyStyled = () => { void copyRich(html, draft.body).then((ok) => { if (ok) { setCopiedStyled(true); setTimeout(() => setCopiedStyled(false), 2500); } }); };
  const onLink = () => { if (styled) copyStyled(); onOpened(); };
  const btn = 'inline-flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold';
  const links = [
    !IS_MOBILE && { href: gmailWebUrl(open, account), label: 'Open in Gmail', primary: true, target: '_blank' },
    IS_IOS && { href: gmailAppUrl(open), label: 'Open Gmail app', primary: true, target: undefined },
    { href: mailtoUrl(open), label: IS_MOBILE && !IS_IOS ? 'Open in Gmail / mail app' : 'Mail app', primary: IS_MOBILE && !IS_IOS, target: undefined },
    IS_MOBILE && { href: gmailWebUrl(open, account), label: 'Gmail website', primary: false, target: '_blank' },
  ].filter(Boolean) as { href: string; label: string; primary: boolean; target?: string }[];
  return (
    <div className="space-y-2">
      {styled ? (
        <iframe title="Email preview" srcDoc={`<!doctype html><html><body style="margin:0;background:${T.bg}">${html}</body></html>`} className="h-[340px] w-full rounded-lg border-0" />
      ) : (
        <pre className="max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-lg p-3 text-[12.5px] text-white/85" style={{ background: 'rgba(0,0,0,.3)', fontFamily: 'inherit' }}>{draft.body}</pre>
      )}
      {styled && (
        <button type="button" onClick={copyStyled} className={`${btn} w-full text-white`} style={{ background: 'rgba(255,255,255,.08)' }}>
          {copiedStyled ? <Check size={15} /> : <Copy size={15} />} {copiedStyled ? 'Styled email copied: paste it into the draft' : 'Copy styled email'}
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        {links.map((l) => (
          <a key={l.label} href={l.href} target={l.target} rel="noopener noreferrer" onClick={onLink}
            className={btn} style={l.primary ? { background: GREEN, color: '#fff' } : { background: 'rgba(255,255,255,.08)', color: '#fff' }}>
            {l.primary && <Mail size={15} />} {l.label}
          </a>
        ))}
      </div>
      {styled && <p className="text-[11px]" style={{ color: MUTED }}>Opening a draft also copies the styled email. In the draft, tap the message area and paste (Ctrl/⌘+V or long-press → Paste).</p>}
    </div>
  );
}

/** Two rows of template buttons: personal (filled in per club) and general (for Bcc batches). */
function TemplatePicker({ templates, value, onChange, compact }: { templates: Template[]; value: string; onChange: (id: string) => void; compact?: boolean }) {
  const group = (kind: Template['kind'], label: string) => (
    <div>
      <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {templates.filter((t) => t.kind === kind).map((t) => (
          <button key={t.id} type="button" onClick={() => onChange(t.id)} className={`rounded-lg font-bold ${compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'}`}
            style={value === t.id ? { background: GREEN, color: '#fff' } : { background: 'rgba(0,0,0,.3)', color: '#fff', border: '1px solid rgba(255,255,255,.1)' }}>{t.name}</button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="space-y-2">
      {group('personal', 'Personal · fills in each club (one by one)')}
      {group('general', 'General · for Bcc batches')}
    </div>
  );
}

export function ClubOutreachPanel() {
  const [tab, setTab] = useState('new');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [settings, setSettings] = useState<Settings>(() => load(SETTINGS_KEY, { sender: 'Shann', gmail: '', address: '', tournamentLink: '', batchSize: 40, styled: true }));
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

  // BCC batches: copy/paste addresses or open one Gmail draft per batch.
  const [batches, setBatches] = useState<Contact[][] | null>(null);
  const [bi, setBi] = useState(0);
  const [copied, setCopied] = useState('');
  const batchSize = Math.max(5, Math.min(100, Number(settings.batchSize) || 40));
  const startBatches = () => {
    const list = contacts.filter((c) => selected.has(c.id));
    if (!list.length) return;
    if (!settings.address.trim()) { setMsg('Add your mailing address in Sender details first. Marketing emails must include one.'); setEditing(true); return; }
    const out: Contact[][] = [];
    for (let i = 0; i < list.length; i += batchSize) out.push(list.slice(i, i + batchSize));
    setBatches(out); setBi(0); setCopied('');
  };
  const copyText = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch { /* ignore */ } t.remove();
    }
    setCopied(what); setTimeout(() => setCopied(''), 1800);
  };
  const batch = batches?.[bi] ?? null;
  const bulkSubject = fill(template.subject, null, settings);
  const bulkBody = fill(template.body, null, settings);
  const finishBatch = async () => {
    if (!batch || !batches) return;
    await setStatus(batch.map((c) => c.id), 'contacted', template.id);
    if (bi + 1 >= batches.length) { setBatches(null); setSelected(new Set()); void loadData(); }
    else { setBi(bi + 1); setCopied(''); }
  };

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
  const [opened, setOpened] = useState(false);
  useEffect(() => { setOpened(false); }, [qi, queue]);
  // ── Resend ──
  const [quota, setQuota] = useState<{ limit: number; used: number; remaining: number } | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const loadQuota = useCallback(async () => {
    try { const r = await apiFetch('/api/admin/club-outreach/resend-quota', { credentials: 'include' }); if (r.ok) setQuota(await r.json()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void loadQuota(); }, [loadQuota]);
  /** Sends each contact its own styled email (template filled for that club) through Resend. */
  const sendViaResend = async (list: Contact[]): Promise<boolean> => {
    if (!list.length) return false;
    if (!settings.address.trim()) { setMsg('Add your mailing address in Sender details first. Marketing emails must include one.'); setEditing(true); return false; }
    const n = quota ? Math.min(list.length, quota.remaining) : list.length;
    if (quota && quota.remaining <= 0) { setMsg(`Resend's daily outreach limit is used up (${quota.limit} a day). Use Gmail or try tomorrow.`); return false; }
    if (!confirm(`Send ${n} styled email${n === 1 ? '' : 's'} through Resend now?${quota && list.length > quota.remaining ? ` (${list.length - quota.remaining} will wait for tomorrow's limit.)` : ''}`)) return false;
    setResendBusy(true); setMsg(`Sending ${n} through Resend…`);
    const items = list.map((c) => {
      const text = fill(template.body, c, settings);
      return { id: c.id, subject: fill(template.subject, c, settings), text, html: styledEmailHtml(text) };
    });
    try {
      const r = await apiFetch('/api/admin/club-outreach/send', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, replyTo: settings.gmail || undefined, template: template.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || 'Could not send'); return false; }
      setMsg(`Sent ${d.sent} through Resend${d.failed?.length ? `, ${d.failed.length} failed` : ''}${d.skippedForLimit ? `, ${d.skippedForLimit} left for tomorrow (daily limit)` : ''}. Replies go to ${settings.gmail || 'your Resend sender address'}.`);
      return true;
    } catch { setMsg('Could not send'); return false; }
    finally { setResendBusy(false); void loadQuota(); void loadData(); }
  };

  const markSentAndNext = async () => {
    if (!current) return;
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
            New ones are found every Monday; use the button for more. Send from your Gmail one at a time, or copy addresses into Bcc batches.
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
              <label className="flex items-center gap-2 text-xs font-bold text-white">
                <input type="checkbox" checked={settings.styled} onChange={(e) => updateSettings({ styled: e.target.checked })} className="h-4 w-4 accent-[#81B64C]" />
                Styled emails (ChessScout look, copied and pasted into the draft)
              </label>
              <div><p className={LABEL}>Addresses per BCC batch</p><input className={INPUT} type="number" min={5} max={100} value={settings.batchSize} onChange={(e) => updateSettings({ batchSize: Number(e.target.value) || 40 })} /></div>
              <p className="text-[11px]" style={{ color: MUTED }}>Saved on this device.</p>
            </div>
          ) : (
            <p className="text-xs" style={{ color: MUTED }}>{settings.sender || 'No name'} · {settings.gmail || 'default Gmail account'} · {settings.address ? 'address set' : 'no mailing address yet'}</p>
          )}
        </div>
        <div className="space-y-2 rounded-xl p-3.5" style={INNER}>
          <p className="text-sm font-bold text-white">Template</p>
          <TemplatePicker templates={templates} value={templateId} onChange={setTemplateId} />
          <input className={INPUT} value={template.subject} onChange={(e) => updateTemplate({ subject: e.target.value })} />
          <textarea className={`${INPUT} min-h-[150px] font-mono text-[12px]`} value={template.body} onChange={(e) => updateTemplate({ body: e.target.value })} />
          <div className="flex items-center justify-between">
            <p className="text-[11px]" style={{ color: MUTED }}>
              {template.kind === 'personal' ? 'Fills in: {{org}} {{city}} {{sender}} {{address}} {{tournamentLine}}' : 'Fills in: {{sender}} {{address}} {{tournamentLine}}'}
            </p>
            {overrides[template.id] && <button onClick={resetTemplate} className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: GREEN }}><RotateCcw size={11} /> Reset</button>}
          </div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_TABS.map((s) => {
          const n = s.id === 'all' ? (Object.values(counts) as number[]).reduce((a, b) => a + b, 0) : counts[s.id] ?? 0;
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
            <Mail size={13} /> Email one by one
          </button>
          <button onClick={async () => { if (await sendViaResend(contacts.filter((c) => selected.has(c.id)))) setSelected(new Set()); }} disabled={!selected.size || resendBusy}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50" style={{ background: GREEN, color: '#fff' }}>
            {resendBusy ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Send with Resend
          </button>
          <button onClick={startBatches} disabled={!selected.size} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50" style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }}>
            <Copy size={13} /> BCC batches
          </button>
          <button onClick={() => copyText(contacts.filter((c) => selected.has(c.id)).map((c) => c.email).join(', '), 'list')} disabled={!selected.size}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-50" style={{ background: 'rgba(255,255,255,.06)', color: '#fff' }}>
            {copied === 'list' ? <Check size={13} /> : <Copy size={13} />} {copied === 'list' ? 'Copied' : 'Copy emails'}
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
        Resend sends each club its own styled email (replies go to your Gmail, with an unsubscribe link){quota ? ` · ${quota.remaining} of ${quota.limit} left today` : ''}.
        Tip: keep Gmail to a few dozen a day so your emails keep landing in inboxes. Anyone who replies "no thanks" goes on the never-contact list (the ⊘ button).
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

      {/* BCC batches */}
      {batches && batch && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center p-0 sm:items-center sm:p-4" style={{ background: 'rgba(0,0,0,.6)' }}>
          <div className="max-h-[92vh] w-full max-w-[640px] space-y-3 overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: '#262421', border: '1px solid rgba(255,255,255,.1)' }}>
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm font-bold text-white">Batch {bi + 1} of {batches.length} · {batch.length} addresses</p>
              <button onClick={() => { setBatches(null); void loadData(); }} aria-label="Close" className="p-1" style={{ color: MUTED }}><X size={18} /></button>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full" style={{ width: `${(bi / batches.length) * 100}%`, background: GREEN }} /></div>
            <TemplatePicker templates={templates} value={templateId} onChange={setTemplateId} compact />
            <p className="text-[12px]" style={{ color: MUTED }}>
              Put these in <b className="text-white">Bcc</b> (never To or Cc) so organizations can't see each other's addresses. Personal templates use "your club" here, since one email goes to several clubs.
            </p>
            <div className="max-h-[110px] overflow-y-auto rounded-lg p-2.5 font-mono text-[11.5px] text-white/80" style={{ background: 'rgba(0,0,0,.3)' }}>
              {batch.map((c) => c.email).join(', ')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => copyText(batch.map((c) => c.email).join(', '), 'bcc')} className="inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>
                {copied === 'bcc' ? <Check size={14} /> : <Copy size={14} />} {copied === 'bcc' ? 'Copied' : 'Copy addresses'}
              </button>
              <button onClick={() => copyText(`${bulkSubject}\n\n${bulkBody}`, 'msg')} className="inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>
                {copied === 'msg' ? <Check size={14} /> : <Copy size={14} />} {copied === 'msg' ? 'Copied' : 'Copy subject + message'}
              </button>
            </div>
            <p className="text-sm font-bold text-white">{bulkSubject}</p>
            <DraftActions draft={{ to: settings.gmail, bcc: batch.map((c) => c.email), subject: bulkSubject, body: bulkBody }} styled={settings.styled} account={settings.gmail} onOpened={() => {}} />
            <button onClick={async () => {
                if (await sendViaResend(batch)) {
                  if (bi + 1 >= (batches?.length ?? 0)) { setBatches(null); setSelected(new Set()); } else { setBi(bi + 1); setCopied(''); }
                }
              }} disabled={resendBusy || (quota?.remaining ?? 1) <= 0}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold disabled:opacity-50" style={{ background: 'rgba(129,182,76,.18)', color: '#fff', border: '1px solid rgba(129,182,76,.5)' }}>
              {resendBusy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Send this batch with Resend, one email each{quota ? ` (${quota.remaining} left today)` : ''}
            </button>
            <button onClick={finishBatch} className="w-full rounded-xl py-2.5 text-xs font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>
              {bi + 1 >= batches.length ? 'Sent — mark contacted and finish' : 'Sent — mark contacted, next batch'}
            </button>
            <p className="text-[11px]" style={{ color: MUTED }}>
              Gmail allows about 500 recipients a day on a regular account. Spreading batches across the day and keeping replies flowing helps the account stay in good standing.
            </p>
          </div>
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
            <TemplatePicker templates={templates} value={templateId} onChange={setTemplateId} compact />
            <p className="text-xs" style={{ color: MUTED }}>To: <span className="text-white">{current.email}</span></p>
            <p className="text-sm font-bold text-white">{subject}</p>
            <DraftActions draft={{ to: current.email, subject, body }} styled={settings.styled} account={settings.gmail} onOpened={() => setOpened(true)} />
            <button onClick={async () => { if (await sendViaResend([current])) advance(); }} disabled={resendBusy || (quota?.remaining ?? 1) <= 0}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold disabled:opacity-50" style={{ background: 'rgba(129,182,76,.18)', color: '#fff', border: '1px solid rgba(129,182,76,.5)' }}>
              {resendBusy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Send styled with Resend instead{quota ? ` (${quota.remaining} left today)` : ''}
            </button>
            <button onClick={markSentAndNext} className="w-full rounded-xl py-2.5 text-xs font-bold" style={opened ? { background: GREEN, color: '#fff' } : { background: 'rgba(255,255,255,.08)', color: '#fff' }}>
              {qi + 1 >= queue.length ? 'Sent — mark contacted and finish' : 'Sent — mark contacted, next'}
            </button>
            <div className="flex gap-2">
              <button onClick={advance} className="flex-1 rounded-xl py-2 text-xs font-bold" style={{ background: 'rgba(255,255,255,.05)', color: MUTED }}>Skip</button>
              <button onClick={async () => { await setStatus([current.id], 'not_interested'); advance(); }} className="flex-1 rounded-xl py-2 text-xs font-bold" style={{ background: 'rgba(255,255,255,.05)', color: MUTED }}>Not a fit</button>
            </div>
            <p className="flex items-center gap-1.5 text-[11px]" style={{ color: MUTED }}><Check size={12} /> Send it in Gmail, then come back and tap Sent.</p>
          </div>
        </div>
      )}
    </div>
  );
}
