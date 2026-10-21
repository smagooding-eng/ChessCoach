import { SocialLinks } from '@/components/SocialLinks';
import React, { useEffect, useRef, useState } from 'react';
import { autoImportLinkedAccounts } from '@/lib/autoImport';
import { Link, useLocation } from 'wouter';
import { Trophy, Target, Search, ArrowRight, ArrowUpRight, ChevronRight, Play, Puzzle, BookOpen, Crosshair, Crown, Camera, Zap, ShoppingBag, Bot, BarChart3, GraduationCap } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMultiEloProgress } from '@/hooks/use-elo-progress';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useLiveRatings, bestLiveRating } from '@/hooks/use-live-ratings';
import { EmailVerifyBanner } from '@/components/EmailVerifyBanner';
import { FenThumb } from '@/components/FenThumb';
import { encodeCard } from '@/pages/ShareCard';
import { ReferralCard } from '@/pages/Profile';
import { useMyGames } from '@/hooks/use-games';
import { GameThumb } from '@/components/GameThumb';
import { playedWhite } from '@/lib/gameSide';
import { ProUpsell } from '@/components/ProUpsell';
import { useSiteImg } from '@/hooks/use-app-config';
import { usePhotoLook } from '@/context/SettingsContext';
import { scene } from '@/components/PhotoHero';
import { BOTS } from '@/lib/chess-bot';
import { ActiveGamesCard } from '@/components/play/ActiveGamesCard';
import { PlayAppCard } from '@/components/GooglePlayBadge';
import { ChallengeInbox } from '@/components/play/OpenChallenges';
import { NEUTRAL_CHIP } from '@/lib/redesignTheme';

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

// CSS variables (with the usual colours as fallbacks) so the photo backdrop look shows through.
const BG = 'var(--rd-bg, #050A0B)';
const CARD = 'var(--rd-card, linear-gradient(160deg, #0F1819 0%, #0B1213 100%))';
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
  // Play now lives on the name card, so this slot shows Tournaments.
  { label: 'Tournaments', sub: 'Join or host events', href: '/tournaments', img: 'scenes/play-online.webp', pos: '70% center', icon: Trophy, c1: '#5f8f36', c2: '#81B64C', glow: 'rgba(129,182,76,.28)' },
  { label: 'Puzzles', sub: 'Smart training', href: '/puzzles', img: 'puzzles.webp', pos: '73% center', icon: Puzzle, c1: '#5f8f36', c2: '#81B64C', glow: 'rgba(92,150,255,.30)' },
  { label: 'Openings', sub: 'Drill and learn', href: '/openings', img: 'openings.webp', pos: '68% center', icon: BookOpen, c1: '#5f8f36', c2: '#81B64C', glow: 'rgba(168,120,255,.30)' },
  { label: 'Chess Traps', sub: 'Learn the classics', href: '/traps', img: 'traps.webp', pos: '59% center', icon: Crosshair, c1: '#5f8f36', c2: '#81B64C', glow: 'rgba(232,180,71,.30)' },
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
  // Photo backdrop look: no pictures on the cards, so they tighten up.
  const photoLook = usePhotoLook();
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
  const { data: liveRatingsData } = useLiveRatings();
  const liveBest = bestLiveRating(liveRatingsData?.ratings);

  // Same behaviour as the classic home: quietly fetch any new games (last month)
  // once per visit, using the shared background-import tracker. Failures are
  // swallowed on purpose -- a manual Import still works and reports its own errors.
  const autoImportedRef = useRef(false);
  useEffect(() => {
    if (autoImportedRef.current) return;
    const chesscom = authUser?.chesscomUsername || username;
    const lichess = authUser?.lichessUsername;
    if (!chesscom && !lichess) return;
    autoImportedRef.current = true;
    autoImportLinkedAccounts({ chesscom, lichess });
  }, [username, authUser?.chesscomUsername, authUser?.lichessUsername]);

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

  const weaknessCount = weaknessesData?.weaknesses?.length ?? 0;

  return (
    <div
      className="min-h-screen px-4 pt-4 md:px-8 md:pt-8 md:pb-14 pb-[calc(7.5rem+env(safe-area-inset-bottom))]"
      style={{ background: BG, color: '#F5F7F6', fontFamily: 'inherit' }}
    >
      {/* Desktop (lg+): two columns at full width instead of the phone column centred */}
      <div className="mx-auto grid grid-cols-1 w-full max-w-[760px] gap-5 lg:max-w-[1200px] lg:grid-cols-2 lg:gap-6 lg:items-start">
        <div className="lg:col-span-2 empty:hidden"><EmailVerifyBanner /></div>

        {/* ── Player summary ── */}
        <section className="relative overflow-hidden rounded-[20px] p-5 lg:col-span-2" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          {/* faint background picture behind the name card */}
          {!photoLook && <img src={siteImg(scene('profile-card'))} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ opacity: 0.6 }} />}
          {!photoLook && <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(11,18,19,.82) 0%, rgba(11,18,19,.5) 50%, rgba(11,18,19,.22) 100%), linear-gradient(0deg, rgba(11,18,19,.55) 0%, rgba(11,18,19,0) 45%)' }} />}
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

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Link href="/play" className="flex items-center justify-center gap-2 rounded-[13px] py-3 text-[14px] font-extrabold" style={{ background: `linear-gradient(180deg, ${GREEN}, ${GREEN_DARK})`, color: '#FFFFFF' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginLeft: 1 }}><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" /></svg> Play
            </Link>
            <Link href="/learning" className="flex items-center justify-center gap-2 rounded-[13px] py-3 text-[14px] font-bold" style={{ background: 'rgba(255,255,255,.06)', border: `1px solid ${BORDER}` }}>
              <GraduationCap size={17} strokeWidth={2.25} style={{ color: GREEN }} /> Learn
            </Link>
          </div>
          </div>
        </section>

        {/* ── Your live / daily games (hidden when none) ── */}
        <ChallengeInbox className="lg:col-span-2" />
        <ActiveGamesCard />
        <PlayAppCard className="lg:col-span-2" />

        {/* ── Feature tiles ── */}
        <div className="grid grid-cols-2 gap-4 lg:self-stretch lg:auto-rows-fr">
          {TILES.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className={`relative block overflow-hidden rounded-[18px] transition-transform active:scale-[.98] ${photoLook ? '' : 'min-h-[128px]'}`}
              style={photoLook ? { background: CARD, border: `1px solid ${BORDER}` } : {
                backgroundColor: 'var(--rd-card-solid, #050A0B)',
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
              {!photoLook && <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,10,11,.78) 0%, rgba(5,10,11,.25) 62%, rgba(5,10,11,0) 100%), linear-gradient(0deg, rgba(5,10,11,.65) 0%, rgba(5,10,11,0) 55%)' }} />}
              <div className={`relative z-10 flex h-full ${photoLook ? 'items-center gap-3 p-3' : 'min-h-[128px] flex-col justify-between p-3.5'}`}>
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px]"
                  style={{ background: `linear-gradient(160deg, ${t.c2}, ${t.c1})`, boxShadow: '0 2px 8px rgba(0,0,0,.45)', border: '1px solid rgba(255,255,255,.18)' }}
                >
                  <t.icon size={21} color="#fff" fill={t.label === 'Play' ? '#fff' : 'none'} />
                </span>
                <div className={`flex justify-between gap-2 ${photoLook ? 'min-w-0 flex-1 items-center' : 'items-end'}`}>
                  <div className="min-w-0">
                    <b className={`block truncate font-extrabold leading-tight ${photoLook ? 'text-[16px]' : 'text-[19px]'}`}>{t.label}</b>
                    <span className="block truncate text-[12.5px]" style={{ color: '#C4CCC9' }}>{t.sub}</span>
                  </div>
                  {!photoLook && (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ border: '1.5px solid rgba(255,255,255,.7)', background: 'rgba(5,10,11,.45)' }}>
                    <ArrowRight size={16} />
                  </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>


        {/* ── Scout hero ── */}
        <section
          className={`relative overflow-hidden rounded-[20px] ${photoLook ? '' : 'min-h-[340px]'}`}
          style={photoLook ? { background: CARD, border: `1px solid ${BORDER}` } : {
            backgroundColor: 'var(--rd-card-solid, #050A0B)',
            border: `1px solid ${BORDER}`,
            backgroundImage: `url(${siteImg(asset('scout-knight.webp'))})`,
            backgroundSize: 'auto 100%',
            backgroundPosition: '68% center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          {!photoLook && <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,10,11,.94) 0%, rgba(5,10,11,.72) 46%, rgba(5,10,11,0) 78%)' }} />}
          <div className={`relative z-10 flex flex-col p-5 ${photoLook ? '' : 'min-h-[340px]'}`}>
            <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.22em]" style={{ color: GREEN }}>
              <Target size={18} /> Know your opponent.
            </p>
            <h2 className="mt-3 text-[26px] font-black leading-[1.04] tracking-tight min-[400px]:text-[28px] sm:text-[36px]" style={{ textShadow: '0 2px 14px rgba(0,0,0,.85)' }}>
              Scout Any<br />
              <span style={{ color: GREEN, textShadow: '0 0 26px rgba(129,182,76,.35), 0 2px 14px rgba(0,0,0,.85)' }}>Chess.com Player</span>
            </h2>
            <p className={`mt-2.5 text-[14px] leading-snug ${photoLook ? '' : 'max-w-[58%] sm:max-w-[48%]'}`} style={{ color: '#C9D1CE', textShadow: '0 2px 10px rgba(0,0,0,.9)' }}>
              Get instant analysis, weaknesses, tendencies, and custom prep lines.
            </p>

            <form
              onSubmit={submitScout}
              className={`${photoLook ? 'mt-5' : 'mt-auto'} flex items-center overflow-hidden rounded-[16px]`}
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
                style={{ background: `linear-gradient(180deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`, color: '#FFFFFF', boxShadow: '0 0 22px rgba(129,182,76,.45)' }}
                aria-label="Scout this player"
              >
                <ArrowRight size={26} strokeWidth={2.6} />
              </button>
            </form>
          </div>
        </section>

        {/* ── Recent games ── */}
        <section className="rounded-[20px]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between px-5 pb-3.5 pt-5">
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
                const isWhite = playedWhite(game, mine);
                const rs = RESULT_STYLE[game.result] ?? RESULT_STYLE.draw;
                return (
                  <Link
                    key={game.id}
                    href={`/games/${game.id}`}
                    className="flex items-center gap-3 border-t px-5 py-3.5 transition-colors hover:bg-white/[0.03]"
                    style={{ borderColor: BORDER }}
                  >
                    <GameThumb pgn={game.pgn} userColor={isWhite ? 'white' : 'black'} size={44} />
                    <span className="w-[52px] shrink-0 rounded-md py-1 text-center text-[11px] font-extrabold tracking-wide" style={NEUTRAL_CHIP}><span className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle" style={{ background: rs.fg }} />
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

        {/* ── My Analytics: stats, weaknesses and courses now live there ── */}
        <Link href="/analysis" className="flex items-center gap-3.5 rounded-[20px] p-5 transition-transform active:scale-[.99]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px]" style={{ background: '#81B64C', color: '#FFFFFF' }}><BarChart3 size={21} /></span>
          <span className="min-w-0 flex-1">
            <b className="block text-[16px] font-extrabold">My Analytics</b>
            <span className="block truncate text-[12.5px]" style={{ color: MUTED }}>
              {statsLoading ? 'Stats, weaknesses and courses'
                : games === 0 ? 'Your stats appear once games finish importing'
                : `${games.toLocaleString()} games · ${winRate}% wins${weaknessCount ? ` · ${weaknessCount} weakness${weaknessCount === 1 ? '' : 'es'} to work on` : ''}`}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0" style={{ color: GREEN }} />
        </Link>

        {/* ── Scan a position (photo coach) ── */}
        <Link href="/scan" className="flex items-center gap-4 overflow-hidden rounded-[20px] p-5" style={{ background: CARD, border: '1px solid rgba(129,182,76,.3)' }}>
          <span className="relative shrink-0">
            <FenThumb fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" size={74} />
            <span className="absolute -bottom-1.5 -right-1.5 grid h-8 w-8 place-items-center rounded-full" style={{ background: `linear-gradient(180deg, ${GREEN}, ${GREEN_DARK})`, color: '#05100A' }}><Camera size={16} /></span>
          </span>
          <span className="min-w-0 flex-1">
            {!freePlan
              ? <span className="mb-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[.16em]" style={NEUTRAL_CHIP}><Zap size={10} style={{ color: GREEN }} /> Coach</span>
              : <span className="mb-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[.16em]" style={{ background: 'linear-gradient(180deg,#F2C560,#D99A24)', color: '#1A1205' }}><Crown size={10} /> Pro</span>}
            <b className="block text-[17px] font-extrabold leading-tight">Seen a position worth studying?</b>
            <span className="mt-0.5 block text-[13px] font-semibold" style={{ color: '#C4CCC9' }}>Snap a photo and explore it on the board</span>
          </span>
          <ArrowUpRight size={20} className="shrink-0" style={{ color: GREEN }} />
        </Link>

        {/* ── Everything else from the classic home ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Practice Bots', sub: `${BOTS.length} opponents`, href: '/practice', icon: Bot, img: scene('quick-bots') },
            { label: 'Courses', sub: 'Lessons & drills', href: '/courses', icon: GraduationCap, img: `${import.meta.env.BASE_URL}assets/courses/course-library.webp` },
            { label: 'Shop', sub: 'Boards & gear', href: '/shop', icon: ShoppingBag, img: scene('quick-shop') },
          ].map((q) => (
            <Link key={q.label} href={q.href} className={`relative flex flex-col items-start justify-between gap-2 overflow-hidden rounded-[18px] p-3.5 transition-transform active:scale-[.98] ${photoLook ? 'min-h-[96px]' : 'min-h-[124px]'}`} style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              {!photoLook && <img src={siteImg(q.img)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
              {!photoLook && <span className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(5,10,11,.92) 0%, rgba(5,10,11,.55) 50%, rgba(5,10,11,.15) 100%)' }} />}
              <span className="relative grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: 'rgba(5,10,11,.6)', color: GREEN, border: '1px solid rgba(129,182,76,.3)' }}><q.icon size={18} /></span>
              <span className="relative min-w-0 max-w-full">
                <b className="block truncate text-[13.5px] font-extrabold">{q.label}</b>
                <span className="block truncate text-[11.5px]" style={{ color: '#C4CCC9' }}>{q.sub}</span>
              </span>
            </Link>
          ))}
        </div>

        {authUser && <div className="lg:col-span-2"><ReferralCard isPremium={isPremium} compact /></div>}
        <footer className="flex items-center justify-center pb-2 pt-1 text-xs lg:col-span-2" style={{ color: '#87918E' }}>
          <SocialLinks size={18} label="Follow ChessScout" />
        </footer>

      </div>
    </div>
  );
}
