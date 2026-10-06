import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Target, Search, ArrowRight, ChevronRight, Play, Puzzle, BookOpen, Crosshair, Crown } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMultiEloProgress } from '@/hooks/use-elo-progress';
import { useMyAnalysisSummary } from '@/hooks/use-analysis';
import { useMyGames } from '@/hooks/use-games';
import { GameThumb } from '@/components/GameThumb';

// Dashboard shown when the global "dashboard redesign" flag is ON (see
// DashboardRouter in App.tsx). The mobile header and bottom nav in the
// design reference are the app's shared Layout chrome and are not
// rebuilt here -- this component is the page content between them.
// Hero/tile artwork is the supplied cinematic imagery (cropped from the
// provided sheet into /public/chessscout/*.webp, served locally -- no
// external URLs). Each image carries its own focal position (`pos`) so
// the subject stays on the right and clear of the text on narrow phone
// cards. Avatars, ratings, stats and game thumbnails all come from the
// app's existing hooks/components, nothing is mocked.

const BG = '#050A0B';
const CARD = 'linear-gradient(160deg, #0F1819 0%, #0B1213 100%)';
const GREEN = '#8BEA45';
const GREEN_DARK = '#5FD533';
const MUTED = '#87918E';
const RED = '#FF5058';
const BORDER = 'rgba(255,255,255,.08)';

const asset = (file: string) => `${import.meta.env.BASE_URL}chessscout/${file}`;

const RESULT_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  win: { bg: 'rgba(95,213,51,.16)', fg: '#7BE05A', label: 'WIN' },
  loss: { bg: 'rgba(255,80,88,.16)', fg: '#FF7A80', label: 'LOSS' },
  draw: { bg: 'rgba(255,255,255,.10)', fg: '#B9C2BF', label: 'DRAW' },
};

const TILES = [
  { label: 'Play', sub: 'Friends or bots', href: '/play', img: 'play.webp', pos: '78% center', icon: Play, c1: '#2f9e3a', c2: '#8BEA45', glow: 'rgba(139,234,69,.28)' },
  { label: 'Puzzles', sub: 'Smart training', href: '/puzzles', img: 'puzzles.webp', pos: '73% center', icon: Puzzle, c1: '#1e5bff', c2: '#5cc8ff', glow: 'rgba(92,150,255,.30)' },
  { label: 'Openings', sub: 'Drill and learn', href: '/openings', img: 'openings.webp', pos: '68% center', icon: BookOpen, c1: '#6a3fc7', c2: '#b48cff', glow: 'rgba(168,120,255,.30)' },
  { label: 'Chess Traps', sub: 'Learn the classics', href: '/traps', img: 'traps.webp', pos: '59% center', icon: Crosshair, c1: '#b9791a', c2: '#ffd27a', glow: 'rgba(232,180,71,.30)' },
];

function RookIcon({ size = 18, color = GREEN }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M5 3h3v2h2V3h4v2h2V3h3v6l-2 2v6l2 2v2H5v-2l2-2v-6L5 9V3z" />
    </svg>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md ${className}`} style={{ background: 'rgba(255,255,255,.07)' }} />;
}

export function DashboardRedesign() {
  const { username, isPremium, authUser } = useUser();
  const { player: chessPlayer } = useChessPlayer(username ?? authUser?.chesscomUsername ?? undefined);
  const { data: multiElo } = useMultiEloProgress(username ?? undefined);
  const { data: summary } = useMyAnalysisSummary();
  const { data: gamesData } = useMyGames(3);
  const [opponent, setOpponent] = useState('');
  const [, navigate] = useLocation();

  const displayName = username ?? authUser?.chesscomUsername ?? authUser?.lichessUsername ?? 'Player';
  const mine = [username, authUser?.chesscomUsername, authUser?.lichessUsername]
    .filter((n): n is string => !!n)
    .map((n) => n.toLowerCase());

  // Same "best available rating" logic as the Layout header so the two
  // numbers can never disagree.
  const ratings: number[] = [];
  if (multiElo?.chesscom?.hasData) ratings.push(multiElo.chesscom.currentRating);
  if (multiElo?.lichess?.hasData) ratings.push(multiElo.lichess.currentRating);
  const scoutElo = ratings.length > 0
    ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
    : (chessPlayer?.rating ?? null);
  const scoutDelta = multiElo?.combined?.delta ?? null;

  const statsLoading = summary === undefined;
  const games = summary?.totalGames ?? 0;
  const wins = summary?.wins ?? 0;
  const draws = summary?.draws ?? 0;
  const losses = summary?.losses ?? 0;
  const winRate = games > 0 ? ((wins / games) * 100).toFixed(1) : null;

  const submitScout = (e: React.FormEvent) => {
    e.preventDefault();
    const target = opponent.trim();
    navigate(target ? `/opponents?username=${encodeURIComponent(target)}` : '/opponents');
  };

  const recent = gamesData?.games ?? [];

  return (
    <div
      className="-m-4 min-h-screen px-3 pt-3 md:-m-6 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]"
      style={{ background: BG, color: '#F5F7F6', fontFamily: 'inherit' }}
    >
      <div className="mx-auto grid w-full max-w-[760px] gap-3">

        {/* ── Player summary ── */}
        <section className="rounded-[20px] p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div
                className="grid h-[60px] w-[60px] place-items-center overflow-hidden rounded-full"
                style={{ border: `2px solid ${GREEN}`, background: 'rgba(139,234,69,.10)' }}
              >
                {chessPlayer?.avatar ? (
                  <img src={chessPlayer.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl font-black" style={{ color: GREEN }}>{displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[20px] font-extrabold leading-tight tracking-tight">{displayName}</h1>
                {isPremium && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-[3px] text-[10px] font-black uppercase tracking-wider"
                    style={{ background: 'linear-gradient(180deg,#F2C560,#D99A24)', color: '#1A1205' }}
                  >
                    <Crown size={11} /> Pro
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[13px]" style={{ color: MUTED }}>
                {authUser?.chesscomUsername && <>Chess.com {multiElo?.chesscom?.currentRating ?? '—'}</>}
                {authUser?.chesscomUsername && authUser?.lichessUsername && <span className="mx-2 opacity-50">|</span>}
                {authUser?.lichessUsername && <>Lichess {multiElo?.lichess?.currentRating ?? '—'}</>}
                {!authUser?.chesscomUsername && !authUser?.lichessUsername && 'Link an account from Profile'}
              </p>
            </div>

            {scoutElo != null && (
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-bold uppercase tracking-[.14em]" style={{ color: MUTED }}>Scout Rating</p>
                <div className="flex items-baseline justify-end gap-1.5">
                  <span className="text-[26px] font-black leading-none">{scoutElo}</span>
                  {scoutDelta != null && scoutDelta !== 0 && (
                    <span className="text-[12px] font-extrabold" style={{ color: scoutDelta > 0 ? GREEN : RED }}>
                      {scoutDelta > 0 ? '▲' : '▼'} {scoutDelta > 0 ? '+' : '-'}{Math.abs(scoutDelta)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Stats strip */}
          <div className="mt-3.5 flex items-center gap-3.5 rounded-[14px] px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${BORDER}` }}>
            {statsLoading ? (
              <>
                <Skeleton className="h-9 w-14" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-9 w-14" />
              </>
            ) : games === 0 ? (
              <p className="w-full py-1 text-center text-[13px]" style={{ color: MUTED }}>Your stats appear here once games finish importing.</p>
            ) : (
              <>
                <div className="shrink-0 text-center">
                  <b className="block text-[20px] font-extrabold leading-none">{games.toLocaleString()}</b>
                  <span className="text-[11px]" style={{ color: MUTED }}>Games</span>
                </div>
                <div className="min-w-0 flex-1 border-x px-3.5" style={{ borderColor: BORDER }}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px] font-extrabold">
                    <span style={{ color: '#7BE05A' }}>{wins}W</span>
                    <span style={{ color: MUTED }}>{draws}D</span>
                    <span style={{ color: RED }}>{losses}L</span>
                  </div>
                  <div className="flex h-[7px] overflow-hidden rounded-full">
                    <div style={{ width: `${(wins / games) * 100}%`, background: `linear-gradient(90deg, ${GREEN_DARK}, ${GREEN})` }} />
                    <div style={{ width: `${(draws / games) * 100}%`, background: '#8A949B' }} />
                    <div style={{ width: `${(losses / games) * 100}%`, background: RED }} />
                  </div>
                </div>
                <div className="shrink-0 text-center">
                  <b className="block text-[20px] font-extrabold leading-none">{winRate}%</b>
                  <span className="text-[11px]" style={{ color: MUTED }}>Win Rate</span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── Scout hero ── */}
        <section
          className="relative min-h-[340px] overflow-hidden rounded-[20px]"
          style={{
            background: BG,
            border: `1px solid ${BORDER}`,
            backgroundImage: `url(${asset('scout-knight.webp')})`,
            backgroundSize: 'auto 100%',
            backgroundPosition: '68% center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,10,11,.94) 0%, rgba(5,10,11,.72) 46%, rgba(5,10,11,0) 78%)' }} />
          <div className="relative z-10 flex min-h-[340px] flex-col p-5">
            <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.22em]" style={{ color: GREEN }}>
              <Target size={18} /> Know your opponent.
            </p>
            <h2 className="mt-3 text-[26px] font-black leading-[1.04] tracking-tight min-[400px]:text-[28px] sm:text-[36px]" style={{ textShadow: '0 2px 14px rgba(0,0,0,.85)' }}>
              Scout Any<br />
              <span style={{ color: GREEN, textShadow: '0 0 26px rgba(139,234,69,.35), 0 2px 14px rgba(0,0,0,.85)' }}>Chess.com Player</span>
            </h2>
            <p className="mt-2.5 max-w-[58%] text-[14px] leading-snug sm:max-w-[48%]" style={{ color: '#C9D1CE', textShadow: '0 2px 10px rgba(0,0,0,.9)' }}>
              Get instant analysis, weaknesses, tendencies, and custom prep lines.
            </p>

            <form
              onSubmit={submitScout}
              className="mt-auto flex items-center overflow-hidden rounded-[16px]"
              style={{ background: 'rgba(8,14,15,.82)', border: `1px solid rgba(255,255,255,.12)`, boxShadow: '0 0 28px rgba(139,234,69,.16)' }}
            >
              <Search size={20} className="ml-4 shrink-0" style={{ color: '#C9D1CE' }} />
              <input
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="Enter a Chess.com username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                className="h-[54px] min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-[#87918E]"
                style={{ color: '#F5F7F6' }}
                aria-label="Chess.com username to scout"
              />
              <button
                type="submit"
                className="grid h-[54px] w-[62px] shrink-0 place-items-center transition-transform active:scale-95"
                style={{ background: `linear-gradient(180deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`, color: '#05100A', boxShadow: '0 0 22px rgba(139,234,69,.45)' }}
                aria-label="Scout this player"
              >
                <ArrowRight size={26} strokeWidth={2.6} />
              </button>
            </form>
          </div>
        </section>

        {/* ── Feature tiles ── */}
        <div className="grid grid-cols-2 gap-3">
          {TILES.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className="relative block min-h-[128px] overflow-hidden rounded-[18px] transition-transform active:scale-[.98]"
              style={{
                background: BG,
                border: `1px solid ${BORDER}`,
                backgroundImage: `url(${asset(t.img)})`,
                backgroundSize: 'auto 100%',
                backgroundPosition: t.pos,
                backgroundRepeat: 'no-repeat',
                boxShadow: `inset 0 0 40px ${t.glow}`,
              }}
            >
              <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,10,11,.78) 0%, rgba(5,10,11,.25) 62%, rgba(5,10,11,0) 100%), linear-gradient(0deg, rgba(5,10,11,.65) 0%, rgba(5,10,11,0) 55%)' }} />
              <div className="relative z-10 flex h-full min-h-[128px] flex-col justify-between p-3.5">
                <span
                  className="grid h-10 w-10 place-items-center rounded-[11px]"
                  style={{ background: `linear-gradient(160deg, ${t.c2}, ${t.c1})`, boxShadow: `0 0 18px ${t.glow}`, border: '1px solid rgba(255,255,255,.18)' }}
                >
                  <t.icon size={21} color="#fff" fill={t.label === 'Play' ? '#fff' : 'none'} />
                </span>
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <b className="block truncate text-[19px] font-extrabold leading-tight">{t.label}</b>
                    <span className="block truncate text-[12.5px]" style={{ color: '#C4CCC9' }}>{t.sub}</span>
                  </div>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ border: '1.5px solid rgba(255,255,255,.7)', background: 'rgba(5,10,11,.45)' }}>
                    <ArrowRight size={16} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* ── Recent games ── */}
        <section className="rounded-[20px]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: 'rgba(139,234,69,.10)', border: `1px solid ${BORDER}` }}>
                <RookIcon size={19} />
              </span>
              <h2 className="text-[17px] font-extrabold">Recent Games</h2>
            </div>
            <Link href="/games" className="flex items-center gap-1 text-[12px] font-extrabold uppercase tracking-wider" style={{ color: GREEN }}>
              All Games <ChevronRight size={14} />
            </Link>
          </div>

          <div>
            {gamesData === undefined ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 border-t px-4 py-3" style={{ borderColor: BORDER }}>
                  <Skeleton className="h-11 w-11" />
                  <Skeleton className="h-4 w-12" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-3/5" /><Skeleton className="h-3 w-2/5" /></div>
                </div>
              ))
            ) : recent.length === 0 ? (
              <p className="border-t px-4 py-8 text-center text-[13px]" style={{ borderColor: BORDER, color: MUTED }}>No games yet — import some to see them here.</p>
            ) : (
              recent.map((game) => {
                const isWhite = mine.includes((game.whiteUsername ?? '').toLowerCase());
                const rs = RESULT_STYLE[game.result] ?? RESULT_STYLE.draw;
                return (
                  <Link
                    key={game.id}
                    href={`/games/${game.id}`}
                    className="flex items-center gap-3 border-t px-4 py-3 transition-colors hover:bg-white/[0.03]"
                    style={{ borderColor: BORDER }}
                  >
                    <GameThumb pgn={game.pgn} userColor={isWhite ? 'white' : 'black'} size={44} />
                    <span className="w-[52px] shrink-0 rounded-md py-1 text-center text-[11px] font-extrabold tracking-wide" style={{ background: rs.bg, color: rs.fg }}>
                      {rs.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-[14px] font-bold">
                        <span className="font-normal" style={{ color: MUTED }}>vs </span>{isWhite ? game.blackUsername : game.whiteUsername}
                      </b>
                      <span className="block truncate text-[12px]" style={{ color: MUTED }}>{game.opening || 'Unknown opening'}</span>
                    </div>
                    <span className="shrink-0 text-[12px]" style={{ color: MUTED }}>{new Date(game.playedAt).toLocaleDateString()}</span>
                    <ChevronRight size={15} className="shrink-0" style={{ color: MUTED }} />
                  </Link>
                );
              })
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
