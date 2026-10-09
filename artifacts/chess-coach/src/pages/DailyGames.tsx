import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { CalendarDays, Loader2, Users, X, ChevronRight, Sparkles, Award, Trophy } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { PT, cardStyle, greenBtn, ghostBtn, formatLeft } from '@/lib/playTheme';
import { ShareLink } from '@/components/play/ShareLink';
import { NotifyPrompt } from '@/components/play/NotifyPrompt';

export const DAILY_TC = [
  { id: 'corr_1d', label: '1 day' },
  { id: 'corr_3d', label: '3 days' },
  { id: 'corr_7d', label: '7 days' },
] as const;
export const dailyTcLabel = (id: string) => DAILY_TC.find(t => t.id === id)?.label ?? id;

export interface DailyGameRow {
  id: string;
  timeControl: string;
  mode: 'casual' | 'ranked';
  whiteUserId: string;
  blackUserId: string;
  whiteUsername: string;
  blackUsername: string;
  pgn: string;
  fen: string;
  turnUserId: string;
  whiteBankMs: number;
  blackBankMs: number;
  lastMoveAt: string;
  status: 'active' | 'finished';
  result: 'white' | 'black' | 'draw' | null;
  termination: string | null;
  startedAt: string;
  finishedAt: string | null;
  whiteRatingBefore: number | null;
  blackRatingBefore: number | null;
  whiteRatingAfter: number | null;
  blackRatingAfter: number | null;
  whiteGamesId: number | null;
  blackGamesId: number | null;
  drawOfferFrom: 'white' | 'black' | null;
}

/** ms left for the side to move (server clock offset applied). */
export function dailyTimeLeft(g: DailyGameRow, serverOffsetMs: number): number {
  const bank = g.turnUserId === g.whiteUserId ? g.whiteBankMs : g.blackBankMs;
  return bank - (Date.now() + serverOffsetMs - new Date(g.lastMoveAt).getTime());
}

type QueueRow = { id: string; timeControl: string; mode: string; joinedAt: string };

export function DailyGames() {
  const { authUser } = useUser();
  const me = authUser?.id;
  const [, navigate] = useLocation();
  const [games, setGames] = useState<DailyGameRow[]>([]);
  const [finished, setFinished] = useState<DailyGameRow[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [rating, setRating] = useState<{ rating: number; gamesPlayed: number; isProvisional: boolean } | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tc, setTc] = useState<string>('corr_1d');
  const [mode, setMode] = useState<'casual' | 'ranked'>('casual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState<{ url: string; code: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [g, q, r] = await Promise.all([
        apiFetch('/api/correspondence/games', { credentials: 'include' }).then(x => x.ok ? x.json() : null),
        apiFetch('/api/correspondence/queue', { credentials: 'include' }).then(x => x.ok ? x.json() : null),
        apiFetch('/api/correspondence/rating', { credentials: 'include' }).then(x => x.ok ? x.json() : null),
      ]);
      if (g) { setGames(g.games ?? []); setFinished(g.finished ?? []); if (typeof g.now === 'number') setOffset(g.now - Date.now()); }
      if (q) setQueue(q.queue ?? []);
      if (r) setRating(r.rating);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const findOpponent = async () => {
    setBusy(true); setError('');
    try {
      const res = await apiFetch('/api/correspondence/create', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeControl: tc, mode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not start a game');
      if (d.status === 'matched' && d.game) { navigate(`/daily/${d.game.id}`); return; }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start a game'); }
    finally { setBusy(false); }
  };

  const challenge = async () => {
    setBusy(true); setError('');
    try {
      const res = await apiFetch('/api/challenges', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'daily', timeControl: tc, mode, color: 'random' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not create the link');
      setLink({ code: d.challenge.code, url: `${window.location.origin}/challenge/${d.challenge.code}` });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the link'); }
    finally { setBusy(false); }
  };

  const leave = async (q: QueueRow) => {
    await apiFetch('/api/correspondence/cancel-queue', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeControl: q.timeControl, mode: q.mode }),
    }).catch(() => {});
    await load();
  };

  const myTurn = games.filter(g => g.turnUserId === me);
  const theirTurn = games.filter(g => g.turnUserId !== me);

  const Row = ({ g }: { g: DailyGameRow }) => {
    const white = g.whiteUserId === me;
    const opp = white ? g.blackUsername : g.whiteUsername;
    const yourTurn = g.status === 'active' && g.turnUserId === me;
    const left = g.status === 'active' ? dailyTimeLeft(g, offset) : 0;
    const won = (g.result === 'white' && white) || (g.result === 'black' && !white);
    const res = g.status === 'finished' ? (g.termination === 'aborted' ? 'Aborted' : g.result === 'draw' ? 'Draw' : won ? 'Won' : 'Lost') : null;
    const moves = g.pgn ? (g.pgn.match(/\d+\./g)?.length ?? 0) : 0;
    return (
      <Link href={`/daily/${g.id}`} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${PT.border}` }}>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: white ? '#f0ede8' : '#1b1b1b', border: '1px solid rgba(255,255,255,.35)' }} title={white ? 'You are White' : 'You are Black'} />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[14.5px] font-extrabold" style={{ color: PT.text }}>vs {opp}</b>
          <span className="block truncate text-[12px]" style={{ color: PT.muted }}>
            {dailyTcLabel(g.timeControl)} · {g.mode === 'ranked' ? 'Ranked' : 'Casual'} · move {Math.max(1, moves)}
            {g.drawOfferFrom && g.status === 'active' && g.drawOfferFrom !== (white ? 'white' : 'black') ? ' · draw offered' : ''}
          </span>
        </span>
        {res ? (
          <span className="shrink-0 rounded-md px-2 py-1 text-[11px] font-black uppercase" style={{ background: res === 'Won' ? PT.greenSoft : 'rgba(255,255,255,.08)', color: res === 'Won' ? PT.green : res === 'Lost' ? PT.red : PT.muted }}>{res}</span>
        ) : (
          <span className="shrink-0 text-right">
            <span className="block text-[12px] font-extrabold" style={{ color: yourTurn ? PT.green : PT.muted }}>{yourTurn ? 'Your move' : 'Their move'}</span>
            <span className="block text-[11px]" style={{ color: left < 3_600_000 ? PT.red : PT.muted }}>{formatLeft(left)} left</span>
          </span>
        )}
        <ChevronRight size={16} className="shrink-0" style={{ color: PT.muted }} />
      </Link>
    );
  };

  const Section = ({ title, list }: { title: string; list: DailyGameRow[] }) => list.length === 0 ? null : (
    <section className="overflow-hidden" style={cardStyle}>
      <h2 className="px-4 py-3 text-[13px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>{title} · {list.length}</h2>
      {list.map(g => <Row key={g.id} g={g} />)}
    </section>
  );

  return (
    <div className="mx-auto max-w-[760px] space-y-4 p-4 md:p-0 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black" style={{ color: PT.text, letterSpacing: '-0.02em' }}>Daily Games</h1>
          <p className="text-sm" style={{ color: PT.muted }}>1, 3 or 7 days per move. We'll notify you when it's your turn.</p>
        </div>
        {rating && (
          <div className="shrink-0 rounded-xl px-3 py-2 text-center" style={{ background: PT.greenSoft, border: `1px solid ${PT.greenLine}` }}>
            <div className="text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: PT.green }}>Daily rating</div>
            <div className="text-[18px] font-black" style={{ color: PT.text }}>{rating.gamesPlayed > 0 ? `${rating.rating}${rating.isProvisional ? '?' : ''}` : '—'}</div>
          </div>
        )}
      </div>

      <NotifyPrompt reason="Turn on notifications so you know when it's your move, when an opponent is found and when time is running low." />

      {/* New game */}
      <section className="p-4 space-y-3" style={cardStyle}>
        <div className="flex items-center gap-2">
          <CalendarDays size={18} style={{ color: PT.green }} />
          <h2 className="text-[15px] font-extrabold" style={{ color: PT.text }}>New daily game</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DAILY_TC.map(t => (
            <button key={t.id} onClick={() => setTc(t.id)} className="rounded-lg px-3.5 py-2 text-[13px] font-bold" style={tc === t.id ? greenBtn : ghostBtn}>{t.label}</button>
          ))}
        </div>
        <div className="inline-flex rounded-xl p-1" style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${PT.border}` }}>
          {(['casual', 'ranked'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className="px-3.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-[0.14em] inline-flex items-center gap-1.5"
              style={{ background: mode === m ? PT.green : 'transparent', color: mode === m ? PT.onGreen : PT.muted }}>
              {m === 'casual' ? <Sparkles size={13} /> : <Award size={13} />} {m}
            </button>
          ))}
        </div>
        <p className="text-[12px] -mt-1" style={{ color: PT.muted }}>
          {mode === 'ranked' ? 'Ranked: changes your daily rating. Paired with players near your rating (the range widens the longer you wait).' : 'Casual: no rating change. Paired with the next available player.'} Finished games appear in your Games and Analysis.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={findOpponent} disabled={busy} className="rounded-xl py-3 text-[14px] font-extrabold disabled:opacity-60" style={greenBtn}>Find opponent</button>
          <button onClick={challenge} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-xl py-3 text-[14px] font-extrabold disabled:opacity-60" style={ghostBtn}>
            <Users size={16} /> Challenge friend
          </button>
        </div>
        {link && (
          <div className="space-y-2 rounded-xl p-3" style={{ background: 'rgba(0,0,0,.2)' }}>
            <p className="text-[12.5px]" style={{ color: PT.text }}>Send this link. The game starts as soon as your friend accepts; we'll notify you.</p>
            <ShareLink url={link.url} text={`Play a daily game with me on ChessScout (${dailyTcLabel(tc)} per move)`} />
          </div>
        )}
        {error && <p className="text-[13px]" style={{ color: PT.red }}>{error}</p>}
      </section>

      {queue.length > 0 && (
        <section className="overflow-hidden" style={cardStyle}>
          <h2 className="px-4 py-3 text-[13px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>Looking for opponents</h2>
          {queue.map(q => (
            <div key={q.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${PT.border}` }}>
              <Loader2 size={16} className="animate-spin shrink-0" style={{ color: PT.green }} />
              <span className="min-w-0 flex-1 text-[13.5px]" style={{ color: PT.text }}>
                {dailyTcLabel(q.timeControl)} · {q.mode === 'ranked' ? 'Ranked' : 'Casual'}
                <span className="block text-[11.5px]" style={{ color: PT.muted }}>Waiting since {new Date(q.joinedAt).toLocaleString()} · we'll notify you when matched</span>
              </span>
              <button onClick={() => leave(q)} className="shrink-0 rounded-lg p-2" style={ghostBtn} aria-label="Stop searching"><X size={15} /></button>
            </div>
          ))}
        </section>
      )}

      {loading ? (
        <div className="py-10 text-center"><Loader2 className="mx-auto animate-spin" style={{ color: PT.green }} /></div>
      ) : (
        <>
          <Section title="Your move" list={myTurn} />
          <Section title="Waiting for opponent" list={theirTurn} />
          <Section title="Recently finished" list={finished} />
          {games.length === 0 && finished.length === 0 && queue.length === 0 && (
            <div className="px-6 py-10 text-center" style={cardStyle}>
              <Trophy size={30} className="mx-auto mb-2" style={{ color: PT.muted }} />
              <p className="text-[14px] font-bold" style={{ color: PT.text }}>No daily games yet</p>
              <p className="text-[12.5px]" style={{ color: PT.muted }}>Start one above, or challenge a friend with a link.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
