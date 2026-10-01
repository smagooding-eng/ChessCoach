import React, { useState } from 'react';
import { Link } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { useMyAnalysisSummary, useMyWeaknesses } from '@/hooks/use-analysis';
import { useMyGames } from '@/hooks/use-games';
import { GameThumb } from '@/components/GameThumb';
import {
  Target, Puzzle, Bot, BookOpen, Camera, Crosshair, ShoppingBag,
  ChevronRight, Swords, Sparkles,
} from 'lucide-react';

// This is a real, separate visual system for this one page -- not a
// reskin of the app's global CSS variables, so it can't leak into any
// other page. Colors match the design concept at
// github.com/andreanarr421-afk/chessscout-redesign as closely as a
// React/Tailwind rebuild reasonably allows; this isn't a pixel-for-pixel
// port of the original vanilla-JS prototype, which used plain DOM
// string templates rather than this app's component architecture.
const RG_BG = '#070906';
const RG_CARD = 'linear-gradient(180deg,#1b2215,#141a10)';
const RG_LINE = 'rgba(255,255,255,.12)';
const RG_TEXT = '#f2f6eb';
const RG_MUTED = '#a3ad98';
const RG_GREEN = '#7fd14f';
const RG_ORANGE = '#ff8a3d';
const RG_VIOLET = '#8a94ff';
const RG_GOLD = '#f2d04a';
const RG_RED = '#ff6a4a';

const RESULT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  win: { bg: 'rgba(127,209,79,.2)', text: RG_GREEN, label: 'WIN' },
  loss: { bg: 'rgba(255,106,74,.2)', text: '#ff9d86', label: 'LOSS' },
  draw: { bg: 'rgba(255,255,255,.12)', text: '#d0d4c8', label: 'DRAW' },
};

function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <section
      className={className}
      style={{
        background: RG_CARD, border: `1px solid ${RG_LINE}`, borderRadius: 18, padding: '1.25rem',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06), 0 14px 30px -20px rgba(0,0,0,.9)',
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function DashboardRedesign() {
  const { username, isPremium, authUser } = useUser();
  const { data: summary } = useMyAnalysisSummary();
  const { data: weaknesses } = useMyWeaknesses();
  const { data: gamesData } = useMyGames(5);
  const [showAfter, setShowAfter] = useState(false);

  const displayName = username ?? authUser?.chesscomUsername ?? authUser?.lichessUsername ?? 'Player';
  const platform = authUser?.chesscomUsername ? 'Chess.com' : authUser?.lichessUsername ? 'Lichess' : 'Unlinked account';
  const winRatePct = summary ? Math.round((summary.winRate || 0) * 100) : null;
  const hasGames = !!summary && summary.totalGames > 0;
  const topWeakness = weaknesses?.weaknesses?.[0];

  return (
    <div style={{ background: RG_BG, color: RG_TEXT, minHeight: '100vh', fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif' }} className="-m-4 p-4 md:-m-6 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] gap-5 items-start max-w-[1280px] mx-auto">
        <div className="grid gap-5 min-w-0">

          {/* Hero profile */}
          <Card style={{
            background: `linear-gradient(115deg, rgba(127,209,79,.26), rgba(127,209,79,.06) 70%), #141a10`,
            borderColor: 'rgba(127,209,79,.4)',
          }} className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3 min-w-[190px]">
              <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center font-extrabold text-xl shrink-0"
                style={{ background: 'linear-gradient(135deg,#6fb13a,#2c4a19)' }}>
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <b className="block text-lg font-extrabold leading-tight">{displayName}</b>
                <small style={{ color: RG_MUTED }} className="text-sm">{platform}{isPremium ? ' · Pro plan' : ' · Free plan'}</small>
              </div>
            </div>
            <div className="flex gap-6 flex-1 flex-wrap">
              {hasGames ? (
                <div>
                  <b className="block text-2xl font-extrabold tracking-tight">{winRatePct}%</b>
                  <small style={{ color: RG_MUTED }} className="text-xs font-semibold">Win rate · {summary!.totalGames.toLocaleString()} games</small>
                  <div className="flex h-1.5 rounded-full overflow-hidden mt-1.5" style={{ width: 110 }}
                    aria-label={`${summary!.wins} wins, ${summary!.draws} draws, ${summary!.losses} losses`}>
                    <div style={{ width: `${(summary!.wins / summary!.totalGames) * 100}%`, background: RG_GREEN }} />
                    <div style={{ width: `${(summary!.draws / summary!.totalGames) * 100}%`, background: '#8b8f84' }} />
                    <div style={{ width: `${(summary!.losses / summary!.totalGames) * 100}%`, background: RG_RED }} />
                  </div>
                </div>
              ) : (
                <div>
                  <b className="block text-2xl font-extrabold tracking-tight">—</b>
                  <small style={{ color: RG_MUTED }} className="text-xs font-semibold">Import games to see your stats</small>
                </div>
              )}
            </div>
            <div className="flex gap-2.5 flex-wrap">
              <Link href="/import">
                <button className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 font-bold border" style={{ background: 'rgba(255,255,255,.08)', borderColor: RG_LINE }}>Import</button>
              </Link>
              <Link href="/opponents">
                <button className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 font-bold" style={{ background: RG_GREEN, color: '#0a0d08' }}>Scout opponent</button>
              </Link>
            </div>
          </Card>

          {/* Weakness insight */}
          <Card style={{
            background: `linear-gradient(180deg, rgba(255,106,74,.14), rgba(255,106,74,0) 45%), ${RG_CARD}`,
            borderColor: 'rgba(255,120,80,.5)',
          }}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide rounded-full px-2.5 py-1"
                style={{ color: '#ffc2b3', background: 'rgba(255,106,74,.18)', border: '1px solid rgba(255,106,74,.45)' }}>
                ⚠ {topWeakness ? 'Pattern found' : 'Not analyzed yet'}
              </span>
              <Link href="/analysis" className="text-xs font-extrabold uppercase tracking-wide" style={{ color: RG_GREEN }}>Full analysis →</Link>
            </div>
            {topWeakness ? (
              <>
                <h3 className="text-xl font-extrabold tracking-tight my-2">{topWeakness.category}</h3>
                <p style={{ color: RG_MUTED }} className="text-sm mb-3 max-w-[56ch]">{topWeakness.description}</p>
                <Link href="/analysis">
                  <button className="rounded-[10px] px-4 py-2.5 font-bold" style={{ background: RG_GREEN, color: '#0a0d08' }}>Start a training plan</button>
                </Link>
              </>
            ) : (
              <>
                <h3 className="text-xl font-extrabold tracking-tight my-2">Find the mistakes that keep costing you games</h3>
                <p style={{ color: RG_MUTED }} className="text-sm mb-3 max-w-[56ch]">Deep Analysis reviews your imported games with the engine and groups your errors into recurring patterns, each with a plan to fix it.</p>
                <Link href="/analysis">
                  <button className="rounded-[10px] px-4 py-2.5 font-bold" style={{ background: RG_GREEN, color: '#0a0d08' }}>Run Deep Analysis</button>
                </Link>
              </>
            )}
          </Card>

          {/* Recent games */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-extrabold">Recent games</h2>
              <Link href="/games" className="text-xs font-extrabold uppercase tracking-wide" style={{ color: RG_GREEN }}>All games →</Link>
            </div>
            <div className="grid gap-2">
              {gamesData?.games?.length ? gamesData.games.map((game) => {
                const isWhite = game.whiteUsername?.toLowerCase() === (username ?? '').toLowerCase();
                const rs = RESULT_STYLE[game.result] ?? RESULT_STYLE.draw;
                return (
                  <Link key={game.id} href={`/games/${game.id}`} className="flex items-center gap-3 p-2.5 rounded-xl transition-colors hover:bg-white/5">
                    <span className="w-[54px] text-center text-[11px] font-extrabold tracking-wide rounded-lg py-1 shrink-0" style={{ background: rs.bg, color: rs.text }}>{rs.label}</span>
                    <div className="flex-1 min-w-0">
                      <b className="text-sm block truncate">vs {isWhite ? game.blackUsername : game.whiteUsername}</b>
                      <small style={{ color: RG_MUTED }} className="block text-xs truncate">{game.opening || 'Unknown opening'} · {new Date(game.playedAt).toLocaleDateString()}</small>
                    </div>
                  </Link>
                );
              }) : (
                <p style={{ color: RG_MUTED }} className="text-sm text-center py-6">No games yet — import to get started.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="grid gap-5 min-w-0">
          {/* Quick tools */}
          <Card>
            <h2 className="text-lg font-extrabold mb-3">Quick tools</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: 'Puzzles', sub: 'Daily puzzles', icon: Puzzle, color: RG_ORANGE, href: '/puzzles' },
                { label: 'Practice Bots', sub: '8 opponents', icon: Bot, color: RG_VIOLET, href: '/bots' },
                { label: 'Opening Trainer', sub: 'Drill your lines', icon: BookOpen, color: RG_GOLD, href: '/bots' },
                { label: 'Scan Position', sub: 'Photo to board', icon: Camera, color: RG_GREEN, href: '/scan' },
              ].map((q) => (
                <Link key={q.label} href={q.href} className="flex flex-col gap-1.5 p-3.5 rounded-2xl min-h-[110px] border transition-transform hover:-translate-y-0.5"
                  style={{ background: `linear-gradient(160deg, ${q.color}26, #141a10 75%)`, borderColor: `${q.color}66` }}>
                  <span className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: `${q.color}33`, color: q.color }}>
                    <q.icon className="w-4 h-4" />
                  </span>
                  <b className="text-sm block">{q.label}</b>
                  <small style={{ color: RG_MUTED }} className="text-xs">{q.sub}</small>
                </Link>
              ))}
            </div>
          </Card>

          {/* More to explore */}
          <Card style={{ background: '#10150d', boxShadow: 'none' }}>
            <h2 className="text-lg font-extrabold mb-2">More to explore</h2>
            <Link href="/traps" className="flex items-center gap-2.5 p-2 rounded-[10px] hover:bg-white/5" style={{ color: RG_MUTED }}>
              <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,.07)' }}><Crosshair className="w-4 h-4" /></span>
              <div><b className="block text-sm" style={{ color: RG_TEXT }}>Chess Traps</b><small className="text-xs">Learn the classics from both sides</small></div>
            </Link>
            <Link href="/shop" className="flex items-center gap-2.5 p-2 rounded-[10px] hover:bg-white/5" style={{ color: RG_MUTED }}>
              <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,.07)' }}><ShoppingBag className="w-4 h-4" /></span>
              <div><b className="block text-sm" style={{ color: RG_TEXT }}>Shop</b><small className="text-xs">Boards, books and gear</small></div>
            </Link>
            {!isPremium && (
              <div className="flex items-center gap-3 rounded-2xl p-3 mt-2.5 text-sm" style={{ border: '1px solid rgba(242,208,74,.35)', background: 'rgba(242,208,74,.07)', color: RG_MUTED }}>
                <div><b style={{ color: RG_TEXT }} className="block text-sm">Free plan</b>Deep Analysis, courses and unlimited puzzles</div>
                <Link href="/pricing" className="ml-auto shrink-0">
                  <button className="rounded-[10px] px-3 py-1.5 text-sm font-bold border" style={{ background: 'rgba(255,255,255,.08)', borderColor: RG_LINE }}>$5/mo</button>
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>

      <p style={{ color: '#6d7866' }} className="text-xs mt-5 max-w-[1280px] mx-auto flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" /> New design — beta. Switch back anytime in Settings.
      </p>
    </div>
  );
}
