import React, { useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, ChevronRight, History, Loader2, Search } from 'lucide-react';
import { RD } from '@/lib/redesignTheme';
import { useUser } from '@/hooks/use-user';
import { ProUpsell } from '@/components/ProUpsell';

// Opponent Scout (redesign): header card with search, profile card, tabs,
// win-rate / vs-you split card and key weaknesses. All values come from the
// real scout result. The mockup's "Add to Watchlist" is replaced by the
// existing "Challenge on Chess.com" link (there is no watchlist feature), and
// its Tactics / Trends tabs are Weaknesses / Courses because those are the
// sections that actually have data.
interface ScoutProfile {
  username: string; name?: string; title?: string; avatar?: string; country?: string; url?: string;
  ratings?: { bullet?: number; blitz?: number; rapid?: number };
}
export interface ScoutResultLike {
  username: string;
  profile?: ScoutProfile | null;
  gamesAnalyzed: number;
  wins: number; losses: number; draws: number;
  headToHead?: { wins: number; draws: number; losses: number; total: number } | null;
  weaknesses: Array<{ category: string; severity: string; description: string; frequency: number; examples: string[] }>;
  topOpenings: Array<{ opening: string; games: number; winRate: number }>;
}

const SEV: Record<string, { bg: string; fg: string }> = {
  Critical: { bg: 'rgba(255,80,88,.22)', fg: '#FF8A8F' },
  High: { bg: 'rgba(255,80,88,.22)', fg: '#FF8A8F' },
  Medium: { bg: 'rgba(232,180,71,.22)', fg: '#F0C25C' },
  Low: { bg: 'rgba(129,182,76,.18)', fg: '#81B64C' },
};

const flag = (country?: string) => {
  const code = country?.split('/').pop()?.toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))) : '';
};

export function ScoutRedesign(props: {
  inputUsername: string;
  setInputUsername: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  statusMsg: string;
  error: string | null;
  isLimitReached: boolean;
  limitNudge: React.ReactNode;
  result: ScoutResultLike | null;
  topPlayers: { username: string; rating: number; rank: number }[];
  history: { id: string; targetUsername: string; createdAt: string }[];
  loadingHistory: boolean;
  onLoadHistory: (id: string) => void;
  exploit: React.ReactNode;
}) {
  const { inputUsername, setInputUsername, onSubmit, loading, statusMsg, error, isLimitReached, limitNudge, result, topPlayers, history, loadingHistory, onLoadHistory, exploit } = props;
  const [tab, setTab] = useState<'overview' | 'openings' | 'weaknesses' | 'courses'>('overview');
  const { isPremium, isSubscriptionLoaded } = useUser();
  const [showTop, setShowTop] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const total = result ? result.wins + result.losses + result.draws : 0;
  const winPct = total > 0 && result ? (result.wins / total) * 100 : 0;
  const p = result?.profile;
  const best = p?.ratings ? Math.max(p.ratings.bullet ?? 0, p.ratings.blitz ?? 0, p.ratings.rapid ?? 0) : 0;
  const h2h = result?.headToHead && result.headToHead.total > 0 ? result.headToHead : null;
  const behind = h2h ? h2h.losses - h2h.wins : 0;

  const card = { background: RD.card, border: `1px solid ${RD.border}` } as const;

  return (
    <div className="min-h-screen px-3 pt-3 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto grid grid-cols-1 w-full max-w-[620px] gap-3 lg:max-w-[1000px]">
        {/* Title + search */}
        <section className="rounded-[22px] p-4" style={card}>
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full" style={{ color: RD.green }}><ArrowLeft size={22} /></Link>
            <h1 className="text-[28px] font-extrabold tracking-tight">Opponent Scout</h1>
          </div>
          <p className="mt-2 text-[15px] leading-snug" style={{ color: 'rgba(245,247,246,.82)' }}>Enter a Chess.com username to get an instant scouting report.</p>

          <form onSubmit={onSubmit} className="mt-4 flex items-stretch overflow-hidden rounded-[16px]" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
            <Search size={19} className="my-auto ml-4 shrink-0" style={{ color: RD.text }} />
            <input
              value={inputUsername}
              onChange={(e) => setInputUsername(e.target.value)}
              placeholder="chess.com username"
              aria-label="Chess.com username"
              disabled={loading}
              autoCapitalize="none"
              autoCorrect="off"
              className="min-w-0 flex-1 bg-transparent px-3.5 py-4 text-[16px] outline-none placeholder:text-[#87918E]"
              style={{ color: RD.text }}
            />
            <button type="submit" disabled={loading || !inputUsername.trim()} aria-label="Scout this player" className="grid w-[64px] place-items-center disabled:opacity-50" style={{ background: `linear-gradient(180deg, ${RD.green}, ${RD.greenDark})`, color: '#05100A' }}>
              {loading ? <Loader2 size={22} className="animate-spin" /> : <ArrowRight size={24} />}
            </button>
          </form>

          {topPlayers.length > 0 && (
            <div className="mt-3">
              <button type="button" onClick={() => setShowTop((v) => !v)} className="flex items-center gap-1 text-[12.5px] font-bold" style={{ color: RD.green }}>
                {showTop ? 'Hide' : 'Or pick from the'} top 25 live players <ChevronDown size={14} className={showTop ? 'rotate-180' : ''} />
              </button>
              {showTop && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-[14px]" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
                  {topPlayers.map((t, i) => (
                    <button key={t.username} type="button" onClick={() => { setInputUsername(t.username); setShowTop(false); }} className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13.5px]" style={{ borderTop: i ? `1px solid ${RD.border}` : undefined }}>
                      <span><span className="mr-2 text-[11px]" style={{ color: RD.muted }}>#{t.rank}</span><b>{t.username}</b></span>
                      <b style={{ color: RD.green }}>{t.rating}</b>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {history.length > 0 && !loading && (
            <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <History size={15} className="shrink-0" style={{ color: RD.muted }} />
              {history.map((h) => (
                <button key={h.id} onClick={() => onLoadHistory(h.id)} disabled={loadingHistory} className="shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-60" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
                  {h.targetUsername}
                </button>
              ))}
            </div>
          )}
        </section>

        {loading && statusMsg && (
          <div className="flex items-center gap-3 rounded-[16px] p-4 text-[13.5px]" style={{ background: 'rgba(129,182,76,.07)', border: '1px solid rgba(129,182,76,.28)' }}>
            <Loader2 size={17} className="shrink-0 animate-spin" style={{ color: RD.green }} />{statusMsg}
          </div>
        )}
        {error && isLimitReached && limitNudge}
        {error && !isLimitReached && (
          <div className="flex items-start gap-3 rounded-[16px] p-4 text-[13.5px]" style={{ background: 'rgba(255,80,88,.10)', border: '1px solid rgba(255,80,88,.30)', color: '#FF9DA2' }}>
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {!result && !loading && !error && (
          <div className="px-6 py-14 text-center" style={{ color: RD.muted }}>
            <p className="text-[16px] font-bold" style={{ color: RD.text }}>Scout your next opponent</p>
            <p className="mt-1 text-[13px]">Works with any Chess.com account.</p>
          </div>
        )}

        {result && !loading && (
          <>
            {/* Profile */}
            <section className="rounded-[22px] p-4" style={card}>
              <div className="flex items-center gap-4">
                {p?.avatar ? (
                  <img src={p.avatar} alt={result.username} className="h-[64px] w-[64px] shrink-0 rounded-[16px] object-cover" style={{ border: `1px solid ${RD.border}` }} />
                ) : (
                  <span className="grid h-[64px] w-[64px] shrink-0 place-items-center rounded-[16px] text-[26px] font-extrabold" style={{ background: 'rgba(129,182,76,.12)', color: RD.green }}>{result.username[0]?.toUpperCase()}</span>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {p?.title && <span className="rounded-md px-1.5 py-0.5 text-[12px] font-extrabold text-white" style={{ background: '#C8383F' }}>{p.title}</span>}
                    <b className="truncate text-[21px] font-extrabold">{p?.name || result.username}</b>
                    {flag(p?.country) && <span className="text-[18px]" aria-hidden="true">{flag(p?.country)}</span>}
                  </div>
                  <p className="mt-1 text-[14px]" style={{ color: RD.muted }}>
                    Chess.com {best > 0 ? best : '—'} | {result.gamesAnalyzed.toLocaleString()} recent games
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <a href={p?.url || `https://www.chess.com/member/${result.username}`} target="_blank" rel="noreferrer" className="rounded-[14px] py-3.5 text-center text-[14px] font-bold" style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.22)' }}>View on Chess.com</a>
                <a href={`https://www.chess.com/play/online/new?opponent=${result.username}`} target="_blank" rel="noreferrer" className="rounded-[14px] py-3.5 text-center text-[14px] font-bold" style={{ background: 'rgba(124,92,255,.14)', border: '1px solid rgba(150,120,255,.6)' }}>Challenge on Chess.com</a>
              </div>
            </section>

            {/* Tabs */}
            <div className="grid grid-cols-4 gap-1 rounded-[16px] p-1" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
              {([['overview', 'Overview'], ['openings', 'Openings'], ['weaknesses', 'Weaknesses'], ['courses', 'Courses']] as const).map(([id, label]) => {
                const active = tab === id;
                return (
                  <button key={id} onClick={() => setTab(id)} className="rounded-[12px] py-2.5 text-[13px] font-bold transition-colors"
                    style={active ? { background: 'rgba(129,182,76,.10)', color: RD.text, boxShadow: `inset 0 0 0 1.5px ${RD.green}` } : { background: 'transparent', color: RD.muted }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {tab === 'overview' && (
              <>
                <section className="grid grid-cols-2 overflow-hidden rounded-[22px]" style={card}>
                  <div className="p-4">
                    <p className="flex items-center gap-1.5 text-[13px]" style={{ color: RD.muted }}><span className="h-2 w-2 rounded-full" style={{ background: RD.green }} />Win Rate</p>
                    <b className="mt-1 block text-[38px] font-extrabold leading-tight">{total > 0 ? `${winPct.toFixed(1)}%` : '—'}</b>
                    {total > 0 && (
                      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }} title={`${result.wins}W ${result.draws}D ${result.losses}L`}>
                        <div style={{ width: `${(result.wins / total) * 100}%`, background: RD.green }} />
                        <div style={{ width: `${(result.draws / total) * 100}%`, background: '#8A949B' }} />
                        <div style={{ width: `${(result.losses / total) * 100}%`, background: RD.red }} />
                      </div>
                    )}
                    <p className="mt-1.5 text-[11.5px]" style={{ color: RD.muted }}>{result.wins}W · {result.draws}D · {result.losses}L</p>
                  </div>
                  <div className="p-4" style={{ borderLeft: `1px solid ${RD.border}` }}>
                    <p className="flex items-center gap-1.5 text-[13px]" style={{ color: RD.muted }}><span className="h-2 w-2 rounded-full" style={{ background: '#B07CFF' }} />vs You</p>
                    {h2h ? (
                      <>
                        <b className="mt-1 block text-[34px] font-extrabold leading-tight">{h2h.wins} <span style={{ color: RD.red }}>–</span> {h2h.losses}</b>
                        <p className="mt-2 text-[12.5px]" style={{ color: 'rgba(245,247,246,.8)' }}>
                          {behind > 0 ? `You are ${behind} game${behind === 1 ? '' : 's'} behind` : behind < 0 ? `You are ${-behind} game${behind === -1 ? '' : 's'} ahead` : 'All square'}
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-[13px]" style={{ color: RD.muted }}>No games against you yet.</p>
                    )}
                  </div>
                </section>

                <section className="rounded-[22px] p-4" style={card}>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="flex items-center gap-2.5 text-[18px] font-extrabold"><span style={{ color: RD.green }}>♞</span>Key Weaknesses</h2>
                    {result.weaknesses.length > 2 && <button onClick={() => setTab('weaknesses')} className="text-[12px] font-extrabold" style={{ color: RD.green }}>See all</button>}
                  </div>
                  {result.weaknesses.length === 0 ? (
                    <div>{limitNudgeFree()}</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {result.weaknesses.slice(0, 4).map((w, i) => {
                        const s = SEV[w.severity] ?? SEV.Low;
                        return (
                          <button key={i} onClick={() => { setTab('weaknesses'); setOpen(i); }} className="rounded-[16px] p-3 text-left" style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${RD.border}` }}>
                            <span className="inline-block rounded-md px-2 py-0.5 text-[11.5px] font-extrabold" style={{ background: s.bg, color: s.fg }}>{w.severity}</span>
                            <b className="mt-2 block text-[14.5px] font-extrabold leading-snug">{w.category}</b>
                            <span className="mt-1 line-clamp-3 block text-[12.5px] leading-snug" style={{ color: RD.muted }}>{w.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}

            {tab === 'openings' && (
              <section className="overflow-hidden rounded-[22px]" style={card}>
                {result.topOpenings.length === 0 ? <p className="p-6 text-center text-[13px]" style={{ color: RD.muted }}>No opening data for this player yet.</p> : result.topOpenings.map((o, i) => (
                  <div key={i} className="px-4 py-3.5" style={{ borderTop: i ? `1px solid ${RD.border}` : undefined }}>
                    <div className="flex items-center justify-between gap-3">
                      <b className="truncate text-[14.5px]">{o.opening}</b>
                      <b className="text-[14.5px]" style={{ color: o.winRate >= 50 ? RD.green : RD.red }}>{o.winRate}%</b>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(o.winRate, 3)}%`, background: o.winRate >= 50 ? RD.green : RD.red }} />
                    </div>
                    <span className="text-[11.5px]" style={{ color: RD.muted }}>{o.games} games</span>
                  </div>
                ))}
              </section>
            )}

            {tab === 'weaknesses' && (
              <section className="grid gap-3 lg:grid-cols-2">
                {result.weaknesses.length === 0 ? <div className="rounded-[22px] p-4" style={card}>{limitNudgeFree()}</div> : result.weaknesses.map((w, i) => {
                  const s = SEV[w.severity] ?? SEV.Low;
                  const isOpen = open === i;
                  return (
                    <div key={i} className="rounded-[20px] p-4" style={card}>
                      <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
                        <span className="mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-extrabold" style={{ background: s.bg, color: s.fg }}>{w.severity}</span>
                        <span className="min-w-0 flex-1">
                          <b className="block text-[15.5px] font-extrabold">{w.category}</b>
                          <span className="mt-1 block text-[13px] leading-snug" style={{ color: RD.muted }}>{w.description}</span>
                        </span>
                        <ChevronRight size={17} className={`mt-1 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} style={{ color: RD.muted }} />
                      </button>
                      {isOpen && w.examples.length > 0 && (
                        <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${RD.border}` }}>
                          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[.14em]" style={{ color: RD.muted }}>Examples from their games</p>
                          <ul className="grid gap-1.5 text-[13px]" style={{ color: 'rgba(245,247,246,.85)' }}>
                            {w.examples.map((ex, j) => <li key={j} className="flex gap-2"><span style={{ color: RD.green }}>•</span>{ex}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {tab === 'courses' && <div>{exploit}</div>}
          </>
        )}
      </div>
    </div>
  );

  function limitNudgeFree() {
    if (!isSubscriptionLoaded) return null;
    if (isPremium) return <p className="text-[13px]" style={{ color: RD.muted }}>No clear weaknesses stood out in this player's recent games.</p>;
    return (
      <ProUpsell
        compact
        title={`See ${result?.username ?? 'this player'}'s weaknesses`}
        text="Pro adds an AI scouting report: where they go wrong, and how to exploit it."
      />
    );
  }
}
