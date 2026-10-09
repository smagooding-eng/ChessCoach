import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { Chess } from 'chess.js';
import { ArrowLeft, Flag, Handshake, Loader2, BookOpen, Clock } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { MaterialStrip } from '@/components/GameStatusStrip';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { PT, cardStyle, greenBtn, ghostBtn, formatLeft } from '@/lib/playTheme';
import { NotifyPrompt } from '@/components/play/NotifyPrompt';
import { dailyTcLabel, dailyTimeLeft, type DailyGameRow } from './DailyGames';

const HOW: Record<string, string> = {
  checkmate: 'by checkmate', resignation: 'by resignation', timeout: 'on time', stalemate: 'by stalemate',
  aborted: 'Closed — no result', draw_agreement: 'by agreement', draw_repetition: 'by repetition', draw_insufficient: 'by insufficient material', draw_50: 'by the 50-move rule',
};

export function DailyGame() {
  const { id } = useParams<{ id: string }>();
  const { authUser } = useUser();
  const me = authUser?.id;
  const [, navigate] = useLocation();
  const [game, setGame] = useState<DailyGameRow | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [sending, setSending] = useState(false);
  const [, setTick] = useState(0);

  const apply = (d: { game?: DailyGameRow; now?: number }) => {
    if (d.game) setGame(d.game);
    if (typeof d.now === 'number') setOffset(d.now - Date.now());
  };

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/correspondence/games/${id}`, { credentials: 'include' });
    if (r.status === 404) { setNotFound(true); return; }
    if (r.ok) apply(await r.json());
  }, [id]);

  const myTurn = !!game && game.status === 'active' && game.turnUserId === me;

  // Poll while waiting for the opponent; tick the clock every 30s.
  useEffect(() => { void load(); }, [load]);
  // Real-time: refresh the moment the server says this game changed.
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail?.gameId === id) void load(); };
    window.addEventListener('cs:daily-update', on);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('cs:daily-update', on); document.removeEventListener('visibilitychange', onVisible); };
  }, [id, load]);
  useEffect(() => {
    if (!game || game.status !== 'active' || myTurn) return;
    const t = setInterval(load, 15_000); // fallback if the live connection drops
    return () => clearInterval(t);
  }, [game?.status, myTurn, load]);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30_000); return () => clearInterval(t); }, []);

  const lastMove = useMemo(() => {
    if (!game?.pgn) return null;
    try {
      const c = new Chess(); c.loadPgn(game.pgn);
      const h = c.history({ verbose: true });
      const m = h[h.length - 1];
      return m ? { from: m.from, to: m.to } : null;
    } catch { return null; }
  }, [game?.pgn]);

  const moveList = useMemo(() => {
    if (!game?.pgn) return [] as string[];
    try { const c = new Chess(); c.loadPgn(game.pgn); return c.history(); } catch { return []; }
  }, [game?.pgn]);

  const post = async (path: string, body?: object) => {
    setSending(true); setError('');
    try {
      const r = await apiFetch(`/api/correspondence/games/${id}/${path}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Something went wrong'); await load(); return; }
      apply(d);
    } catch { setError('Connection problem — try again'); }
    finally { setSending(false); }
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-[560px] p-6 text-center" style={{ color: PT.muted }}>
        <p className="mb-3">This game doesn't exist or isn't yours.</p>
        <Link href="/daily" style={{ color: PT.green }}>Back to Daily Games</Link>
      </div>
    );
  }
  if (!game || !me) return <div className="py-16 text-center"><Loader2 className="mx-auto animate-spin" style={{ color: PT.green }} /></div>;

  const white = game.whiteUserId === me;
  const mySide = white ? 'white' : 'black';
  const opp = white ? game.blackUsername : game.whiteUsername;
  const you = white ? game.whiteUsername : game.blackUsername;
  const oppRating = white ? game.blackRatingBefore : game.whiteRatingBefore;
  const myRating = white ? game.whiteRatingBefore : game.blackRatingBefore;
  const left = game.status === 'active' ? dailyTimeLeft(game, offset) : 0;
  const theyOffered = game.status === 'active' && game.drawOfferFrom && game.drawOfferFrom !== mySide;
  const iOffered = game.status === 'active' && game.drawOfferFrom === mySide;
  const reviewId = white ? game.whiteGamesId : game.blackGamesId;

  const Strip = ({ name, rating, side, active }: { name: string; rating: number | null; side: 'white' | 'black'; active: boolean }) => (
    <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: active ? PT.greenSoft : 'rgba(255,255,255,.04)', border: `1px solid ${active ? PT.green : PT.border}` }}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: side === 'white' ? '#f0ede8' : '#1b1b1b', border: '1px solid rgba(255,255,255,.35)' }} />
        <span className="min-w-0">
          <b className="block truncate text-[14px] font-extrabold" style={{ color: PT.text }}>{name}</b>
          {rating != null && <span className="block text-[11px]" style={{ color: PT.muted }}>{rating}</span>}
        </span>
      </div>
      {active && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-extrabold" style={{ background: 'rgba(0,0,0,.35)', color: left < 3_600_000 ? PT.red : PT.text }}>
          <Clock size={13} /> {formatLeft(left)}
        </span>
      )}
    </div>
  );

  const result = (() => {
    if (game.status !== 'finished') return null;
    const won = (game.result === 'white' && white) || (game.result === 'black' && !white);
    const title = game.termination === 'aborted' ? 'Game aborted' : game.result === 'draw' ? 'Draw' : won ? 'You won' : 'You lost';
    const accent = game.result === 'draw' ? PT.muted : won ? PT.green : PT.red;
    const after = white ? game.whiteRatingAfter : game.blackRatingAfter;
    const delta = myRating != null && after != null ? after - myRating : null;
    return (
      <div className="space-y-3 p-5 text-center" style={{ ...cardStyle, border: `1px solid ${accent}66` }}>
        <p className="text-xl font-black" style={{ color: PT.text }}>{title}</p>
        <p className="text-[12.5px]" style={{ color: PT.muted }}>{HOW[game.termination ?? ''] ?? game.termination}</p>
        {delta != null ? (
          <p className="text-[14px] font-extrabold" style={{ color: delta >= 0 ? PT.green : PT.red }}>{delta >= 0 ? '+' : ''}{delta} daily rating</p>
        ) : (
          <p className="text-[12px]" style={{ color: PT.muted }}>Casual game — no rating change</p>
        )}
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <button onClick={() => navigate(reviewId ? `/games/${reviewId}` : '/games')} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-extrabold" style={greenBtn}>
            <BookOpen size={15} /> Review game
          </button>
          <Link href="/daily" className="rounded-xl px-4 py-2.5 text-[13px] font-bold" style={ghostBtn}>Daily games</Link>
        </div>
      </div>
    );
  })();

  return (
    <div className="mx-auto max-w-[620px] space-y-3 p-4 md:p-0 pb-24">
      <div className="flex items-center justify-between gap-3">
        <Link href="/daily" className="inline-flex items-center gap-1.5 text-sm" style={{ color: PT.muted }}><ArrowLeft size={16} /> Daily games</Link>
        <span className="text-[12px] font-bold" style={{ color: PT.muted }}>{dailyTcLabel(game.timeControl)} per move · {game.mode === 'ranked' ? 'Ranked' : 'Casual'}</span>
      </div>

      <Strip name={opp} rating={oppRating} side={white ? 'black' : 'white'} active={game.status === 'active' && !myTurn} />
      <MaterialStrip fen={game.fen} color={white ? 'b' : 'w'} className="px-1" />

      <ChessBoard
        fen={game.fen}
        flipped={!white}
        practiceMode={myTurn && !sending}
        expectedMoveSan={null}
        onMovePlayed={(san) => {
          // show the move straight away, then confirm with the server
          try {
            const c = new Chess(); if (game.pgn) c.loadPgn(game.pgn);
            if (c.move(san)) setGame({ ...game, fen: c.fen(), pgn: c.pgn(), turnUserId: white ? game.blackUserId : game.whiteUserId });
          } catch { /* server will reject */ }
          void post('move', { san });
        }}
        lastMove={lastMove}
        moveQuality={null}
      />

      <MaterialStrip fen={game.fen} color={white ? 'w' : 'b'} className="px-1" />
      <Strip name={`${you} (you)`} rating={myRating} side={white ? 'white' : 'black'} active={myTurn} />

      {game.status === 'active' && (
        <p className="text-center text-[13px] font-bold" style={{ color: myTurn ? PT.green : PT.muted }}>
          {myTurn ? `Your move — ${formatLeft(left)} left` : `Waiting for ${opp} — ${formatLeft(left)} left on their clock`}
        </p>
      )}

      {theyOffered && (
        <div className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: PT.greenSoft, border: `1px solid ${PT.greenLine}` }}>
          <span className="text-[13.5px] font-bold" style={{ color: PT.text }}>{opp} offered a draw.</span>
          <div className="flex gap-2">
            <button onClick={() => post('draw-accept')} disabled={sending} className="rounded-lg px-3 py-1.5 text-[12px] font-extrabold" style={greenBtn}>Accept</button>
            <button onClick={() => post('draw-decline')} disabled={sending} className="rounded-lg px-3 py-1.5 text-[12px] font-extrabold" style={ghostBtn}>Decline</button>
          </div>
        </div>
      )}
      {iOffered && <p className="text-center text-[12px]" style={{ color: PT.muted }}>Draw offer sent — waiting for {opp}.</p>}

      {error && <p className="text-center text-[13px]" style={{ color: PT.red }}>{error}</p>}

      {game.status === 'active' && (
        <div className="flex justify-end gap-2">
          <button onClick={() => post('draw-offer')} disabled={sending || !!iOffered || !!theyOffered} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold disabled:opacity-50" style={ghostBtn}>
            <Handshake size={14} /> Offer draw
          </button>
          <button onClick={() => { if (confirm('Resign this game?')) void post('resign'); }} disabled={sending} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold" style={{ background: 'rgba(220,67,67,0.25)', color: PT.text, border: '1px solid rgba(220,67,67,0.5)' }}>
            <Flag size={14} /> Resign
          </button>
        </div>
      )}

      {result}

      {game.status === 'active' && <NotifyPrompt reason={`Turn on notifications so you know when ${opp} moves.`} />}

      {moveList.length > 0 && (
        <div className="p-3" style={cardStyle}>
          <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>Moves</p>
          <p className="text-[13px] leading-relaxed" style={{ color: PT.text }}>
            {moveList.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m} ` : `${m} `)).join('')}
          </p>
        </div>
      )}
    </div>
  );
}
