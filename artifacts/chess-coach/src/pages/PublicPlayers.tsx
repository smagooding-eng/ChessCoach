import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import { Loader2, Search, ArrowRight, ExternalLink } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { setPageMeta } from '@/lib/pageMeta';
import { useUser } from '@/hooks/use-user';
import { RD } from '@/lib/redesignTheme';

// Public player pages: what well-known Chess.com players actually play, from
// their real recent games. Open to everyone (no login) and indexable, so people
// searching "what does Hikaru play" can find ChessScout. The same text is put
// into the page's HTML before the app loads (see /api/page on Vercel).

type Res = { games: number; wins: number; draws: number; losses: number };
interface PlayerData {
  username: string; name: string | null; title: string | null; avatar: string | null; country: string | null; url: string | null;
  ratings: { bullet?: number; blitz?: number; rapid?: number };
  period: { from: string; to: string; games: number };
  overall: { wins: number; draws: number; losses: number };
  asWhite: Res & { firstMoves: (Res & { move: string })[]; openings: (Res & { name: string })[] };
  asBlack: Res & { vsE4: (Res & { move: string })[]; vsD4: (Res & { move: string })[]; openings: (Res & { name: string })[] };
  timeClasses: { name: string; games: number }[];
  recent: ('W' | 'D' | 'L')[];
}
interface Summary { slug: string; name: string | null; title: string | null; avatar: string | null; ratings: PlayerData['ratings']; games: number }

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const score = (r: Res) => (r.games ? Math.round(((r.wins + r.draws * 0.5) / r.games) * 100) : 0);
const display = (p: { name: string | null; slug?: string; username?: string; title: string | null }) => {
  const handle = p.username ?? p.slug ?? '';
  return `${p.title ? `${p.title} ` : ''}${p.name || handle}`;
};

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[18px] p-4 ${className}`} style={{ background: RD.card, border: `1px solid ${RD.border}` }}>{children}</section>;
}

function Bar({ value }: { value: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
      <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: RD.green }} />
    </span>
  );
}

function ResultTable({ rows, label, total }: { rows: (Res & { name?: string; move?: string })[]; label: string; total: number }) {
  if (!rows.length) return <p className="text-[13px]" style={{ color: RD.muted }}>Not enough games.</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const key = r.name ?? r.move ?? '';
        return (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
              <span className="min-w-0 truncate font-bold" style={{ color: RD.text }}>{r.move ? `1.${label === 'white' ? '' : '.. '}${r.move}` : key}</span>
              <span className="shrink-0 tabular-nums" style={{ color: RD.muted }}>{r.games} games · {pct(r.games, total)}% · scores {score(r)}%</span>
            </div>
            <Bar value={pct(r.games, total)} />
          </div>
        );
      })}
    </div>
  );
}

function SignupCta() {
  const { isAuthenticated } = useUser();
  return (
    <Card className="text-center">
      <p className="text-[15px] font-extrabold" style={{ color: RD.text }}>Playing someone soon? Scout them the same way.</p>
      <p className="mt-1 text-[13px]" style={{ color: RD.muted }}>ChessScout reads any Chess.com or Lichess player&apos;s games and shows what they play and where they go wrong.</p>
      <Link href={isAuthenticated ? '/opponents' : '/setup'} className="mt-3 inline-flex items-center gap-2 rounded-[12px] px-5 py-2.5 text-[14px] font-extrabold" style={{ background: RD.green, color: '#FFFFFF' }}>
        <Search size={16} /> {isAuthenticated ? 'Scout an opponent' : 'Scout a player free'}
      </Link>
    </Card>
  );
}

export function PublicPlayerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PlayerData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');

  useEffect(() => {
    setState('loading');
    apiFetch(`/api/public/players/${encodeURIComponent(slug ?? '')}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.data) { setData(d.data); setState('ok'); } else setState('missing'); })
      .catch(() => setState('missing'));
  }, [slug]);

  useEffect(() => {
    if (!data) return;
    const who = display({ ...data, title: data.title });
    const top = data.asWhite.firstMoves[0];
    setPageMeta(
      `${who} — Openings & Repertoire | ChessScout`,
      `What ${data.name || data.username} plays on Chess.com: ${top ? `1.${top.move} in ${pct(top.games, data.asWhite.games)}% of White games, ` : ''}top openings as White and Black, and results from ${data.period.games} recent games.`,
      `/players/${data.username}`,
    );
  }, [data]);

  if (state === 'loading') return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: RD.green }} /></div>;
  if (state === 'missing' || !data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <h1 className="text-2xl font-black" style={{ color: RD.text }}>Player not found</h1>
        <p className="mt-2 text-sm" style={{ color: RD.muted }}>We don&apos;t have a page for this player yet.</p>
        <Link href="/players" className="mt-4 inline-block text-sm font-bold" style={{ color: RD.green }}>See all players</Link>
      </div>
    );
  }

  const d = data;
  const from = new Date(d.period.from).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const to = new Date(d.period.to).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const name = d.name || d.username;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-28 pt-4 md:pb-10">
      <nav className="text-[12.5px]" style={{ color: RD.muted }}><Link href="/players" style={{ color: RD.muted }}>Players</Link> / <span style={{ color: RD.text }}>{d.username}</span></nav>
      <Card>
        <div className="flex items-center gap-4">
          {d.avatar && <img src={d.avatar} alt="" className="cs-keep-img h-16 w-16 shrink-0 rounded-2xl object-cover" />}
          <div className="min-w-0">
            <h1 className="text-[22px] font-black leading-tight" style={{ color: RD.text }}>
              {d.title && <span className="mr-1.5 rounded-md px-1.5 py-0.5 align-middle text-[12px] font-black" style={{ background: 'rgba(255,255,255,.08)', color: RD.text }}>{d.title}</span>}
              {name}&apos;s openings
            </h1>
            <p className="mt-0.5 text-[13px]" style={{ color: RD.muted }}>
              Chess.com: {d.username}
              {d.ratings.blitz ? ` · Blitz ${d.ratings.blitz}` : ''}{d.ratings.bullet ? ` · Bullet ${d.ratings.bullet}` : ''}{d.ratings.rapid ? ` · Rapid ${d.ratings.rapid}` : ''}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: RD.text }}>
          From {d.period.games} games played on Chess.com between {from} and {to}: {name} scored {score({ games: d.period.games, wins: d.overall.wins, draws: d.overall.draws, losses: d.overall.losses })}% ({d.overall.wins} wins, {d.overall.draws} draws, {d.overall.losses} losses).
          {d.asWhite.firstMoves[0] ? ` With White, ${name} opens 1.${d.asWhite.firstMoves[0].move} in ${pct(d.asWhite.firstMoves[0].games, d.asWhite.games)}% of games.` : ''}
        </p>
        {d.recent.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[12px]" style={{ color: RD.muted }}>Last {d.recent.length}:</span>
            {d.recent.map((r, i) => (
              <span key={i} className="grid h-5 w-5 place-items-center rounded text-[10px] font-black" style={{ background: 'rgba(255,255,255,.07)', color: RD.text }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: r === 'W' ? RD.green : r === 'L' ? RD.red : '#B9C2BF' }} />
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <h2 className="text-[16px] font-extrabold" style={{ color: RD.text }}>As White: first move</h2>
          <p className="mb-3 text-[12.5px]" style={{ color: RD.muted }}>{d.asWhite.games} games · scores {score(d.asWhite)}%</p>
          <ResultTable rows={d.asWhite.firstMoves} label="white" total={d.asWhite.games} />
        </Card>
        <Card>
          <h2 className="text-[16px] font-extrabold" style={{ color: RD.text }}>As White: openings</h2>
          <p className="mb-3 text-[12.5px]" style={{ color: RD.muted }}>Most played</p>
          <ResultTable rows={d.asWhite.openings} label="white" total={d.asWhite.games} />
        </Card>
        <Card>
          <h2 className="text-[16px] font-extrabold" style={{ color: RD.text }}>As Black: against 1.e4</h2>
          <p className="mb-3 text-[12.5px]" style={{ color: RD.muted }}>{d.asBlack.games} games as Black · scores {score(d.asBlack)}%</p>
          <ResultTable rows={d.asBlack.vsE4} label="black" total={d.asBlack.vsE4.reduce((n, r) => n + r.games, 0)} />
        </Card>
        <Card>
          <h2 className="text-[16px] font-extrabold" style={{ color: RD.text }}>As Black: against 1.d4</h2>
          <p className="mb-3 text-[12.5px]" style={{ color: RD.muted }}>Most common replies</p>
          <ResultTable rows={d.asBlack.vsD4} label="black" total={d.asBlack.vsD4.reduce((n, r) => n + r.games, 0)} />
        </Card>
        <Card className="md:col-span-2">
          <h2 className="text-[16px] font-extrabold" style={{ color: RD.text }}>As Black: openings</h2>
          <p className="mb-3 text-[12.5px]" style={{ color: RD.muted }}>Most played</p>
          <ResultTable rows={d.asBlack.openings} label="black" total={d.asBlack.games} />
        </Card>
      </div>

      {d.timeClasses.length > 0 && (
        <Card>
          <h2 className="text-[16px] font-extrabold" style={{ color: RD.text }}>What they play</h2>
          <p className="mt-1 text-[13.5px]" style={{ color: RD.text }}>
            {d.timeClasses.map((t) => `${t.name.charAt(0).toUpperCase() + t.name.slice(1)} ${pct(t.games, d.period.games)}%`).join(' · ')}
          </p>
        </Card>
      )}

      <SignupCta />

      <p className="px-1 text-[11.5px] leading-relaxed" style={{ color: RD.muted }}>
        Worked out by ChessScout from {name}&apos;s public games on Chess.com; updated about once a week. Score = wins plus half the draws.
        {d.url && <> <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline" style={{ color: RD.muted }}>Profile on Chess.com <ExternalLink size={11} /></a></>}
      </p>
    </div>
  );
}

export function PublicPlayersIndex() {
  const [list, setList] = useState<Summary[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    setPageMeta('Top Chess Players’ Openings & Repertoires | ChessScout', 'See what the world’s top Chess.com players and streamers actually play: first moves, favorite openings as White and Black, and recent results.', '/players');
    apiFetch('/api/public/players').then((r) => (r.ok ? r.json() : { players: [] })).then((d) => setList(d.players ?? [])).catch(() => setList([]));
  }, []);
  const shown = (list ?? []).filter((p) => !q || `${p.slug} ${p.name ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-28 pt-4 md:pb-10">
      <h1 className="text-[26px] font-black leading-tight" style={{ color: RD.text }}>What top players play</h1>
      <p className="text-[14px]" style={{ color: RD.muted }}>Openings, first moves and recent results for top Chess.com players and streamers, from their real games.</p>
      <label className="flex items-center gap-2 rounded-[14px] px-3.5 py-2.5" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
        <Search size={16} style={{ color: RD.muted }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a player" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" style={{ color: RD.text }} />
      </label>
      {list === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" style={{ color: RD.green }} /></div>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: RD.muted }}>{list.length ? 'No player matches that.' : 'Player pages are being built — check back soon.'}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {shown.map((p) => {
            const best = Math.max(p.ratings.blitz ?? 0, p.ratings.bullet ?? 0, p.ratings.rapid ?? 0);
            return (
              <Link key={p.slug} href={`/players/${p.slug}`} className="flex items-center gap-3 rounded-[16px] px-3.5 py-3" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
                {p.avatar ? <img src={p.avatar} alt="" loading="lazy" className="cs-keep-img h-10 w-10 shrink-0 rounded-xl object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-xl" style={{ background: 'rgba(255,255,255,.07)' }} />}
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14.5px]" style={{ color: RD.text }}>{display({ name: p.name, slug: p.slug, title: p.title })}</b>
                  <span className="block truncate text-[12px]" style={{ color: RD.muted }}>{p.slug}{best ? ` · ${best}` : ''}</span>
                </span>
                <ArrowRight size={16} style={{ color: RD.muted }} />
              </Link>
            );
          })}
        </div>
      )}
      <SignupCta />
    </div>
  );
}
