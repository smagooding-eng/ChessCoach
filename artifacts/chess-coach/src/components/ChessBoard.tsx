import React, { useState, useCallback, useMemo, useRef, useEffect, Component, type ReactNode } from 'react';
import { Chessboard, defaultPieces } from 'react-chessboard';
import { Chess } from 'chess.js';
import { normalizeFen } from '@/lib/utils';
import { useSettings, playMoveSound } from '@/context/SettingsContext';
import { Trophy, X } from 'lucide-react';

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
}: ChessBoardProps) {
  const { confirmMoves, boardColors, boardTextureCss, showCoordinates, pieceColors, pieceShape, soundEnabled, promotionChoice, boardMaxWidth: settingsMaxWidth } = useSettings();
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
  const expectedMoveSanRef = useRef(expectedMoveSan);
  expectedMoveSanRef.current = expectedMoveSan;
  // When "Confirm Moves" is on, a legal move is staged here (shown on the
  // board immediately for feedback) but not actually committed via
  // onMovePlayed until the player taps Confirm.
  const [pendingMove, setPendingMove] = useState<{ from: string; to: string; san: string; isCorrect: boolean; tempFen: string } | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: string; to: string } | null>(null);

  // Wraps the library's real default piece renderers with a direct `fill`
  // color override -- a real color change, not a CSS filter (filters like
  // hue-rotate barely affect near-grayscale source art, which is why an
  // earlier filter-based attempt at this wasn't visibly noticeable).
  // Skipped entirely for the Classic style (avoids wrapper overhead).
  const tintedPieces = useMemo(() => {
    if (pieceShape === 'cburnett') {
      // Real, distinct artwork set (not the library's default shapes).
      // Static SVG files with color baked in, so the color picker
      // doesn't apply on top of this -- shape and color are independent.
      const wrapped: typeof defaultPieces = {};
      for (const key of Object.keys(defaultPieces)) {
        wrapped[key] = ({ svgStyle } = {}) => (
          <img src={`/pieces/cburnett/${key}.svg`} alt={key} style={{ width: '100%', height: '100%', ...svgStyle }} />
        );
      }
      return wrapped;
    }
    if (pieceColors.light === '#ffffff' && pieceColors.dark === '#2b2b2b' && Object.keys(pieceColors.finish).length === 0) return undefined;
    const wrapped: typeof defaultPieces = {};
    for (const [key, PieceComponent] of Object.entries(defaultPieces)) {
      const isWhitePiece = key.startsWith('w');
      const fill = isWhitePiece ? pieceColors.light : pieceColors.dark;
      wrapped[key] = (props) => (
        <PieceComponent {...props} fill={fill} svgStyle={{ ...props?.svgStyle, ...pieceColors.finish }} />
      );
    }
    return wrapped;
  }, [pieceColors, pieceShape]);

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

  const confirmPendingMove = useCallback(() => {
    if (!pendingMove) return;
    onMovePlayedRef.current?.(pendingMove.san, pendingMove.isCorrect);
    setPendingMove(null);
  }, [pendingMove]);

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
      if (soundEnabledRef.current) playMoveSound(move.captured ? 'capture' : 'move');
      const san = move.san;
      const expected = expectedMoveSanRef.current;
      const isCorrect = !expected || san === expected;
      if (expected) {
        setFeedback(isCorrect ? 'correct' : 'wrong');
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => setFeedback(null), 900);
      }
      if (confirmMovesRef.current && !suppressConfirmMovesRef.current && !expected) {
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

    // Practice feedback overrides
    if (feedback === 'correct' && lastMove) {
      styles[lastMove.to] = { background: 'rgba(80, 220, 100, 0.65)' };
    } else if (feedback === 'wrong' && lastMove) {
      styles[lastMove.to] = { background: 'rgba(220, 80, 80, 0.65)' };
    }

    return styles;
  }, [lastMove, selectedSquare, legalTargets, legalMoveInfo, feedback, moveQuality]);

  const boardKeyRef = useRef(0);

  return (
    <div className="relative w-full mx-auto" style={{ maxWidth: boardMaxWidth }}>
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
              borderRadius: '10px',
              boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
              cursor: (practiceMode || premoveMode) && !pendingMove ? 'pointer' : 'default',
            },
            lightSquareStyle: { backgroundColor: boardColors.light, backgroundImage: boardTextureCss.backgroundImage, backgroundSize: boardTextureCss.backgroundSize },
            darkSquareStyle: { backgroundColor: boardColors.dark, backgroundImage: boardTextureCss.backgroundImage, backgroundSize: boardTextureCss.backgroundSize },
            pieces: tintedPieces,
            animationDurationInMs: 150,
          }}
        />
      </BoardErrorBoundary>

      {/* Checkmate indicator directly on the board -- green on the
          winning king's square, red on the losing king's, instead of a
          separate result banner elsewhere that's easy to miss. */}
      {checkmateInfo && (
        <>
          <div
            className="absolute pointer-events-none flex items-center justify-center"
            style={{
              ...squareToPercent(checkmateInfo.winningKingSquare),
              width: '12.5%',
              height: '12.5%',
            }}
          >
            <div className="w-[55%] h-[55%] rounded-full flex items-center justify-center"
              style={{ background: 'rgba(34,197,94,0.92)', boxShadow: '0 0 0 3px rgba(255,255,255,0.5), 0 4px 12px rgba(0,0,0,0.5)' }}>
              <Trophy className="w-[55%] h-[55%] text-white" strokeWidth={2.5} />
            </div>
          </div>
          <div
            className="absolute pointer-events-none flex items-center justify-center"
            style={{
              ...squareToPercent(checkmateInfo.losingKingSquare),
              width: '12.5%',
              height: '12.5%',
            }}
          >
            <div className="w-[55%] h-[55%] rounded-full flex items-center justify-center"
              style={{ background: 'rgba(220,38,38,0.92)', boxShadow: '0 0 0 3px rgba(255,255,255,0.5), 0 4px 12px rgba(0,0,0,0.5)' }}>
              <X className="w-[55%] h-[55%] text-white" strokeWidth={3} />
            </div>
          </div>
        </>
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

      {pendingMove && (
        <div className="mt-3 flex items-stretch gap-2">
          <button
            onClick={cancelPendingMove}
            className="w-12 shrink-0 rounded-xl flex items-center justify-center transition-transform active:scale-95"
            style={{ background: 'rgba(255,255,255,0.35)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)' }}
            title="Cancel"
          >
            <span className="text-base font-black">✕</span>
          </button>
          <button
            onClick={confirmPendingMove}
            className="relative flex-1 h-14 rounded-xl overflow-hidden flex transition-transform active:scale-[0.98]"
            style={{
              boxShadow: '0 4px 0 #2a2a2a, 0 8px 16px rgba(0,0,0,0.4)',
              border: '1px solid rgba(0,0,0,0.25)',
            }}
          >
            <span
              className="flex-1 flex items-center justify-center font-black text-xs tracking-wider"
              style={{ background: 'linear-gradient(180deg, #3a3a3a 0%, #232323 100%)', color: 'rgba(255,255,255,0.5)' }}
            >
              MOVE
            </span>
            <span
              className="flex-1 flex items-center justify-center font-black text-xs tracking-wider"
              style={{ background: 'linear-gradient(180deg, #a8d876 0%, #81b64c 55%, #5f8f36 100%)', color: '#fff' }}
            >
              CONFIRM
            </span>
            {/* center seam */}
            <div className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2" style={{ background: 'rgba(0,0,0,0.35)' }} />
          </button>
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

      {/* Move quality badge — shown in top-right corner of the board */}
      {moveQuality && !practiceMode && !feedback && (
        <div className="absolute top-2 right-2 pointer-events-none z-10">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold shadow-lg backdrop-blur-sm border
            ${moveQuality === 'checkmate'   ? 'bg-amber-950/90 text-amber-300 border-amber-400/40' :
              moveQuality === 'brilliant'   ? 'bg-cyan-950/90 text-cyan-300 border-cyan-400/40' :
              moveQuality === 'great'       ? 'bg-sky-950/90 text-sky-300 border-sky-400/40' :
              moveQuality === 'best'        ? 'bg-emerald-950/90 text-emerald-300 border-emerald-400/40' :
              moveQuality === 'excellent'   ? 'bg-teal-950/90 text-teal-300 border-teal-400/40' :
              moveQuality === 'good'        ? 'bg-green-950/90 text-green-300 border-green-400/40' :
              moveQuality === 'book'        ? 'bg-blue-950/90 text-blue-300 border-blue-400/40' :
              moveQuality === 'inaccuracy'  ? 'bg-yellow-950/90 text-yellow-300 border-yellow-400/40' :
              moveQuality === 'mistake'     ? 'bg-orange-950/90 text-orange-300 border-orange-400/40' :
                                              'bg-red-950/90 text-red-300 border-red-400/40'}`}>
            <span>{QUALITY_LABEL[moveQuality].icon}</span>
            <span>{QUALITY_LABEL[moveQuality].text}</span>
          </div>
        </div>
      )}
    </div>
  );
}
