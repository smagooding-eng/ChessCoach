import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RatePlayCard } from '@/components/RatePlayCard';
import { Link, useLocation, useParams } from 'wouter';
import { Chess } from 'chess.js';
import { ArrowLeft, Flag, Handshake, Loader2, BookOpen, Clock, GitBranch, X, Undo2 } from 'lucide-react';
import { MoveBrowserBar } from '@/components/MoveBrowserBar';
import { useMoveBrowser, positionsFromSan } from '@/hooks/use-move-browser';
import { ChessBoard } from '@/components/ChessBoard';
import { GameOverOverlay, OverlayButton } from '@/components/GameOverOverlay';
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
  // Opening the game clears its notifications from the device.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.getNotifications({ tag: `cs:/daily/${id}` }))
      .then((list) => list.forEach((n) => n.close()))
      .catch(() => { /* not supported */ });
  }, [id]);
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
    // Fallback if the instant connection drops: re-check every 4s while the
    // page is visible and it's the opponent's move (a tiny request).
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 4_000);
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

  // Look back through the game.
  const positions = useMemo(() => positionsFromSan(moveList), [moveList]);
  const browser = useMoveBrowser(positions, id);

  // Planning ahead while it's the opponent's turn: a premove and conditional lines.
  type Plan = { basePly: number; lines: string[][]; premove: { from: string; to: string; promotion?: string } | null };
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const waiting = !!game && game.status === 'active' && !myTurn;
  const loadPlan = useCallback(async () => {
    try { const r = await apiFetch(`/api/correspondence/games/${id}/plan`, { credentials: 'include' }); if (r.ok) setPlan((await r.json()).plan ?? null); } catch { /* ignore */ }
  }, [id]);
  useEffect(() => { if (waiting) void loadPlan(); else { setPlan(null); setPlanning(false); setDraft([]); } }, [waiting, game?.pgn, loadPlan]);
  const savePlan = async (next: { lines: string[][]; premove: Plan['premove'] }) => {
    setError('');
    try {
      const r = await apiFetch(`/api/correspondence/games/${id}/plan`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Could not save'); return; }
      setPlan(d.plan ?? null);
    } catch { setError('Connection problem — try again'); }
  };
  const planFen = useMemo(() => {
    if (!game) return null;
    try { const c = new Chess(game.fen); for (const s of draft) c.move(s); return c.fen(); } catch { return game.fen; }
  }, [game?.fen, draft]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {won && game.result !== 'draw' && game.termination !== 'aborted' && <RatePlayCard moment="Great win!" />}
      </div>
    );
  })();

  // Draw offers, errors and actions: left of the board on desktop, under it on phones.
  const messages = (
    <>
      {theyOffered && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3" style={{ background: PT.greenSoft, border: `1px solid ${PT.greenLine}` }}>
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
        <div className="flex flex-wrap justify-end gap-2 lg:justify-start">
          <button onClick={() => post('draw-offer')} disabled={sending || !!iOffered || !!theyOffered} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold disabled:opacity-50" style={ghostBtn}>
            <Handshake size={14} /> Offer draw
          </button>
          <button onClick={() => { if (confirm('Resign this game?')) void post('resign'); }} disabled={sending} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold" style={{ background: 'rgba(220,67,67,0.25)', color: PT.text, border: '1px solid rgba(220,67,67,0.5)' }}>
            <Flag size={14} /> Resign
          </button>
        </div>
      )}

    </>
  );

  return (
    <div className="mx-auto max-w-[620px] lg:max-w-[1080px] space-y-3 p-4 md:p-0 pb-24">
      <div className="flex items-center justify-between gap-3">
        <Link href="/daily" className="inline-flex items-center gap-1.5 text-sm" style={{ color: PT.muted }}><ArrowLeft size={16} /> Daily games</Link>
        <span className="text-[12px] font-bold" style={{ color: PT.muted }}>{dailyTcLabel(game.timeControl)} per move · {game.mode === 'ranked' ? 'Ranked' : 'Casual'}</span>
      </div>

      <Strip name={opp} rating={oppRating} side={white ? 'black' : 'white'} active={game.status === 'active' && !myTurn} />
      <MaterialStrip fen={game.fen} color={white ? 'b' : 'w'} className="px-1" />

      <ChessBoard
        fen={browser.viewing && browser.fen ? browser.fen : planning && planFen ? planFen : game.fen}
        flipped={!white}
        practiceMode={!browser.viewing && ((myTurn && !sending) || planning)}
        suppressConfirmMoves={planning}
        premoveMode={waiting && !planning && !browser.viewing}
        premoveColor={white ? 'w' : 'b'}
        premove={plan?.premove ? { from: plan.premove.from, to: plan.premove.to } : null}
        onPremoveSet={(p) => { void savePlan({ lines: plan?.lines ?? [], premove: p }); }}
        expectedMoveSan={null}
        onMovePlayed={(san) => {
          if (planning) { setDraft((d) => [...d, san]); return; }
          // show the move straight away, then confirm with the server
          try {
            const c = new Chess(); if (game.pgn) c.loadPgn(game.pgn);
            if (c.move(san)) setGame({ ...game, fen: c.fen(), pgn: c.pgn(), turnUserId: white ? game.blackUserId : game.whiteUserId });
          } catch { /* server will reject */ }
          void post('move', { san });
        }}
        lastMove={browser.viewing ? browser.lastMove : planning ? null : lastMove}
        moveQuality={null}
        boardOverlay={game.status === 'finished' && game.termination !== 'aborted' && !browser.viewing ? (() => {
          const won = (game.result === 'white' && white) || (game.result === 'black' && !white);
          const after = white ? game.whiteRatingAfter : game.blackRatingAfter;
          return (
            <GameOverOverlay
              gameKey={game.id}
              outcome={game.result === 'draw' ? 'draw' : won ? 'win' : 'loss'}
              yourColor={mySide}
              subtitle={HOW[game.termination ?? ''] ?? game.termination ?? undefined}
              ratingDelta={myRating != null && after != null ? after - myRating : null}
              delayMs={game.termination === 'checkmate' ? 500 : 250}
              actions={<>
                <OverlayButton primary onClick={() => navigate(reviewId ? `/games/${reviewId}` : '/games')}>Review game</OverlayButton>
                <OverlayButton onClick={() => navigate('/daily')}>Daily games</OverlayButton>
              </>}
            />
          );
        })() : null}
        sidePanel={{
          left: <div className="space-y-3">{messages}</div>,
          clocks: {
            top: { name: opp, text: game.status === 'active' && !myTurn ? formatLeft(left) : '—', active: game.status === 'active' && !myTurn, low: !myTurn && left < 3_600_000, moves: white ? Math.floor(moveList.length / 2) : Math.ceil(moveList.length / 2) },
            bottom: { name: 'You', text: myTurn ? formatLeft(left) : '—', active: myTurn, low: myTurn && left < 3_600_000, moves: white ? Math.ceil(moveList.length / 2) : Math.floor(moveList.length / 2) },
          },
          status: game.status !== 'active' ? 'Game over' : myTurn ? 'Your move' : `Waiting for ${opp}`,
        }}
      />

      <MaterialStrip fen={game.fen} color={white ? 'w' : 'b'} className="px-1" />
      <Strip name={`${you} (you)`} rating={myRating} side={white ? 'white' : 'black'} active={myTurn} />
      {!planning && <MoveBrowserBar browser={browser} yourTurn={myTurn} />}

      {/* Plan ahead while it's their move: a premove, and conditional moves. */}
      {waiting && !browser.viewing && (
        <div className="space-y-2.5 p-3.5" style={cardStyle}>
          {planning ? (
            <>
              <p className="flex items-center gap-2 text-[14px] font-extrabold" style={{ color: PT.text }}><GitBranch size={16} style={{ color: PT.green }} /> New conditional line</p>
              <p className="text-[12.5px]" style={{ color: PT.muted }}>
                {draft.length === 0 ? `On the board, play the move you expect from ${opp}.` : draft.length % 2 === 1 ? 'Now play your reply.' : `Saved as: if ${opp} plays these moves, your replies go in automatically. Keep going to plan further, or save.`}
              </p>
              <p className="min-h-[20px] text-[13.5px] font-bold" style={{ color: PT.text }}>
                {draft.map((m, i) => (i % 2 === 0 ? `If ${m} → ` : `${m}${i < draft.length - 1 ? ', then ' : ''}`)).join('')}
              </p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setDraft((d) => d.slice(0, -1))} disabled={!draft.length} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold disabled:opacity-40" style={ghostBtn}><Undo2 size={14} /> Undo</button>
                <button onClick={() => { void savePlan({ lines: [...(plan?.lines ?? []), draft], premove: plan?.premove ?? null }); setPlanning(false); setDraft([]); }}
                  disabled={draft.length < 2 || draft.length % 2 === 1} className="rounded-lg px-3.5 py-2 text-[12.5px] font-extrabold disabled:opacity-40" style={greenBtn}>Save line</button>
                <button onClick={() => { setPlanning(false); setDraft([]); }} className="rounded-lg px-3 py-2 text-[12.5px] font-bold" style={ghostBtn}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 text-[14px] font-extrabold" style={{ color: PT.text }}><GitBranch size={16} style={{ color: PT.green }} /> Plan ahead</p>
              <p className="text-[12.5px]" style={{ color: PT.muted }}>
                Premove: move a piece on the board now and it's played after {opp}'s move (if it's still legal). Conditional moves: "if {opp} plays this, I reply that", played for you automatically.
              </p>
              {plan?.premove && (
                <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(255,140,90,.12)', border: '1px solid rgba(255,140,90,.35)' }}>
                  <span className="text-[13px] font-bold" style={{ color: PT.text }}>Premove: {plan.premove.from} → {plan.premove.to}</span>
                  <button onClick={() => void savePlan({ lines: plan.lines, premove: null })} aria-label="Cancel premove" className="grid h-7 w-7 place-items-center rounded-md" style={ghostBtn}><X size={14} /></button>
                </div>
              )}
              {(plan?.lines ?? []).map((l, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: PT.greenSoft, border: `1px solid ${PT.greenLine}` }}>
                  <span className="min-w-0 text-[13px] font-bold" style={{ color: PT.text }}>{l.map((m, k) => (k % 2 === 0 ? `If ${m} → ` : `${m}${k < l.length - 1 ? ', then ' : ''}`)).join('')}</span>
                  <button onClick={() => void savePlan({ lines: plan!.lines.filter((_, k) => k !== i), premove: plan!.premove })} aria-label="Remove line" className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={ghostBtn}><X size={14} /></button>
                </div>
              ))}
              <button onClick={() => { setPlanning(true); setDraft([]); }} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-extrabold" style={greenBtn}>
                <GitBranch size={14} /> Add a conditional move
              </button>
            </>
          )}
        </div>
      )}

      {game.status === 'active' && (
        <p className="text-center text-[13px] font-bold" style={{ color: myTurn ? PT.green : PT.muted }}>
          {myTurn ? `Your move — ${formatLeft(left)} left` : `Waiting for ${opp} — ${formatLeft(left)} left on their clock`}
        </p>
      )}

      <div className="space-y-3 lg:hidden">{messages}</div>

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
