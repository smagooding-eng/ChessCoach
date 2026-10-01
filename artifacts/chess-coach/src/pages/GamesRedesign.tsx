import React, { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { useMyGames } from '@/hooks/use-games';
import { useUser } from '@/hooks/use-user';
import { GameThumb } from '@/components/GameThumb';
import { Search } from 'lucide-react';

// Same scoped, separate visual system as DashboardRedesign.tsx -- see
// that file's comment for why these values live here rather than in the
// app's global CSS variables.
const RG_BG = '#070906';
const RG_CARD = 'linear-gradient(180deg,#1b2215,#141a10)';
const RG_LINE = 'rgba(255,255,255,.12)';
const RG_TEXT = '#f2f6eb';
const RG_MUTED = '#a3ad98';
const RG_GREEN = '#7fd14f';
const RG_RED = '#ff6a4a';

const RESULT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  win: { bg: 'rgba(127,209,79,.2)', text: RG_GREEN, label: 'WIN' },
  loss: { bg: 'rgba(255,106,74,.2)', text: '#ff9d86', label: 'LOSS' },
  draw: { bg: 'rgba(255,255,255,.12)', text: '#d0d4c8', label: 'DRAW' },
};

const FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All results' },
  { id: 'win', label: 'Wins' },
  { id: 'loss', label: 'Losses' },
  { id: 'draw', label: 'Draws' },
];

// This page deliberately covers only what the design concept's own Games
// view shows: a searchable, filterable real list. The classic Games page
// has real functionality beyond that -- bulk-review job polling and a
// head-to-head opponent search mode -- that the mockup never depicted.
// Rather than guess at how those should look in the new style, this page
// leaves them where they already work correctly; toggling back to the
// classic dashboard design reaches them exactly as before.
export function GamesRedesign() {
  const { username } = useUser();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const { data } = useMyGames(100);
  const games = data?.games ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return games.filter((g) => {
      const matchesFilter = filter === 'all' || g.result.toLowerCase() === filter;
      const matchesSearch = !q || [g.whiteUsername, g.blackUsername, g.opening ?? ''].join(' ').toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [games, search, filter]);

  return (
    <div style={{ background: RG_BG, color: RG_TEXT, minHeight: '100vh', fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif' }} className="-m-4 p-4 md:-m-6 md:p-6">
      <div className="max-w-[900px] mx-auto grid gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">My Games</h1>
          <p style={{ color: RG_MUTED }} className="text-sm mt-1">Import, review, and analyze your chess games — all in one place.</p>
        </div>

        <section style={{ background: RG_CARD, border: `1px solid ${RG_LINE}`, borderRadius: 18, padding: '1.25rem' }}>
          <div className="flex items-center gap-2 mb-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,0,0,.3)', border: `1px solid ${RG_LINE}` }}>
            <Search className="w-4 h-4 shrink-0" style={{ color: RG_MUTED }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search opponent or opening…"
              aria-label="Search games"
              className="bg-transparent border-0 outline-none flex-1 text-sm"
              style={{ color: RG_TEXT }}
            />
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="rounded-full px-3.5 py-1.5 text-sm font-semibold border transition-colors"
                style={filter === f.id
                  ? { background: RG_GREEN, color: '#0a0d08', borderColor: RG_GREEN }
                  : { background: 'transparent', color: RG_MUTED, borderColor: RG_LINE }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <p style={{ color: RG_MUTED }} className="text-xs text-right mb-2">Showing {filtered.length} game{filtered.length === 1 ? '' : 's'}</p>

          <div className="grid gap-2">
            {filtered.length ? filtered.map((game) => {
              const isWhite = game.whiteUsername?.toLowerCase() === (username ?? '').toLowerCase();
              const opponent = isWhite ? game.blackUsername : game.whiteUsername;
              const rs = RESULT_STYLE[game.result] ?? RESULT_STYLE.draw;
              return (
                <Link key={game.id} href={`/games/${game.id}`} className="flex items-center gap-3 p-2.5 rounded-xl transition-colors hover:bg-white/5">
                  <GameThumb pgn={game.pgn} userColor={isWhite ? 'white' : 'black'} size={44} />
                  <span className="w-[54px] text-center text-[11px] font-extrabold tracking-wide rounded-lg py-1 shrink-0" style={{ background: rs.bg, color: rs.text }}>{rs.label}</span>
                  <div className="flex-1 min-w-0">
                    <b className="text-sm block truncate">vs {opponent}</b>
                    <small style={{ color: RG_MUTED }} className="block text-xs truncate">
                      {game.eco ? `${game.eco} · ` : ''}{game.opening || 'Unknown opening'} · {new Date(game.playedAt).toLocaleDateString()}
                    </small>
                  </div>
                </Link>
              );
            }) : (
              <div className="text-center py-10" style={{ color: RG_MUTED }}>
                <p className="text-sm">No games match.</p>
                <p className="text-xs mt-1">Try a different search or filter.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
