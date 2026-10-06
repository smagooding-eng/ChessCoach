import React, { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { Search, ChevronRight } from 'lucide-react';
import { useMyGames } from '@/hooks/use-games';
import { useUser } from '@/hooks/use-user';
import { GameThumb } from '@/components/GameThumb';
import { RD, RESULT_BADGE } from '@/lib/redesignTheme';

// Game History (redesign). Matches the mockup: All Games / White / Black
// tabs with a filter button that reveals the result filter, a search
// field, and real game rows with their real board thumbnails.
//
// Scope note (unchanged from the previous version of this page): the
// classic Games page also has bulk-review job polling and a head-to-head
// opponent search mode, which this view does not reproduce -- the mockup
// doesn't depict them. They still work in the classic design.

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
  const { data } = useMyGames(100);
  const games = data?.games ?? [];

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

  return (
    <div className="-m-4 min-h-screen px-3 pt-3 md:-m-6 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto grid w-full max-w-[760px] gap-3">
        <div className="flex items-end justify-between px-1">
          <h1 className="text-[24px] font-extrabold tracking-tight">My Games</h1>
          <p className="pb-1 text-[12px]" style={{ color: RD.muted }}>
            {data === undefined ? 'Loading…' : `${filtered.length} game${filtered.length === 1 ? '' : 's'}`}
          </p>
        </div>

        {/* Tabs + filter button */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1.5 rounded-[14px] p-1" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
            {COLOR_TABS.map((t) => {
              const active = colorTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setColorTab(t.id)}
                  className="flex-1 rounded-[10px] py-2 text-[13px] font-bold transition-colors"
                  style={active
                    ? { background: 'rgba(139,234,69,.10)', color: RD.green, boxShadow: `inset 0 0 0 1px ${RD.green}` }
                    : { background: 'transparent', color: RD.muted }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="relative grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[14px] transition-colors"
            style={{ background: RD.cardSolid, border: `1px solid ${showFilters || filtersActive ? RD.green : RD.border}`, color: showFilters || filtersActive ? RD.green : RD.text }}
            aria-label="Filter by result"
            aria-expanded={showFilters}
          >
            <FunnelIcon />
            {filtersActive && <span className="absolute right-2 top-2 h-2 w-2 rounded-full" style={{ background: RD.green }} />}
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {RESULT_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setResultFilter(f.id)}
                className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
                style={resultFilter === f.id
                  ? { background: RD.green, color: '#05100A', border: `1px solid ${RD.green}` }
                  : { background: 'transparent', color: RD.muted, border: `1px solid ${RD.border}` }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2.5 rounded-[14px] px-3.5" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
          <Search size={17} className="shrink-0" style={{ color: RD.muted }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search opponent or opening…"
            aria-label="Search games"
            className="h-[46px] min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#87918E]"
            style={{ color: RD.text }}
          />
        </div>

        {/* List */}
        <section className="overflow-hidden rounded-[20px]" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
          {data === undefined ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? `1px solid ${RD.border}` : undefined }}>
                <div className="h-11 w-11 animate-pulse rounded-md" style={{ background: 'rgba(255,255,255,.07)' }} />
                <div className="h-4 w-12 animate-pulse rounded-md" style={{ background: 'rgba(255,255,255,.07)' }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-3/5 animate-pulse rounded-md" style={{ background: 'rgba(255,255,255,.07)' }} />
                  <div className="h-3 w-2/5 animate-pulse rounded-md" style={{ background: 'rgba(255,255,255,.07)' }} />
                </div>
              </div>
            ))
          ) : filtered.length ? (
            filtered.map((game, i) => {
              const isWhite = mine.includes((game.whiteUsername ?? '').toLowerCase());
              const opponent = isWhite ? game.blackUsername : game.whiteUsername;
              const rs = RESULT_BADGE[game.result] ?? RESULT_BADGE.draw;
              return (
                <Link
                  key={game.id}
                  href={`/games/${game.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
                  style={{ borderTop: i ? `1px solid ${RD.border}` : undefined }}
                >
                  <GameThumb pgn={game.pgn} userColor={isWhite ? 'white' : 'black'} size={44} />
                  <span className="w-[52px] shrink-0 rounded-md py-1 text-center text-[11px] font-extrabold tracking-wide" style={{ background: rs.bg, color: rs.fg }}>{rs.label}</span>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[14px] font-bold"><span className="font-normal" style={{ color: RD.muted }}>vs </span>{opponent}</b>
                    <span className="block truncate text-[12px]" style={{ color: RD.muted }}>{game.opening || 'Unknown opening'}</span>
                  </div>
                  <span className="shrink-0 text-[12px]" style={{ color: RD.muted }}>{new Date(game.playedAt).toLocaleDateString()}</span>
                  <ChevronRight size={15} className="shrink-0" style={{ color: RD.muted }} />
                </Link>
              );
            })
          ) : (
            <div className="px-4 py-12 text-center" style={{ color: RD.muted }}>
              <p className="text-[14px]">No games match.</p>
              <p className="mt-1 text-[12px]">Try a different search or filter.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
