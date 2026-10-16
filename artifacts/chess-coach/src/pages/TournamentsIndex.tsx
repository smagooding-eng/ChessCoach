import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Trophy, Plus, Search, Users, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { setPageMeta } from '@/lib/pageMeta';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { whenLabel, type TournamentSummary } from '@/components/play/Tournaments';
import { TournamentLogo } from '@/components/play/TournamentBranding';

// Public list of tournaments (signed in or not): open to join, in progress,
// and finished, each opening its page with standings, bracket and games.

type Tab = 'open' | 'live' | 'finished';

function isFull(t: TournamentSummary) { return !!t.maxPlayers && t.players >= t.maxPlayers; }
function isOpen(t: TournamentSummary) {
  if (isFull(t)) return false;
  return t.status === 'scheduled' || (t.status === 'running' && t.format === 'arena');
}

function StatusChip({ t }: { t: TournamentSummary }) {
  const [label, dot] = t.status === 'finished'
    ? ['Finished', PT.muted]
    : isFull(t) ? ['Full', PT.gold]
    : t.status === 'running' && t.format === 'bracket' ? ['Registration closed', PT.muted]
    : t.status === 'running' ? ['Live now · open', '#FF5058']
    : ['Open', PT.green];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wider"
      style={{ background: 'rgba(255,255,255,.06)', border: `1px solid ${PT.border}`, color: PT.text }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} /> {label}
    </span>
  );
}

function Row({ t, now }: { t: TournamentSummary; now: number }) {
  const host = t.clubName || (t.createdByName && t.createdByName !== 'ChessScout.net' ? t.createdByName : 'ChessScout.net');
  return (
    <Link href={`/tournaments/${t.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[.02]" style={{ borderTop: `1px solid ${PT.border}` }}>
      <TournamentLogo t={t} size={48} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="truncate text-[15px] font-extrabold" style={{ color: PT.text }}>{t.name}</b>
          <StatusChip t={t} />
          {t.joined && <span className="text-[10.5px] font-black uppercase tracking-wider" style={{ color: PT.green }}>Joined</span>}
          {t.isCreator && <span className="text-[10.5px] font-black uppercase tracking-wider" style={{ color: PT.muted }}>Yours</span>}
        </span>
        <span className="block truncate text-[12px]" style={{ color: PT.muted }}>{host}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px]" style={{ color: PT.muted }}>
          <span className="inline-flex items-center gap-1"><Clock size={11} /> {t.format === 'bracket' ? 'Knockout' : 'Arena'} · {t.timeControlLabel} · {t.mode === 'ranked' ? 'Ranked' : 'Casual'}</span>
          <span className="inline-flex items-center gap-1"><Users size={11} /> {t.players}{t.maxPlayers ? ` / ${t.maxPlayers}` : ''}</span>
          <span>{whenLabel(t, now)}</span>
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0" style={{ color: PT.muted }} />
    </Link>
  );
}

export function TournamentsIndex() {
  const { isAuthenticated } = useUser();
  const [data, setData] = useState<{ running: TournamentSummary[]; upcoming: TournamentSummary[]; recent: TournamentSummary[] } | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const [q, setQ] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setPageMeta('Online Chess Tournaments | ChessScout.net', 'Join free online chess tournaments: arenas and knockouts, live or daily. See standings, brackets and results, or create one for your club.', '/tournaments');
    let alive = true;
    const load = () => apiFetch('/api/tournaments', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d) setData(d); }).catch(() => {});
    void load();
    const t = setInterval(load, 30_000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; clearInterval(t); clearInterval(c); };
  }, []);

  const lists = useMemo(() => {
    const all = [...(data?.running ?? []), ...(data?.upcoming ?? [])];
    return {
      open: all.filter(isOpen).sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
      live: data?.running ?? [],
      finished: data?.recent ?? [],
    };
  }, [data]);
  const shown = lists[tab].filter((t) => !q || `${t.name} ${t.clubName ?? ''} ${t.createdByName ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  // Upcoming but full or closed still deserve a place: list them under Open as "Full".
  const fullUpcoming = tab === 'open' ? (data?.upcoming ?? []).filter(isFull) : [];

  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: 'open', label: 'Open to join', n: lists.open.length },
    { id: 'live', label: 'In progress', n: lists.live.length },
    { id: 'finished', label: 'Finished', n: lists.finished.length },
  ];

  return (
    <div className="mx-auto max-w-[760px] space-y-4 p-4 pb-28 md:p-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-black md:text-3xl" style={{ color: PT.text, letterSpacing: '-0.02em' }}>
            <Trophy size={24} style={{ color: PT.gold }} /> Tournaments
          </h1>
          <p className="text-[13px]" style={{ color: PT.muted }}>Arenas and knockouts, live or daily. Tap one for standings, bracket and games.</p>
        </div>
        <Link href={isAuthenticated ? '/tournaments/new' : '/setup'} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[13px] font-extrabold" style={greenBtn}>
          <Plus size={15} /> Create
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-[14px] p-1" style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${PT.border}` }}>
        {tabs.map((x) => (
          <button key={x.id} onClick={() => setTab(x.id)} aria-pressed={tab === x.id}
            className="rounded-[10px] px-2 py-2.5 text-[13px] font-extrabold"
            style={tab === x.id ? greenBtn : { color: PT.muted }}>
            {x.label} <span className="opacity-70">{x.n}</span>
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 rounded-[14px] px-3.5 py-2.5" style={{ background: PT.cardSolid, border: `1px solid ${PT.border}` }}>
        <Search size={16} style={{ color: PT.muted }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or club" className="w-full bg-transparent text-[14px] outline-none" style={{ color: PT.text }} />
      </label>

      <div className="overflow-hidden" style={cardStyle}>
        {!data ? (
          <div className="py-10 text-center"><Loader2 className="mx-auto animate-spin" style={{ color: PT.green }} /></div>
        ) : shown.length === 0 && fullUpcoming.length === 0 ? (
          <div className="space-y-3 px-4 py-10 text-center">
            <p className="text-[14px] font-bold" style={{ color: PT.text }}>
              {tab === 'open' ? 'No tournaments open right now.' : tab === 'live' ? 'Nothing in progress right now.' : 'No finished tournaments yet.'}
            </p>
            <Link href={isAuthenticated ? '/tournaments/new' : '/setup'} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-extrabold" style={ghostBtn}>
              <Plus size={14} /> Create one for your friends or club
            </Link>
          </div>
        ) : (
          <div className="-mt-px">
            {shown.map((t) => <Row key={t.id} t={t} now={now} />)}
            {fullUpcoming.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase())).map((t) => <Row key={t.id} t={t} now={now} />)}
          </div>
        )}
      </div>
    </div>
  );
}
