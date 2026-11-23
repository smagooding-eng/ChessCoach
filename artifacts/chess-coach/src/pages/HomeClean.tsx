// The new Home (clean look): solid panels, short labels, rows instead of cards in cards, colourful
// icons, and one big Play button pinned at the bottom. The previous Home stays one tap away
// ("Use the previous Home" at the bottom; DashboardRouter in App.tsx picks).
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Crown, Search, ArrowRight } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useMultiEloProgress } from '@/hooks/use-elo-progress';
import { useLiveRatings, bestLiveRating } from '@/hooks/use-live-ratings';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMyGames } from '@/hooks/use-games';
import { playedWhite, useMyNames } from '@/lib/gameSide';
import { autoImportLinkedAccounts } from '@/lib/autoImport';
import { apiFetch } from '@/lib/api';
import { EditableAvatar } from '@/components/EditableAvatar';
import { EmailVerifyBanner } from '@/components/EmailVerifyBanner';
import { MaintenanceBanner } from '@/components/MaintenanceNotice';
import { NotifyPrompt } from '@/components/play/NotifyPrompt';
import { ChallengeInbox } from '@/components/play/OpenChallenges';
import { ActiveGamesCard } from '@/components/play/ActiveGamesCard';
import { ReferralCard } from '@/pages/Profile';
import { SocialLinks } from '@/components/SocialLinks';
import { AppIcon } from '@/components/AppIcon';
import { GameThumb } from '@/components/GameThumb';
import { setHomeStyle } from '@/lib/homeStyle';
import { useStreak } from '@/lib/activity';

const BG = 'var(--rd-bg, #0E1415)';
const PANEL = 'var(--rd-card-solid, #182123)';
const PANEL2 = 'var(--rd-card-light, #212B2D)';
const MUTED = '#8F9997';
const GREEN = '#81B64C';

function Section({ title, href, link = 'View all', children, className = '' }: { title: string; href?: string; link?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <h2 className="text-[15px] font-extrabold">{title}</h2>
        {href && <Link href={href} className="text-[13px] font-bold" style={{ color: MUTED }}>{link}</Link>}
      </div>
      {children}
    </section>
  );
}

function Tile({ href, icon, value, label }: { href: string; icon: string; value?: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex w-[100px] shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] py-3 active:scale-[.97]" style={{ background: PANEL }}>
      <AppIcon name={icon} size={30} />
      {value != null && <b className="text-[17px] font-black leading-none tabular-nums">{value}</b>}
      <span className="text-[12px] font-semibold" style={{ color: MUTED }}>{label}</span>
    </Link>
  );
}

const RESULT: Record<string, { c: string; t: string }> = { win: { c: GREEN, t: '+' }, loss: { c: '#E8524A', t: '−' }, draw: { c: '#9AA4A2', t: '=' } };

export function HomeClean() {
  const { username, isPremium, authUser } = useUser();
  const { player } = useChessPlayer(username ?? authUser?.chesscomUsername ?? undefined);
  const { data: multiElo } = useMultiEloProgress(username ?? undefined);
  const { data: live } = useLiveRatings();
  const { data: gamesData } = useMyGames(6);
  const mine = useMyNames();
  const [, navigate] = useLocation();
  const [opponent, setOpponent] = useState('');
  const [puzzles, setPuzzles] = useState<{ solved: number; streak: number } | null>(null);
  const daily = useStreak(!!authUser);

  // quietly fetch new games once per visit (as the previous Home does)
  const imported = useRef(false);
  useEffect(() => {
    if (imported.current) return;
    const chesscom = authUser?.chesscomUsername || username;
    const lichess = authUser?.lichessUsername;
    if (!chesscom && !lichess) return;
    imported.current = true;
    autoImportLinkedAccounts({ chesscom, lichess });
  }, [username, authUser?.chesscomUsername, authUser?.lichessUsername]);
  useEffect(() => {
    if (!authUser) return;
    apiFetch('/api/puzzles/stats', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setPuzzles({ solved: d.solved ?? 0, streak: d.streak ?? 0 })).catch(() => {});
  }, [authUser]);

  const name = authUser?.scoutUsername ?? authUser?.chesscomUsername ?? authUser?.lichessUsername ?? username ?? 'Player';
  const liveBest = bestLiveRating(live?.ratings);
  const linked: number[] = [];
  if (multiElo?.chesscom?.hasData) linked.push(multiElo.chesscom.currentRating);
  if (multiElo?.lichess?.hasData) linked.push(multiElo.lichess.currentRating);
  const scout = liveBest ? liveBest.rating : linked.length ? Math.round(linked.reduce((a, b) => a + b, 0) / linked.length) : (player?.rating ?? null);
  const games = gamesData?.games ?? [];
  const toReview = games.find((g) => !g.reviewed);
  const solved = puzzles?.solved ?? 0;

  const scoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = opponent.trim();
    navigate(t ? `/opponents?username=${encodeURIComponent(t)}` : '/opponents');
  };

  return (
    <div className="min-h-screen px-4 pt-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:px-8 md:pt-6 md:pb-6" style={{ background: BG, color: '#F5F7F6' }}>
      <div className="mx-auto w-full max-w-[680px] space-y-5">
        <div className="empty:hidden"><EmailVerifyBanner /></div>
        <MaintenanceBanner />

        {/* who you are */}
        <div className="flex items-center gap-3">
          <EditableAvatar size={48} border="none" fallback={<span className="text-lg font-black" style={{ color: GREEN }}>{name.charAt(0).toUpperCase()}</span>} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <b className="truncate text-[18px] font-black">{name}</b>
              {isPremium && <Crown size={15} style={{ color: '#F2B53A' }} aria-label="Pro" />}
            </div>
            <span className="text-[12.5px]" style={{ color: MUTED }}>
              {[authUser?.chesscomUsername && `Chess.com ${multiElo?.chesscom?.currentRating ?? '—'}`, authUser?.lichessUsername && `Lichess ${multiElo?.lichess?.currentRating ?? '—'}`].filter(Boolean).join(' · ') || 'Link an account in Profile'}
            </span>
          </div>
          {scout != null && (
            <div className="text-right">
              <b className="block text-[22px] font-black leading-none tabular-nums">{scout}</b>
              <span className="text-[11.5px] font-semibold" style={{ color: MUTED }}>Scout rating</span>
            </div>
          )}
        </div>

        {daily && (
          <div className="flex items-center gap-3 rounded-[12px] px-3.5 py-2.5" style={{ background: PANEL }}>
            <AppIcon name="streak" size={28} style={{ filter: daily.doneToday ? undefined : 'grayscale(1) opacity(.6)' }} />
            <span className="min-w-0 flex-1">
              <b className="block text-[15px] font-extrabold">{daily.streak} day{daily.streak === 1 ? '' : 's'} in a row</b>
              <span className="text-[12px]" style={{ color: MUTED }}>{daily.doneToday ? 'Done for today' : 'Play, solve or review today to keep it'}</span>
            </span>
            <span className="flex gap-1">{daily.week.map((d) => <span key={d.day} className="h-2.5 w-2.5 rounded-full" style={{ background: d.done ? '#F08A3C' : 'rgba(255,255,255,.12)' }} />)}</span>
          </div>
        )}

        <Link href="/play" className="cs-cta">Play</Link>

        <NotifyPrompt id="home" reason="Get told when your games are reviewed." />

        {/* puzzles */}
        <Link href="/puzzles/hub" className="flex items-center gap-3 rounded-[12px] p-3.5 active:scale-[.99]" style={{ background: PANEL }}>
          <AppIcon name="puzzles" size={40} />
          <span className="min-w-0 flex-1">
            <b className="block text-[17px] font-black">Puzzles</b>
            <span className="text-[12.5px] font-semibold" style={{ color: MUTED }}>{solved ? `${solved.toLocaleString()} solved · Case Files from your games` : 'Case Files from your own games'}</span>
          </span>
          <span className="cs-cta !w-auto !min-h-[40px] !px-4 !text-[15px]">Solve</span>
        </Link>

        {/* your turn: an unreviewed game */}
        {toReview && (
          <Section title="Ready to review">
            <Link href={`/games/${toReview.id}`} className="flex items-center gap-3 rounded-[12px] p-3" style={{ background: PANEL }}>
              <AppIcon name="coach" size={36} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[15px] font-extrabold">vs {playedWhite(toReview, mine) ? toReview.blackUsername : toReview.whiteUsername}</b>
                <span className="block truncate text-[12.5px]" style={{ color: MUTED }}>{toReview.opening || 'Your latest game'}</span>
              </span>
              <span className="cs-cta !w-auto !min-h-[38px] !px-3.5 !text-[14px]">Review</span>
            </Link>
          </Section>
        )}

        <ChallengeInbox />
        <ActiveGamesCard />

        {/* numbers that matter */}
        <Section title="Ratings" href="/analysis">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
            {scout != null && <Tile href="/analysis" icon="leaderboard" value={scout} label="Scout" />}
            {multiElo?.chesscom?.hasData && <Tile href="/analysis" icon="live" value={multiElo.chesscom.currentRating} label="Chess.com" />}
            {multiElo?.lichess?.hasData && <Tile href="/analysis" icon="board" value={multiElo.lichess.currentRating} label="Lichess" />}
            <Tile href="/puzzles" icon="puzzles" value={solved} label="Puzzles" />
            {daily && <Tile href="/puzzles" icon="streak" value={daily.streak} label={daily.streak === 1 ? 'Day streak' : 'Days streak'} />}
            <Tile href="/analysis" icon="analysis" label="All stats" />
          </div>
        </Section>

        {/* recent games: one tight row each */}
        <Section title="Game history" href="/games" link="View all">
          <div className="overflow-hidden rounded-[12px]" style={{ background: PANEL }}>
            {gamesData === undefined ? (
              <p className="px-4 py-6 text-center text-[13px]" style={{ color: MUTED }}>Loading…</p>
            ) : games.length === 0 ? (
              <Link href="/import" className="flex items-center gap-3 px-4 py-4"><AppIcon name="import" size={26} /><span className="text-[14px] font-bold">Import your games</span></Link>
            ) : games.slice(0, 5).map((g, i) => {
              const white = playedWhite(g, mine);
              const r = RESULT[g.result] ?? RESULT.draw;
              return (
                <Link key={g.id} href={`/games/${g.id}`} className="flex items-center gap-3 px-3.5 py-2.5 active:bg-white/5" style={i ? { borderTop: '1px solid rgba(255,255,255,.05)' } : undefined}>
                  <GameThumb pgn={g.pgn} userColor={white ? 'white' : 'black'} size={44} />
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-[15px] font-black text-white" style={{ background: r.c }}>{r.t}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold">
                    {white ? g.blackUsername : g.whiteUsername} <span className="font-normal" style={{ color: MUTED }}>({white ? g.blackRating : g.whiteRating})</span>
                  </span>
                  {g.reviewed
                    ? <span className="text-[12px] font-bold" style={{ color: MUTED }}>Reviewed</span>
                    : <span className="text-[12px] font-extrabold" style={{ color: GREEN }}>Review</span>}
                </Link>
              );
            })}
          </div>
        </Section>

        {/* everything to train with, as icons */}
        <Section title="Train">
          <div className="grid grid-cols-4 gap-2">
            {[
              ['/openings', 'openings', 'Openings'], ['/tactics', 'tactics', 'Tactics'], ['/endgames', 'endgames', 'Endgames'], ['/traps', 'traps', 'Traps'],
              ['/practice', 'bots', 'Bots'], ['/analysis-board', 'board', 'Analysis'], ['/courses', 'courses', 'Courses'], ['/scan', 'scan', 'Scan'],
            ].map(([href, icon, label]) => (
              <Link key={href} href={href} className="flex flex-col items-center gap-1.5 rounded-[10px] py-3 active:scale-[.97]" style={{ background: PANEL }}>
                <AppIcon name={icon} size={30} />
                <span className="text-[12px] font-bold">{label}</span>
              </Link>
            ))}
          </div>
        </Section>

        {/* scout an opponent */}
        <Section title="Scout an opponent">
          <form onSubmit={scoutSubmit} className="flex items-center overflow-hidden rounded-[12px]" style={{ background: PANEL2 }}>
            <Search size={18} className="ml-3.5 shrink-0" style={{ color: MUTED }} />
            <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Chess.com username" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go"
              className="h-[48px] min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-[#8F9997]" aria-label="Chess.com username to scout" />
            <button type="submit" aria-label="Scout" className="grid h-[48px] w-[52px] place-items-center" style={{ background: GREEN, color: '#fff' }}><ArrowRight size={22} /></button>
          </form>
        </Section>

        {authUser && <ReferralCard isPremium={isPremium} compact />}
        <footer className="flex flex-col items-center gap-2 pb-2 text-xs" style={{ color: MUTED }}>
          <SocialLinks size={18} label="Follow ChessScout.net" />
          <button onClick={() => setHomeStyle('classic')} className="underline-offset-2 hover:underline">Back to the usual Home</button>
        </footer>


      </div>
    </div>
  );
}
