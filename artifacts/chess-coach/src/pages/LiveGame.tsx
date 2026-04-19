import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChessBoard } from '@/components/ChessBoard';
import { Chess } from 'chess.js';
import type { useLivePlay } from '@/hooks/use-live-play';
import { useMyGames } from '@/hooks/use-games';
import { Flag, ArrowLeft, Trophy, Clock, Handshake, X, Wifi, WifiOff, BookOpen } from 'lucide-react';
import { useLocation } from 'wouter';

const CHESSCOM_GREEN = '#81b64c';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';

function fmtClock(ms: number): string {
  if (ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 1 || ms < 10_000) return `${m}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;
}

function PlayerStrip({ p, ms, active, isYou }: { p: { username: string; rating: number; country?: string; title?: string | null; avatar?: string }; ms: number; active: boolean; isYou: boolean }) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-xl"
      style={{ background: active ? 'rgba(129,182,76,0.12)' : 'rgba(255,255,255,0.04)', border: active ? `1px solid ${CHESSCOM_GREEN}` : '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 min-w-0">
        {p.avatar
          ? <img src={p.avatar} alt={p.username} className="w-9 h-9 rounded-full object-cover bg-white/10" style={{ border: '1px solid rgba(255,255,255,0.15)' }} />
          : <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm" style={{ background: 'rgba(129,182,76,0.18)', color: CHESSCOM_GREEN }}>{p.username[0]?.toUpperCase()}</div>}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {p.title && <span className="text-[10px] font-black px-1 py-0.5 rounded text-black" style={{ background: 'linear-gradient(135deg,#f5c460,#e5a631)' }}>{p.title}</span>}
            {p.country && <span className="text-[10px]" style={{ color: TEXT_MUTED }}>{p.country}</span>}
            {isYou && <span className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: CHESSCOM_GREEN }}>You</span>}
          </div>
          <p className="text-sm font-bold truncate" style={{ color: TEXT_LIGHT }}>{p.username}</p>
          <p className="text-[10px]" style={{ color: TEXT_MUTED }}>{Math.round(p.rating)} ELO</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono font-black tabular-nums text-lg"
        style={{ background: active ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)', color: ms < 10_000 ? '#ec6b6b' : TEXT_LIGHT }}>
        <Clock className="w-3.5 h-3.5" /> {fmtClock(ms)}
      </div>
    </div>
  );
}

export function LiveGame({ live, onLeave }: { live: ReturnType<typeof useLivePlay>; onLeave: () => void }) {
  const { game, color, move, resign, status, opponentDisconnect, premove, setPremove, offerDraw, acceptDraw, declineDraw } = live;
  const [, navigate] = useLocation();
  const [tick, setTick] = useState(0);
  const { data: myGames, refetch: refetchGames } = useMyGames(1);
  useEffect(() => { if (game?.status === 'finished') void refetchGames(); }, [game?.status, refetchGames]);
  const reviewId = myGames?.games?.[0]?.id;

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  const snapshotRef = useRef<{ at: number; whiteTimeMs: number; blackTimeMs: number; turn: 'w' | 'b'; status: string }>({ at: Date.now(), whiteTimeMs: 0, blackTimeMs: 0, turn: 'w', status: 'active' });
  useEffect(() => {
    if (game) snapshotRef.current = { at: Date.now(), whiteTimeMs: game.whiteTimeMs, blackTimeMs: game.blackTimeMs, turn: game.turn, status: game.status };
  }, [game?.whiteTimeMs, game?.blackTimeMs, game?.turn, game?.status, game?.id]);

  const liveClocks = useMemo(() => {
    const snap = snapshotRef.current;
    if (!game) return { white: 0, black: 0 };
    if (snap.status !== 'active') return { white: snap.whiteTimeMs, black: snap.blackTimeMs };
    const elapsed = Date.now() - snap.at;
    if (snap.turn === 'w') return { white: Math.max(0, snap.whiteTimeMs - elapsed), black: snap.blackTimeMs };
    return { white: snap.whiteTimeMs, black: Math.max(0, snap.blackTimeMs - elapsed) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, game?.id, game?.fen, game?.status]);

  const lastMoveSquares = useMemo(() => {
    if (!game || game.sanMoves.length === 0) return null;
    try {
      const c = new Chess();
      for (let i = 0; i < game.sanMoves.length - 1; i++) c.move(game.sanMoves[i]);
      const m = c.move(game.sanMoves[game.sanMoves.length - 1]);
      return m ? { from: m.from, to: m.to } : null;
    } catch { return null; }
  }, [game?.sanMoves]);

  // When it becomes our turn and we have a stored premove, attempt to play it.
  const lastFenForPremove = useRef<string | null>(null);
  useEffect(() => {
    if (!game || !color || game.status !== 'active') return;
    if (game.turn !== color) return;
    if (!premove) return;
    if (lastFenForPremove.current === game.fen) return;
    lastFenForPremove.current = game.fen;
    try {
      const c = new Chess(game.fen);
      const m = c.move({ from: premove.from, to: premove.to, promotion: 'q' });
      if (m) move(m.san);
    } catch {}
    setPremove(null);
  }, [game?.fen, game?.turn, game?.status, color, premove, move, setPremove]);

  if (!game || !color) {
    return <div className="p-8 text-center" style={{ color: TEXT_MUTED }}>Loading…</div>;
  }

  const isPlayerTurn = game.status === 'active' && game.turn === color;
  const youAreWhite = color === 'w';
  const top = youAreWhite ? game.black : game.white;
  const bottom = youAreWhite ? game.white : game.black;
  const topMs = youAreWhite ? liveClocks.black : liveClocks.white;
  const bottomMs = youAreWhite ? liveClocks.white : liveClocks.black;
  const topActive = game.status === 'active' && game.turn !== color;
  const bottomActive = game.status === 'active' && game.turn === color;

  const onMovePlayed = (san: string) => { move(san); };

  const opponentOfferedDraw = game.drawOfferFrom && game.drawOfferFrom !== color;
  const youOfferedDraw = game.drawOfferFrom && game.drawOfferFrom === color;

  const resultBanner = (() => {
    if (game.status !== 'finished') return null;
    const youWon = (game.result === 'white' && youAreWhite) || (game.result === 'black' && !youAreWhite);
    const draw = game.result === 'draw';
    const title = draw ? 'Draw' : youWon ? 'You Won!' : 'You Lost';
    const accent = draw ? '#9e9b98' : youWon ? CHESSCOM_GREEN : '#ec6b6b';
    const myDelta = youAreWhite ? game.ratingDelta?.white : game.ratingDelta?.black;
    return (
      <div className="rounded-2xl p-5 text-center space-y-3"
        style={{ background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)', border: `1px solid ${accent}55` }}>
        <Trophy className="w-8 h-8 mx-auto" style={{ color: accent }} />
        <div>
          <p className="text-xl font-black" style={{ color: TEXT_LIGHT }}>{title}</p>
          <p className="text-xs mt-1 capitalize" style={{ color: TEXT_MUTED }}>by {String(game.termination ?? '').replace(/_/g, ' ')}</p>
        </div>
        {game.mode === 'ranked' && typeof myDelta === 'number' && myDelta !== 0 ? (
          <p className="text-sm font-bold" style={{ color: myDelta > 0 ? CHESSCOM_GREEN : '#ec6b6b' }}>
            {myDelta > 0 ? '+' : ''}{myDelta} ELO
          </p>
        ) : (
          <p className="text-xs" style={{ color: TEXT_MUTED }}>{game.mode === 'casual' ? 'Casual game — no rating change' : ''}</p>
        )}
        <div className="flex justify-center gap-2 pt-2 flex-wrap">
          <button onClick={onLeave}
            className="px-4 py-2 rounded-lg font-black text-xs"
            style={{ background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)`, color: 'white' }}>
            Play Again
          </button>
          <button onClick={() => navigate(reviewId ? `/games/${reviewId}` : '/games')}
            disabled={!reviewId}
            className="px-4 py-2 rounded-lg font-black text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: 'rgba(129,182,76,0.18)', color: CHESSCOM_GREEN, border: '1px solid rgba(129,182,76,0.4)' }}>
            <BookOpen className="w-3.5 h-3.5" /> Review Game
          </button>
          <button onClick={() => navigate('/games')}
            className="px-4 py-2 rounded-lg font-black text-xs"
            style={{ background: 'rgba(255,255,255,0.08)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}>
            All My Games
          </button>
        </div>
      </div>
    );
  })();

  return (
    <div className="p-4 md:p-0 space-y-3 max-w-2xl mx-auto">
      <button onClick={onLeave} className="inline-flex items-center gap-1.5 text-sm" style={{ color: TEXT_MUTED }}>
        <ArrowLeft className="w-4 h-4" /> Lobby
      </button>

      <PlayerStrip p={top} ms={topMs} active={topActive} isYou={false} />

      {opponentDisconnect && opponentDisconnect.side !== color && (
        <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
          style={{ background: 'rgba(234,151,51,0.1)', color: '#ea9733', border: '1px solid rgba(234,151,51,0.3)' }}>
          <WifiOff className="w-3.5 h-3.5" /> Opponent disconnected. They have ~{Math.max(0, Math.ceil((opponentDisconnect.until - Date.now()) / 1000))}s to reconnect.
        </div>
      )}

      <ChessBoard
        fen={game.fen}
        flipped={!youAreWhite}
        practiceMode={isPlayerTurn}
        expectedMoveSan={null}
        onMovePlayed={onMovePlayed}
        lastMove={lastMoveSquares}
        moveQuality={null}
        premoveMode={!isPlayerTurn && game.status === 'active'}
        premoveColor={color}
        premove={premove}
        onPremoveSet={(p) => setPremove(p)}
      />

      {premove && !isPlayerTurn && (
        <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
          style={{ background: 'rgba(255,140,90,0.12)', color: '#ff8c5a', border: '1px solid rgba(255,140,90,0.35)' }}>
          <span>Premove: {premove.from} → {premove.to}</span>
          <button onClick={() => setPremove(null)} className="font-bold inline-flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
        </div>
      )}

      <PlayerStrip p={bottom} ms={bottomMs} active={bottomActive} isYou={true} />

      {opponentOfferedDraw && (
        <div className="rounded-lg p-3 flex items-center justify-between gap-3"
          style={{ background: 'rgba(129,182,76,0.12)', border: '1px solid rgba(129,182,76,0.4)' }}>
          <span className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>Opponent offered a draw.</span>
          <div className="flex gap-2">
            <button onClick={acceptDraw}
              className="px-3 py-1.5 rounded-lg text-xs font-black"
              style={{ background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)`, color: 'white' }}>Accept</button>
            <button onClick={declineDraw}
              className="px-3 py-1.5 rounded-lg text-xs font-black"
              style={{ background: 'rgba(255,255,255,0.08)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}>Decline</button>
          </div>
        </div>
      )}
      {youOfferedDraw && (
        <div className="rounded-lg p-2 text-xs text-center" style={{ background: 'rgba(255,255,255,0.04)', color: TEXT_MUTED }}>
          Draw offer sent — waiting for opponent's reply.
        </div>
      )}

      {game.status === 'active' && (
        <div className="flex justify-end gap-2">
          <button onClick={offerDraw} disabled={!!youOfferedDraw}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
            style={{ background: 'rgba(129,182,76,0.12)', color: CHESSCOM_GREEN, border: '1px solid rgba(129,182,76,0.3)' }}>
            <Handshake className="w-3.5 h-3.5" /> Offer Draw
          </button>
          <button onClick={() => { if (confirm('Resign this game?')) resign(); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold"
            style={{ background: 'rgba(220,67,67,0.15)', color: '#dc4343', border: '1px solid rgba(220,67,67,0.3)' }}>
            <Flag className="w-3.5 h-3.5" /> Resign
          </button>
        </div>
      )}

      {resultBanner}
    </div>
  );
}
