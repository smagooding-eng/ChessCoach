import React, { useState, useCallback, useMemo, useRef, useEffect, Component, type ReactNode } from 'react';
import { Chessboard, defaultPieces } from 'react-chessboard';
import { Chess } from 'chess.js';
import { normalizeFen, getPieceColorScheme } from '@/lib/utils';
import { buildTintedPieceSet } from './RecoloredPieces';
import { PieceGradientDefs } from './PieceGradientDefs';
import { useSettings, playMoveSound, boardSkin } from '@/context/SettingsContext';
import { eventForMove, detectSingleMove } from '@/lib/sounds';
import { SquareBadge } from './SquareBadge';
import { CheckmateOverlay } from './CheckmateOverlay';

class BoardErrorBoundary extends Component<
  { children: ReactNode; position: string; renderKey: number },
  { hasError: boolean; retryCount: number; lastError: string | null }
> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private static MAX_RETRIES = 8;

  constructor(props: { children: ReactNode; position: string; renderKey: number }) {
    super(props);
    this.state = { hasError: false, retryCount: 0, lastError: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, lastError: error?.message ?? '' };
  }

  componentDidCatch(error: Error) {
    const isKnown = error.message?.includes('Square width') ||
                    error.message?.includes('Cannot read properties of undefined');
    if (!isKnown) {
      console.error('[ChessBoard] Unexpected error:', error.message);
    }
    if (this.state.retryCount < BoardErrorBoundary.MAX_RETRIES) {
      const delay = 100 + this.state.retryCount * 50;
      this.retryTimer = setTimeout(() => {
        this.setState(s => ({ hasError: false, retryCount: s.retryCount + 1 }));
      }, delay);
    }
  }

  componentDidUpdate(prevProps: { position: string; renderKey: number }) {
    if (this.state.hasError && prevProps.position !== this.props.position) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.setState({ hasError: false, retryCount: 0, lastError: null });
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.hasError) {
      return <div style={{ aspectRatio: '1', width: '100%', background: 'transparent' }} />;
    }
    return this.props.children;
  }
}

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type MoveQuality = 'checkmate' | 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder' | 'missed_win';

const QUALITY_COLOR: Record<MoveQuality, string> = {
  checkmate:   'rgba(255, 215, 0, 0.70)',
  brilliant:   'rgba(0, 220, 240, 0.60)',
  great:       'rgba(56, 189, 248, 0.60)',
  best:        'rgba(50, 210, 110, 0.60)',
  excellent:   'rgba(45, 212, 191, 0.55)',
  good:        'rgba(100, 200, 80, 0.50)',
  book:        'rgba(90, 140, 255, 0.55)',
  inaccuracy:  'rgba(255, 215, 40, 0.60)',
  mistake:     'rgba(255, 130, 20, 0.65)',
  blunder:     'rgba(220, 50, 50, 0.70)',
  missed_win:  'rgba(239, 68, 68, 0.65)',
};

const QUALITY_LABEL: Record<MoveQuality, { text: string; icon: string }> = {
  checkmate:   { text: 'Checkmate!',    icon: '♚' },
  brilliant:   { text: 'Brilliant!!',   icon: '✦' },
  great:       { text: 'Great Move!',   icon: '!' },
  best:        { text: 'Best Move!',    icon: '!' },
  excellent:   { text: 'Excellent!',    icon: '!' },
  good:        { text: 'Good Move',     icon: '!' },
  book:        { text: 'Book Move',     icon: '📖' },
  inaccuracy:  { text: 'Inaccuracy',    icon: '?!' },
  mistake:     { text: 'Mistake',       icon: '?' },
  blunder:     { text: 'Blunder??',     icon: '??' },
  missed_win:  { text: 'Missed Win',    icon: '✗' },
};

// Solid badge colours + short glyphs for the corner marker on the destination square.
const QUALITY_BADGE: Record<MoveQuality, string> = {
  checkmate: '#C9971C', brilliant: '#1BACA6', great: '#4A8BD6', best: '#5FA83A', excellent: '#7DB94A',
  good: '#8AA86E', book: '#A88865', inaccuracy: '#E3AE2A', mistake: '#E5822A', blunder: '#CA3431', missed_win: '#B8343E',
};
const QUALITY_GLYPH: Record<MoveQuality, string> = {
  checkmate: '#', brilliant: '!!', great: '!', best: '★', excellent: '!', good: '✓', book: '📖',
  inaccuracy: '?!', mistake: '?', blunder: '??', missed_win: '✗',
};

interface ChessBoardProps {
  fen?: string | null;
  flipped?: boolean;
  practiceMode?: boolean;
  expectedMoveSan?: string | null;
  onMovePlayed?: (san: string, isCorrect: boolean) => void;
  lastMove?: { from: string; to: string } | null;
  moveQuality?: MoveQuality | null;
  // Premove: allow user to set a planned move while it's not their turn.
  premoveMode?: boolean;
  premoveColor?: 'w' | 'b';
  premove?: { from: string; to: string } | null;
  onPremoveSet?: (premove: { from: string; to: string } | null) => void;
  // Board arrows — e.g. the move actually played vs. the engine's
  // preferred move, shown simultaneously in different colors.
  arrows?: Array<{ from: string; to: string; color?: string }>;
  // Overrides the user's normal Settings board-size preference for
  // special contexts (e.g. a dedicated fullscreen game view) where the
  // board should genuinely dominate the screen regardless of their
  // general in-app size choice. Accepts any valid CSS max-width value.
  maxWidthOverride?: string | number;
  // Suppresses ChessBoard's own generic confirm-move staging even if the
  // user has that setting on globally -- for contexts that have their
  // own dedicated confirmation mechanic (e.g. Local Play's tap-your-clock
  // flow), where showing both at once would be redundant/conflicting.
  suppressConfirmMoves?: boolean;
  /** Keep the confirm-bar's space under the board even when no move is
   *  staged, so the page doesn't shift every time it appears/disappears. */
  reserveConfirmSpace?: boolean;
}

export function ChessBoard({
  fen,
  flipped = false,
  practiceMode = false,
  expectedMoveSan,
  onMovePlayed,
  lastMove,
  moveQuality,
  premoveMode = false,
  premoveColor,
  premove,
  onPremoveSet,
  arrows,
  maxWidthOverride,
  suppressConfirmMoves = false,
  reserveConfirmSpace = false,
}: ChessBoardProps) {
  const { confirmMoves, boardColors, boardTextureCss, showCoordinates, showLegalMoves, pieceColors, pieceShape, pieceStyle, soundEnabled, promotionChoice, boardMaxWidth: settingsMaxWidth } = useSettings();
  const boardMaxWidth = maxWidthOverride ?? settingsMaxWidth;
  const confirmMovesRef = useRef(confirmMoves);
  confirmMovesRef.current = confirmMoves;
  const suppressConfirmMovesRef = useRef(suppressConfirmMoves);
  suppressConfirmMovesRef.current = suppressConfirmMoves;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const promotionChoiceRef = useRef(promotionChoice);
  promotionChoiceRef.current = promotionChoice;
  const position = normalizeFen(fen || START_FEN);

  // Checkmate indicator, computed directly from the current position --
  // works automatically in every context ChessBoard is used (Local Play,
  // Practice Bots, Game Review, Live Game) with zero extra wiring needed
  // from callers, since it only depends on the fen prop already passed
  // everywhere. Finds both kings' squares so a badge can render directly
  // on the board itself instead of a separate result banner elsewhere.
  const checkmateInfo = useMemo(() => {
    try {
      const c = new Chess(position);
      if (!c.isCheckmate()) return null;
      const losingColor = c.turn(); // side to move when checkmated = the losing side
      const winningColor = losingColor === 'w' ? 'b' : 'w';
      const board = c.board();
      let losingKingSquare: string | null = null;
      let winningKingSquare: string | null = null;
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const sq = board[r][f];
          if (sq?.type === 'k') {
            const square = `${'abcdefgh'[f]}${8 - r}`;
            if (sq.color === losingColor) losingKingSquare = square;
            else winningKingSquare = square;
          }
        }
      }
      if (!losingKingSquare || !winningKingSquare) return null;
      return { losingKingSquare, winningKingSquare };
    } catch {
      return null;
    }
  }, [position]);

  // Converts a square like "e1" into a percentage-based position within
  // the board container, accounting for board orientation -- percentage
  // based so it scales correctly at any board size without needing to
  // know pixel dimensions.
  function squareToPercent(square: string): { left: string; top: string } {
    const file = square.charCodeAt(0) - 97; // 'a' -> 0
    const rank = parseInt(square[1], 10) - 1; // '1' -> 0
    const col = flipped ? 7 - file : file;
    const row = flipped ? rank : 7 - rank;
    return { left: `${col * 12.5}%`, top: `${row * 12.5}%` };
  }

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMovePlayedRef = useRef(onMovePlayed);
  onMovePlayedRef.current = onMovePlayed;
  const positionRef = useRef(position);
  positionRef.current = position;

  // Voice moves that arrive from outside (bot/opponent replies, stepping forward
  // through a game, auto-played drill replies). Only a change that is exactly one
  // legal move sounds -- jumps, resets and stepping backwards stay silent -- and the
  // user's own move (already voiced in finishMove) is skipped.
  const userMoveFenRef = useRef<string | null>(null);
  const soundPrevRef = useRef(position);
  useEffect(() => {
    const prev = soundPrevRef.current;
    soundPrevRef.current = position;
    if (prev === position) return;
    const placed = position.split(' ')[0];
    if (userMoveFenRef.current === placed) { userMoveFenRef.current = null; return; }
    if (!soundEnabledRef.current) return;
    const hit = detectSingleMove(prev, position);
    if (hit) playMoveSound(eventForMove(hit.move, hit.after));
  }, [position]);
  const expectedMoveSanRef = useRef(expectedMoveSan);
  expectedMoveSanRef.current = expectedMoveSan;
  // When "Confirm Moves" is on, a legal move is staged here (shown on the
  // board immediately for feedback) but not actually committed via
  // onMovePlayed until the player taps Confirm.
  const [pendingMove, setPendingMove] = useState<{ from: string; to: string; san: string; isCorrect: boolean; tempFen: string } | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: string; to: string } | null>(null);

  // Computed once, referenced both by the recolored piece set below and
  // by the gradient <defs> in the render output further down. baseLight/
  // baseDark are always a real hex (unlike pieceColors.light/dark, which
  // is a url(#...) gradient reference for the four 3D-look presets), so
  // this works the same way for every style, not just custom colors.
  const pieceSchemes = useMemo(
    () => ({ light: getPieceColorScheme(pieceColors.baseLight), dark: getPieceColorScheme(pieceColors.baseDark) }),
    [pieceColors.baseLight, pieceColors.baseDark],
  );

  // Now built by the one shared function every board calls -- see
  // buildTintedPieceSet in RecoloredPieces.tsx for why (Puzzles.tsx used
  // to have its own hand-copied version of this loop, and kept showing
  // pieces with no fill in production for a cause never pinned down
  // despite the two copies looking identical -- removing the duplication
  // outright means there's no second copy left to diverge).
  const tintedPieces = useMemo(
    () => buildTintedPieceSet({ pieceColors, pieceShape, pieceStyle, useGradientForCustom: true }) as unknown as typeof defaultPieces,
    [pieceColors, pieceShape, pieceStyle],
  );
  const skin = boardSkin(boardColors, boardTextureCss);


  useEffect(() => {
    return () => { if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current); };
  }, []);

  const [prevPosition, setPrevPosition] = useState(position);
  if (position !== prevPosition) {
    setPrevPosition(position);
    setSelectedSquare(null);
    setFeedback(null);
    setPendingMove(null);
    setPromotionPending(null);
  }

  // Tracks whether a confirm is currently being processed, purely for
  // immediate visual feedback -- separate from pendingMove itself so the
  // button can visibly react the instant it's tapped, before the
  // pendingMove state clears and the whole overlay unmounts. Real user
  // analytics showed this exact button getting rage-clicked up to 37
  // times in a single session; the most likely explanation is the first
  // tap was actually working, but with no visible confirmation it had
  // registered, users kept tapping out of uncertainty.
  const [confirming, setConfirming] = useState(false);

  const confirmPendingMove = useCallback(() => {
    if (!pendingMove || confirming) return;
    setConfirming(true);
    onMovePlayedRef.current?.(pendingMove.san, pendingMove.isCorrect);
    setPendingMove(null);
  }, [pendingMove, confirming]);

  const cancelPendingMove = useCallback(() => {
    setPendingMove(null);
  }, []);

  const legalMoveInfo = useMemo(() => {
    if (!selectedSquare || !practiceMode) return { targets: [] as string[], captures: new Set<string>() };
    try {
      const chess = new Chess(position);
      const moves = chess.moves({ square: selectedSquare as Parameters<typeof chess.moves>[0]['square'], verbose: true });
      const targets = moves.map((m) => m.to as string);
      const captures = new Set(moves.filter(m => m.captured).map(m => m.to as string));
      return { targets, captures };
    } catch {
      return { targets: [] as string[], captures: new Set<string>() };
    }
  }, [selectedSquare, position, practiceMode]);

  const legalTargets = legalMoveInfo.targets;

  const finishMove = useCallback((from: string, to: string, promotion: string) => {
    try {
      const chess = new Chess(positionRef.current);
      const move = chess.move({ from, to, promotion });
      if (!move) return false;
      if (soundEnabledRef.current) playMoveSound(eventForMove(move, chess));
      userMoveFenRef.current = chess.fen().split(' ')[0];
      const san = move.san;
      const expected = expectedMoveSanRef.current;
      const isCorrect = !expected || san === expected;
      if (expected) {
        setFeedback(isCorrect ? 'correct' : 'wrong');
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => setFeedback(null), 900);
      }
      if (confirmMovesRef.current && !suppressConfirmMovesRef.current && !expected) {
        setConfirming(false);
        setPendingMove({ from, to, san, isCorrect, tempFen: chess.fen() });
        return true;
      }
      if (import.meta.env.DEV || (typeof window !== 'undefined' && window.location.search.includes('debugConfirm'))) {
        console.log('[ChessBoard] confirm-move check', {
          confirmMoves: confirmMovesRef.current,
          suppressConfirmMoves: suppressConfirmMovesRef.current,
          expected,
          wouldConfirm: confirmMovesRef.current && !suppressConfirmMovesRef.current && !expected,
        });
      }
      onMovePlayedRef.current?.(san, isCorrect);
      return true;
    } catch {
      return false;
    }
  }, []);

  const tryMove = useCallback((from: string, to: string): boolean => {
    try {
      // Detect promotion up front so we can ask which piece, if that
      // setting is on, before actually committing the move.
      const probe = new Chess(positionRef.current);
      const piece = probe.get(from as any);
      const isPromotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1');
      if (isPromotion && promotionChoiceRef.current === 'ask') {
        const legal = probe.moves({ square: from as any, verbose: true }).some((m: any) => m.to === to);
        if (!legal) return false;
        setPromotionPending({ from, to });
        return true;
      }
      return finishMove(from, to, 'q');
    } catch {
      return false;
    }
  }, [finishMove]);

  const choosePromotion = useCallback((piece: 'q' | 'r' | 'b' | 'n') => {
    if (!promotionPending) return;
    finishMove(promotionPending.from, promotionPending.to, piece);
    setPromotionPending(null);
  }, [promotionPending, finishMove]);

  const handlePieceDrop = useCallback(({ sourceSquare, targetSquare, piece }: { piece: { pieceType: string } | null; sourceSquare: string; targetSquare: string | null }) => {
    if (!targetSquare) return false;
    if (premoveMode && !practiceMode && piece) {
      const pc = piece.pieceType[0].toLowerCase();
      if (premoveColor && pc !== premoveColor) return false;
      onPremoveSet?.({ from: sourceSquare, to: targetSquare });
      return true;
    }
    if (!practiceMode) return false;
    if (sourceSquare === targetSquare) {
      setSelectedSquare(prev => prev === sourceSquare ? null : sourceSquare);
      return false;
    }
    setSelectedSquare(null);
    return tryMove(sourceSquare, targetSquare);
  }, [practiceMode, premoveMode, premoveColor, onPremoveSet, tryMove]);

  const canDragPiece = useCallback(({ piece }: { piece: { pieceType: string } | null }) => {
    if (!piece) return false;
    if (pendingMove || promotionPending) return false;
    if (practiceMode) {
      try {
        const chess = new Chess(positionRef.current);
        const turn = chess.turn();
        const pieceColor = piece.pieceType[0].toLowerCase();
        return pieceColor === turn;
      } catch { return false; }
    }
    if (premoveMode) {
      const pc = piece.pieceType[0].toLowerCase();
      return premoveColor ? pc === premoveColor : true;
    }
    return false;
  }, [practiceMode, premoveMode, premoveColor, pendingMove, promotionPending]);

  const selectedSquareRef = useRef(selectedSquare);
  selectedSquareRef.current = selectedSquare;
  const legalTargetsRef = useRef(legalTargets);
  legalTargetsRef.current = legalTargets;

  const handleSquareClick = useCallback(({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
    if (pendingMove || promotionPending) return;
    if (premoveMode && !practiceMode) {
      const sel = selectedSquareRef.current;
      if (sel) {
        if (square === sel) { setSelectedSquare(null); return; }
        onPremoveSet?.({ from: sel, to: square });
        setSelectedSquare(null);
        return;
      }
      if (piece) {
        const pc = piece.pieceType[0].toLowerCase();
        if (!premoveColor || pc === premoveColor) setSelectedSquare(square);
      }
      return;
    }
    if (!practiceMode) return;
    const sel = selectedSquareRef.current;

    if (sel) {
      if (square === sel) {
        setSelectedSquare(null);
        return;
      }
      if (legalTargetsRef.current.includes(square)) {
        const moved = tryMove(sel, square);
        setSelectedSquare(null);
        if (!moved) {
          if (piece) setSelectedSquare(square);
        }
        return;
      }
      if (piece) {
        setSelectedSquare(square);
      } else {
        setSelectedSquare(null);
      }
      return;
    }

    if (piece) {
      try {
        const chess = new Chess(positionRef.current);
        const turn = chess.turn();
        const pieceColor = piece.pieceType[0].toLowerCase();
        if (pieceColor === turn) {
          setSelectedSquare(square);
        }
      } catch {
        setSelectedSquare(square);
      }
    }
  }, [practiceMode, tryMove, pendingMove, promotionPending]);

  // Build square styles
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    // Last move highlight — use quality color if available, else yellow
    if (lastMove) {
      styles[lastMove.from] = { background: 'rgba(255, 240, 80, 0.30)' };
      styles[lastMove.to] = moveQuality
        ? { background: QUALITY_COLOR[moveQuality] }
        : { background: 'rgba(255, 240, 80, 0.55)' };
    }

    // Selected square
    if (selectedSquare) {
      styles[selectedSquare] = { background: 'rgba(100, 180, 255, 0.55)', borderRadius: '4px' };
    }

    // Premove highlight
    if (premove) {
      styles[premove.from] = { ...(styles[premove.from] || {}), background: 'rgba(255, 140, 90, 0.45)', boxShadow: 'inset 0 0 0 2px rgba(255,140,90,0.9)' };
      styles[premove.to] = { ...(styles[premove.to] || {}), background: 'rgba(255, 140, 90, 0.55)', boxShadow: 'inset 0 0 0 2px rgba(255,140,90,0.9)' };
    }

    if (showLegalMoves) {
      for (const sq of legalTargets) {
        if (legalMoveInfo.captures.has(sq)) {
          styles[sq] = {
            background: 'radial-gradient(circle, transparent 55%, rgba(100,180,255,0.55) 56%)',
            borderRadius: '50%',
            ...(styles[sq] || {}),
          };
        } else {
          styles[sq] = {
            background: 'radial-gradient(circle, rgba(100,180,255,0.55) 28%, transparent 30%)',
            ...(styles[sq] || {}),
          };
        }
      }
    }

    // Practice feedback overrides
    if (feedback === 'correct' && lastMove) {
      styles[lastMove.to] = { background: 'rgba(80, 220, 100, 0.65)' };
    } else if (feedback === 'wrong' && lastMove) {
      styles[lastMove.to] = { background: 'rgba(220, 80, 80, 0.65)' };
    }

    return styles;
  }, [lastMove, selectedSquare, legalTargets, legalMoveInfo, feedback, moveQuality, showLegalMoves]);

  const boardKeyRef = useRef(0);

  return (
    <div className="relative w-full mx-auto" style={{ maxWidth: boardMaxWidth }}>
      {/* Static gradient presets (Shaded/3D Wood/3D Marble/Chrome/Gold/
          Copper/Obsidian/Ivory) now live in the shared PieceGradientDefs
          component so every board can use them, not just this one -- see
          that file for why. Only the dynamic Custom-color gradient below
          stays here, since it needs this component's own computed values. */}
      <PieceGradientDefs />
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          {/* Dynamic gradient for custom piece colors, computed from
              whatever hex the user picked (see getPieceColorScheme in
              lib/utils.ts) -- gives custom colors the same subtle 3D
              shading the preset styles above already have, instead of a
              flat, single-tone fill. Only rendered when custom colors are
              actually active. */}
          {pieceStyle === 'custom' && (
            <>
              <linearGradient id="cc-grad-custom-light" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={pieceSchemes.light.gradientLight} />
                <stop offset="55%" stopColor={pieceColors.light} />
                <stop offset="100%" stopColor={pieceSchemes.light.gradientDark} />
              </linearGradient>
              <linearGradient id="cc-grad-custom-dark" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={pieceSchemes.dark.gradientLight} />
                <stop offset="55%" stopColor={pieceColors.dark} />
                <stop offset="100%" stopColor={pieceSchemes.dark.gradientDark} />
              </linearGradient>
            </>
          )}
        </defs>
      </svg>
      <BoardErrorBoundary position={position} renderKey={boardKeyRef.current}>
        <Chessboard
          options={{
            position: pendingMove ? pendingMove.tempFen : position,
            boardOrientation: flipped ? 'black' : 'white',
            allowDragging: (practiceMode || premoveMode) && !pendingMove && !promotionPending,
            dragActivationDistance: 8,
            canDragPiece,
            onPieceDrop: handlePieceDrop,
            squareStyles,
            onSquareClick: handleSquareClick,
            showNotation: showCoordinates,
            arrows: arrows?.map(a => ({
              startSquare: a.from,
              endSquare: a.to,
              color: a.color ?? 'rgba(255,170,0,0.8)',
            })),
            boardStyle: {
              ...skin.boardStyle,
              borderRadius: '10px',
              boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
              cursor: (practiceMode || premoveMode) && !pendingMove ? 'pointer' : 'default',
            },
            lightSquareStyle: skin.lightSquareStyle,
            darkSquareStyle: skin.darkSquareStyle,
            pieces: tintedPieces,
            animationDurationInMs: 150,
          }}
        />
      </BoardErrorBoundary>

      {/* Checkmate indicator directly on the board -- gold crown on the winning
          king, crimson mark on the mated king, and a brief ribbon. */}
      {/* Overlays live in a square box matching the board itself, so they stay
          aligned even when the promotion picker / confirm bar below adds height. */}
      {checkmateInfo && (
        <div className="absolute inset-x-0 top-0 aspect-square pointer-events-none">
        <CheckmateOverlay
          winningKingSquare={checkmateInfo.winningKingSquare}
          losingKingSquare={checkmateInfo.losingKingSquare}
          flipped={flipped}
          positionKey={position}
        />
        </div>
      )}

      {/* Confirm-move bar -- in normal document flow (not absolutely
          positioned) so it pushes content below the board down instead of
          covering it. Styled as an aerial-view chess clock top: a wide
          rectangular block split by a center seam into two paddle halves,
          like the reference clocks. */}
      {/* Promotion piece picker -- only shown when "Ask on Promotion" is
          on and a pawn just reached the back rank. */}
      {promotionPending && (
        <div className="mt-3 flex items-center justify-center gap-2">
          {(['q', 'r', 'b', 'n'] as const).map((p) => (
            <button
              key={p}
              onClick={() => choosePromotion(p)}
              className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl transition-transform active:scale-90"
              style={{ background: '#302e2b', border: '1px solid rgba(129,182,76,0.4)' }}
              title={{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p]}
            >
              {{ q: '♛', r: '♜', b: '♝', n: '♞' }[p]}
            </button>
          ))}
        </div>
      )}

      {!pendingMove && !promotionPending && reserveConfirmSpace && confirmMoves && !suppressConfirmMoves && (
        <div aria-hidden className="mt-3 h-14" />
      )}
      {pendingMove && (
        // The chess-clock bar: left paddle cancels the staged move, right
        // paddle plays it. (The left half used to be a dead "MOVE" label that
        // still submitted the move, with a separate X to cancel.)
        <div
          className="relative mt-3 flex h-14 overflow-hidden rounded-xl"
          style={{
            boxShadow: '0 4px 0 #2a2a2a, 0 8px 16px rgba(0,0,0,0.4)',
            border: '1px solid rgba(0,0,0,0.25)',
            opacity: confirming ? 0.6 : 1,
          }}
        >
          <button
            onClick={cancelPendingMove}
            disabled={confirming}
            className="flex flex-1 items-center justify-center gap-1.5 text-xs font-black tracking-wider transition-transform active:scale-[0.97]"
            style={{ background: 'linear-gradient(180deg, #3a3a3a 0%, #232323 100%)', color: 'rgba(255,255,255,0.75)' }}
          >
            <span className="text-sm">✕</span> CANCEL
          </button>
          <button
            onClick={confirmPendingMove}
            disabled={confirming}
            className="flex flex-1 items-center justify-center text-xs font-black tracking-wider transition-transform active:scale-[0.97]"
            style={{ background: 'linear-gradient(180deg, #a8d876 0%, #81b64c 55%, #5f8f36 100%)', color: '#fff' }}
          >
            {confirming ? '✓' : 'CONFIRM'}
          </button>
          {/* center seam */}
          <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 w-[2px] -translate-x-1/2" style={{ background: 'rgba(0,0,0,0.35)' }} />
        </div>
      )}
      {/* Practice feedback overlay */}
      {feedback && (
        <div className={`absolute inset-0 rounded-[10px] pointer-events-none flex items-center justify-center
          ${feedback === 'correct' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
          <span className={`text-5xl font-black drop-shadow-lg ${feedback === 'correct' ? 'text-emerald-400' : 'text-red-400'}`}>
            {feedback === 'correct' ? '✓' : '✗'}
          </span>
        </div>
      )}

      {/* Move quality marker -- a small badge in the corner of the square the move
          landed on, instead of a large label over the board's top-right squares.
          Checkmate has its own overlay above, so it isn't badged twice. */}
      {moveQuality && moveQuality !== 'checkmate' && !practiceMode && !feedback && lastMove?.to && (
        <div className="absolute inset-x-0 top-0 aspect-square pointer-events-none">
        <SquareBadge
          square={lastMove.to}
          flipped={flipped}
          color={QUALITY_BADGE[moveQuality]}
          glyph={QUALITY_GLYPH[moveQuality]}
          label={QUALITY_LABEL[moveQuality].text}
        />
        </div>
      )}
    </div>
  );
}
