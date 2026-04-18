import React from 'react';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useMyCourses } from '@/hooks/use-courses';
import { useMyGames } from '@/hooks/use-games';
import { Link } from 'wouter';
import { Swords, Trophy, Target, AlertTriangle, BookOpen, Clock, GraduationCap, TrendingUp, ChevronRight, Search, Play, Bot, Camera, Lock, Crown } from 'lucide-react';
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

  return (
    <div className="space-y-4 md:space-y-5">

      <div style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}
        className="p-4 md:p-5 rounded-md">
        <div className="flex items-center gap-3">
          <div className="shrink-0 relative">
            {chessPlayer?.avatar
              ? <img src={chessPlayer.avatar} alt={username ?? ''} className="w-14 h-14 rounded-md object-cover" style={{ border: `2px solid ${CHESSCOM_GREEN}` }} />
              : <div className="w-14 h-14 rounded-md flex items-center justify-center" style={{ background: 'rgba(129,182,76,0.15)', border: `2px solid rgba(129,182,76,0.3)` }}>
                  <span className="text-xl font-black" style={{ color: CHESSCOM_GREEN }}>{username?.[0]?.toUpperCase()}</span>
                </div>
            }
            {chessPlayer?.title && (
              <span className="absolute -bottom-1 -right-1 px-1 py-px rounded text-[9px] font-black text-black leading-none" style={{ background: '#e5a631' }}>
                {chessPlayer.title}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black truncate" style={{ color: TEXT_LIGHT }}>{username}</h1>
            {(multiElo.chesscom?.hasData || multiElo.lichess?.hasData) ? (
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {multiElo.chesscom?.hasData && (
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-bold" style={{ color: CHESSCOM_GREEN }}>CC</span>
                    <span className="text-lg font-black leading-none" style={{ color: CHESSCOM_GREEN }}>{multiElo.chesscom.currentRating}</span>
                    <span className="text-[10px] font-bold" style={{ color: multiElo.chesscom.delta > 0 ? CHESSCOM_GREEN : multiElo.chesscom.delta < 0 ? '#dc4343' : TEXT_MUTED }}>
                      {multiElo.chesscom.delta > 0 ? '+' : ''}{multiElo.chesscom.delta}
                    </span>
                  </div>
                )}
                {multiElo.lichess?.hasData && (
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-bold" style={{ color: '#b0b0b0' }}>LC</span>
                    <span className="text-lg font-black leading-none" style={{ color: '#b0b0b0' }}>{multiElo.lichess.currentRating}</span>
                    <span className="text-[10px] font-bold" style={{ color: multiElo.lichess.delta > 0 ? CHESSCOM_GREEN : multiElo.lichess.delta < 0 ? '#dc4343' : TEXT_MUTED }}>
                      {multiElo.lichess.delta > 0 ? '+' : ''}{multiElo.lichess.delta}
                    </span>
                  </div>
                )}
              </div>
            ) : chessPlayer?.rating ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xl font-black leading-none" style={{ color: CHESSCOM_GREEN }}>{chessPlayer.rating}</span>
                <span className="text-[11px] font-semibold mt-0.5" style={{ color: TEXT_MUTED }}>ELO</span>
              </div>
            ) : null}
            {summary?.totalGames ? (
              <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{summary.totalGames} games · {winRate}% win rate</p>
            ) : (
              <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>Import games to start coaching</p>
            )}
          </div>

          <div className="hidden sm:flex flex-col gap-1.5 shrink-0">
            <Link href="/import" className="px-3 py-2 rounded-md font-bold text-xs text-white flex items-center gap-1.5 transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/30" style={{ background: CHESSCOM_GREEN }}>
              <ImportIcon /> Import
            </Link>
            <Link href="/opponents" className="px-3 py-2 rounded-md font-bold text-xs flex items-center gap-1.5 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/30" style={{ background: 'rgba(255,255,255,0.06)', color: TEXT_LIGHT }}>
              <Swords className="w-3.5 h-3.5" style={{ color: CHESSCOM_GREEN }} /> Scout
            </Link>
          </div>
        </div>
        <div className="flex sm:hidden gap-2 mt-3">
          <Link href="/import" className="flex-1 px-3 py-2 rounded-md font-bold text-xs text-white flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90" style={{ background: CHESSCOM_GREEN }}>
            <ImportIcon /> Import Games
          </Link>
          <Link href="/opponents" className="flex-1 px-3 py-2 rounded-md font-bold text-xs flex items-center justify-center gap-1.5 transition-colors hover:bg-white/10" style={{ background: 'rgba(255,255,255,0.06)', color: TEXT_LIGHT }}>
            <Swords className="w-3.5 h-3.5" style={{ color: CHESSCOM_GREEN }} /> Scout
          </Link>
        </div>

        {summary?.totalGames ? (
          <div className="mt-3">
            <div className="flex h-1 rounded-full overflow-hidden gap-px">
              <div style={{ width: `${(summary.wins / summary.totalGames) * 100}%`, background: CHESSCOM_GREEN }} />
              <div style={{ width: `${(summary.draws / summary.totalGames) * 100}%`, background: TEXT_MUTED }} />
              <div style={{ width: `${(summary.losses / summary.totalGames) * 100}%`, background: '#dc4343' }} />
            </div>
            <div className="flex gap-3 mt-1.5">
              <span className="text-[11px] font-bold" style={{ color: CHESSCOM_GREEN }}>{summary.wins}W</span>
              <span className="text-[11px]" style={{ color: TEXT_MUTED }}>{summary.draws}D</span>
              <span className="text-[11px] font-bold" style={{ color: '#dc4343' }}>{summary.losses}L</span>
            </div>
          </div>
        ) : null}
      </div>

      <Link href="/scan" className="block px-3 md:px-0">
        <div className="rounded-md p-4 md:p-5 transition-all group cursor-pointer flex items-center gap-4"
          style={{
            background: 'linear-gradient(135deg, rgba(129,182,76,0.18) 0%, rgba(129,182,76,0.04) 100%)',
            border: `1px solid rgba(129,182,76,0.3)`,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(129,182,76,0.55)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(129,182,76,0.3)')}>
          <div className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-md flex items-center justify-center"
            style={{ background: 'rgba(129,182,76,0.18)' }}>
            <Camera className="w-6 h-6 md:w-7 md:h-7" style={{ color: CHESSCOM_GREEN }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-base md:text-lg" style={{ color: TEXT_LIGHT }}>
              Stuck in a game? Scan a position
            </h3>
            <p className="text-xs md:text-sm mt-0.5" style={{ color: TEXT_MUTED }}>
              Upload a screenshot and get the best move instantly.
            </p>
          </div>
          <ChevronRight className="shrink-0 w-5 h-5 opacity-50 group-hover:opacity-90 group-hover:translate-x-1 transition-all" style={{ color: CHESSCOM_GREEN }} />
        </div>
      </Link>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 px-3 md:px-0">
        {[
          { label: 'Total Games', value: summary?.totalGames || 0, icon: <Swords className="w-4 h-4" /> },
          { label: 'Win Rate', value: `${winRate}%`, icon: <Trophy className="w-4 h-4" /> },
          { label: 'Avg Rating', value: Math.round(summary?.avgRating || 0) || '—', icon: <TrendingUp className="w-4 h-4" /> },
          { label: 'Games Reviewed', value: allGamesData?.games?.filter(g => g.reviewed).length ?? 0, icon: <Target className="w-4 h-4" /> },
        ].map((s) => (
          <div key={s.label} className="rounded-md p-3.5" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>{s.label}</p>
              <span style={{ color: CHESSCOM_GREEN }}>{s.icon}</span>
            </div>
            <div className="text-2xl font-black" style={{ color: TEXT_LIGHT }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 px-3 md:px-0">
        <div className="lg:col-span-2 space-y-3 md:space-y-4">

          <DashCard title="Key Weaknesses" icon={<AlertTriangle className="w-4 h-4" style={{ color: '#ea9733' }} />} linkHref={isPremium ? "/analysis" : "/subscription"} linkText={isPremium ? "Full Analysis" : "Upgrade"}>
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
                      <div key={i} className="flex items-start gap-2.5 p-3 rounded-md">
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
                  <div className="text-center px-4 py-5 rounded-md max-w-xs"
                    style={{ background: 'rgba(38,36,33,0.92)', border: `1px solid rgba(234,166,49,0.35)`, backdropFilter: 'blur(2px)' }}>
                    <div className="inline-flex items-center justify-center w-9 h-9 rounded-md mb-2" style={{ background: 'rgba(234,166,49,0.18)' }}>
                      <Lock className="w-4 h-4" style={{ color: '#eaa631' }} />
                    </div>
                    <p className="font-bold text-sm mb-1" style={{ color: TEXT_LIGHT }}>
                      Unlock your full breakdown and personalized training plan
                    </p>
                    <Link href="/subscription">
                      <button className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-md font-bold text-xs transition-all"
                        style={{ background: '#eaa631', color: '#1a1816' }}>
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
                        <div className="group flex items-start gap-2.5 p-3 rounded-md transition-colors cursor-pointer" style={{ background: 'transparent' }}
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

          <DashCard title="Recent Games" icon={<Clock className="w-4 h-4" style={{ color: '#6da5d8' }} />} linkHref="/games" linkText="All Games">
            <div className="space-y-0.5">
              {gamesData?.games?.slice(0, 5).map(game => {
                const res = RESULT_COLORS[game.result] ?? RESULT_COLORS.draw;
                return (
                  <Link key={game.id} href={`/games/${game.id}`} className="block">
                    <div className="group flex items-center gap-2.5 p-2.5 rounded-md transition-colors"
                      onMouseEnter={e => (e.currentTarget.style.background = BG_CARD_HOVER)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <span className="w-6 text-center py-0.5 rounded text-[10px] font-black shrink-0" style={{ background: res.bg, color: res.text }}>
                        {game.result === 'win' ? 'W' : game.result === 'loss' ? 'L' : 'D'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: TEXT_LIGHT }}>
                          {game.whiteUsername} vs {game.blackUsername}
                        </p>
                        <p className="text-xs truncate" style={{ color: TEXT_MUTED }}>
                          {game.opening || 'Unknown Opening'} · {new Date(game.playedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" style={{ color: TEXT_MUTED }} />
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
            <div className="rounded-md p-4 md:p-5 transition-colors group cursor-pointer"
              style={{ background: 'linear-gradient(135deg, rgba(129,182,76,0.12) 0%, rgba(129,182,76,0.04) 100%)', border: `1px solid rgba(129,182,76,0.2)` }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(129,182,76,0.4)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(129,182,76,0.2)')}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: 'rgba(129,182,76,0.15)' }}>
                  <Swords className="w-5 h-5" style={{ color: CHESSCOM_GREEN }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-sm" style={{ color: TEXT_LIGHT }}>Opponent Scout</h3>
                  <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Our #1 feature</p>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 opacity-40 group-hover:opacity-80 transition-opacity" style={{ color: CHESSCOM_GREEN }} />
              </div>
              <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>
                AI-powered scouting report on any Chess.com player. Find weaknesses, tendencies, and prep lines before your next match.
              </p>
            </div>
          </Link>

          <div className="rounded-md p-4 space-y-1" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: TEXT_MUTED }}>Quick Actions</p>
            {[
              { href: '/opponents', label: 'Scout an Opponent', icon: <Swords className="w-4 h-4" /> },
              { href: '/lookup', label: 'Game Lookup', icon: <Search className="w-4 h-4" /> },
              { href: '/play', label: 'Play Local', icon: <Play className="w-4 h-4" /> },
              { href: '/practice', label: 'Practice vs Bots', icon: <Bot className="w-4 h-4" /> },
              { href: '/import', label: 'Import Games', icon: <ImportIcon /> },
              { href: '/analysis', label: 'Run AI Analysis', icon: <Target className="w-4 h-4" /> },
            ].map(action => (
              <Link key={action.href} href={action.href} className="block">
                <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-sm font-medium group"
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
            <div className="rounded-md p-4" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
                  <GraduationCap className="w-4 h-4" style={{ color: '#b583e0' }} /> Courses
                  <span className="px-1.5 py-px rounded text-[8px] font-black tracking-wider" style={{ background: 'rgba(234,166,49,0.15)', color: '#eaa631' }}>BETA</span>
                </h2>
                <Link href="/courses" className="text-[11px] font-semibold flex items-center gap-0.5 hover:underline" style={{ color: CHESSCOM_GREEN }}>
                  All <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-2">
                {coursesData.courses.slice(0, 3).map(course => {
                  const progress = Math.round((course.completedLessons / course.totalLessons) * 100) || 0;
                  return (
                    <Link key={course.id} href={`/courses/${course.id}`} className="block">
                      <div className="group flex items-center gap-2.5 p-2 rounded-md transition-colors"
                        onMouseEnter={e => (e.currentTarget.style.background = BG_CARD_HOVER)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-xs line-clamp-1" style={{ color: TEXT_LIGHT }}>{course.title}</p>
                        </div>
                        <span className="text-[10px] shrink-0" style={{ color: TEXT_MUTED }}>{progress}%</span>
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

function DashCard({ title, icon, linkHref, linkText, children }: {
  title: string; icon: React.ReactNode; linkHref: string; linkText: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-md p-4 md:p-5" style={{ background: BG_CARD, border: CARD_BORDER, boxShadow: CARD_SHADOW }}>
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: TEXT_LIGHT }}>
          {icon} {title}
        </h2>
        <Link href={linkHref} className="text-[11px] font-semibold flex items-center gap-0.5 hover:underline" style={{ color: CHESSCOM_GREEN }}>
          {linkText} <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, text, linkHref, linkText }: { icon: React.ReactNode; text: string; linkHref: string; linkText: string }) {
  return (
    <div className="text-center py-8 rounded-md" style={{ border: `1px dashed rgba(255,255,255,0.1)` }}>
      <div className="mx-auto mb-2 opacity-25" style={{ color: TEXT_MUTED }}>{icon}</div>
      <p className="text-sm" style={{ color: TEXT_MUTED }}>{text}</p>
      <Link href={linkHref} className="mt-2 inline-block text-sm font-semibold hover:underline" style={{ color: CHESSCOM_GREEN }}>{linkText}</Link>
    </div>
  );
}

const ImportIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>;
