import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Swords, ChevronRight, List, LayoutGrid } from 'lucide-react';
import { Chess } from 'chess.js';
import { ThemedMiniBoard } from '@/components/ThemedMiniBoard';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { PT, cardStyle, formatLeft } from '@/lib/playTheme';
import { lichessAuth, syncLichessAuth, nowPlaying, isDaily, type LichessPlaying } from '@/lib/lichessBoard';

interface DailyRow {
  id: string; timeControl: string; whiteUserId: string; blackUserId: string;
  whiteUsername: string; blackUsername: string; turnUserId: string;
  whiteBankMs: number; blackBankMs: number; lastMoveAt: string; drawOfferFrom: string | null;
  fen?: string; pgn?: string;
}
interface LiveActive { id: string; white: { username: string }; black: { username: string }; timeControl: { label: string }; turn: 'w' | 'b'; fen?: string; sanMoves?: string[] }

/** The moves so far (the latest ones, numbered like a PGN) and the last move's squares. */
function gameMoves(sans: string[]): { tail: string; last: { from: string; to: string } | null } {
  if (!sans.length) return { tail: 'No moves yet', last: null };
  let last: { from: string; to: string } | null = null;
  try { const c = new Chess(); for (const s of sans) { const m = c.move(s); if (m) last = { from: m.from, to: m.to }; } } catch { /* keep text */ }
  const from = Math.max(0, sans.length - 6 - (sans.length % 2 === 0 ? 0 : 1));
  const parts: string[] = [];
  for (let i = from; i < sans.length; i++) parts.push(i % 2 === 0 ? `${i / 2 + 1}. ${sans[i]}` : sans[i]);
  return { tail: `${from > 0 ? '… ' : ''}${parts.join(' ')}`, last };
}
function sansFromPgn(pgn?: string): string[] {
  if (!pgn) return [];
  try { const c = new Chess(); c.loadPgn(pgn); return c.history(); } catch { return []; }
}

/** A Lichess game: plays on ChessScout, or opens on lichess.org when Lichess won't let outside boards play it. */
const LiLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) =>
  href.startsWith('http') ? <a href={href} target="_blank" rel="noreferrer" {...rest}>{children}</a> : <Link href={href} {...rest}>{children}</Link>;

/** Opponent names are never shown as an email address. */
const nameOf = (n: string) => (n.includes('@') ? n.split('@')[0] : n) || 'Player';

type View = 'list' | 'boards';
const VIEW_KEY = 'cs_your_games_view';
function readView(): View {
  try { return localStorage.getItem(VIEW_KEY) === 'boards' ? 'boards' : 'list'; } catch { return 'list'; }
}

const TC: Record<string, string> = { corr_1d: '1 day', corr_3d: '3 days', corr_7d: '7 days' };

// "Your games" on the home page: any live game in progress plus active daily
// games (your move first). Refreshes in real time; hidden when there are none.
export function ActiveGamesCard() {
  const { authUser } = useUser();
  const me = authUser?.id;
  // Shown straight away from what this device saw last time, then refreshed,
  // so the card is there when Home opens instead of popping in late.
  const cacheKey = me ? `cs_your_games_${me}` : null;
  const [cached] = useState<{ daily: DailyRow[]; live: { game: LiveActive; color: 'w' | 'b' } | null; offset: number } | null>(() => {
    try { const v = cacheKey && localStorage.getItem(cacheKey); return v ? JSON.parse(v) : null; } catch { return null; }
  });
  const [daily, setDaily] = useState<DailyRow[]>(cached?.daily ?? []);
  const [offset, setOffset] = useState(cached?.offset ?? 0);
  const [live, setLive] = useState<{ game: LiveActive; color: 'w' | 'b' } | null>(cached?.live ?? null);
  // List rows or a row of bigger boards you swipe through; remembered per device.
  const [view, setView] = useState<View>(readView);
  // Games going on Lichess (started here or on lichess.org): tap one to play it on ChessScout.
  const [li, setLi] = useState<LichessPlaying[]>([]);
  useEffect(() => {
    if (!me) return;
    let alive = true;
    const f = () => { if (lichessAuth()) void nowPlaying().then((g) => { if (alive) setLi(g); }).catch(() => {}); };
    void syncLichessAuth().catch(() => null).then(f);
    const t = setInterval(f, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [me]);
  const liSorted = [...li].sort((a, b) => Number(!isDaily(b)) - Number(!isDaily(a)) || Number(!!b.isMyTurn) - Number(!!a.isMyTurn));
  const liLabel = (g: LichessPlaying) => (isDaily(g) ? 'Lichess daily' : `Lichess ${g.speed ?? 'game'}`);
  // Lichess only lets outside boards play rapid, classical and daily games started elsewhere;
  // a bullet or blitz game started on lichess.org opens there.
  const liHref = (g: LichessPlaying) => (/^(ultraBullet|bullet|blitz)$/.test(g.speed ?? '') ? `https://lichess.org/${g.gameId}` : `/lichess?game=${g.gameId}`);
  const chooseView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } };

  const load = useCallback(async () => {
    const [d, l] = await Promise.all([
      apiFetch('/api/correspondence/games').then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch('/api/live/active-game').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    const nextLive = l?.game && l.game.status === 'active' ? { game: l.game as LiveActive, color: l.color as 'w' | 'b' } : null;
    const nextOffset = d && typeof d.now === 'number' ? d.now - Date.now() : null;
    if (d) { setDaily(d.games ?? []); if (nextOffset != null) setOffset(nextOffset); }
    setLive(nextLive);
    if (d && cacheKey) {
      try { localStorage.setItem(cacheKey, JSON.stringify({ daily: d.games ?? [], live: nextLive, offset: nextOffset ?? 0 })); } catch { /* full or blocked */ }
    }
  }, [cacheKey]);

  useEffect(() => {
    if (!me) return;
    void load();
    const on = () => { void load(); };
    window.addEventListener('cs:daily-update', on);
    const t = setInterval(load, 60_000);
    return () => { window.removeEventListener('cs:daily-update', on); clearInterval(t); };
  }, [me, load]);

  if (!me || (daily.length === 0 && !live && li.length === 0)) return null;

  const sorted = [...daily].sort((a, b) => Number(b.turnUserId === me) - Number(a.turnUserId === me));
  const myMoves = sorted.filter(g => g.turnUserId === me).length + li.filter((g) => g.isMyTurn).length;

  return (
    <section className="overflow-hidden lg:col-span-2" style={cardStyle}>
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <h2 className="flex items-center gap-2 text-[16px] font-extrabold" style={{ color: PT.text }}>
          <Swords size={18} style={{ color: PT.green }} /> Your games
          {myMoves > 0 && <span className="rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: PT.green, color: PT.onGreen }}>{myMoves} your move</span>}
        </h2>
        <span className="flex items-center gap-2.5">
          <span className="flex rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${PT.border}` }} role="group" aria-label="Game list view">
            {([['list', List, 'List'], ['boards', LayoutGrid, 'Boards']] as const).map(([v, Icon, label]) => (
              <button key={v} type="button" onClick={() => chooseView(v)} aria-label={label} aria-pressed={view === v}
                className="grid h-7 w-8 place-items-center rounded-md transition-colors"
                style={view === v ? { background: PT.green, color: PT.onGreen } : { color: PT.muted }}>
                <Icon size={15} />
              </button>
            ))}
          </span>
          <Link href="/daily" className="text-[12px] font-extrabold uppercase tracking-wider" style={{ color: PT.green }}>All</Link>
        </span>
      </div>
      {view === 'boards' && (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 pt-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          {live && (() => {
            const mv = gameMoves(live.game.sanMoves ?? []);
            return (
              <Link href="/live" className="w-[164px] shrink-0 snap-start rounded-2xl p-2" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${PT.border}` }}>
                {live.game.fen ? <ThemedMiniBoard fen={live.game.fen} size={148} flipped={live.color === 'b'} lastMove={mv.last} /> : <span className="block h-[148px] w-[148px] rounded-md" style={{ background: 'rgba(255,255,255,0.05)' }} />}
                <b className="mt-2 flex items-center gap-1.5 truncate text-[13px] font-extrabold" style={{ color: PT.text }}>
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: PT.red }} />
                  <span className="truncate">{nameOf(live.color === 'w' ? live.game.black.username : live.game.white.username)}</span>
                </b>
                <span className="block text-[11.5px] font-extrabold" style={{ color: PT.green }}>Live · Resume</span>
                <span className="block truncate font-mono text-[11px]" style={{ color: PT.text, opacity: 0.75 }}>{mv.tail}</span>
              </Link>
            );
          })()}
          {liSorted.map((g) => (
            <LiLink key={g.gameId} href={liHref(g)} className="w-[164px] shrink-0 snap-start rounded-2xl p-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${g.isMyTurn ? 'rgba(129,182,76,0.55)' : PT.border}` }}>
              {g.fen ? <ThemedMiniBoard fen={g.fen} size={148} flipped={g.color === 'black'} /> : <span className="block h-[148px] w-[148px] rounded-md" style={{ background: 'rgba(255,255,255,0.05)' }} />}
              <b className="mt-2 flex items-center gap-1.5 truncate text-[13px] font-extrabold" style={{ color: PT.text }}>
                {!isDaily(g) && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: PT.red }} />}
                <span className="truncate">{g.opponent?.username ?? 'Opponent'}</span>
              </b>
              <span className="flex items-baseline justify-between gap-1 text-[11.5px]">
                <span className="font-extrabold" style={{ color: g.isMyTurn ? PT.green : PT.muted }}>{g.isMyTurn ? 'Your move' : 'Their move'}</span>
                <span className="truncate" style={{ color: PT.muted }}>{liLabel(g)}</span>
              </span>
            </LiLink>
          ))}
          {sorted.map(g => {
            const white = g.whiteUserId === me;
            const yours = g.turnUserId === me;
            const bank = g.turnUserId === g.whiteUserId ? g.whiteBankMs : g.blackBankMs;
            const left = bank - (Date.now() + offset - new Date(g.lastMoveAt).getTime());
            const mv = gameMoves(sansFromPgn(g.pgn));
            return (
              <Link key={g.id} href={`/daily/${g.id}`} className="w-[164px] shrink-0 snap-start rounded-2xl p-2"
                style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${yours ? 'rgba(129,182,76,0.55)' : PT.border}` }}>
                {g.fen ? <ThemedMiniBoard fen={g.fen} size={148} flipped={!white} lastMove={mv.last} /> : <span className="block h-[148px] w-[148px] rounded-md" style={{ background: 'rgba(255,255,255,0.05)' }} />}
                <b className="mt-2 block truncate text-[13px] font-extrabold" style={{ color: PT.text }}>{nameOf(white ? g.blackUsername : g.whiteUsername)}</b>
                <span className="flex items-baseline justify-between gap-1 text-[11.5px]">
                  <span className="font-extrabold" style={{ color: yours ? PT.green : PT.muted }}>{yours ? 'Your move' : 'Their move'}</span>
                  <span style={{ color: left < 3_600_000 ? PT.red : PT.muted }}>{formatLeft(left)}</span>
                </span>
                <span className="block truncate font-mono text-[11px]" style={{ color: PT.text, opacity: 0.75 }}>{mv.tail}</span>
              </Link>
            );
          })}
        </div>
      )}
      {view === 'list' && live && (() => {
        const mv = gameMoves(live.game.sanMoves ?? []);
        return (
        <Link href="/live" className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${PT.border}` }}>
          {live.game.fen ? <ThemedMiniBoard fen={live.game.fen} size={56} flipped={live.color === 'b'} lastMove={mv.last} /> : <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full" style={{ background: PT.red }} />}
          <span className="min-w-0 flex-1">
            <b className="flex items-center gap-1.5 truncate text-[14px] font-extrabold" style={{ color: PT.text }}>
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: PT.red }} />
              Live vs {nameOf(live.color === 'w' ? live.game.black.username : live.game.white.username)}
            </b>
            <span className="block text-[12px]" style={{ color: PT.muted }}>{live.game.timeControl.label} · in progress</span>
            <span className="block truncate font-mono text-[11.5px]" style={{ color: PT.text, opacity: 0.8 }}>{mv.tail}</span>
          </span>
          <span className="shrink-0 text-[12px] font-extrabold" style={{ color: PT.green }}>Resume</span>
          <ChevronRight size={16} style={{ color: PT.muted }} />
        </Link>
        );
      })()}
      {view === 'list' && liSorted.map((g) => (
        <LiLink key={g.gameId} href={liHref(g)} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${PT.border}` }}>
          {g.fen ? <ThemedMiniBoard fen={g.fen} size={56} flipped={g.color === 'black'} /> : <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PT.green }} />}
          <span className="min-w-0 flex-1">
            <b className="flex items-center gap-1.5 truncate text-[14px] font-extrabold" style={{ color: PT.text }}>
              {!isDaily(g) && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: PT.red }} />}
              vs {g.opponent?.username ?? 'Opponent'}
            </b>
            <span className="block text-[12px]" style={{ color: PT.muted }}>{liLabel(g)} · {g.rated ? 'Rated' : 'Casual'}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[12px] font-extrabold" style={{ color: g.isMyTurn ? PT.green : PT.muted }}>{g.isMyTurn ? 'Your move' : 'Their move'}</span>
            {isDaily(g) && typeof g.secondsLeft === 'number' && <span className="block text-[11px]" style={{ color: g.secondsLeft < 3600 ? PT.red : PT.muted }}>{formatLeft(g.secondsLeft * 1000)}</span>}
          </span>
          <ChevronRight size={16} style={{ color: PT.muted }} />
        </LiLink>
      ))}
      {view === 'list' && sorted.map(g => {
        const white = g.whiteUserId === me;
        const yours = g.turnUserId === me;
        const bank = g.turnUserId === g.whiteUserId ? g.whiteBankMs : g.blackBankMs;
        const left = bank - (Date.now() + offset - new Date(g.lastMoveAt).getTime());
        const mv = gameMoves(sansFromPgn(g.pgn));
        return (
          <Link key={g.id} href={`/daily/${g.id}`} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${PT.border}` }}>
            {g.fen && <ThemedMiniBoard fen={g.fen} size={56} flipped={!white} lastMove={mv.last} />}
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[14px] font-extrabold" style={{ color: PT.text }}>vs {nameOf(white ? g.blackUsername : g.whiteUsername)}</b>
              <span className="block text-[12px]" style={{ color: PT.muted }}>Daily · {TC[g.timeControl] ?? g.timeControl}{g.drawOfferFrom ? ' · draw offer' : ''}</span>
              <span className="block truncate font-mono text-[11.5px]" style={{ color: PT.text, opacity: 0.8 }}>{mv.tail}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[12px] font-extrabold" style={{ color: yours ? PT.green : PT.muted }}>{yours ? 'Your move' : 'Their move'}</span>
              <span className="block text-[11px]" style={{ color: left < 3_600_000 ? PT.red : PT.muted }}>{formatLeft(left)}</span>
            </span>
            <ChevronRight size={16} style={{ color: PT.muted }} />
          </Link>
        );
      })}
    </section>
  );
}
