import React from 'react';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useMyCourses } from '@/hooks/use-courses';
import { useMyGames } from '@/hooks/use-games';
import { Link } from 'wouter';
import { Swords, Trophy, Target, AlertTriangle, BookOpen, Clock, GraduationCap, TrendingUp, ChevronRight, Search, Play, Bot, Camera, Lock, Crown, Flame, Zap, Award, Activity, Sparkles, ArrowUpRight } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMultiEloProgress } from '@/hooks/use-elo-progress';

const CHESSCOM_GREEN = '#81b64c';
const BG_DARK = '#262421';
const BG_CARD = 'linear-gradient(180deg, #353230 0%, #2d2b28 100%)';
const BG_CARD_FLAT = '#302e2b';
const BG_CARD_HOVER = '#3a3733';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const CARD_SHADOW = '0 4px 16px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(129,182,76,0.04)';
const CARD_BORDER = '1px solid rgba(129,182,76,0.08)';

const RESULT_COLORS: Record<string, { bg: string; text: string }> = {
  win: { bg: 'rgba(129,182,76,0.15)', text: CHESSCOM_GREEN },
  loss: { bg: 'rgba(220,67,67,0.15)', text: '#dc4343' },
  draw: { bg: 'rgba(158,155,152,0.1)', text: TEXT_MUTED },
};

const SEV_COLORS: Record<string, { bg: string; text: string }> = {
  Critical: { bg: 'rgba(220,67,67,0.15)', text: '#dc4343' },
  High: { bg: 'rgba(234,151,51,0.15)', text: '#ea9733' },
  Medium: { bg: 'rgba(234,193,51,0.15)', text: '#eac133' },
  Low: { bg: 'rgba(129,182,76,0.15)', text: CHESSCOM_GREEN },
};

export function Dashboard() {
  const { username, isPremium } = useUser();
  const { player: chessPlayer } = useChessPlayer(username ?? undefined);
  const { data: multiElo } = useMultiEloProgress(username ?? undefined);
  const { data: summary, isLoading: loadingSummary } = useMyAnalysisSummary();
  const { data: weaknesses } = useMyWeaknesses();
  const { data: coursesData } = useMyCourses();
  const { data: gamesData } = useMyGames(5);
  const { data: allGamesData } = useMyGames();

  if (loadingSummary) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: CHESSCOM_GREEN, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const winRate = summary ? ((summary.winRate || 0) * 100).toFixed(1) : '—';

  const reviewedCount = allGamesData?.games?.filter(g => g.reviewed).length ?? 0;

  return (
    <div className="space-y-4 md:space-y-5">

      <div
        className="relative overflow-hidden p-5 md:p-7 rounded-2xl"
        style={{
          background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}>
        <div className="relative flex items-start gap-4">
          <div className="shrink-0 relative">
            {chessPlayer?.avatar
              ? <img src={chessPlayer.avatar} alt={username ?? ''} className="relative w-20 h-20 md:w-24 md:h-24 rounded-2xl object-cover" style={{ border: `3px solid ${CHESSCOM_GREEN}`, boxShadow: '0 8px 24px -4px rgba(0,0,0,0.6)' }} />
              : <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(129,182,76,0.18)', border: `3px solid ${CHESSCOM_GREEN}`, boxShadow: '0 8px 24px -4px rgba(0,0,0,0.6)' }}>
                  <span className="text-4xl font-black" style={{ color: CHESSCOM_GREEN }}>{username?.[0]?.toUpperCase()}</span>
                </div>
            }
            {chessPlayer?.title && (
              <span className="absolute -bottom-1.5 -right-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-black text-black leading-none shadow-lg" style={{ background: 'linear-gradient(180deg, #f5c460 0%, #e5a631 100%)' }}>
                {chessPlayer.title}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-[0.18em]" style={{ background: 'rgba(129,182,76,0.18)', color: CHESSCOM_GREEN, border: '1px solid rgba(129,182,76,0.3)' }}>
                <Sparkles className="w-2.5 h-2.5" /> Player
              </span>
              {isPremium && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-[0.18em] text-black" style={{ background: 'linear-gradient(135deg, #f5c460, #e5a631)' }}>
                  <Crown className="w-2.5 h-2.5" /> Pro
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-black truncate leading-none" style={{ color: TEXT_LIGHT, letterSpacing: '-0.02em', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>{username}</h1>

            {(multiElo.chesscom?.hasData || multiElo.lichess?.hasData) ? (
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {multiElo.chesscom?.hasData && (
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] leading-none" style={{ color: CHESSCOM_GREEN }}>Chess.com</span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-3xl md:text-4xl font-black leading-none" style={{ color: TEXT_LIGHT, letterSpacing: '-0.03em' }}>{multiElo.chesscom.currentRating}</span>
                      <span className="inline-flex items-center text-xs font-black px-1.5 py-0.5 rounded" style={{ background: multiElo.chesscom.delta > 0 ? 'rgba(129,182,76,0.2)' : multiElo.chesscom.delta < 0 ? 'rgba(220,67,67,0.2)' : 'rgba(158,155,152,0.15)', color: multiElo.chesscom.delta > 0 ? CHESSCOM_GREEN : multiElo.chesscom.delta < 0 ? '#dc4343' : TEXT_MUTED }}>
                        {multiElo.chesscom.delta > 0 ? '▲' : multiElo.chesscom.delta < 0 ? '▼' : '–'} {Math.abs(multiElo.chesscom.delta)}
                      </span>
                    </div>
                  </div>
                )}
                {multiElo.lichess?.hasData && (
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] leading-none" style={{ color: '#b0b0b0' }}>Lichess</span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-3xl md:text-4xl font-black leading-none" style={{ color: TEXT_LIGHT, letterSpacing: '-0.03em' }}>{multiElo.lichess.currentRating}</span>
                      <span className="inline-flex items-center text-xs font-black px-1.5 py-0.5 rounded" style={{ background: multiElo.lichess.delta > 0 ? 'rgba(129,182,76,0.2)' : multiElo.lichess.delta < 0 ? 'rgba(220,67,67,0.2)' : 'rgba(158,155,152,0.15)', color: multiElo.lichess.delta > 0 ? CHESSCOM_GREEN : multiElo.lichess.delta < 0 ? '#dc4343' : TEXT_MUTED }}>
                        {multiElo.lichess.delta > 0 ? '▲' : multiElo.lichess.delta < 0 ? '▼' : '–'} {Math.abs(multiElo.lichess.delta)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : chessPlayer?.rating ? (
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-4xl font-black leading-none" style={{ color: TEXT_LIGHT, letterSpacing: '-0.03em' }}>{chessPlayer.rating}</span>
                <span className="text-xs font-black uppercase tracking-wider" style={{ color: CHESSCOM_GREEN }}>ELO</span>
              </div>
            ) : null}
          </div>
        </div>

        {summary?.totalGames ? (
          <div className="relative mt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: TEXT_MUTED }}>Performance</span>
              <span className="text-[11px] font-bold" style={{ color: TEXT_LIGHT }}>{summary.totalGames.toLocaleString()} games · <span style={{ color: CHESSCOM_GREEN }}>{winRate}%</span> win rate</span>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5" style={{ boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04)' }}>
              <div className="relative" style={{ width: `${(summary.wins / summary.totalGames) * 100}%`, background: `linear-gradient(180deg, #a8d567 0%, ${CHESSCOM_GREEN} 100%)`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)' }} />
              <div style={{ width: `${(summary.draws / summary.totalGames) * 100}%`, background: 'linear-gradient(180deg, #c0bdba 0%, #8a8784 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)' }} />
              <div style={{ width: `${(summary.losses / summary.totalGames) * 100}%`, background: 'linear-gradient(180deg, #ec6b6b 0%, #c93535 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' }} />
            </div>
            <div className="flex gap-4 mt-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-black" style={{ color: CHESSCOM_GREEN }}>
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: CHESSCOM_GREEN, boxShadow: `0 0 8px ${CHESSCOM_GREEN}` }} />{summary.wins.toLocaleString()} W
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: TEXT_MUTED }}>
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: TEXT_MUTED }} />{summary.draws.toLocaleString()} D
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-black" style={{ color: '#dc4343' }}>
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: '#dc4343', boxShadow: '0 0 8px #dc4343' }} />{summary.losses.toLocaleString()} L
              </span>
            </div>
          </div>
        ) : (
          <p className="relative mt-4 text-sm" style={{ color: TEXT_MUTED }}>Import games to start coaching</p>
        )}

        <div className="relative flex gap-2 mt-5">
          <Link href="/import" className="flex-1 px-4 py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)`, boxShadow: `0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)` }}>
            <ImportIcon /> Import Games
          </Link>
          <Link href="/opponents" className="flex-1 px-4 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ background: 'rgba(255,255,255,0.07)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
            <Swords className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} /> Scout
          </Link>
        </div>
      </div>

      <Link href="/scan" className="block px-3 md:px-0">
        <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 transition-all group cursor-pointer flex items-center gap-4 md:gap-5"
          style={{
            background: 'linear-gradient(180deg, #353230 0%, #2b2926 100%)',
            border: `1px solid rgba(129,182,76,0.3)`,
            boxShadow: '0 12px 32px -8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(129,182,76,0.5)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(129,182,76,0.3)')}>
          <div className="relative">
            <BoardThumb size={84} />
            <div className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, #95c45a, ${CHESSCOM_GREEN})`, boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
              <Camera className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0 relative">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-[0.18em] mb-1.5" style={{ background: 'rgba(129,182,76,0.25)', color: CHESSCOM_GREEN, border: '1px solid rgba(129,182,76,0.4)' }}>
              <Zap className="w-2.5 h-2.5" /> AI Coach
            </span>
            <h3 className="font-black text-lg md:text-2xl leading-tight" style={{ color: TEXT_LIGHT, letterSpacing: '-0.02em' }}>
              Stuck in a game?
            </h3>
            <p className="text-sm md:text-base font-bold mt-0.5" style={{ color: CHESSCOM_GREEN }}>
              Scan & get the best move instantly
            </p>
          </div>
          <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all group-hover:translate-x-1" style={{ background: 'rgba(129,182,76,0.2)', border: '1px solid rgba(129,182,76,0.35)' }}>
            <ArrowUpRight className="w-5 h-5" style={{ color: CHESSCOM_GREEN }} />
          </div>
        </div>
      </Link>

      <div className="px-3 md:px-0">
        <div className="relative overflow-hidden rounded-2xl"
          style={{
            background: 'linear-gradient(180deg, #353230 0%, #2b2926 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 8px 24px -10px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}>
          
          <div className="relative grid grid-cols-2 sm:grid-cols-4">
            {[
              { label: 'Total Games', value: summary?.totalGames?.toLocaleString() || '0', icon: <Swords className="w-3.5 h-3.5" /> },
              { label: 'Win Rate', value: `${winRate}%`, icon: <Trophy className="w-3.5 h-3.5" /> },
              { label: 'Avg Rating', value: Math.round(summary?.avgRating || 0) || '—', icon: <Activity className="w-3.5 h-3.5" /> },
              { label: 'Reviewed', value: reviewedCount, icon: <Award className="w-3.5 h-3.5" /> },
            ].map((s, i) => {
              const isLeftColMobile = i % 2 === 0;
              const isTopRowMobile = i < 2;
              return (
                <div key={s.label} className="px-3 py-3 md:px-4 md:py-3.5 flex items-center gap-3"
                  style={{
                    borderRight: isLeftColMobile ? '1px solid rgba(255,255,255,0.05)' : undefined,
                    borderBottom: isTopRowMobile ? '1px solid rgba(255,255,255,0.05)' : undefined,
                  }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(129,182,76,0.15)', border: '1px solid rgba(129,182,76,0.3)', color: CHESSCOM_GREEN }}>
                    {s.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] leading-none mb-1" style={{ color: TEXT_MUTED }}>{s.label}</p>
                    <p className="text-lg md:text-xl font-black leading-none truncate" style={{ color: TEXT_LIGHT, letterSpacing: '-0.02em' }}>{s.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 px-3 md:px-0">
        <div className="lg:col-span-2 space-y-3 md:space-y-4">

          <DashCard title="Key Weaknesses" visual={<PieceTile piece="♚" />} linkHref={isPremium ? "/analysis" : "/subscription"} linkText={isPremium ? "Full Analysis" : "Upgrade"}>
            {!isPremium ? (
              <div className="relative min-h-[180px]">
                <div className="space-y-1.5 pointer-events-none select-none" style={{ filter: 'blur(6px)' }}>
                  {[
                    { sev: 'High', cat: 'Endgame Technique', desc: 'You convert only 38% of winning endgames…' },
                    { sev: 'Medium', cat: 'Opening Repertoire', desc: 'Multiple losses in the same opening line…' },
                    { sev: 'Medium', cat: 'Tactical Awareness', desc: 'Missed forks and pins recur across games…' },
                  ].map((w, i) => {
                    const sev = SEV_COLORS[w.sev as keyof typeof SEV_COLORS] ?? SEV_COLORS.Low;
                    return (
                      <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl">
                        <span className="mt-px px-1.5 py-px rounded text-[10px] font-bold shrink-0" style={{ background: sev.bg, color: sev.text }}>{w.sev}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm" style={{ color: TEXT_LIGHT }}>{w.cat}</p>
                          <p className="text-xs line-clamp-1 mt-0.5" style={{ color: TEXT_MUTED }}>{w.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center px-5 py-5 rounded-2xl max-w-xs"
                    style={{ background: 'rgba(38,36,33,0.94)', border: `1px solid rgba(129,182,76,0.35)`, backdropFilter: 'blur(2px)', boxShadow: '0 8px 24px -8px rgba(0,0,0,0.6)' }}>
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-2.5" style={{ background: 'rgba(129,182,76,0.18)', border: '1px solid rgba(129,182,76,0.35)' }}>
                      <Lock className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
                    </div>
                    <p className="font-black text-sm mb-2.5" style={{ color: TEXT_LIGHT, letterSpacing: '-0.01em' }}>
                      Unlock your full breakdown and personalized training plan
                    </p>
                    <Link href="/subscription">
                      <button className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-xs text-white transition-all hover:scale-[1.02]"
                        style={{ background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)`, boxShadow: '0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)' }}>
                        <Crown className="w-3.5 h-3.5" /> Upgrade to Pro
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            ) : weaknesses?.weaknesses?.length ? (
              <div className="relative">
                <div className="space-y-1.5">
                  {weaknesses.weaknesses.slice(0, 3).map((w) => {
                    const sev = SEV_COLORS[w.severity] ?? SEV_COLORS.Low;
                    return (
                      <Link key={w.id} href={`/analysis/${w.id}`}>
                        <div className="group flex items-start gap-2.5 p-3 rounded-xl transition-colors cursor-pointer" style={{ background: 'transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.background = BG_CARD_HOVER)}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <span className="mt-px px-1.5 py-px rounded text-[10px] font-bold shrink-0" style={{ background: sev.bg, color: sev.text }}>
                            {w.severity}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm" style={{ color: TEXT_LIGHT }}>{w.category}</p>
                            <p className="text-xs line-clamp-1 mt-0.5" style={{ color: TEXT_MUTED }}>{w.description}</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 shrink-0 mt-1 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: TEXT_MUTED }} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyState icon={<Target className="w-7 h-7" />} text="No weaknesses found yet." linkHref="/analysis" linkText="Run AI Analysis →" />
            )}
          </DashCard>

          <DashCard title="Recent Games" visual={<PieceTile piece="♜" />} linkHref="/games" linkText="All Games">
            <div className="space-y-0.5">
              {gamesData?.games?.slice(0, 5).map((game, i) => {
                const res = RESULT_COLORS[game.result] ?? RESULT_COLORS.draw;
                const playedAsWhite = game.whiteUsername?.toLowerCase() === username?.toLowerCase();
                return (
                  <Link key={game.id} href={`/games/${game.id}`} className="block">
                    <div className="group flex items-center gap-3 p-2.5 rounded-xl transition-colors"
                      onMouseEnter={e => (e.currentTarget.style.background = BG_CARD_HOVER)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <BoardThumb size={56} flip={i % 2 === 1} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-px rounded text-[10px] font-black shrink-0" style={{ background: res.bg, color: res.text }}>
                            {game.result === 'win' ? 'WIN' : game.result === 'loss' ? 'LOSS' : 'DRAW'}
                          </span>
                          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>
                            {playedAsWhite ? 'as White' : 'as Black'}
                          </p>
                        </div>
                        <p className="text-sm font-bold truncate mt-0.5" style={{ color: TEXT_LIGHT }}>
                          vs {playedAsWhite ? game.blackUsername : game.whiteUsername}
                        </p>
                        <p className="text-xs truncate" style={{ color: TEXT_MUTED }}>
                          {game.opening || 'Unknown Opening'} · {new Date(game.playedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 opacity-30 group-hover:opacity-90 group-hover:translate-x-0.5 transition-all shrink-0" style={{ color: TEXT_MUTED }} />
                    </div>
                  </Link>
                );
              })}
              {!gamesData?.games?.length && (
                <EmptyState icon={<Swords className="w-7 h-7" />} text="No games imported yet." linkHref="/import" linkText="Import Games →" />
              )}
            </div>
          </DashCard>
        </div>

        <div className="space-y-3 md:space-y-4">
          <Link href="/opponents" className="block">
            <div className="relative overflow-hidden rounded-2xl p-4 md:p-5 transition-colors group cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, #353230 0%, #2b2926 100%)',
                border: `1px solid rgba(129,182,76,0.3)`,
                boxShadow: '0 8px 24px -10px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(129,182,76,0.5)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(129,182,76,0.3)')}>
              
              <div className="relative flex items-center gap-3 mb-2.5">
                <PieceTile piece="♞" size={48} />
                <div className="flex-1 min-w-0">
                  <span className="inline-block text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: CHESSCOM_GREEN }}>#1 Feature</span>
                  <h3 className="font-black text-base leading-tight" style={{ color: TEXT_LIGHT, letterSpacing: '-0.01em' }}>Opponent Scout</h3>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 opacity-40 group-hover:opacity-80 transition-opacity" style={{ color: CHESSCOM_GREEN }} />
              </div>
              <p className="relative text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>
                AI-powered scouting report on any Chess.com player. Find weaknesses, tendencies, and prep lines before your next match.
              </p>
            </div>
          </Link>

          <div className="relative overflow-hidden rounded-2xl p-4 md:p-5 space-y-1"
            style={{
              background: 'linear-gradient(180deg, #353230 0%, #2b2926 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: '0 8px 24px -10px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}>
            
            <div className="relative flex items-center gap-3 mb-3">
              <PieceTile piece="♛" />
              <h2 className="text-base md:text-lg font-black" style={{ color: TEXT_LIGHT, letterSpacing: '-0.01em' }}>Quick Actions</h2>
            </div>
            {[
              { href: '/opponents', label: 'Scout an Opponent', icon: <Swords className="w-4 h-4" /> },
              { href: '/lookup', label: 'Game Lookup', icon: <Search className="w-4 h-4" /> },
              { href: '/play', label: 'Play Local', icon: <Play className="w-4 h-4" /> },
              { href: '/practice', label: 'Practice vs Bots', icon: <Bot className="w-4 h-4" /> },
              { href: '/import', label: 'Import Games', icon: <ImportIcon /> },
              { href: '/analysis', label: 'Run AI Analysis', icon: <Target className="w-4 h-4" /> },
            ].map(action => (
              <Link key={action.href} href={action.href} className="block">
                <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors text-sm font-medium group"
                  style={{ color: TEXT_MUTED }}
                  onMouseEnter={e => { e.currentTarget.style.color = CHESSCOM_GREEN; e.currentTarget.style.background = 'rgba(129,182,76,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = TEXT_MUTED; e.currentTarget.style.background = 'transparent'; }}>
                  <span>{action.icon}</span>
                  {action.label}
                  <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>

          {coursesData?.courses?.length ? (
            <div className="relative overflow-hidden rounded-2xl p-4 md:p-5"
              style={{
                background: 'linear-gradient(180deg, #353230 0%, #2b2926 100%)',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 8px 24px -10px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}>
              
              <div className="relative flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <PieceTile piece="♝" />
                  <h2 className="text-base md:text-lg font-black flex items-center gap-2" style={{ color: TEXT_LIGHT, letterSpacing: '-0.01em' }}>
                    Courses
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-[0.18em]" style={{ background: 'rgba(129,182,76,0.18)', color: CHESSCOM_GREEN, border: '1px solid rgba(129,182,76,0.3)' }}>Beta</span>
                  </h2>
                </div>
                <Link href="/courses" className="text-[11px] font-black uppercase tracking-wider flex items-center gap-0.5 hover:underline" style={{ color: CHESSCOM_GREEN }}>
                  All <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="relative space-y-1">
                {coursesData.courses.slice(0, 3).map(course => {
                  const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;
                  return (
                    <Link key={course.id} href={`/courses/${course.id}`} className="block">
                      <div className="group flex items-center gap-2.5 p-2.5 rounded-xl transition-colors"
                        onMouseEnter={e => (e.currentTarget.style.background = BG_CARD_HOVER)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm line-clamp-1" style={{ color: TEXT_LIGHT }}>{course.title}</p>
                          <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: CHESSCOM_GREEN }} />
                          </div>
                        </div>
                        <span className="text-xs font-black shrink-0" style={{ color: CHESSCOM_GREEN }}>{progress}%</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DashCard({ title, visual, linkHref, linkText, children }: {
  title: string; visual?: React.ReactNode; linkHref: string; linkText: string; children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-4 md:p-5"
      style={{
        background: 'linear-gradient(180deg, #353230 0%, #2b2926 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 8px 24px -10px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {visual}
          <h2 className="text-base md:text-lg font-black" style={{ color: TEXT_LIGHT, letterSpacing: '-0.01em' }}>{title}</h2>
        </div>
        <Link href={linkHref} className="text-[11px] font-black uppercase tracking-wider flex items-center gap-0.5 hover:underline" style={{ color: CHESSCOM_GREEN }}>
          {linkText} <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

function EmptyState({ icon, text, linkHref, linkText }: { icon: React.ReactNode; text: string; linkHref: string; linkText: string }) {
  return (
    <div className="text-center py-8 rounded-xl" style={{ border: `1px dashed rgba(255,255,255,0.1)` }}>
      <div className="mx-auto mb-2 opacity-25" style={{ color: TEXT_MUTED }}>{icon}</div>
      <p className="text-sm" style={{ color: TEXT_MUTED }}>{text}</p>
      <Link href={linkHref} className="mt-2 inline-block text-sm font-semibold hover:underline" style={{ color: CHESSCOM_GREEN }}>{linkText}</Link>
    </div>
  );
}

const ImportIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>;

// Chess-piece illustration tile used at the head of each dashboard section.
// Chunky green-gradient square with a bold white chess piece silhouette — like a chess.com puzzle/lesson card.
function PieceTile({ piece, size = 44 }: { piece: '♚' | '♛' | '♜' | '♝' | '♞' | '♟'; size?: number }) {
  return (
    <div className="relative shrink-0 rounded-xl flex items-center justify-center overflow-hidden"
      style={{
        width: size, height: size,
        background: 'linear-gradient(160deg, #8fc556 0%, #6a9c3c 55%, #4f7a2a 100%)',
        boxShadow: '0 4px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -2px 0 rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.4)',
      }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18), transparent 55%)' }} />
      <span style={{
        fontSize: Math.round(size * 0.72),
        lineHeight: 1,
        color: '#ffffff',
        textShadow: '0 2px 3px rgba(0,0,0,0.45), 0 0 1px rgba(0,0,0,0.6)',
        fontFamily: '"Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", "Arial Unicode MS", sans-serif',
        marginTop: -2,
      }}>{piece}</span>
    </div>
  );
}

// Lightweight chess-board thumbnail (starting position) — purely decorative.
// Mirrors chess.com's home-feed thumbnails: little green-and-cream board with pieces.
function BoardThumb({ size = 56, flip = false }: { size?: number; flip?: boolean }) {
  const ROWS_W = ['♖','♘','♗','♕','♔','♗','♘','♖'];
  const PAWNS_W = Array(8).fill('♙');
  const ROWS_B = ['♜','♞','♝','♛','♚','♝','♞','♜'];
  const PAWNS_B = Array(8).fill('♟');
  const ranks = flip
    ? [ROWS_W, PAWNS_W, [], [], [], [], PAWNS_B, ROWS_B]
    : [ROWS_B, PAWNS_B, [], [], [], [], PAWNS_W, ROWS_W];
  const sq = size / 8;
  const fontSize = Math.round(sq * 0.92);
  return (
    <div
      className="relative shrink-0 rounded-md overflow-hidden"
      style={{
        width: size,
        height: size,
        boxShadow: '0 4px 14px -2px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.5)',
      }}
    >
      <div className="grid h-full w-full" style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)' }}>
        {Array.from({ length: 64 }).map((_, i) => {
          const r = Math.floor(i / 8);
          const c = i % 8;
          const isLight = (r + c) % 2 === 0;
          const piece = ranks[r]?.[c];
          const isWhite = piece && '♔♕♖♗♘♙'.includes(piece);
          return (
            <div
              key={i}
              className="flex items-center justify-center"
              style={{ background: isLight ? '#eeeed2' : '#769656' }}
            >
              {piece && (
                <span style={{
                  fontSize,
                  lineHeight: 1,
                  color: isWhite ? '#fff' : '#1a1a1a',
                  textShadow: isWhite
                    ? '0 1px 1px rgba(0,0,0,0.65), 0 0 1px rgba(0,0,0,0.85)'
                    : '0 1px 1px rgba(255,255,255,0.18)',
                }}>{piece}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
