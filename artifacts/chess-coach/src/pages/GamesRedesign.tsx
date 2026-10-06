import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { Search, ChevronRight, RefreshCw, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useMyAnalysisSummary } from '@/hooks/use-analysis';
import { useMyGames } from '@/hooks/use-games';
import { useUser } from '@/hooks/use-user';
import { GameThumb } from '@/components/GameThumb';
import { RD } from '@/lib/redesignTheme';
import { RedesignHeader } from '@/components/RedesignHeader';

// Game History (redesign). Matches the mockup: All Games / White / Black
// tabs with a filter button that reveals the result filter, a search
// field, and real game rows with their real board thumbnails.
//
// Everything the classic Games page can do is available here too: bulk
// review of unreviewed games (same endpoints + polling), head-to-head
// search against a specific opponent (filtered server-side across the
// full history), and loading more than the first page.

const COLOR_TABS = [
  { id: 'all', label: 'All Games' },
  { id: 'white', label: 'White' },
  { id: 'black', label: 'Black' },
] as const;

const RESULT_FILTERS = [
  { id: 'all', label: 'All results' },
  { id: 'win', label: 'Wins' },
  { id: 'loss', label: 'Losses' },
  { id: 'draw', label: 'Draws' },
];

function FunnelIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h18l-7 8.5V20l-4-2v-4.5z" />
    </svg>
  );
}

export function GamesRedesign() {
  const { username, authUser } = useUser();
  const [search, setSearch] = useState('');
  const [colorTab, setColorTab] = useState<(typeof COLOR_TABS)[number]['id']>('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [h2hOpponent, setH2hOpponent] = useState('');
  const [debouncedH2h, setDebouncedH2h] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedH2h(h2hOpponent.trim()), 350);
    return () => clearTimeout(t);
  }, [h2hOpponent]);
  // Opponent filtering happens server-side across the whole history, so an
  // H2H record is never silently limited to whatever page happens to be loaded.
  const { data } = useMyGames(pageSize, { opponent: debouncedH2h || undefined });
  const games = data?.games ?? [];
  const total = data?.total ?? 0;
  const { data: summary } = useMyAnalysisSummary();
  const queryClient = useQueryClient();
  const unreviewedCount = Math.max(0, (summary ? total : 0) - (summary?.reviewedCount ?? 0));

  // Bulk review: trigger + poll (same endpoints as the classic page)
  const [bulkJobId, setBulkJobId] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ reviewedSoFar: number; total: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiFetch('/api/games/review-all-active', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { jobId: string | null } | null) => { if (d?.jobId) setBulkJobId(d.jobId); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!bulkJobId) return;
    const poll = async () => {
      try {
        const res = await apiFetch(`/api/games/review-all-status/${bulkJobId}`, { credentials: 'include' });
        if (!res.ok) return;
        const st = await res.json() as { status: string; error?: string; reviewedSoFar?: number; total?: number };
        if (typeof st.reviewedSoFar === 'number' && typeof st.total === 'number') setBulkProgress({ reviewedSoFar: st.reviewedSoFar, total: st.total });
        if (st.status === 'done' || st.status === 'error') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          if (st.status === 'error') setBulkError(st.error ?? 'Review failed');
          setBulkJobId(null);
          queryClient.invalidateQueries();
        }
      } catch { /* transient network error: keep polling */ }
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [bulkJobId, queryClient]);

  const startBulkReview = async () => {
    setBulkError(null);
    setBulkProgress(null);
    try {
      const res = await apiFetch('/api/games/review-all', { method: 'POST', credentials: 'include' });
      if (!res.ok) { setBulkError('Failed to start review'); return; }
      const { jobId } = await res.json() as { jobId: string };
      setBulkJobId(jobId);
    } catch { setBulkError('Failed to start review'); }
  };

  const mine = useMemo(
    () => [username, authUser?.chesscomUsername, authUser?.lichessUsername].filter((n): n is string => !!n).map((n) => n.toLowerCase()),
    [username, authUser?.chesscomUsername, authUser?.lichessUsername],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return games.filter((g) => {
      const iAmWhite = mine.includes((g.whiteUsername ?? '').toLowerCase());
      if (colorTab === 'white' && !iAmWhite) return false;
      if (colorTab === 'black' && iAmWhite) return false;
      if (resultFilter !== 'all' && g.result.toLowerCase() !== resultFilter) return false;
      return !q || [g.whiteUsername, g.blackUsername, g.opening ?? ''].join(' ').toLowerCase().includes(q);
    });
  }, [games, search, colorTab, resultFilter, mine]);

  const filtersActive = resultFilter !== 'all';

  const BADGE: Record<string, { bg: string; fg: string; label: string }> = {
    win: { bg: 'rgba(46,125,50,.45)', fg: '#7BE05A', label: 'WIN' },
    loss: { bg: 'rgba(150,35,45,.55)', fg: '#FF6B73', label: 'LOSS' },
    draw: { bg: 'rgba(255,255,255,.12)', fg: '#C9D2CF', label: 'DRAW' },
  };

  return (
    <div className="min-h-screen px-3 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto w-full max-w-[680px]">
        <RedesignHeader
          title="My Games"
          icon={<span className="text-[26px] leading-none">♟</span>}
          right={
            <button onClick={() => setShowSearch((v) => !v)} aria-label="Search games" aria-expanded={showSearch} className="grid h-9 w-9 place-items-center rounded-full" style={{ color: showSearch ? RD.green : RD.text }}>
              <Search size={21} />
            </button>
          }
        />

        <div className="flex items-center gap-2.5">
          <div className="grid flex-1 grid-cols-3 gap-1 rounded-[16px] p-1" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
            {COLOR_TABS.map((t) => {
              const active = colorTab === t.id;
              return (
                <button key={t.id} onClick={() => setColorTab(t.id)} className="rounded-[12px] py-2.5 text-[14px] font-bold transition-colors"
                  style={active ? { background: 'rgba(139,234,69,.10)', color: RD.text, boxShadow: `inset 0 0 0 1.5px ${RD.green}` } : { background: 'transparent', color: RD.muted }}>
                  {t.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="relative grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[16px]"
            style={{ background: RD.cardSolid, border: `1px solid ${showFilters || filtersActive || h2hOpponent.trim() ? RD.green : RD.border}`, color: RD.text }}
            aria-label="Filters"
            aria-expanded={showFilters}
          >
            <FunnelIcon size={20} />
            {(filtersActive || h2hOpponent.trim()) && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full" style={{ background: RD.green }} />}
          </button>
        </div>

        {showSearch && (
          <div className="mt-3 flex items-center gap-3 rounded-[16px] px-4" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
            <Search size={18} className="shrink-0" style={{ color: RD.muted }} />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search opponent or opening…" aria-label="Search games" className="h-[48px] min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-[#87918E]" style={{ color: RD.text }} />
          </div>
        )}

        {showFilters && (
          <div className="mt-3 grid gap-3 rounded-[18px] p-3.5" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
            <div className="flex flex-wrap gap-1.5">
              {RESULT_FILTERS.map((f) => (
                <button key={f.id} onClick={() => setResultFilter(f.id)} className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold"
                  style={resultFilter === f.id ? { background: RD.green, color: '#05100A', border: `1px solid ${RD.green}` } : { background: 'transparent', color: RD.muted, border: `1px solid ${RD.border}` }}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2.5 rounded-[14px] px-3.5" style={{ background: RD.cardSolid, border: `1px solid ${h2hOpponent.trim() ? RD.green : RD.border}` }}>
              <Users size={17} className="shrink-0" style={{ color: RD.muted }} />
              <input value={h2hOpponent} onChange={(e) => setH2hOpponent(e.target.value)} placeholder="Head-to-head: opponent username…" aria-label="Head-to-head opponent" className="h-[44px] min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#87918E]" style={{ color: RD.text }} />
              {h2hOpponent.trim() && (
                <span className="flex shrink-0 items-center gap-2 text-[12px] font-extrabold">
                  <span style={{ color: RD.green }}>W {filtered.filter((g) => g.result === 'win').length}</span>
                  <span style={{ color: RD.muted }}>D {filtered.filter((g) => g.result === 'draw').length}</span>
                  <span style={{ color: RD.red }}>L {filtered.filter((g) => g.result === 'loss').length}</span>
                </span>
              )}
            </div>
          </div>
        )}

        {unreviewedCount > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-[16px] px-4 py-3" style={{ background: 'rgba(139,234,69,.07)', border: '1px solid rgba(139,234,69,.28)' }}>
            <div className="min-w-0 flex-1 text-[13px]">
              {bulkJobId && bulkProgress ? (
                <span><b>Reviewing…</b> <span style={{ color: RD.muted }}>{bulkProgress.reviewedSoFar} of {bulkProgress.total} done</span></span>
              ) : bulkJobId ? <b>Starting review…</b> : (
                <span><b>{unreviewedCount}</b> <span style={{ color: RD.muted }}>of your {total} games {unreviewedCount === 1 ? "hasn't" : "haven't"} been reviewed yet</span></span>
              )}
              {bulkError && <p className="mt-0.5 text-[12px]" style={{ color: RD.red }}>{bulkError}</p>}
            </div>
            <button onClick={startBulkReview} disabled={!!bulkJobId} className="flex shrink-0 items-center gap-1.5 rounded-[11px] px-3.5 py-2 text-[12.5px] font-extrabold disabled:opacity-60" style={{ background: RD.green, color: '#05100A' }}>
              <RefreshCw size={14} className={bulkJobId ? 'animate-spin' : ''} />{bulkJobId ? 'Reviewing…' : 'Review all'}
            </button>
          </div>
        )}

        <div className="mt-3 grid gap-2.5">
          {data === undefined ? (
            [0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-[64px] w-[64px] animate-pulse rounded-[10px]" style={{ background: 'rgba(255,255,255,.07)' }} />
                <div className="h-[64px] flex-1 animate-pulse rounded-[16px]" style={{ background: 'rgba(255,255,255,.05)' }} />
              </div>
            ))
          ) : filtered.length ? (
            filtered.map((game) => {
              const isWhite = mine.includes((game.whiteUsername ?? '').toLowerCase());
              const opponent = isWhite ? game.blackUsername : game.whiteUsername;
              const rs = BADGE[game.result] ?? BADGE.draw;
              return (
                <Link key={game.id} href={`/games/${game.id}`} className="flex items-center gap-3 transition-opacity active:opacity-80">
                  <span className="shrink-0 overflow-hidden rounded-[10px]" style={{ border: '2px solid rgba(255,244,225,.9)' }}>
                    <GameThumb pgn={game.pgn} userColor={isWhite ? 'white' : 'black'} size={60} />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] px-3 py-2.5" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
                    <span className="grid h-[38px] w-[64px] shrink-0 place-items-center rounded-[10px] text-[14px] font-extrabold tracking-wide" style={{ background: rs.bg, color: rs.fg }}>{rs.label}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[15px] font-bold"><span className="font-semibold" style={{ color: 'rgba(245,247,246,.8)' }}>vs </span>{opponent}</b>
                      <span className="block truncate text-[12.5px]" style={{ color: RD.muted }}>{game.opening || 'Unknown opening'}</span>
                    </span>
                    <span className="shrink-0 text-[13px]" style={{ color: 'rgba(245,247,246,.85)' }}>{new Date(game.playedAt).toLocaleDateString()}</span>
                  </span>
                </Link>
              );
            })
          ) : (
            <div className="rounded-[18px] px-4 py-12 text-center" style={{ background: RD.card, border: `1px solid ${RD.border}`, color: RD.muted }}>
              <p className="text-[14px]">No games match.</p>
              <p className="mt-1 text-[12px]">Try a different search or filter.</p>
            </div>
          )}
        </div>

        {games.length < total && (
          <button onClick={() => setPageSize((n) => n + 100)} className="mt-3 w-full rounded-[14px] py-3 text-[13.5px] font-extrabold" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}`, color: RD.green }}>
            Load more games ({total - games.length} remaining)
          </button>
        )}
      </div>
    </div>
  );
}
