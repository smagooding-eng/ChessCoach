import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'wouter';
import { Chess } from 'chess.js';
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { ChessBoard } from '@/components/ChessBoard';

const BG = '#141413';
const CARD = '#1c1b19';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const ACCENT = '#4a9eda';
const GREEN = '#81b64c';
const RED = '#e05a5a';

const PIECE_NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function randomSquare(exclude: string[] = [], rankMin = 1, rankMax = 8): string {
  let sq: string;
  do {
    const file = 'abcdefgh'[Math.floor(Math.random() * 8)];
    const rank = Math.floor(Math.random() * (rankMax - rankMin + 1)) + rankMin;
    sq = `${file}${rank}`;
  } while (exclude.includes(sq));
  return sq;
}

function squaresAdjacent(a: string, b: string): boolean {
  const fileDiff = Math.abs(a.charCodeAt(0) - b.charCodeAt(0));
  const rankDiff = Math.abs(parseInt(a[1], 10) - parseInt(b[1], 10));
  return fileDiff <= 1 && rankDiff <= 1;
}

// Generates a random position with just the drill piece and both kings
// (nothing else, so any legal move played is unambiguously the drill
// piece moving), then verifies via chess.js that the piece actually has
// at least one legal move -- regenerating rather than risk a boxed-in
// piece (e.g. a pawn with a king sitting directly in front of it).
function generateDrillPosition(pieceType: string): { fen: string; pieceSquare: string } {
  for (let attempt = 0; attempt < 50; attempt++) {
    let whiteKingSq: string, blackKingSq: string;
    do {
      whiteKingSq = randomSquare();
      blackKingSq = randomSquare([whiteKingSq]);
    } while (squaresAdjacent(whiteKingSq, blackKingSq));

    // Special case: when drilling the king itself, the white king IS the
    // drill piece -- there's no separate third piece to place.
    if (pieceType === 'k') {
      const fen = `${placeOnEmptyBoard({ [whiteKingSq]: 'K', [blackKingSq]: 'k' })} w - - 0 1`;
      try {
        const chess = new Chess(fen);
        if (chess.moves({ square: whiteKingSq as any }).length > 0) {
          return { fen, pieceSquare: whiteKingSq };
        }
      } catch { /* try again */ }
      continue;
    }

    const pieceSq = pieceType === 'p'
      ? randomSquare([whiteKingSq, blackKingSq], 2, 7)
      : randomSquare([whiteKingSq, blackKingSq]);

    const fen = `${placeOnEmptyBoard({ [whiteKingSq]: 'K', [blackKingSq]: 'k', [pieceSq]: pieceType.toUpperCase() })} w - - 0 1`;

    try {
      const chess = new Chess(fen);
      const legalMoves = chess.moves({ square: pieceSq as any });
      if (legalMoves.length > 0) {
        return { fen, pieceSquare: pieceSq };
      }
    } catch {
      // malformed position somehow -- try again
    }
  }
  // Extremely unlikely fallback: a knight on d4 with kings tucked in corners always has legal moves.
  return { fen: `k6K/8/8/8/3${pieceType.toUpperCase()}4/8/8/8 w - - 0 1`, pieceSquare: 'd4' };
}

function placeOnEmptyBoard(placements: Record<string, string>): string {
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const [sq, piece] of Object.entries(placements)) {
    const file = sq.charCodeAt(0) - 97;
    const rank = parseInt(sq[1], 10) - 1;
    board[rank][file] = piece;
  }
  const fenRanks: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let rankStr = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      if (board[r][f]) {
        if (empty > 0) { rankStr += empty; empty = 0; }
        rankStr += board[r][f];
      } else {
        empty++;
      }
    }
    if (empty > 0) rankStr += empty;
    fenRanks.push(rankStr);
  }
  return fenRanks.join('/');
}

interface LessonStep {
  type: 'text' | 'board' | 'practice' | 'drill';
  text: string;
  fen?: string;
  expectedMoveSan?: string;
  drillPiece?: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  drillReps?: number;
}

interface Lesson {
  id: number;
  title: string;
  summary: string;
  steps: LessonStep[];
}

export default function BeginnerLessonPage() {
  const { id } = useParams<{ id: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [stepIdx, setStepIdx] = useState(0);
  const [practiceDone, setPracticeDone] = useState(false);
  const [finished, setFinished] = useState(false);
  const [drillFen, setDrillFen] = useState<string | null>(null);
  const [drillCompleted, setDrillCompleted] = useState(0);
  const [drillWrongPiece, setDrillWrongPiece] = useState(false);

  useEffect(() => {
    apiFetch(`/api/beginner-lessons/${id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.lesson) setLesson(d.lesson); })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    setPracticeDone(false);
    setDrillCompleted(0);
    setDrillWrongPiece(false);
    const step = lesson?.steps[stepIdx];
    if (step?.type === 'drill' && step.drillPiece) {
      setDrillFen(generateDrillPosition(step.drillPiece).fen);
    } else {
      setDrillFen(null);
    }
  }, [stepIdx, lesson]);

  const handleDrillMove = useCallback((san: string, step: LessonStep) => {
    // When NOT drilling the king, a king move means they moved the wrong
    // piece -- the only other piece on the board is the drill piece, so
    // anything that isn't a king move is automatically the right one.
    // When drilling the king itself, the reverse is true: a king move IS
    // the correct piece, since the king is the only piece present at all.
    const isKingMove = san.startsWith('K') || san.startsWith('O-O');
    const wrongPiece = step.drillPiece === 'k' ? !isKingMove : isKingMove;
    if (wrongPiece) {
      setDrillWrongPiece(true);
      // Regenerate immediately so they get a fresh attempt rather than
      // continuing from a position where a piece has now moved.
      if (step.drillPiece) setDrillFen(generateDrillPosition(step.drillPiece).fen);
      return;
    }
    setDrillWrongPiece(false);
    const nextCount = drillCompleted + 1;
    setDrillCompleted(nextCount);
    const reps = step.drillReps ?? 5;
    if (nextCount < reps && step.drillPiece) {
      setDrillFen(generateDrillPosition(step.drillPiece).fen);
    }
  }, [drillCompleted]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: ACCENT }} />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: BG, color: TEXT }}>
        <p className="text-sm" style={{ color: MUTED }}>Lesson not found.</p>
        <Link href="/admin/beginner-courses" className="text-sm font-bold" style={{ color: ACCENT }}>Back to Courses</Link>
      </div>
    );
  }

  const step = lesson.steps[stepIdx];
  const isLastStep = stepIdx === lesson.steps.length - 1;
  const canAdvance = (step.type !== 'practice' || practiceDone) && (step.type !== 'drill' || drillCompleted >= (step.drillReps ?? 5));

  const markComplete = () => {
    apiFetch(`/api/beginner-lessons/${lesson.id}/complete`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    setFinished(true);
  };

  const goNext = () => {
    if (!canAdvance) return;
    if (isLastStep) {
      markComplete();
    } else {
      setStepIdx(i => i + 1);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
        <Link href="/admin/beginner-courses" className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: MUTED }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <h1 className="text-2xl font-black mb-1" style={{ letterSpacing: '-0.02em' }}>{lesson.title}</h1>

        {!finished && (
          <div className="flex items-center gap-1 mb-6 mt-3">
            {lesson.steps.map((_, i) => (
              <div
                key={i}
                className="flex-1 h-1.5 rounded-full"
                style={{ background: i <= stepIdx ? ACCENT : 'rgba(255,255,255,0.08)' }}
              />
            ))}
          </div>
        )}

        {finished ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: CARD, border: `1px solid ${GREEN}40` }}>
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: GREEN }} />
            <p className="font-bold text-sm mb-4" style={{ color: GREEN }}>Lesson complete!</p>
            <Link href="/admin/beginner-courses" className="text-sm font-bold" style={{ color: ACCENT }}>Back to Courses</Link>
          </div>
        ) : (
          <>
            <div className="rounded-2xl p-5 mb-4" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-sm leading-relaxed" style={{ color: TEXT }}>{step.text}</p>
            </div>

            {(step.type === 'board' || step.type === 'practice') && step.fen && (
              <div className="mb-4">
                <ChessBoard
                  fen={step.fen}
                  practiceMode={step.type === 'practice' && !practiceDone}
                  expectedMoveSan={step.type === 'practice' ? step.expectedMoveSan : null}
                  onMovePlayed={() => {
                    if (step.type === 'practice') setPracticeDone(true);
                  }}
                />
                {step.type === 'practice' && !practiceDone && (
                  <p className="text-xs text-center mt-3" style={{ color: MUTED }}>Make the move on the board to continue.</p>
                )}
                {step.type === 'practice' && practiceDone && (
                  <p className="text-xs text-center mt-3 font-bold" style={{ color: GREEN }}>Nicely done.</p>
                )}
              </div>
            )}

            {step.type === 'drill' && step.drillPiece && drillFen && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold" style={{ color: ACCENT }}>
                    Move the {PIECE_NAMES[step.drillPiece]} anywhere it can legally go
                  </p>
                  <p className="text-xs font-black" style={{ color: drillCompleted >= (step.drillReps ?? 5) ? GREEN : MUTED }}>
                    {Math.min(drillCompleted, step.drillReps ?? 5)}/{step.drillReps ?? 5}
                  </p>
                </div>
                <ChessBoard
                  key={drillFen}
                  fen={drillFen}
                  practiceMode={drillCompleted < (step.drillReps ?? 5)}
                  expectedMoveSan={null}
                  onMovePlayed={(san) => handleDrillMove(san, step)}
                />
                {drillWrongPiece && (
                  <p className="text-xs text-center mt-3 font-bold" style={{ color: RED }}>
                    {step.drillPiece === 'k'
                      ? `Move the king, not that.`
                      : `That's the king — move the ${PIECE_NAMES[step.drillPiece]} instead.`}
                  </p>
                )}
                {!drillWrongPiece && drillCompleted < (step.drillReps ?? 5) && (
                  <p className="text-xs text-center mt-3" style={{ color: MUTED }}>Any legal move counts — try a different square each time.</p>
                )}
                {drillCompleted >= (step.drillReps ?? 5) && (
                  <p className="text-xs text-center mt-3 font-bold" style={{ color: GREEN }}>Great — you've got it.</p>
                )}
              </div>
            )}

            <button
              onClick={goNext}
              disabled={!canAdvance}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-transform active:scale-[0.98] disabled:opacity-40"
              style={{ background: ACCENT, color: '#fff' }}
            >
              {isLastStep ? 'Finish lesson' : 'Continue'} <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
