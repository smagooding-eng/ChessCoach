import { K, CoachTake, ActionRow, Ring as KRing } from '@/components/analytics/Kit';
import { ScoutIcon } from '@/components/ScoutIcons';
import React, { useState, useMemo } from 'react';
import { PageHero } from '@/components/DesignSystem';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import {
  BookOpen, Search, TrendingUp, TrendingDown,
  ArrowUpDown, ChevronUp, ChevronDown, ChevronRight,
  GraduationCap, Target, Swords
} from 'lucide-react';
import { useMyOpenings, type OpeningStat } from '@/hooks/use-openings';
import { useDashboardRedesignFlag, usePhotoImagesFlag } from '@/hooks/use-app-config';
import { RD } from '@/lib/redesignTheme';
import { RedesignHeader } from '@/components/RedesignHeader';
import { openingThumbList } from '@/lib/openingThumb';
import { useSwipeTabs } from '@/lib/swipeNav';
import { usePhotoLook } from '@/context/SettingsContext';

type SortKey = 'totalGames' | 'winRate' | 'opening' | 'whiteWinRate' | 'blackWinRate';
type ColorFilter = 'all' | 'white' | 'black';

function WinBar({ wins, losses, draws }: { wins: number; losses: number; draws: number }) {
  const total = wins + losses + draws;
  if (total === 0) return <div className="h-1.5 w-full bg-secondary rounded-full" />;
  const wp = (wins / total) * 100;
  const lp = (losses / total) * 100;
  return (
    <div className="flex h-1.5 w-full rounded-full overflow-hidden gap-px">
      <div className="bg-emerald-500 rounded-l-full transition-all" style={{ width: `${wp}%` }} />
      <div className="bg-secondary/60 flex-1" />
      <div className="bg-red-500 rounded-r-full transition-all" style={{ width: `${lp}%` }} />
    </div>
  );
}

function WinRateBadge({ rate }: { rate: number }) {
  const color =
    rate >= 60 ? 'text-emerald-400' :
    rate >= 50 ? 'text-amber-400' :
    rate >= 40 ? 'text-orange-400' : 'text-red-400';
  return <span className={`font-black text-base ${color}`}>{rate}%</span>;
}

export function Openings() {
  const { data, isLoading } = useMyOpenings();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('totalGames');
  const [sortAsc, setSortAsc] = useState(false);
  const [colorFilter, setColorFilter] = useState<ColorFilter>('all');
  const { enabled: redesign } = useDashboardRedesignFlag();
  const photoImgs = usePhotoImagesFlag();
  const photoLook = usePhotoLook();
  const [tab, setTab] = useState<'foryou' | 'popular' | 'repertoire'>('foryou');
  useSwipeTabs(['foryou', 'popular', 'repertoire'] as const, tab, setTab);

  const openings = data?.openings ?? [];
  const totalGames = data?.totalGames ?? 0;

  const filtered = useMemo(() => {
    let list = openings;
    if (colorFilter === 'white') list = list.filter(o => o.white.games > 0);
    else if (colorFilter === 'black') list = list.filter(o => o.black.games > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.opening.toLowerCase().includes(q) || (o.eco?.toLowerCase().includes(q) ?? false)
      );
    }
    list = [...list].sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === 'totalGames') { av = a.totalGames; bv = b.totalGames; }
      else if (sortKey === 'winRate') { av = a.winRate; bv = b.winRate; }
      else if (sortKey === 'whiteWinRate') { av = a.white.winRate; bv = b.white.winRate; }
      else if (sortKey === 'blackWinRate') { av = a.black.winRate; bv = b.black.winRate; }
      else if (sortKey === 'opening') return sortAsc ? a.opening.localeCompare(b.opening) : b.opening.localeCompare(a.opening);
      return sortAsc ? av - bv : bv - av;
    });
    return list;
  }, [openings, search, sortKey, sortAsc, colorFilter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/40" />;
    return sortAsc
      ? <ChevronUp className="w-3.5 h-3.5 text-primary" />
      : <ChevronDown className="w-3.5 h-3.5 text-primary" />;
  }

  const bestOpening  = [...openings].filter(o => o.totalGames >= 3).sort((a, b) => b.winRate - a.winRate)[0];
  const worstOpening = [...openings].filter(o => o.totalGames >= 3).sort((a, b) => a.winRate - b.winRate)[0];
  const mostPlayed   = openings[0];

  if (isLoading) return (
    <div className="flex justify-center items-center min-h-[50vh]">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (redesign) {
    // Openings Trainer (redesign). Everything shown is the player's own
    // per-opening record. The mockup's tabs map onto real slices of it:
    //   For You       -> openings that need the most work (lowest win rate, 3+ games)
    //   Popular       -> the openings you play most
    //   My Repertoire -> all your openings, best results first
    // The thumbnails are decorative artwork (supplied), cycled by opening.
    const q = search.trim().toLowerCase();
    const base = openings.filter(o => !q || o.opening.toLowerCase().includes(q) || (o.eco?.toLowerCase().includes(q) ?? false));
    const rated = base.filter(o => o.totalGames >= 3);
    const list = tab === 'foryou'
      ? [...rated].sort((a, b) => a.winRate - b.winRate)
      : tab === 'popular'
        ? [...base].sort((a, b) => b.totalGames - a.totalGames)
        : [...base].sort((a, b) => b.winRate - a.winRate || b.totalGames - a.totalGames);
    const TABS: { id: typeof tab; label: string }[] = [
      { id: 'foryou', label: 'For You' },
      { id: 'popular', label: 'Popular' },
      { id: 'repertoire', label: 'My Repertoire' },
    ];
    void photoImgs; void photoLook;
    const weak = [...rated].filter((o) => o.winRate < 50).sort((a, b) => a.winRate - b.winRate || b.totalGames - a.totalGames)[0];
    const best = [...rated].filter((o) => o.winRate >= 50).sort((a, b) => b.winRate - a.winRate || b.totalGames - a.totalGames)[0];
    const drill = (o: (typeof openings)[number]) => (o.eco ? `/practice?tab=openings&eco=${encodeURIComponent(o.eco)}` : '/practice?tab=openings');
    const split = (name: string): [string, string] => { const i = name.indexOf(':'); return i > 0 ? [name.slice(0, i), name.slice(i + 1).replace(/^[\s,]+/, '')] : [name, '']; };
    const TAB_NOTE: Record<typeof tab, string> = { foryou: 'Lowest win rate first: the openings worth drilling.', popular: 'The openings you play most.', repertoire: 'Everything you play, best results first.' };

    return (
      <div className="min-h-screen px-3 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
        <div className="mx-auto grid w-full max-w-[640px] gap-4 lg:max-w-[1000px]">
          <div>
            <RedesignHeader title="Openings" icon={<ScoutIcon name="openings" size={32} />} />
            <p className="-mt-2 px-1 text-[13.5px]" style={{ color: RD.muted }}>How you do in every opening you play, and which to drill.</p>
          </div>

          {openings.length === 0 ? (
            <CoachTake icon="openings" headline="Import your games and your coach will rate every opening you play." action="Import games" href="/import" />
          ) : weak ? (
            <CoachTake icon="openings" headline={`${split(weak.opening)[0]} is costing you games`} detail={`You win ${weak.winRate}% of your ${weak.totalGames} games with it. Drill the main line against the trainer bot.`} action="Drill this opening" href={drill(weak)} board={<KRing pct={weak.winRate} size={96} stroke={8} color={K.red} />} />
          ) : best ? (
            <CoachTake icon="openings" headline={`Your best weapon: ${split(best.opening)[0]}`} detail={`You win ${best.winRate}% of your ${best.totalGames} games with it. Keep it sharp.`} action="Practise it" href={drill(best)} board={<KRing pct={best.winRate} size={96} stroke={8} />} />
          ) : (
            <CoachTake icon="openings" headline="Play an opening a few times and your coach will rate it." detail="An opening is rated once you've played it 3 times." action="Practise openings" href="/practice?tab=openings" />
          )}

          {openings.length > 0 && (
            <section className="rounded-[20px] p-4" style={{ background: K.card, border: `1px solid ${K.line}` }}>
              <div className="flex items-center gap-3 rounded-[14px] px-3.5" style={{ background: K.card2, border: `1px solid ${K.line}` }}>
                <Search size={18} className="shrink-0" style={{ color: K.muted }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your openings" aria-label="Search openings"
                  className="h-[46px] min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#87918E]" style={{ color: RD.text }} />
              </div>
              <div data-swipe-tabs className="mt-3 grid grid-cols-3 gap-1 rounded-[14px] p-1" style={{ background: K.card2 }}>
                {TABS.map((t) => {
                  const active = tab === t.id;
                  return (
                    <button key={t.id} onClick={() => setTab(t.id)} className="rounded-[11px] py-2.5 text-[13.5px] font-bold transition-colors"
                      style={active ? { background: '#1E3A1C', color: RD.text, boxShadow: `inset 0 0 0 1.5px ${RD.green}` } : { color: RD.muted }}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2.5 px-1 text-[12.5px]" style={{ color: K.muted }}>{TAB_NOTE[tab]}</p>
              <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
                {list.length === 0 ? (
                  <p className="py-8 text-center text-[13px] lg:col-span-2" style={{ color: K.muted }}>{tab === 'foryou' ? 'Nothing to work on yet: an opening needs at least 3 games to be rated.' : 'No openings match your search.'}</p>
                ) : list.map((o) => {
                  const [family, variation] = split(o.opening);
                  const rated3 = o.totalGames >= 3;
                  return (
                    <div key={o.opening} className="flex items-center gap-3 rounded-[16px] p-3" style={{ background: K.card2, border: `1px solid ${K.line}` }}>
                      <Link href={`/openings/${encodeURIComponent(o.eco ?? o.opening)}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <KRing pct={rated3 ? o.winRate : null} size={50} stroke={5} color={o.winRate >= 50 ? K.green : K.red} />
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-[15px] font-extrabold">{family}</b>
                          {variation && <span className="block truncate text-[12.5px]" style={{ color: 'rgba(245,247,246,.75)' }}>{variation}</span>}
                          <span className="text-[12px]" style={{ color: K.muted }}>{o.totalGames} game{o.totalGames === 1 ? '' : 's'} · {o.wins}W {o.draws}D {o.losses}L</span>
                        </span>
                      </Link>
                      <Link href={drill(o)} className="shrink-0 rounded-[11px] px-3 py-1.5 text-[12.5px] font-extrabold text-white" style={{ background: K.green }}>Drill</Link>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <ActionRow icon="practice-bots" title="Practise against the trainer bot" sub="Play any opening's main line until it's automatic." action="Start" href="/practice?tab=openings" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 px-4 pt-4 md:px-0 md:pt-0">
      <PageHero
        piece="♞"
        title="Opening Repertoire"
        subtitle={`${totalGames} games imported · click any opening to view stats & practice`}
      />

      <button
        onClick={() => navigate('/practice?tab=openings')}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground font-bold text-sm transition-all"
      >
        <BookOpen className="w-4 h-4" /> Practice Your Openings Against the Trainer Bot
      </button>

      {openings.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground border-2 border-dashed border-border rounded-xl">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-bold opacity-60">No games imported yet</p>
          <p className="text-sm mt-1 opacity-40">Import games to see your opening stats</p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
              className="glass-card rounded-xl p-5">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
                <Swords className="w-3.5 h-3.5" /> Most Played
              </p>
              {mostPlayed ? (
                <>
                  <p className="font-black text-lg line-clamp-1 leading-tight">{mostPlayed.opening}</p>
                  <p className="text-muted-foreground text-sm mt-1">{mostPlayed.totalGames} games · {mostPlayed.percentage}% of total</p>
                </>
              ) : <p className="text-muted-foreground">—</p>}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
              className="glass-card rounded-xl p-5 border-emerald-500/25">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Best Win Rate
              </p>
              {bestOpening ? (
                <>
                  <p className="font-black text-base line-clamp-1 leading-tight">{bestOpening.opening}</p>
                  <p className="text-emerald-400 font-black text-2xl">{bestOpening.winRate}%</p>
                </>
              ) : <p className="text-muted-foreground">—</p>}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
              className="glass-card rounded-xl p-5 border-red-500/25">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-red-400" /> Needs Work
              </p>
              {worstOpening ? (
                <>
                  <p className="font-black text-base line-clamp-1 leading-tight">{worstOpening.opening}</p>
                  <p className="text-red-400 font-black text-2xl">{worstOpening.winRate}%</p>
                </>
              ) : <p className="text-muted-foreground">—</p>}
            </motion.div>
          </div>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search openings or ECO code…"
                className="w-full pl-10 pr-4 py-3 bg-secondary/70 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
              />
            </div>
            <div className="flex rounded-xl overflow-hidden border border-border text-sm font-bold">
              {(['all', 'white', 'black'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setColorFilter(f)}
                  className={`px-4 py-3 transition-colors capitalize ${
                    colorFilter === f
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f === 'all' ? 'All' : `As ${f.charAt(0).toUpperCase() + f.slice(1)}`}
                </button>
              ))}
            </div>
          </div>

          {/* ── Desktop table / Mobile cards ── */}

          {/* Desktop (md+): table */}
          <div className="hidden md:block glass-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => toggleSort('opening')} className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                        Opening <SortIcon col="opening" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right">
                      <button onClick={() => toggleSort('totalGames')} className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors ml-auto">
                        Games <SortIcon col="totalGames" />
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button onClick={() => toggleSort('winRate')} className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                        Win Rate <SortIcon col="winRate" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center font-black text-xs uppercase tracking-wider text-muted-foreground">
                      Training
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-10 text-center text-muted-foreground">
                        No openings match your search.
                      </td>
                    </tr>
                  ) : filtered.map((o, i) => {
                    const linkParam = encodeURIComponent(o.eco ?? o.opening);
                    return (
                      <motion.tr
                        key={o.opening}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i * 0.03, 0.3) }}
                        className="hover:bg-white/[0.025] transition-colors group cursor-pointer"
                        onClick={() => navigate(`/openings/${linkParam}`)}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            {o.eco && (
                              <span className="shrink-0 px-2 py-0.5 rounded-xl text-[10px] font-black bg-primary text-primary-foreground border border-primary/25">
                                {o.eco}
                              </span>
                            )}
                            <span className="font-bold leading-snug group-hover:text-primary transition-colors">{o.opening}</span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <span className="font-black text-lg">{o.totalGames}</span>
                          <p className="text-[10px] text-muted-foreground">{o.percentage}% of games</p>
                        </td>

                        <td className="px-4 py-3.5 min-w-[140px]">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex gap-2 text-[11px]">
                              <span className="text-emerald-400 font-bold">{o.wins}W</span>
                              <span className="text-red-400 font-bold">{o.losses}L</span>
                              <span className="text-muted-foreground">{o.draws}D</span>
                            </div>
                            <WinRateBadge rate={o.winRate} />
                          </div>
                          <WinBar wins={o.wins} losses={o.losses} draws={o.draws} />
                        </td>

                        <td className="px-4 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                          <Link href={`/openings/${linkParam}`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary hover:bg-primary/90 border border-primary/25 hover:border-primary text-primary-foreground hover:text-primary-foreground text-xs font-black transition-all">
                            <GraduationCap className="w-3.5 h-3.5" />
                            Practice
                          </Link>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="px-4 py-3 border-t border-border/40 text-xs text-muted-foreground font-medium">
                {filtered.length} of {openings.length} openings · {totalGames} total games
              </div>
            )}
          </div>

          {/* Mobile (< md): cards */}
          <div className="md:hidden space-y-2">
            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No openings match your search.</p>
            ) : filtered.map((o, i) => {
              const linkParam = encodeURIComponent(o.eco ?? o.opening);
              return (
                <motion.div
                  key={o.opening}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.4) }}
                  className="glass-card rounded-xl p-4 cursor-pointer group"
                  onClick={() => navigate(`/openings/${linkParam}`)}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      {o.eco && (
                        <span className="inline-block px-2 py-0.5 rounded-xl text-[10px] font-black bg-primary text-primary-foreground border border-primary/25 mb-1.5">
                          {o.eco}
                        </span>
                      )}
                      <p className="font-black text-base leading-tight group-hover:text-primary transition-colors">{o.opening}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <WinRateBadge rate={o.winRate} />
                      <p className="text-xs text-muted-foreground mt-0.5">{o.totalGames} games</p>
                    </div>
                  </div>

                  <WinBar wins={o.wins} losses={o.losses} draws={o.draws} />

                  <div className="flex items-center justify-between mt-3">
                    <div className="flex gap-3 text-xs">
                      <span className="text-emerald-400 font-bold">{o.wins}W</span>
                      <span className="text-red-400 font-bold">{o.losses}L</span>
                      <span className="text-muted-foreground">{o.draws}D</span>
                    </div>
                    <Link
                      href={`/openings/${linkParam}`}
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-black transition-all hover:brightness-110"
                    >
                      <GraduationCap className="w-3.5 h-3.5" />
                      Practice &amp; Review
                    </Link>
                  </div>
                </motion.div>
              );
            })}
            {filtered.length > 0 && (
              <p className="text-center text-xs text-muted-foreground pt-2">
                {filtered.length} of {openings.length} openings
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
