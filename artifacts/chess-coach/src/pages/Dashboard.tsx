import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useMyCourses } from '@/hooks/use-courses';
import { useMyGames } from '@/hooks/use-games';
import { GameThumb } from '@/components/GameThumb';
import { Link } from 'wouter';
import { Swords, Trophy, Target, AlertTriangle, BookOpen, Clock, GraduationCap, TrendingUp, ChevronRight, Search, Play, Bot, Camera, Lock, Crown, Flame, Zap, Award, Activity, Sparkles, ArrowUpRight, Share2 } from 'lucide-react';
import { encodeCard } from '@/pages/ShareCard';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMultiEloProgress } from '@/hooks/use-elo-progress';
import { useLiveRatings, bestLiveRating } from '@/hooks/use-live-ratings';
import { EmailVerifyBanner } from '@/components/EmailVerifyBanner';
import { CHESSCOM_GREEN, BRASS, TEXT_LIGHT, TEXT_MUTED, t, PieceTile } from '@/components/DesignSystem';
import { ReferralCard } from '@/pages/Profile';

const BG_DARK = '#262421';
const BG_CARD = 'linear-gradient(180deg, #383532 0%, #2a2825 100%)';
const BG_CARD_FLAT = '#302e2b';
const BG_CARD_HOVER = '#3a3733';
const CARD_SHADOW = '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)';
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
  const { username, isPremium, authUser } = useUser();
  const ratingHandle = username ?? authUser?.chesscomUsername ?? authUser?.lichessUsername ?? undefined;
  const { player: chessPlayer } = useChessPlayer(ratingHandle);
  const { data: multiElo } = useMultiEloProgress(ratingHandle);
  const { data: liveRatingsData } = useLiveRatings();
  const liveBest = bestLiveRating(liveRatingsData?.ratings);
  const { data: summary, isLoading: loadingSummary } = useMyAnalysisSummary();
  const { data: weaknesses } = useMyWeaknesses();
  const { data: coursesData } = useMyCourses();
  const { data: gamesData } = useMyGames(5);

  if (loadingSummary) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: CHESSCOM_GREEN, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const winRate = summary ? ((summary.winRate || 0) * 100).toFixed(1) : '—';

  const reviewedCount = summary?.reviewedCount ?? 0;

  return (
    <div className="space-y-4 md:space-y-5">
      <EmailVerifyBanner />

      <div
        className="relative overflow-hidden p-4 md:p-5 rounded-2xl"
        style={{
          background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}>
        <div className="relative flex items-center gap-3">
          <div className="shrink-0 relative">
            {chessPlayer?.avatar
              ? <img src={chessPlayer.avatar} alt={username ?? ''} className="relative w-12 h-12 md:w-14 md:h-14 rounded-xl object-cover" style={{ border: `2px solid ${CHESSCOM_GREEN}`, boxShadow: '0 6px 18px -4px rgba(0,0,0,0.6)' }} />
              : <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center" style={{ background: 'rgba(129,182,76,0.18)', border: `2px solid ${CHESSCOM_GREEN}`, boxShadow: '0 6px 18px -4px rgba(0,0,0,0.6)' }}>
                  <span className="text-xl font-semibold" style={{ color: CHESSCOM_GREEN }}>{username?.[0]?.toUpperCase()}</span>
                </div>
            }
            {chessPlayer?.title && (
              <span className="absolute -bottom-1.5 -right-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-black leading-none shadow-lg" style={{ background: `linear-gradient(180deg, #dbb877 0%, ${BRASS} 100%)` }}>
                {chessPlayer.title}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 min-w-0">
                <h1 className="font-display text-lg font-semibold truncate leading-none" style={{ color: TEXT_LIGHT, letterSpacing: '-0.015em' }}>{username}</h1>
                {isPremium && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-[0.14em] text-black shrink-0" style={{ background: `linear-gradient(135deg, ${BRASS}, #b3854a)` }}>
                    <Crown className="w-2.5 h-2.5" /> Pro
                  </span>
                )}
              </div>

              {(multiElo.chesscom?.hasData || multiElo.lichess?.hasData) ? (
                (() => {
                  const ratings: number[] = [];
                  if (multiElo.chesscom?.hasData) ratings.push(multiElo.chesscom.currentRating);
                  if (multiElo.lichess?.hasData) ratings.push(multiElo.lichess.currentRating);
                  if (ratings.length === 0 && !liveBest) return null;
                  const scoutElo = liveBest
                    ? liveBest.rating
                    : Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
                  return (
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        const url = `${window.location.origin}/share/${encodeCard({
                          type: 'milestone',
                          username: username ?? 'A ChessScout.net user',
                          newRating: scoutElo,
                        })}`;
                        const shareData = { title: `My Scout ELO is ${scoutElo}`, url };
                        if (navigator.share) {
                          try { await navigator.share(shareData); return; } catch { /* fall through to clipboard */ }
                        }
                        try { await navigator.clipboard.writeText(url); } catch { /* nothing more we can do */ }
                      }}
                      className="shrink-0 flex items-baseline gap-1"
                    >
                      <span className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: CHESSCOM_GREEN }}>Scout</span>
                      <span className="text-lg font-black leading-none" style={{ color: TEXT_LIGHT }}>{scoutElo}</span>
                    </button>
                  );
                })()
              ) : chessPlayer?.rating ? (
                <span className="shrink-0 text-base font-semibold" style={{ color: TEXT_LIGHT }}>{chessPlayer.rating} <span className="text-[10px] font-semibold uppercase" style={{ color: CHESSCOM_GREEN }}>ELO</span></span>
              ) : null}
            </div>

            {(multiElo.chesscom?.hasData || multiElo.lichess?.hasData) && (
              <div className="flex items-center gap-2 mt-0.5">
                {multiElo.chesscom?.hasData && (
                  <span className="text-[10px]" style={{ color: TEXT_MUTED }}>Chess.com {multiElo.chesscom.currentRating}</span>
                )}
                {multiElo.lichess?.hasData && (
                  <span className="text-[10px]" style={{ color: TEXT_MUTED }}>Lichess {multiElo.lichess.currentRating}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {summary?.totalGames ? (
          <div className="relative mt-3.5">
            <p className="text-[11px] font-bold mb-1.5" style={{ color: TEXT_MUTED }}>
              <span style={{ color: TEXT_LIGHT }}>{summary.totalGames.toLocaleString()}</span> games ·{' '}
              <span style={{ color: CHESSCOM_GREEN }}>{summary.wins.toLocaleString()}W</span>
              {' · '}
              <span style={{ color: TEXT_LIGHT }}>{summary.draws.toLocaleString()}D</span>
              {' · '}
              <span style={{ color: '#dc4343' }}>{summary.losses.toLocaleString()}L</span>
            </p>
            <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5" style={{ boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04)' }}>
              <div className="relative" style={{ width: `${(summary.wins / summary.totalGames) * 100}%`, background: `linear-gradient(180deg, #a8d567 0%, ${CHESSCOM_GREEN} 100%)`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)' }} />
              <div style={{ width: `${(summary.draws / summary.totalGames) * 100}%`, background: 'linear-gradient(180deg, #c0bdba 0%, #8a8784 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)' }} />
              <div style={{ width: `${(summary.losses / summary.totalGames) * 100}%`, background: 'linear-gradient(180deg, #ec6b6b 0%, #c93535 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' }} />
            </div>
          </div>
        ) : (
          <p className="relative mt-3 text-sm" style={{ color: TEXT_MUTED }}>Import games to start coaching</p>
        )}

        <div className="relative flex gap-2 mt-3.5">
          <Link href="/import" className="flex-1 px-3 py-2 rounded-lg font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)`, boxShadow: `0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)` }}>
            <ImportIcon /> Import
          </Link>
          <Link href="/opponents" className="flex-1 px-3 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ background: 'rgba(255,255,255,0.07)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
            <Swords className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} /> Scout
          </Link>
        </div>
      </div>

      <Link href="/scan" className="block px-3 md:px-0">
        <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 transition-all group cursor-pointer flex items-center gap-4 md:gap-5"
          style={{
            background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
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
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-[0.18em] mb-1.5" style={{ background: 'rgba(129,182,76,0.25)', color: CHESSCOM_GREEN, border: '1px solid rgba(129,182,76,0.4)' }}>
              <Zap className="w-2.5 h-2.5" /> Coach
            </span>
            <h3 className="font-semibold text-lg md:text-2xl leading-tight" style={{ color: TEXT_LIGHT, letterSpacing: '-0.02em' }}>
              Seen a position worth studying?
            </h3>
            <p className="text-sm md:text-base font-bold mt-0.5" style={{ color: CHESSCOM_GREEN }}>
              Snap a photo and explore it on the board
            </p>
          </div>
          <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all group-hover:translate-x-1"
            style={{ background: '#211f1c', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05), inset 0 2px 4px rgba(0,0,0,0.4)' }}>
            <ArrowUpRight className="w-5 h-5" style={{ color: CHESSCOM_GREEN }} />
          </div>
        </div>
      </Link>

      <Link href="/opponents" className="block px-3 md:px-0">
        <div className="relative overflow-hidden rounded-2xl p-4 md:p-5 transition-colors group cursor-pointer"
          style={{
            background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
            border: `1px solid rgba(129,182,76,0.3)`,
            boxShadow: '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(129,182,76,0.5)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(129,182,76,0.3)')}>

          <div className="relative flex items-center gap-3 mb-2.5">
            <PieceTile piece="♞" size={48} />
            <div className="flex-1 min-w-0">
              <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: CHESSCOM_GREEN }}>#1 Feature</span>
              <h3 className="font-semibold text-base leading-tight" style={{ color: TEXT_LIGHT, letterSpacing: '-0.01em' }}>Opponent Scout</h3>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0 opacity-40 group-hover:opacity-80 transition-opacity" style={{ color: CHESSCOM_GREEN }} />
          </div>
          <p className="relative text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>
            Smart scouting report on any Chess.com player. Find weaknesses, tendencies, and prep lines before your next match.
          </p>
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-3 px-3 md:px-0">
        <Link href="/practice" className="block">
          <div className="relative overflow-hidden rounded-2xl p-4 flex flex-col items-start gap-2 transition-colors group cursor-pointer h-full"
            style={{
              background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(129,182,76,0.15)' }}>
              <Bot className="w-4.5 h-4.5" style={{ color: CHESSCOM_GREEN }} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm" style={{ color: TEXT_LIGHT }}>Practice Bots</h3>
              <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>8 opponents, 400–2000 ELO</p>
            </div>
          </div>
        </Link>
        <Link href="/practice?tab=openings" className="block">
          <div className="relative overflow-hidden rounded-2xl p-4 flex flex-col items-start gap-2 transition-colors group cursor-pointer h-full"
            style={{
              background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(129,182,76,0.15)' }}>
              <BookOpen className="w-4.5 h-4.5" style={{ color: CHESSCOM_GREEN }} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm" style={{ color: TEXT_LIGHT }}>Opening Trainer</h3>
              <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>Drill lines move-by-move</p>
            </div>
          </div>
        </Link>
      </div>

      <Link href="/analysis" className="block px-3 md:px-0">
        <div className="relative overflow-hidden rounded-2xl transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}>

          <div className="relative grid grid-cols-2 sm:grid-cols-4">
            {[
              { label: 'Total Games', value: summary?.totalGames?.toLocaleString() || '0', icon: Trophy },
              { label: 'Win Rate', value: `${winRate}%`, icon: Target },
              { label: 'Avg Rating', value: Math.round(summary?.avgRating || 0) || '—', icon: TrendingUp },
              { label: 'Reviewed', value: reviewedCount, icon: Activity },
            ].map((s, i) => {
              const isLeftColMobile = i % 2 === 0;
              const isTopRowMobile = i < 2;
              return (
                <div key={s.label} className="px-3 py-2.5"
                  style={{
                    borderRight: isLeftColMobile ? '1px solid rgba(255,255,255,0.05)' : undefined,
                    borderBottom: isTopRowMobile ? '1px solid rgba(255,255,255,0.05)' : undefined,
                  }}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <s.icon className="w-3 h-3" style={{ color: TEXT_MUTED }} />
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] leading-none" style={{ color: TEXT_MUTED }}>{s.label}</p>
                  </div>
                  <p className={t.numeric} style={{ fontSize: '1.05rem', lineHeight: 1.3, color: TEXT_LIGHT }}>{s.value}</p>
                </div>
              );
            })}
          </div>
          <div className="relative flex items-center justify-center gap-1 py-2 text-[11px] font-bold" style={{ color: CHESSCOM_GREEN, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            See Full Analysis <ChevronRight className="w-3 h-3" />
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 px-3 md:px-0">
        <div className="lg:col-span-2 space-y-3 md:space-y-4">

          <DashCard title="Key Weaknesses" visual={<PieceTile piece="♚" />} linkHref="/analysis" linkText="Full Analysis">
            {weaknesses?.weaknesses?.length ? (
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
                            <p className="font-bold text-sm" style={{ color: TEXT_LIGHT }}>{w.category}</p>
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
              <EmptyState icon={<Target className="w-7 h-7" />} text="No weaknesses found yet." linkHref="/analysis" linkText="Run Deep Analysis →" />
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
                      <GameThumb pgn={game.pgn} userColor={playedAsWhite ? 'white' : 'black'} size={56} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-px rounded text-[10px] font-semibold shrink-0" style={{ background: res.bg, color: res.text }}>
                            {game.result === 'win' ? 'WIN' : game.result === 'loss' ? 'LOSS' : 'DRAW'}
                          </span>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: TEXT_MUTED }}>
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
          <Link href="/play" className="block">
            <div className="relative overflow-hidden rounded-2xl p-4 md:p-5 flex items-center gap-3 transition-colors group cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}>
              <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(129,182,76,0.15)' }}>
                <Play className="w-5 h-5" style={{ color: CHESSCOM_GREEN }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm" style={{ color: TEXT_LIGHT }}>Play Local</h3>
                <p className="text-xs" style={{ color: TEXT_MUTED }}>Pass-and-play on this device with a friend</p>
              </div>
              <ChevronRight className="w-4 h-4 shrink-0 opacity-40 group-hover:opacity-80 transition-opacity" style={{ color: CHESSCOM_GREEN }} />
            </div>
          </Link>

          {coursesData?.courses?.length ? (
            <div className="relative overflow-hidden rounded-2xl p-4 md:p-5"
              style={{
                background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}>
              
              <div className="relative flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <PieceTile piece="♝" />
                  <h2 className="text-base md:text-lg font-semibold flex items-center gap-2" style={{ color: TEXT_LIGHT, letterSpacing: '-0.01em' }}>
                    Courses
                  </h2>
                </div>
                <Link href="/courses" className="text-[10px] font-semibold uppercase tracking-[0.18em] flex items-center gap-0.5 hover:underline" style={{ color: CHESSCOM_GREEN }}>
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
                        <span className="text-xs font-semibold shrink-0" style={{ color: CHESSCOM_GREEN }}>{progress}%</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {authUser && <ReferralCard isPremium={isPremium} compact />}
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
        background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {visual}
          <h2 className="text-base md:text-lg font-semibold" style={{ color: TEXT_LIGHT, letterSpacing: '-0.01em' }}>{title}</h2>
        </div>
        <Link href={linkHref} className="text-[10px] font-semibold uppercase tracking-[0.18em] flex items-center gap-0.5 hover:underline" style={{ color: CHESSCOM_GREEN }}>
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
      <Link href={linkHref} className="mt-2 inline-block text-sm font-bold hover:underline" style={{ color: CHESSCOM_GREEN }}>{linkText}</Link>
    </div>
  );
}

const ImportIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>;

// Chess-piece illustration tile used at the head of each dashboard section.
// Chunky green-gradient square with a bold white chess piece silhouette — like a chess.com puzzle/lesson card.
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
