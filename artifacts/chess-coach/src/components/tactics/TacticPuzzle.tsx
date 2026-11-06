// One tactics puzzle on the regular board. Lichess puzzles open with the
// opponent's move (played for you); then you find the solution. Any move that
// gives checkmate counts. Guided mode shows the first move as an arrow and lets
// you retry; drills and speed rounds count the first wrong move as a miss.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Lightbulb, ChevronRight, Check, X } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { PT } from '@/lib/playTheme';

export interface TacticPuzzleData { id: number; fen: string; moves: string[]; rating: number; themes: string[]; setup: boolean }
type Mode = 'guided' | 'drill' | 'speed' | 'kids';

const uciMove = (c: Chess, uci: string) => { try { return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as 'q' | 'r' | 'b' | 'n' | undefined }); } catch { return null; } };

export function TacticPuzzle({ puzzle, mode, onDone, onNext, nextLabel = 'Next' }: {
  puzzle: TacticPuzzleData; mode: Mode;
  /** Called once: solved or not, and how long it took. */
  onDone: (solved: boolean, timeMs: number) => void;
  /** Shown after the puzzle ends (not in speed rounds, which move on by themselves). */
  onNext?: () => void; nextLabel?: string;
}) {
  const chess = useMemo(() => new Chess(puzzle.fen), [puzzle.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const solution = useMemo(() => (puzzle.setup ? puzzle.moves.slice(1) : puzzle.moves), [puzzle]);
  const [fen, setFen] = useState(puzzle.fen);
  const [idx, setIdx] = useState(0); // next move in the solution
  const [ready, setReady] = useState(!puzzle.setup);
  const [status, setStatus] = useState<'play' | 'solved' | 'failed'>('play');
  const [missed, setMissed] = useState(false); // used the hint (drill) / a wrong try (guided, kids)
  // Drills: a wrong move can be retried 3 times before the puzzle counts as missed.
  const [wrong, setWrong] = useState(0);
  const [hint, setHint] = useState(mode === 'guided');
  const [nonce, setNonce] = useState(0);
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const started = useRef(Date.now());
  const finished = useRef(false);
  // The side you play, known from the start (in Lichess puzzles the opponent moves first),
  // so the board is the right way round from the first frame.
  const myColor = useRef<'w' | 'b'>('w');
  myColor.current = useMemo(() => { const t = new Chess(puzzle.fen).turn(); return puzzle.setup ? (t === 'w' ? 'b' : 'w') : t; }, [puzzle.id, puzzle.fen, puzzle.setup]);

  // The opponent's opening move.
  useEffect(() => {
    finished.current = false; started.current = Date.now();
    if (!puzzle.setup) return;
    const t = setTimeout(() => {
      const m = uciMove(chess, puzzle.moves[0]);
      if (m) { setFen(chess.fen()); setLast({ from: m.from, to: m.to }); }
      setReady(true); started.current = Date.now();
    }, mode === 'speed' ? 250 : 650);
    return () => clearTimeout(t);
  }, [puzzle.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback((ok: boolean) => {
    if (finished.current) return;
    finished.current = true;
    setStatus(ok ? 'solved' : 'failed');
    onDone(ok, Date.now() - started.current);
  }, [onDone]);

  const expected = useMemo(() => {
    if (!ready || status !== 'play' || idx >= solution.length) return null;
    const c = new Chess(fen); const m = uciMove(c, solution[idx]);
    return m ? { san: m.san, from: m.from, to: m.to } : null;
  }, [fen, idx, ready, status, solution]);

  const onMove = useCallback((san: string) => {
    if (!expected || status !== 'play') return;
    const probe = new Chess(fen); const played = probe.move(san);
    const mates = probe.isCheckmate();
    if (san === expected.san || mates) {
      chess.move(san); setFen(chess.fen()); setLast({ from: played.from, to: played.to });
      const next = idx + 1;
      if (mates || next >= solution.length) { setIdx(next); finish(mode === 'guided' ? true : !missed); return; }
      // Their reply.
      setTimeout(() => {
        const m = uciMove(chess, solution[next]);
        if (m) { setFen(chess.fen()); setLast({ from: m.from, to: m.to }); }
        setIdx(next + 1);
        if (next + 1 >= solution.length) finish(mode === 'guided' ? true : !missed);
      }, mode === 'speed' ? 200 : 450);
      return;
    }
    // Wrong.
    setNonce((n) => n + 1); // put the piece back
    if (mode === 'guided' || mode === 'kids') { setMissed(true); setHint(true); return; }
    if (mode === 'drill' && wrong < 3) { setWrong((w) => w + 1); return; }
    // Out of tries (or a speed round): show the right move, count it as missed.
    const c = new Chess(fen); const m = uciMove(c, solution[idx]);
    if (m) setLast({ from: m.from, to: m.to });
    setHint(true);
    finish(false);
  }, [expected, status, fen, chess, idx, solution, finish, missed, mode, wrong]);

  const arrow = hint && expected ? [{ from: expected.from, to: expected.to, color: 'rgba(129,182,76,0.85)' }]
    : status === 'failed' && idx < solution.length ? (() => { const c = new Chess(fen); const m = uciMove(c, solution[idx]); return m ? [{ from: m.from, to: m.to, color: 'rgba(129,182,76,0.85)' }] : undefined; })()
    : undefined;
  const toMove = new Chess(fen).turn();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-[13px] font-bold" style={{ color: PT.text }}>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: myColor.current === 'w' ? '#F5F5F0' : '#1A1A19', border: '1px solid rgba(255,255,255,.4)' }} />
          {status === 'solved' ? <span style={{ color: PT.green }}>Solved!</span> : status === 'failed' ? <span style={{ color: '#FF7A80' }}>Missed it. The green arrow shows the move.</span>
            : !ready ? 'Watch their move…'
            : wrong > 0 && mode === 'drill' ? <span style={{ color: '#E8B447' }}>Not that one. {3 - wrong + 1} {3 - wrong + 1 === 1 ? 'try' : 'tries'} left</span> : toMove === myColor.current ? `${myColor.current === 'w' ? 'White' : 'Black'} to move: find the best move` : '…'}
        </span>
        {mode !== 'speed' && <span style={{ color: PT.muted }}>{puzzle.rating}</span>}
      </div>
      <ChessBoard key={`${puzzle.id}-${nonce}`} fen={fen} flipped={myColor.current === 'b'} practiceMode={ready && status === 'play' && toMove === myColor.current}
        expectedMoveSan={expected?.san ?? null} onMovePlayed={(san) => onMove(san)} lastMove={last} arrows={arrow} maxWidthOverride="100%" suppressConfirmMoves />
      {mode !== 'speed' && (
        <div className="flex flex-wrap items-center gap-2">
          {status === 'play' && mode !== 'guided' && (
            <button onClick={() => { setHint(true); setMissed(true); }} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold"
              style={{ background: hint ? '#E8B447' : 'rgba(255,255,255,.07)', color: hint ? '#1A1A19' : PT.text }}>
              <Lightbulb size={14} /> {hint ? 'Hint on' : 'Hint'}
            </button>
          )}
          {status !== 'play' && onNext && (
            <button onClick={onNext} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-extrabold" style={{ background: PT.green, color: '#fff' }}>
              {status === 'solved' ? <Check size={15} /> : <X size={15} />} {nextLabel} <ChevronRight size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
