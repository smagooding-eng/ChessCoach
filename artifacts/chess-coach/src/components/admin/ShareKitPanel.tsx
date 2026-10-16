import React, { useEffect, useMemo, useState } from 'react';
import { Link2, Copy, Check, Share2, ExternalLink, Monitor, Smartphone, RefreshCw, Image as ImageIcon, Eye } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';

// Share kit (Admin > Growth & Marketing): every page worth sharing, each
// with a ready link (optionally tagged with where you're posting it and your
// referral code) and a current screenshot of the live page.
//
// Screenshots come from Microlink's screenshot service, which renders the
// real page in a browser and caches the image for about a day; "Refresh"
// asks for a fresh one. "Live" shows the page itself, as visitors see it.

const SITE = 'https://chessscout.net';
const CARD: React.CSSProperties = { background: '#302e2b', border: '1px solid rgba(255,255,255,0.05)' };
const INNER: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' };
const GREEN = '#81B64C';
const MUTED = '#9e9b98';

interface Item { title: string; path: string; note?: string; group: string; signIn?: boolean }

const STATIC: Item[] = [
  { group: 'Main pages', title: 'Home', path: '/', note: 'Play. Scout. Improve. The landing page with sign-up.' },
  { group: 'Main pages', title: 'Pricing', path: '/pricing', note: 'Free vs Pro, $5/month.' },
  { group: 'Main pages', title: 'Tournaments', path: '/tournaments', note: 'Public list: open, in progress, finished.' },
  { group: 'Main pages', title: 'Create a tournament', path: '/tournaments/new', note: 'Sign-up first, then the create screen.', signIn: true },
  { group: 'Main pages', title: 'Top players', path: '/players', note: "What top players play, from their real games." },
  { group: 'Main pages', title: 'Learn (articles)', path: '/learn', note: 'Chess guides and articles.' },
  { group: 'Main pages', title: 'Sweepstakes', path: '/raffle', note: 'Win a ChessNut Air.' },
  { group: 'Main pages', title: 'Get the app', path: '/download', note: 'Install on phone or desktop.' },
  { group: 'Comparisons', title: 'ChessScout vs Aimchess', path: '/vs/aimchess' },
  { group: 'Comparisons', title: 'ChessScout vs ImproveMyChess', path: '/vs/improve-my-chess' },
  { group: 'Comparisons', title: 'ChessScout vs free analysis', path: '/vs/free-chess-analysis' },
  { group: 'In the app (sign-in)', title: 'Play', path: '/play', note: 'Visitors are asked to sign up first.', signIn: true },
  { group: 'In the app (sign-in)', title: 'Play Online', path: '/live', signIn: true },
  { group: 'In the app (sign-in)', title: 'Puzzles', path: '/puzzles', signIn: true },
  { group: 'In the app (sign-in)', title: 'Opening Trainer', path: '/openings', signIn: true },
  { group: 'In the app (sign-in)', title: 'Practice bots', path: '/practice', signIn: true },
  { group: 'In the app (sign-in)', title: 'Scout an opponent', path: '/opponents', signIn: true },
];

const SOURCES = [
  { id: '', label: 'No tag' }, { id: 'instagram', label: 'Instagram' }, { id: 'facebook', label: 'Facebook' }, { id: 'reddit', label: 'Reddit' },
  { id: 'tiktok', label: 'TikTok' }, { id: 'youtube', label: 'YouTube' }, { id: 'x', label: 'X / Twitter' }, { id: 'discord', label: 'Discord' }, { id: 'email', label: 'Email' },
];

type View = 'desktop' | 'phone';

function shotUrl(url: string, view: View, bust: number): string {
  const q = new URLSearchParams({ url, screenshot: 'true', meta: 'false', embed: 'screenshot.url', waitForTimeout: '3000' });
  if (view === 'phone') { q.set('viewport.width', '390'); q.set('viewport.height', '844'); q.set('viewport.isMobile', 'true'); q.set('viewport.deviceScaleFactor', '2'); }
  else { q.set('viewport.width', '1280'); q.set('viewport.height', '800'); }
  if (bust) { q.set('force', 'true'); q.set('_', String(bust)); }
  return `https://api.microlink.io/?${q.toString()}`;
}

function Card({ item, url, view, live }: { item: Item; url: string; view: View; live: boolean }) {
  const [copied, setCopied] = useState(false);
  const [bust, setBust] = useState(0);
  const [failed, setFailed] = useState(false);
  const shot = shotUrl(`${SITE}${item.path}`, view, bust);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch {
      const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch { /* ignore */ } t.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const ratio = view === 'phone' ? '390 / 700' : '1280 / 800';
  return (
    <div className="overflow-hidden rounded-xl" style={INNER}>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: ratio, background: '#050A0B' }}>
        {live ? (
          <iframe title={item.title} src={item.path} loading="lazy"
            className="absolute left-0 top-0 origin-top-left border-0"
            style={view === 'phone' ? { width: 390, height: 700, transform: 'scale(var(--s,0.6))' } : { width: 1280, height: 800, transform: 'scale(var(--s,0.25))' }}
            ref={(el) => {
              if (!el?.parentElement) return;
              const w = el.parentElement.clientWidth;
              el.style.setProperty('--s', String(w / (view === 'phone' ? 390 : 1280)));
            }} />
        ) : failed ? (
          <div className="grid h-full place-items-center p-4 text-center text-[11.5px]" style={{ color: MUTED }}>
            Screenshot unavailable right now (the free screenshot service allows about 50 a day). Use Live, or try Refresh later.
          </div>
        ) : (
          <img key={shot} src={shot} alt={`${item.title} screenshot`} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover object-top" />
        )}
        {item.signIn && <span className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(0,0,0,.7)', color: '#fff' }}>Sign-in page</span>}
      </div>
      <div className="space-y-2 p-3">
        <div>
          <p className="text-sm font-bold text-white">{item.title}</p>
          {item.note && <p className="text-[11.5px]" style={{ color: MUTED }}>{item.note}</p>}
        </div>
        <p className="truncate rounded-lg px-2 py-1.5 font-mono text-[11px] text-white/80" style={{ background: 'rgba(0,0,0,.3)' }}>{url}</p>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={copy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold" style={{ background: GREEN, color: '#fff' }}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy link'}
          </button>
          {canShare && (
            <button onClick={() => navigator.share({ title: `ChessScout.net · ${item.title}`, url }).catch(() => {})} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>
              <Share2 size={13} /> Share
            </button>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>
            <ExternalLink size={13} /> Open
          </a>
          {!live && !failed && (
            <>
              <a href={shot} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>
                <ImageIcon size={13} /> Image
              </a>
              <button onClick={() => { setFailed(false); setBust(Date.now()); }} title="Take a fresh screenshot" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white" style={{ background: 'rgba(255,255,255,.08)' }}>
                <RefreshCw size={13} /> Refresh
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ShareKitPanel() {
  const { authUser } = useUser();
  const inviteCode = (authUser as unknown as { inviteCode?: string | null } | null)?.inviteCode ?? null;
  const [source, setSource] = useState('');
  const [withRef, setWithRef] = useState(false);
  const [view, setView] = useState<View>('phone');
  const [live, setLive] = useState(false);
  const [open, setOpen] = useState(false);
  const [dynamic, setDynamic] = useState<Item[]>([]);

  useEffect(() => {
    if (!open) return;
    const items: Item[] = [];
    Promise.all([
      apiFetch('/api/tournaments').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      apiFetch('/api/articles').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      apiFetch('/api/public/players').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([t, a, p]) => {
      for (const x of [...(t?.running ?? []), ...(t?.upcoming ?? [])].slice(0, 8)) {
        items.push({ group: 'Tournaments now', title: x.name, path: `/tournaments/${x.id}`, note: `${x.format === 'bracket' ? 'Knockout' : 'Arena'} · ${x.timeControlLabel} · ${x.players} players` });
      }
      for (const x of (a?.articles ?? []).slice(0, 6)) items.push({ group: 'Latest articles', title: x.title, path: `/learn/${x.slug}` });
      for (const x of (p?.players ?? []).slice(0, 6)) items.push({ group: 'Top player pages', title: x.name || x.slug, path: `/players/${encodeURIComponent(x.slug)}` });
      setDynamic(items);
    });
  }, [open]);

  const linkFor = (path: string) => {
    const q = new URLSearchParams();
    if (source) { q.set('utm_source', source); q.set('utm_medium', 'social'); q.set('utm_campaign', 'share_kit'); }
    if (withRef && inviteCode) q.set('ref', inviteCode);
    const qs = q.toString();
    return `${SITE}${path}${qs ? `${path.includes('?') ? '&' : '?'}${qs}` : ''}`;
  };

  const groups = useMemo(() => {
    const all = [...STATIC, ...dynamic];
    const map = new Map<string, Item[]>();
    for (const it of all) { if (!map.has(it.group)) map.set(it.group, []); map.get(it.group)!.push(it); }
    return [...map.entries()];
  }, [dynamic]);

  const pill = (on: boolean): React.CSSProperties => on ? { background: GREEN, color: '#fff' } : { background: 'rgba(0,0,0,.3)', color: '#fff', border: '1px solid rgba(255,255,255,.1)' };

  return (
    <div className="rounded-2xl p-5 space-y-4" style={CARD}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-3 text-left">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: GREEN, color: '#fff' }}><Link2 size={17} /></span>
            Share Kit
          </h2>
          <p className="mt-1 text-xs" style={{ color: MUTED }}>Shareable links for every page, with current screenshots. Tag a link with where you're posting it, add your referral code, copy and go.</p>
        </div>
        <span className="mt-1 text-xs font-bold" style={{ color: GREEN }}>{open ? 'Hide' : 'Open'}</span>
      </button>

      {open && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl p-3" style={INNER}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">Posting to</span>
              <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white outline-none">
                {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <label className={`inline-flex items-center gap-2 text-xs font-bold text-white ${inviteCode ? '' : 'opacity-50'}`}>
              <input type="checkbox" checked={withRef} disabled={!inviteCode} onChange={(e) => setWithRef(e.target.checked)} className="h-4 w-4 accent-[#81B64C]" />
              Add my referral code{inviteCode ? ` (${inviteCode})` : ''}
            </label>
            <div className="ml-auto flex gap-1.5">
              <button onClick={() => setView('phone')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold" style={pill(view === 'phone')}><Smartphone size={13} /> Phone</button>
              <button onClick={() => setView('desktop')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold" style={pill(view === 'desktop')}><Monitor size={13} /> Desktop</button>
              <button onClick={() => setLive((l) => !l)} title="Show the live page instead of a screenshot" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold" style={pill(live)}><Eye size={13} /> Live</button>
            </div>
          </div>
          <p className="text-[11px]" style={{ color: MUTED }}>
            Screenshots show what a visitor sees (signed out) and refresh about once a day; Refresh takes a new one now. Live shows the page as you see it, signed in.
            Sign-in pages send visitors to sign up first.
          </p>
          {groups.map(([group, items]) => (
            <div key={group} className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">{group}</p>
              <div className={`grid gap-3 ${view === 'phone' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                {items.map((it) => <Card key={`${it.path}-${view}-${live}`} item={it} url={linkFor(it.path)} view={view} live={live} />)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
