import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChessBoard } from '@/components/ChessBoard';
import { EvalBar, MaterialStrip } from '@/components/GameStatusStrip';
import { Chess } from 'chess.js';
import type { useLivePlay } from '@/hooks/use-live-play';
import { Flag, ArrowLeft, Trophy, Clock, Handshake, X, WifiOff, BookOpen, RotateCcw } from 'lucide-react';
import { GameOverOverlay, OverlayButton, describeEnding } from '@/components/GameOverOverlay';
import { useLocation } from 'wouter';

import { PT } from '@/lib/playTheme';
const CHESSCOM_GREEN = PT.green;
const TEXT_LIGHT = PT.text;
const TEXT_MUTED = PT.muted;

function fmtClock(ms: number): string {
  if (ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 1 || ms < 10_000) return `${m}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;
}

function countryToFlag(code?: string): string | null {
  if (!code) return null;
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const A = 0x1F1E6;
  return String.fromCodePoint(A + (cc.charCodeAt(0) - 65), A + (cc.charCodeAt(1) - 65));
}

function awayText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `Away · 0:${String(s).padStart(2, '0')}`;
}

function PlayerStrip({ p, ms, active, isYou, awayMs }: { p: { username: string; rating: number; country?: string; title?: string | null; avatar?: string; isBot?: boolean }; ms: number; active: boolean; isYou: boolean; awayMs?: number | null }) {
  const flag = countryToFlag(p.country);
  return (
    <div className="flex items-center justify-between p-2.5 rounded-xl"
      style={{ background: active ? PT.greenSoft : 'rgba(255,255,255,0.04)', border: active ? `1px solid ${CHESSCOM_GREEN}` : '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 min-w-0">
        {p.avatar
          ? <img src={p.avatar} alt={p.username} className="w-9 h-9 rounded-full object-cover bg-white/10" style={{ border: '1px solid rgba(255,255,255,0.15)' }} />
          : <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm" style={{ background: 'rgba(129,182,76,0.18)', color: CHESSCOM_GREEN }}>{p.username[0]?.toUpperCase()}</div>}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {p.title && <span className="text-[10px] font-black px-1 py-0.5 rounded text-black" style={{ background: 'linear-gradient(135deg,#f5c460,#e5a631)' }}>{p.title}</span>}
            {p.isBot && <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: 'rgba(255,255,255,0.12)', color: TEXT_LIGHT }}>Bot</span>}
            {flag && <span className="text-sm leading-none" title={p.country ?? undefined} aria-label={p.country ?? undefined}>{flag}</span>}
            {p.country && <span className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>{p.country}</span>}
            {isYou && <span className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: CHESSCOM_GREEN }}>You</span>}
          </div>
          <p className="text-sm font-bold truncate" style={{ color: TEXT_LIGHT }}>{p.username}</p>
          <p className="text-[10px]" style={{ color: TEXT_MUTED }}>{Math.round(p.rating)} ELO</p>
        </div>
      </div>
      {typeof awayMs === 'number' && (
        <span className="mr-2 shrink-0 animate-pulse rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider lg:hidden"
          style={{ background: '#E5484D', color: '#fff' }}>
          {awayText(awayMs)}
        </span>
      )}
      <div className="flex lg:hidden items-center gap-1.5 px-3 py-2 rounded-lg font-mono font-black tabular-nums text-lg"
        style={{ background: active ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)', color: ms < 10_000 ? '#ec6b6b' : TEXT_LIGHT }}>
        <Clock className="w-3.5 h-3.5" /> {fmtClock(ms)}
      </div>
    </div>
  );
}

export function LiveGame({ live, onLeave }: { live: ReturnType<typeof useLivePlay>; onLeave: () => void }) {
  const { game, color, move, resign, premove, setPremove, offerDraw, acceptDraw, declineDraw, serverOffset, notice, offerRematch, declineRematch } = live;
  const [, navigate] = useLocation();
  const [tick, setTick] = useState(0);
  const reviewId = game?.dbGameIds && color
    ? (color === 'w' ? game.dbGameIds.white : game.dbGameIds.black)
    : undefined;

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

  // Abandonment countdowns (ms left before that side loses), synced to the server clock.
  const oppColor: 'w' | 'b' = youAreWhite ? 'b' : 'w';
  const awayLeft = (side: 'w' | 'b'): number | null => {
    const a = game.status === 'active' ? game.away?.[side] : undefined;
    return a ? Math.max(0, a.deadline - (Date.now() + serverOffset)) : null;
  };
  const oppAwayMs = awayLeft(oppColor);
  const myAwayMs = awayLeft(color);
  const oppAwayReason = game.away?.[oppColor]?.reason;

  const opponentOfferedDraw = game.drawOfferFrom && game.drawOfferFrom !== color;
  const youOfferedDraw = game.drawOfferFrom && game.drawOfferFrom === color;

  const finished = game.status === 'finished';
  const youWonGame = (game.result === 'white' && youAreWhite) || (game.result === 'black' && !youAreWhite);
  const outcome: 'win' | 'loss' | 'draw' = game.result === 'draw' ? 'draw' : youWonGame ? 'win' : 'loss';
  const myRatingDelta = game.mode === 'ranked' ? (youAreWhite ? game.ratingDelta?.white : game.ratingDelta?.black) : null;
  const opponentIsBot = (youAreWhite ? game.black : game.white).isBot;
  const rematchAskedByOpp = finished && !!game.rematchFrom && game.rematchFrom !== color;
  const rematchAskedByMe = finished && game.rematchFrom === color;
  const rematchButtons = rematchAskedByOpp ? (
    <>
      <OverlayButton primary onClick={offerRematch}><RotateCcw className="w-4 h-4" /> Accept rematch</OverlayButton>
      <OverlayButton onClick={declineRematch}>Decline</OverlayButton>
    </>
  ) : (
    <OverlayButton primary onClick={offerRematch} disabled={rematchAskedByMe}>
      <RotateCcw className="w-4 h-4" /> {rematchAskedByMe ? 'Rematch sent — waiting…' : 'Rematch'}
    </OverlayButton>
  );

  const resultBanner = (() => {
    if (game.status !== 'finished') return null;
    const youWon = (game.result === 'white' && youAreWhite) || (game.result === 'black' && !youAreWhite);
    const draw = game.result === 'draw';
    const title = draw ? 'Draw' : youWon ? 'You Won!' : 'You Lost';
    const accent = draw ? '#9e9b98' : youWon ? CHESSCOM_GREEN : '#ec6b6b';
    const myDelta = youAreWhite ? game.ratingDelta?.white : game.ratingDelta?.black;
    return (
      <div className="rounded-2xl p-5 text-center space-y-3"
        style={{ background: PT.card, border: `1px solid ${accent}55` }}>
        <Trophy className="w-8 h-8 mx-auto" style={{ color: accent }} />
        <div>
          <p className="text-xl font-black" style={{ color: TEXT_LIGHT }}>{title}</p>
          <p className="text-xs mt-1 first-letter:uppercase" style={{ color: TEXT_MUTED }}>{describeEnding(game.termination, draw ? 'draw' : youWon ? 'win' : 'loss')}</p>
        </div>
        {game.mode === 'ranked' && typeof myDelta === 'number' && myDelta !== 0 ? (
          <p className="text-sm font-bold" style={{ color: myDelta > 0 ? CHESSCOM_GREEN : '#ec6b6b' }}>
            {myDelta > 0 ? '+' : ''}{myDelta} ELO
          </p>
        ) : (
          <p className="text-xs" style={{ color: TEXT_MUTED }}>{game.mode === 'casual' ? 'Casual game — no rating change' : ''}</p>
        )}
        {rematchAskedByOpp && (
          <p className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>{opponentIsBot ? 'The bot' : 'Your opponent'} wants a rematch!</p>
        )}
        {notice && <p className="text-xs font-bold" style={{ color: '#ec6b6b' }}>{notice}</p>}
        <div className="mx-auto flex max-w-[320px] flex-col gap-2">{rematchButtons}</div>
        <div className="flex justify-center gap-2 pt-2 flex-wrap">
          <button onClick={onLeave}
            className="px-4 py-2 rounded-lg font-black text-xs"
            style={{ background: CHESSCOM_GREEN, color: PT.onGreen }}>
            New Opponent
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

  // Game messages + actions. On desktop they sit in the panel left of the
  // board (they were getting pushed off-screen below it); on phones they stay
  // under the board as before.
  const messages = (
    <>
      {oppAwayMs !== null && (
        <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
          style={{ background: 'rgba(229,72,77,0.3)', color: '#ffffff', border: '1px solid rgba(229,72,77,0.6)' }}>
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>{oppAwayReason === 'offline' ? 'Opponent lost connection.' : 'Opponent left the game.'} They lose by abandonment in <b>{Math.ceil(oppAwayMs / 1000)}s</b> unless they come back.</span>
        </div>
      )}
      {myAwayMs !== null && (
        <div className="rounded-lg px-3 py-2 text-xs font-bold"
          style={{ background: 'rgba(229,72,77,0.3)', color: '#ffffff', border: '1px solid rgba(229,72,77,0.6)' }}>
          Stay on this screen — leaving a timed game for 30 seconds loses it ({Math.ceil(myAwayMs / 1000)}s left).
        </div>
      )}
      {finished && notice && (
        <div className="rounded-lg px-3 py-2 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: TEXT_LIGHT }}>{notice}</div>
      )}
      {premove && !isPlayerTurn && (
        <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
          style={{ background: 'rgba(255,140,90,0.35)', color: '#ffffff', border: '1px solid rgba(255,140,90,0.35)' }}>
          <span>Premove: {premove.from} → {premove.to}</span>
          <button onClick={() => setPremove(null)} className="font-bold inline-flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
        </div>
      )}
      {opponentOfferedDraw && (
        <div className="rounded-lg p-3 space-y-2"
          style={{ background: PT.greenSoft, border: `1px solid ${PT.greenLine}` }}>
          <span className="block text-sm font-bold" style={{ color: TEXT_LIGHT }}>Opponent offered a draw.</span>
          <div className="flex gap-2">
            <button onClick={acceptDraw} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-black" style={{ background: CHESSCOM_GREEN, color: PT.onGreen }}>Accept</button>
            <button onClick={declineDraw} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-black" style={{ background: 'rgba(255,255,255,0.08)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}>Decline</button>
          </div>
        </div>
      )}
      {youOfferedDraw && (
        <div className="rounded-lg p-2 text-xs text-center" style={{ background: 'rgba(255,255,255,0.04)', color: TEXT_MUTED }}>
          Draw offer sent — waiting for opponent's reply.
        </div>
      )}
      {game.status === 'active' && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={offerDraw} disabled={!!youOfferedDraw || !!opponentOfferedDraw || game.turn !== color}
            title={game.turn !== color ? 'You can only offer a draw on your own turn' : 'Offer your opponent a draw'}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
            style={{ background: PT.greenSoft, color: CHESSCOM_GREEN, border: `1px solid ${PT.greenLine}` }}>
            <Handshake className="w-3.5 h-3.5" /> Offer Draw
          </button>
          <button onClick={() => { if (confirm('Resign this game?')) resign(); }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold"
            style={{ background: 'rgba(220,67,67,0.35)', color: '#ffffff', border: '1px solid rgba(220,67,67,0.6)' }}>
            <Flag className="w-3.5 h-3.5" /> Resign
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="p-4 md:p-0 space-y-3 max-w-2xl lg:max-w-[1120px] mx-auto">
      <button onClick={onLeave} className="inline-flex items-center gap-1.5 text-sm" style={{ color: TEXT_MUTED }}>
        <ArrowLeft className="w-4 h-4" /> Lobby
      </button>

      <PlayerStrip p={top} ms={topMs} active={topActive} isYou={false} awayMs={oppAwayMs} />
      <MaterialStrip fen={game.fen} color={youAreWhite ? 'b' : 'w'} className="px-1" />

      {/* Engine evaluation only after the game -- showing it during a game
          against a real person would be an engine aid. */}
      {game.status === 'finished' && <EvalBar fen={game.fen} />}

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
        boardOverlay={finished ? (
          <GameOverOverlay
            gameKey={game.id}
            outcome={outcome}
            subtitle={describeEnding(game.termination, outcome)}
            ratingDelta={myRatingDelta}
            delayMs={game.termination === 'checkmate' ? 1400 : 250}
            actions={<>
              {rematchAskedByOpp && <p className="text-[13px] font-bold" style={{ color: '#EDEDED' }}>{opponentIsBot ? 'The bot' : 'Your opponent'} wants a rematch!</p>}
              {notice && <p className="text-[12px] font-bold" style={{ color: '#ec6b6b' }}>{notice}</p>}
              {rematchButtons}
              {reviewId && <OverlayButton onClick={() => navigate(`/games/${reviewId}`)}><BookOpen className="w-4 h-4" /> Review game</OverlayButton>}
              <OverlayButton onClick={onLeave}>New opponent</OverlayButton>
            </>}
          />
        ) : null}
        sidePanel={{
          left: <div className="space-y-3">{messages}</div>,
          clocks: {
            top: { name: top.username, text: fmtClock(topMs), active: topActive, low: topMs < 10_000, alert: oppAwayMs !== null ? awayText(oppAwayMs) : undefined, moves: youAreWhite ? Math.floor(game.sanMoves.length / 2) : Math.ceil(game.sanMoves.length / 2) },
            bottom: { name: 'You', text: fmtClock(bottomMs), active: bottomActive, low: bottomMs < 10_000, alert: myAwayMs !== null ? awayText(myAwayMs) : undefined, moves: youAreWhite ? Math.ceil(game.sanMoves.length / 2) : Math.floor(game.sanMoves.length / 2) },
          },
          status: game.status !== 'active' ? 'Game over' : isPlayerTurn ? 'Your move' : 'Opponent to move',
        }}
      />

      <MaterialStrip fen={game.fen} color={youAreWhite ? 'w' : 'b'} className="px-1" />
      <PlayerStrip p={bottom} ms={bottomMs} active={bottomActive} isYou={true} awayMs={myAwayMs} />

      <div className="space-y-3 lg:hidden">{messages}</div>

      {resultBanner}
    </div>
  );
}
