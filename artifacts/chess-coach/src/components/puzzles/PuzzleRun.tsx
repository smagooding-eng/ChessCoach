// A short run of puzzles with clear feedback (used by the Learn Path and Today's 3):
// right or wrong after every move, a hint, the answer after 3 tries, a big Next
// button; a puzzle missed or solved with help comes back at the end of the set.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Check, ChevronRight, Lightbulb, X } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { type TacticPuzzleData } from '@/components/tactics/TacticPuzzle';

const MUTED = '#8F9997', GREEN = '#81B64C', CARD = '#182123', CARD2 = '#212B2D';

function Banner({ kind, children }: { kind: 'good' | 'bad' | 'info'; children: React.ReactNode }) {
  const c = kind === 'good' ? GREEN : kind === 'bad' ? '#E8524A' : '#C9D1D3';
  return (
    <div className="flex items-center gap-2 rounded-[14px] px-3.5 py-2.5 text-[15px] font-extrabold" style={{ background: kind === 'info' ? CARD : `${c}22`, border: `1.5px solid ${c}`, color: kind === 'info' ? '#F5F7F6' : c }}>
      {kind === 'good' ? <Check size={18} strokeWidth={3.5} /> : kind === 'bad' ? <X size={18} strokeWidth={3.5} /> : null}<span className="min-w-0">{children}</span>
    </div>
  );
}

const uci = (c: Chess, u: string) => { try { return c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: (u[4] as 'q' | 'r' | 'b' | 'n' | undefined) }); } catch { return null; } };

/** One puzzle with clear feedback: right or wrong after every move, a hint, the answer after 3
 *  tries, and a big Next button. clean = solved with no wrong move and no help. */
function PathPuzzle({ p, last, onNext }: { p: TacticPuzzleData; last: boolean; onNext: (clean: boolean) => void }) {
  const chess = useMemo(() => new Chess(p.fen), [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const solution = p.setup ? p.moves.slice(1) : p.moves;
  const me = useMemo(() => { const t = new Chess(p.fen).turn(); return p.setup ? (t === 'w' ? 'b' : 'w') : t; }, [p]);
  const [fen, setFen] = useState(p.fen);
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(!p.setup);
  const [lastMv, setLastMv] = useState<{ from: string; to: string } | null>(null);
  const [wrong, setWrong] = useState(0);
  const [helped, setHelped] = useState(false);
  const [hint, setHint] = useState(false);
  const [state, setState] = useState<'play' | 'solved' | 'shown'>('play');
  const [flash, setFlash] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!p.setup) return;
    const t = setTimeout(() => { const m = uci(chess, p.moves[0]); if (m) { setFen(chess.fen()); setLastMv({ from: m.from, to: m.to }); } setReady(true); }, 700);
    return () => clearTimeout(t);
  }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const expected = useMemo(() => { if (!ready || state !== 'play' || idx >= solution.length) return null; const m = uci(new Chess(fen), solution[idx]); return m ? { san: m.san, from: m.from, to: m.to } : null; }, [fen, idx, ready, state, solution]);
  const reply = (next: number) => {
    if (next >= solution.length) { setIdx(next); setState('solved'); return; }
    setTimeout(() => { const m = uci(chess, solution[next]); if (m) { setFen(chess.fen()); setLastMv({ from: m.from, to: m.to }); } setIdx(next + 1); if (next + 1 >= solution.length) setState('solved'); }, 500);
  };
  const onMove = (san: string) => {
    if (!expected) return;
    const probe = new Chess(fen); const pm = probe.move(san);
    if (san === expected.san || probe.isCheckmate()) {
      chess.move(san); setFen(chess.fen()); setLastMv({ from: pm.from, to: pm.to }); setHint(false);
      setFlash({ kind: 'good', text: `${san}: correct!` });
      if (probe.isCheckmate()) { setIdx(solution.length); setState('solved'); return; }
      reply(idx + 1); return;
    }
    setNonce((n) => n + 1); setWrong((w) => w + 1);
    setFlash({ kind: 'bad', text: `${san} isn't it. Try again.` });
  };
  const showAnswer = () => {
    setHelped(true); setState('shown');
    let i = idx; const step = () => { if (i >= solution.length) return; const m = uci(chess, solution[i]); if (m) { setFen(chess.fen()); setLastMv({ from: m.from, to: m.to }); } i++; setIdx(i); if (i < solution.length) setTimeout(step, 600); };
    step();
  };
  const clean = state === 'solved' && wrong === 0 && !helped;
  const toMove = new Chess(fen).turn();
  return (
    <div className="cs-split space-y-3">
      {state === 'solved' ? <Banner kind="good">{clean ? 'Solved!' : 'Solved, with help. This one comes back at the end.'}</Banner>
        : state === 'shown' ? <Banner kind="bad">Here's the answer. This one comes back at the end.</Banner>
        : flash ? <Banner kind={flash.kind}>{flash.text}</Banner>
        : <Banner kind="info">{!ready ? 'Watch their move…' : `${me === 'w' ? 'White' : 'Black'} to move: find the best move`}</Banner>}
      <div className="cs-split-main"><ChessBoard key={`${p.id}-${nonce}`} fen={fen} flipped={me === 'b'} practiceMode={ready && state === 'play' && toMove === me}
        expectedMoveSan={expected?.san ?? null} onMovePlayed={onMove} lastMove={lastMv}
        arrows={hint && expected ? [{ from: expected.from, to: expected.to, color: 'rgba(129,182,76,0.85)' }] : undefined} maxWidthOverride="100%" suppressConfirmMoves /></div>
      {state === 'play' ? (
        <div className="flex gap-2">
          {ready && !hint && <button onClick={() => { setHint(true); setHelped(true); }} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[13.5px] font-bold" style={{ background: CARD2 }}><Lightbulb size={15} /> Hint</button>}
          {wrong >= 3 && <button onClick={showAnswer} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[13.5px] font-bold" style={{ background: CARD2 }}>Show the answer</button>}
          <span className="ml-auto self-center text-[12.5px]" style={{ color: MUTED }}>Rated {p.rating}</span>
        </div>
      ) : (
        <button onClick={() => onNext(clean)} className="cs-cta">{last && clean ? 'Finish' : 'Next puzzle'} <ChevronRight size={17} /></button>
      )}
    </div>
  );
}

/** A fixed set of puzzles; one missed (or solved with help) comes back at the end. */
export function PuzzleSet({ puzzles, onDone, onResult }: { puzzles: TacticPuzzleData[]; onDone: () => void; /** Each puzzle the first time it's finished: solved cleanly or not. */ onResult?: (p: TacticPuzzleData, clean: boolean) => void }) {
  const reported = useRef(new Set<number>());
  const [queue, setQueue] = useState(puzzles);
  const [solved, setSolved] = useState(0);
  const [round, setRound] = useState(0);
  const p = queue[0];
  if (!p) return <Banner kind="good">All solved!</Banner>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5">{puzzles.map((x, i) => <span key={x.id} className="h-2 flex-1 rounded-full" style={{ background: i < solved ? GREEN : 'rgba(255,255,255,.1)' }} />)}</div>
        <span className="text-[12.5px] font-extrabold">{solved}/{puzzles.length}</span>
      </div>
      <PathPuzzle key={`${p.id}-${round}`} p={p} last={queue.length === 1}
        onNext={(clean) => {
          if (!reported.current.has(p.id)) { reported.current.add(p.id); onResult?.(p, clean); }
          setRound((r) => r + 1);
          if (clean) { const left = queue.slice(1); setSolved((n) => n + 1); setQueue(left); if (!left.length) onDone(); }
          else setQueue([...queue.slice(1), queue[0]]);
        }} />
    </div>
  );
}
