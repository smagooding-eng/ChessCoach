import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Target, Search, ArrowRight, ArrowUpRight, ChevronRight, Play, Puzzle, BookOpen, Crosshair, Crown, Camera, Zap, ShoppingBag, Bot, Swords, Download } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMultiEloProgress } from '@/hooks/use-elo-progress';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useMyCourses } from '@/hooks/use-courses';
import { useLiveRatings, bestLiveRating } from '@/hooks/use-live-ratings';
import { apiFetch } from '@/lib/api';
import { trackImportJob } from '@/components/ImportStatusWatcher';
import { EmailVerifyBanner } from '@/components/EmailVerifyBanner';
import { FenThumb } from '@/components/FenThumb';
import { encodeCard } from '@/pages/ShareCard';
import { ReferralCard } from '@/pages/Profile';
import { useMyGames } from '@/hooks/use-games';
import { GameThumb } from '@/components/GameThumb';
import { ProUpsell } from '@/components/ProUpsell';
import { useSiteImg } from '@/hooks/use-app-config';
import { scene } from '@/components/PhotoHero';
import { BOTS } from '@/lib/chess-bot';
import { ActiveGamesCard } from '@/components/play/ActiveGamesCard';

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
const GREEN = '#81B64C';
const GREEN_DARK = '#5F8F36';
const MUTED = '#87918E';
const RED = '#FF5058';
const BORDER = 'rgba(255,255,255,.08)';

const asset = (file: string) => `${import.meta.env.BASE_URL}chessscout/${file}`;

const RESULT_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  win: { bg: 'rgba(95,143,54,.16)', fg: '#95C45A', label: 'WIN' },
  loss: { bg: 'rgba(255,80,88,.16)', fg: '#FF7A80', label: 'LOSS' },
  draw: { bg: 'rgba(255,255,255,.10)', fg: '#B9C2BF', label: 'DRAW' },
};

const TILES = [
  { label: 'Play', sub: 'Friends or bots', href: '/play', img: 'play.webp', pos: '78% center', icon: Play, c1: '#5f8f36', c2: '#81B64C', glow: 'rgba(129,182,76,.28)' },
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
  const siteImg = useSiteImg();
  const { username, isPremium, authUser, isSubscriptionLoaded } = useUser();
  // Only once the plan is known, so Pro members never see an upsell flash.
  const freePlan = isSubscriptionLoaded && !!authUser && !isPremium;
  const { player: chessPlayer } = useChessPlayer(username ?? authUser?.chesscomUsername ?? undefined);
  const { data: multiElo } = useMultiEloProgress(username ?? undefined);
  const { data: summary } = useMyAnalysisSummary();
  const { data: gamesData } = useMyGames(3);
  const [opponent, setOpponent] = useState('');
  const [, navigate] = useLocation();
  const { data: weaknessesData } = useMyWeaknesses();
  const { data: coursesData } = useMyCourses();
  const { data: liveRatingsData } = useLiveRatings();
  const liveBest = bestLiveRating(liveRatingsData?.ratings);

  // Same behaviour as the classic home: quietly fetch any new games (last month)
  // once per visit, using the shared background-import tracker. Failures are
  // swallowed on purpose -- a manual Import still works and reports its own errors.
  const autoImportedRef = useRef(false);
  useEffect(() => {
    if (autoImportedRef.current) return;
    const platform: 'chesscom' | 'lichess' | null = username ? 'chesscom' : authUser?.lichessUsername ? 'lichess' : null;
    const autoUsername = platform === 'chesscom' ? username : authUser?.lichessUsername;
    if (!platform || !autoUsername) return;
    autoImportedRef.current = true;
    (async () => {
      try {
        const r = await apiFetch('/api/games/import-bg', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: autoUsername, months: 1, forceUpdate: false, platform, ownerUsername: username || autoUsername }),
        });
        if (!r.ok) return;
        const { jobId } = await r.json() as { jobId: string };
        if (jobId) trackImportJob(jobId, platform, autoUsername, true);
      } catch { /* silent by design */ }
    })();
  }, [username, authUser?.lichessUsername]);

  const displayName = username ?? authUser?.chesscomUsername ?? authUser?.lichessUsername ?? 'Player';
  const mine = [username, authUser?.chesscomUsername, authUser?.lichessUsername]
    .filter((n): n is string => !!n)
    .map((n) => n.toLowerCase());

  // Same "best available rating" logic as the Layout header so the two
  // numbers can never disagree.
  const ratings: number[] = [];
  if (multiElo?.chesscom?.hasData) ratings.push(multiElo.chesscom.currentRating);
  if (multiElo?.lichess?.hasData) ratings.push(multiElo.lichess.currentRating);
  const scoutElo = liveBest
    ? liveBest.rating
    : ratings.length > 0
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

  // Tapping the Scout rating shares a milestone card (same as the classic home)
  const shareScout = async () => {
    if (scoutElo == null) return;
    const url = `${window.location.origin}/share/${encodeCard({ type: 'milestone', username: username ?? 'A ChessScout.net user', newRating: scoutElo })}`;
    const shareData = { title: `My Scout ELO is ${scoutElo}`, url };
    if (navigator.share) { try { await navigator.share(shareData); return; } catch { /* fall through to clipboard */ } }
    try { await navigator.clipboard.writeText(url); } catch { /* nothing more we can do */ }
  };

  const SEV: Record<string, { bg: string; fg: string }> = {
    Critical: { bg: 'rgba(255,80,88,.18)', fg: '#FF8A8F' },
    High: { bg: 'rgba(255,138,61,.18)', fg: '#FFB07A' },
    Medium: { bg: 'rgba(232,180,71,.18)', fg: '#F0C25C' },
    Low: { bg: 'rgba(129,182,76,.16)', fg: GREEN },
  };
  const topWeaknesses = weaknessesData?.weaknesses?.slice(0, 3) ?? [];
  const courses = coursesData?.courses?.slice(0, 3) ?? [];

  return (
    <div
      className="min-h-screen px-3 pt-3 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]"
      style={{ background: BG, color: '#F5F7F6', fontFamily: 'inherit' }}
    >
      {/* Desktop (lg+): two columns at full width instead of the phone column centred */}
      <div className="mx-auto grid grid-cols-1 w-full max-w-[760px] gap-3 lg:max-w-[1200px] lg:grid-cols-2 lg:gap-4 lg:items-start">
        <div className="lg:col-span-2 empty:hidden"><EmailVerifyBanner /></div>

        {/* ── Player summary ── */}
        <section className="relative overflow-hidden rounded-[20px] p-4 lg:col-span-2" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          {/* faint background picture behind the name card */}
          <img src={siteImg(scene('profile-card'))} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ opacity: 0.6 }} />
          <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(11,18,19,.82) 0%, rgba(11,18,19,.5) 50%, rgba(11,18,19,.22) 100%), linear-gradient(0deg, rgba(11,18,19,.55) 0%, rgba(11,18,19,0) 45%)' }} />
          <div className="relative">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div
                className="grid h-[60px] w-[60px] place-items-center overflow-hidden rounded-full"
                style={{ border: `2px solid ${GREEN}`, background: 'rgba(129,182,76,.10)' }}
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
              <button onClick={shareScout} aria-label="Share your Scout rating" className="shrink-0 text-right">
                <p className="text-[10px] font-bold uppercase tracking-[.14em]" style={{ color: MUTED }}>Scout Rating</p>
                <div className="flex items-baseline justify-end gap-1.5">
                  <span className="text-[26px] font-black leading-none">{scoutElo}</span>
                  {scoutDelta != null && scoutDelta !== 0 && (
                    <span className="text-[12px] font-extrabold" style={{ color: scoutDelta > 0 ? GREEN : RED }}>
                      {scoutDelta > 0 ? '▲' : '▼'} {scoutDelta > 0 ? '+' : '-'}{Math.abs(scoutDelta)}
                    </span>
                  )}
                </div>
              </button>
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
                    <span style={{ color: '#95C45A' }}>{wins}W</span>
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

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Link href="/import" className="flex items-center justify-center gap-2 rounded-[13px] py-3 text-[14px] font-extrabold" style={{ background: `linear-gradient(180deg, ${GREEN}, ${GREEN_DARK})`, color: '#05100A' }}>
              <Download size={16} /> Import
            </Link>
            <Link href="/opponents" className="flex items-center justify-center gap-2 rounded-[13px] py-3 text-[14px] font-bold" style={{ background: 'rgba(255,255,255,.06)', border: `1px solid ${BORDER}` }}>
              <Swords size={16} style={{ color: GREEN }} /> Scout
            </Link>
          </div>
          </div>
        </section>

        {/* ── Your live / daily games (hidden when none) ── */}
        <ActiveGamesCard />

        {/* ── Scout hero ── */}
        <section
          className="relative min-h-[340px] overflow-hidden rounded-[20px]"
          style={{
            background: BG,
            border: `1px solid ${BORDER}`,
            backgroundImage: `url(${siteImg(asset('scout-knight.webp'))})`,
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
              <span style={{ color: GREEN, textShadow: '0 0 26px rgba(129,182,76,.35), 0 2px 14px rgba(0,0,0,.85)' }}>Chess.com Player</span>
            </h2>
            <p className="mt-2.5 max-w-[58%] text-[14px] leading-snug sm:max-w-[48%]" style={{ color: '#C9D1CE', textShadow: '0 2px 10px rgba(0,0,0,.9)' }}>
              Get instant analysis, weaknesses, tendencies, and custom prep lines.
            </p>

            <form
              onSubmit={submitScout}
              className="mt-auto flex items-center overflow-hidden rounded-[16px]"
              style={{ background: 'rgba(8,14,15,.82)', border: `1px solid rgba(255,255,255,.12)`, boxShadow: '0 0 28px rgba(129,182,76,.16)' }}
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
                style={{ background: `linear-gradient(180deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`, color: '#05100A', boxShadow: '0 0 22px rgba(129,182,76,.45)' }}
                aria-label="Scout this player"
              >
                <ArrowRight size={26} strokeWidth={2.6} />
              </button>
            </form>
          </div>
        </section>

        {/* ── Feature tiles ── */}
        <div className="grid grid-cols-2 gap-3 lg:self-stretch lg:auto-rows-fr">
          {TILES.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className="relative block min-h-[128px] overflow-hidden rounded-[18px] transition-transform active:scale-[.98]"
              style={{
                background: BG,
                border: `1px solid ${BORDER}`,
                backgroundImage: `url(${siteImg(asset(t.img))})`,
                backgroundSize: 'auto 100%',
                backgroundPosition: t.pos,
                backgroundRepeat: 'no-repeat',
                // No coloured glow on these tiles: it read as a bright rim down the
                // left side of Play and Openings.
                boxShadow: 'none',
              }}
            >
              <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,10,11,.78) 0%, rgba(5,10,11,.25) 62%, rgba(5,10,11,0) 100%), linear-gradient(0deg, rgba(5,10,11,.65) 0%, rgba(5,10,11,0) 55%)' }} />
              <div className="relative z-10 flex h-full min-h-[128px] flex-col justify-between p-3.5">
                <span
                  className="grid h-10 w-10 place-items-center rounded-[11px]"
                  style={{ background: `linear-gradient(160deg, ${t.c2}, ${t.c1})`, boxShadow: '0 2px 8px rgba(0,0,0,.45)', border: '1px solid rgba(255,255,255,.18)' }}
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

        {/* ── Key weaknesses ── */}
        <section className="rounded-[20px]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] text-[19px]" style={{ background: 'rgba(129,182,76,.10)', border: `1px solid ${BORDER}`, color: GREEN }}>♚</span>
              <h2 className="text-[17px] font-extrabold">Key Weaknesses</h2>
            </div>
            <Link href="/analysis" className="flex items-center gap-1 text-[12px] font-extrabold uppercase tracking-wider" style={{ color: GREEN }}>
              Full Analysis <ChevronRight size={14} />
            </Link>
          </div>
          {topWeaknesses.length === 0 ? (
            <div className="border-t px-4 py-7 text-center" style={{ borderColor: BORDER }}>
              <Target size={26} className="mx-auto mb-2 opacity-50" />
              <p className="text-[13px]" style={{ color: MUTED }}>No weaknesses found yet.</p>
              <Link href="/analysis" className="mt-1.5 inline-block text-[13px] font-bold" style={{ color: GREEN }}>Run Deep Analysis →</Link>
            </div>
          ) : (
            topWeaknesses.map((w) => {
              const sev = SEV[w.severity] ?? SEV.Low;
              return (
                <Link key={w.id} href={`/analysis/${w.id}`} className="flex items-start gap-3 border-t px-4 py-3.5 transition-colors hover:bg-white/[0.03]" style={{ borderColor: BORDER }}>
                  <span className="mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-extrabold" style={{ background: sev.bg, color: sev.fg }}>{w.severity}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14.5px] font-bold">{w.category}</b>
                    <span className="line-clamp-1 block text-[12.5px]" style={{ color: MUTED }}>{w.description}</span>
                  </span>
                  <ChevronRight size={15} className="mt-1 shrink-0" style={{ color: MUTED }} />
                </Link>
              );
            })
          )}
          {freePlan && topWeaknesses.length > 0 && (
            <div className="border-t p-3" style={{ borderColor: BORDER }}>
              <ProUpsell compact title="Turn these into a course" text="Pro builds lessons from the exact positions where you went wrong." />
            </div>
          )}
        </section>

        {/* ── Recent games ── */}
        <section className="rounded-[20px]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: 'rgba(129,182,76,.10)', border: `1px solid ${BORDER}` }}>
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

        {/* ── Stats tile (same four numbers as the classic home) ── */}
        <Link href="/analysis" className="block overflow-hidden rounded-[20px]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="grid grid-cols-2">
            {[
              { label: 'Total Games', value: summary?.totalGames?.toLocaleString() || '0' },
              { label: 'Win Rate', value: winRate != null ? `${winRate}%` : '—' },
              { label: 'Avg Rating', value: Math.round(summary?.avgRating || 0) || '—' },
              { label: 'Reviewed', value: summary?.reviewedCount ?? 0 },
            ].map((st, i) => (
              <div key={st.label} className="px-4 py-3.5" style={{ borderRight: i % 2 === 0 ? `1px solid ${BORDER}` : undefined, borderBottom: i < 2 ? `1px solid ${BORDER}` : undefined }}>
                <p className="text-[10.5px] font-bold uppercase tracking-[.14em]" style={{ color: MUTED }}>{st.label}</p>
                <b className="mt-0.5 block text-[22px] font-extrabold leading-tight">{st.value}</b>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-1 border-t py-2.5 text-[12.5px] font-extrabold" style={{ borderColor: BORDER, color: GREEN }}>
            See Full Analysis <ChevronRight size={14} />
          </div>
        </Link>

        {/* ── Scan a position (photo coach) ── */}
        <Link href="/scan" className="flex items-center gap-4 overflow-hidden rounded-[20px] p-4" style={{ background: CARD, border: '1px solid rgba(129,182,76,.3)' }}>
          <span className="relative shrink-0">
            <FenThumb fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" size={74} />
            <span className="absolute -bottom-1.5 -right-1.5 grid h-8 w-8 place-items-center rounded-full" style={{ background: `linear-gradient(180deg, ${GREEN}, ${GREEN_DARK})`, color: '#05100A' }}><Camera size={16} /></span>
          </span>
          <span className="min-w-0 flex-1">
            {!freePlan
              ? <span className="mb-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[.16em]" style={{ background: 'rgba(129,182,76,.12)', color: GREEN }}><Zap size={10} /> Coach</span>
              : <span className="mb-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[.16em]" style={{ background: 'linear-gradient(180deg,#F2C560,#D99A24)', color: '#1A1205' }}><Crown size={10} /> Pro</span>}
            <b className="block text-[17px] font-extrabold leading-tight">Seen a position worth studying?</b>
            <span className="mt-0.5 block text-[13px] font-bold" style={{ color: GREEN }}>Snap a photo and explore it on the board</span>
          </span>
          <ArrowUpRight size={20} className="shrink-0" style={{ color: GREEN }} />
        </Link>

        {/* ── Courses: Pro. Free members see what they'd get, inline. ── */}
        {freePlan && (
          <ProUpsell
            title="Get courses built from your own games"
            text="The AI coach turns the mistakes Stockfish finds in your games into short lessons and drills."
            perks={['Lessons from your real positions', 'The AI coach on every game you review', 'AI scouting reports on your opponents']}
          />
        )}

        {/* ── Courses progress ── */}
        {courses.length > 0 && (
          <section className="rounded-[20px]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-[10px] text-[19px]" style={{ background: 'rgba(129,182,76,.10)', border: `1px solid ${BORDER}`, color: GREEN }}>♝</span>
                <h2 className="text-[17px] font-extrabold">Courses</h2>
              </div>
              <Link href="/courses" className="flex items-center gap-1 text-[12px] font-extrabold uppercase tracking-wider" style={{ color: GREEN }}>All <ChevronRight size={14} /></Link>
            </div>
            {courses.map((c) => {
              const pct = Math.round((c.completedLessons / c.totalLessons) * 100) || 0;
              return (
                <Link key={c.id} href={`/courses/${c.id}`} className="flex items-center gap-3 border-t px-4 py-3.5 transition-colors hover:bg-white/[0.03]" style={{ borderColor: BORDER }}>
                  <span className="min-w-0 flex-1">
                    <b className="line-clamp-1 block text-[14.5px] font-bold">{c.title}</b>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.10)' }}>
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%`, background: GREEN }} />
                    </span>
                  </span>
                  <b className="shrink-0 text-[13px]" style={{ color: GREEN }}>{pct}%</b>
                </Link>
              );
            })}
          </section>
        )}

        {/* ── Everything else from the classic home ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Practice Bots', sub: `${BOTS.length} opponents`, href: '/practice', icon: Bot, img: 'quick-bots' },
            { label: 'Local Play', sub: 'Pass and play', href: '/play/local', icon: Play, img: 'quick-local' },
            { label: 'Shop', sub: 'Boards & gear', href: '/shop', icon: ShoppingBag, img: 'quick-shop' },
          ].map((q) => (
            <Link key={q.label} href={q.href} className="relative flex min-h-[124px] flex-col items-start justify-between gap-2 overflow-hidden rounded-[18px] p-3.5 transition-transform active:scale-[.98]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <img src={siteImg(scene(q.img))} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              <span className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(5,10,11,.92) 0%, rgba(5,10,11,.55) 50%, rgba(5,10,11,.15) 100%)' }} />
              <span className="relative grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: 'rgba(5,10,11,.6)', color: GREEN, border: '1px solid rgba(129,182,76,.3)' }}><q.icon size={18} /></span>
              <span className="relative min-w-0 max-w-full">
                <b className="block truncate text-[13.5px] font-extrabold">{q.label}</b>
                <span className="block truncate text-[11.5px]" style={{ color: '#C4CCC9' }}>{q.sub}</span>
              </span>
            </Link>
          ))}
        </div>

        {authUser && <div className="lg:col-span-2"><ReferralCard isPremium={isPremium} compact /></div>}

      </div>
    </div>
  );
}
