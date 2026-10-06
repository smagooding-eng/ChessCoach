import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Target, Puzzle, BookOpen, Play, Crosshair, ChevronRight, Crown,
} from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMultiEloProgress } from '@/hooks/use-elo-progress';
import { useMyAnalysisSummary } from '@/hooks/use-analysis';
import { useMyGames } from '@/hooks/use-games';

// New design target -- matches the provided screenshot/palette. The
// header (logo/search/bell/avatar) and bottom nav (Home/Scout/Games/
// Analysis/More) shown in that screenshot are the app's existing shared
// Layout chrome, not rebuilt here; this component is the page content
// Layout renders between them.
const GREEN = '#8bea45';
const BG = '#080c0d';
const CARD = 'linear-gradient(145deg,#151c1e,#0e1415)';
const BORDER = 'rgba(255,255,255,.09)';
const MUTED = '#8d9795';
const RED = '#ff5656';
const GOLD = '#eab44b';

const RESULT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  win: { bg: 'rgba(139,234,69,.18)', text: GREEN, label: 'WIN' },
  loss: { bg: 'rgba(255,86,86,.18)', text: '#ff9d8f', label: 'LOSS' },
  draw: { bg: 'rgba(255,255,255,.12)', text: '#d0d4c8', label: 'DRAW' },
};

function Card({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section
      className={className}
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 20,
        boxShadow: '0 18px 45px -30px rgba(0,0,0,.95)',
        ...style,
      }}
    >
      {children}
    </section>
  );
}

// Small checkerboard swatch used as a placeholder game thumbnail where a
// real per-game board preview isn't available -- same role as the
// partial script's MiniBoard, kept here so Recent Games has a visual
// without depending on a screenshot/FEN-render for every row.
function MiniBoard() {
  return (
    <div
      className="grid grid-cols-4 grid-rows-2 overflow-hidden shrink-0"
      style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid rgba(255,255,255,.16)', background: '#d6b08b' }}
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} style={{ background: i % 2 ? '#9e704f' : '#f1d0a5' }} />
      ))}
    </div>
  );
}

const QUICK_LINKS = [
  {
    label: 'Play', sub: 'Friends or bots', icon: Play, href: '/play',
    bg: 'linear-gradient(160deg, rgba(139,234,69,.32), rgba(139,234,69,.05) 70%), #10201a',
    iconBg: 'rgba(139,234,69,.22)', iconColor: GREEN,
  },
  {
    label: 'Puzzles', sub: 'Smart training', icon: Puzzle, href: '/puzzles',
    bg: 'linear-gradient(160deg, rgba(92,150,255,.32), rgba(92,150,255,.05) 70%), #0f1a28',
    iconBg: 'rgba(92,150,255,.22)', iconColor: '#5c96ff',
  },
  {
    label: 'Openings', sub: 'Drill and learn', icon: BookOpen, href: '/openings',
    bg: 'linear-gradient(160deg, rgba(168,120,255,.32), rgba(168,120,255,.05) 70%), #1a1428',
    iconBg: 'rgba(168,120,255,.22)', iconColor: '#a878ff',
  },
  {
    label: 'Chess Traps', sub: 'Learn the classics', icon: Crosshair, href: '/traps',
    bg: 'linear-gradient(160deg, rgba(234,180,75,.32), rgba(234,180,75,.05) 70%), #221a0f',
    iconBg: 'rgba(234,180,75,.22)', iconColor: GOLD,
  },
];

export function DashboardRedesign() {
  const { username, isPremium, authUser } = useUser();
  const { player: chessPlayer } = useChessPlayer(username ?? authUser?.chesscomUsername ?? undefined);
  const { data: multiElo } = useMultiEloProgress(username ?? undefined);
  const { data: summary } = useMyAnalysisSummary();
  const { data: gamesData } = useMyGames(3);
  const [opponent, setOpponent] = useState('');
  const [, navigate] = useLocation();

  const displayName = username ?? authUser?.chesscomUsername ?? authUser?.lichessUsername ?? 'Player';

  // Same "best available rating" logic already used in Layout.tsx's own
  // header, so the number shown here always matches what's shown there.
  const ratings: number[] = [];
  if (multiElo?.chesscom?.hasData) ratings.push(multiElo.chesscom.currentRating);
  if (multiElo?.lichess?.hasData) ratings.push(multiElo.lichess.currentRating);
  const scoutElo = ratings.length > 0
    ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
    : (chessPlayer?.rating ?? null);
  const scoutDelta = multiElo?.combined?.delta ?? null;

  const games = summary?.totalGames ?? 0;
  const wins = summary?.wins ?? 0;
  const draws = summary?.draws ?? 0;
  const losses = summary?.losses ?? 0;
  const winRatePct = games > 0 ? Math.round((wins / games) * 100) : null;

  const submitScout = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = opponent.trim();
    navigate(trimmed ? `/opponents?username=${encodeURIComponent(trimmed)}` : '/opponents');
  };

  return (
    <div
      className="-m-4 min-h-screen px-3 pb-8 pt-2 md:-m-6 md:px-6 md:pt-4"
      style={{ background: BG, color: '#f3f5f4', fontFamily: 'Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}
    >
      <div className="mx-auto grid max-w-[1050px] gap-3">

        {/* Profile summary */}
        <Card className="p-4 md:p-5">
          <div className="flex items-center gap-3">
            <div
              className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full"
              style={{ border: `2px solid ${GREEN}`, background: 'rgba(139,234,69,.12)' }}
            >
              {chessPlayer?.avatar ? (
                <img src={chessPlayer.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xl font-black" style={{ color: GREEN }}>{displayName.charAt(0).toUpperCase()}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-extrabold tracking-tight">{displayName}</h1>
                {isPremium && (
                  <span
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-black uppercase tracking-wider"
                    style={{ background: GOLD, color: '#17130b' }}
                  >
                    <Crown size={10} /> Pro
                  </span>
                )}
              </div>
              <p className="truncate text-xs" style={{ color: MUTED }}>
                {authUser?.chesscomUsername && `Chess.com ${multiElo?.chesscom?.currentRating ?? '—'}`}
                {authUser?.chesscomUsername && authUser?.lichessUsername && '  |  '}
                {authUser?.lichessUsername && `Lichess ${multiElo?.lichess?.currentRating ?? '—'}`}
                {!authUser?.chesscomUsername && !authUser?.lichessUsername && 'Link an account from Profile'}
              </p>
            </div>

            {scoutElo != null && (
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>Scout Rating</p>
                <div className="flex items-baseline justify-end gap-1.5">
                  <span className="text-xl font-black">{scoutElo}</span>
                  {scoutDelta != null && scoutDelta !== 0 && (
                    <span className="text-xs font-bold" style={{ color: scoutDelta > 0 ? GREEN : RED }}>
                      {scoutDelta > 0 ? '▲' : '▼'}{Math.abs(scoutDelta)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {games > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-4 border-t pt-3" style={{ borderColor: BORDER }}>
              <div>
                <span className="block text-lg font-black leading-none">{games.toLocaleString()}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>Games</span>
              </div>
              <div className="flex-1 min-w-[120px]">
                <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                  <span style={{ color: GREEN }}>{wins}W</span>
                  <span style={{ color: MUTED }}>{draws}D</span>
                  <span style={{ color: RED }}>{losses}L</span>
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden">
                  <div style={{ width: `${(wins / games) * 100}%`, background: GREEN }} />
                  <div style={{ width: `${(draws / games) * 100}%`, background: MUTED }} />
                  <div style={{ width: `${(losses / games) * 100}%`, background: RED }} />
                </div>
              </div>
              <div className="text-right">
                <span className="block text-lg font-black leading-none">{winRatePct}%</span>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>Win Rate</span>
              </div>
            </div>
          )}
        </Card>

        {/* Scout hero */}
        <Card className="relative overflow-hidden p-5">
          <div className="relative z-10 max-w-[75%]">
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest" style={{ color: GREEN }}>
              <Target size={13} /> Know your opponent.
            </p>
            <h2 className="mt-1.5 text-2xl font-black leading-tight">
              Scout Any<br />
              <span style={{ background: `linear-gradient(90deg, ${GREEN}, ${GOLD})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Chess.com Player
              </span>
            </h2>
            <p className="mt-2 text-sm" style={{ color: MUTED }}>
              Get instant analysis, weaknesses, tendencies, and custom prep lines.
            </p>
            <form onSubmit={submitScout} className="mt-4 flex items-center gap-2 rounded-xl p-1" style={{ background: 'rgba(0,0,0,.35)', border: `1px solid ${BORDER}` }}>
              <input
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="Enter a Chess.com username"
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                style={{ color: '#f3f5f4' }}
              />
              <button type="submit" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: GREEN, color: '#071007' }}>
                <ChevronRight size={18} />
              </button>
            </form>
          </div>
        </Card>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          {QUICK_LINKS.map((q) => (
            <Link key={q.label} href={q.href}>
              <Card className="flex flex-col justify-between p-4 min-h-[128px] cursor-pointer transition-transform hover:-translate-y-0.5" style={{ background: q.bg }}>
                <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: q.iconBg, color: q.iconColor }}>
                  <q.icon size={18} />
                </span>
                <div className="flex items-end justify-between">
                  <div>
                    <b className="block text-base font-extrabold">{q.label}</b>
                    <span className="text-xs" style={{ color: MUTED }}>{q.sub}</span>
                  </div>
                  <ChevronRight size={16} style={{ color: MUTED }} />
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {/* Recent games */}
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-extrabold">Recent Games</h2>
            <Link href="/games" className="text-xs font-extrabold uppercase tracking-wide" style={{ color: GREEN }}>All Games →</Link>
          </div>
          <div className="grid gap-1">
            {gamesData?.games?.length ? gamesData.games.map((game) => {
              const isWhite = game.whiteUsername?.toLowerCase() === (username ?? '').toLowerCase();
              const rs = RESULT_STYLE[game.result] ?? RESULT_STYLE.draw;
              return (
                <Link key={game.id} href={`/games/${game.id}`} className="flex items-center gap-3 p-2 rounded-xl transition-colors hover:bg-white/5">
                  <MiniBoard />
                  <span className="w-[52px] text-center text-[10px] font-extrabold tracking-wide rounded-lg py-1 shrink-0" style={{ background: rs.bg, color: rs.text }}>{rs.label}</span>
                  <div className="flex-1 min-w-0">
                    <b className="text-sm block truncate">vs {isWhite ? game.blackUsername : game.whiteUsername}</b>
                    <small style={{ color: MUTED }} className="block text-xs truncate">{game.opening || 'Unknown opening'}</small>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs" style={{ color: MUTED }}>{new Date(game.playedAt).toLocaleDateString()}</span>
                    <ChevronRight size={14} style={{ color: MUTED }} />
                  </div>
                </Link>
              );
            }) : (
              <p style={{ color: MUTED }} className="text-sm text-center py-6">No games yet — import to get started.</p>
            )}
          </div>
        </Card>

      </div>
    </div>
  );
}
