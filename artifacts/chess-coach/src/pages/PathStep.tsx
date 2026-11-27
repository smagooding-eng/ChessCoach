// One Learn Path step on its own simple screen: just the board and what to do, nothing else.
// Lesson (a pattern walked through move by move), tactic and puzzle sets (fixed puzzles; a missed
// one comes back at the end), openings and traps (play your side of the line), and the reviews
// (your bot game, then one recent game of your own: the biggest moments, graded on this device).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { Chess } from 'chess.js';
import { ArrowLeft, Check, ChevronRight, Lightbulb, RotateCcw, X } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { type TacticPuzzleData } from '@/components/tactics/TacticPuzzle';
import { ScoutIcon } from '@/components/ScoutIcons';
import { apiFetch } from '@/lib/api';
import { gradeMove, type DeviceGrade } from '@/lib/deviceEngine';
import { stepByKey, completeStep, startStep, setPathReview, readPath, lastBotGame, setHasGames, type Level, type Step } from '@/lib/learnPath';

const MUTED = '#8F9997', GREEN = '#81B64C', GOLD = '#E8B447', CARD = '#182123', CARD2 = '#212B2D', BORDER = 'rgba(255,255,255,.07)';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function Note({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'good' | 'warn' }) {
  const c = tone === 'good' ? GREEN : tone === 'warn' ? GOLD : '#F5F7F6';
  return <div className="rounded-[14px] px-3.5 py-3 text-[14px] leading-snug" style={{ background: CARD, border: `1px solid ${tone === 'plain' ? BORDER : c + '55'}`, color: c }}>{children}</div>;
}

function Banner({ kind, children }: { kind: 'good' | 'bad' | 'info'; children: React.ReactNode }) {
  const c = kind === 'good' ? GREEN : kind === 'bad' ? '#E8524A' : '#C9D1D3';
  return (
    <div className="flex items-center gap-2 rounded-[14px] px-3.5 py-2.5 text-[15px] font-extrabold" style={{ background: kind === 'info' ? CARD : `${c}22`, border: `1.5px solid ${c}`, color: kind === 'info' ? '#F5F7F6' : c }}>
      {kind === 'good' ? <Check size={18} strokeWidth={3.5} /> : kind === 'bad' ? <X size={18} strokeWidth={3.5} /> : null}<span className="min-w-0">{children}</span>
    </div>
  );
}

/** Play your side of a line; the other side answers by itself. Notes follow each move.
 *  drill: the line has to be played with no wrong moves and no help to count; after the third
 *  try a Skip shows (skipping gives no credit). */
function LinePlayer({ startFen = START, moves, userColor, notes, intro, drill = false, onDone, onSkip }: {
  startFen?: string; moves: string[]; userColor: 'w' | 'b'; notes?: string[]; intro?: string; drill?: boolean; onDone: () => void; onSkip?: () => void;
}) {
  const chess = useMemo(() => new Chess(startFen), [startFen]);
  const [fen, setFen] = useState(startFen);
  const [idx, setIdx] = useState(0);
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [wrongHere, setWrongHere] = useState(0);
  const [slips, setSlips] = useState(0); // wrong moves or help this run
  const [tries, setTries] = useState(1);
  const [show, setShow] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [note, setNote] = useState<string | null>(intro ?? null);
  const [flash, setFlash] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);
  const done = idx >= moves.length;
  const turn = new Chess(fen).turn();
  const mine = !done && turn === userColor;
  const expected = useMemo(() => { if (done) return null; try { const m = new Chess(fen).move(moves[idx]); return m ? { san: m.san, from: m.from, to: m.to } : null; } catch { return null; } }, [fen, idx, done, moves]);

  const play = (san: string) => {
    const m = chess.move(san); if (!m) return;
    setFen(chess.fen()); setLast({ from: m.from, to: m.to });
    if (notes?.[idx]) setNote(notes[idx]);
    setIdx((i) => i + 1); setWrongHere(0); setShow(false);
  };
  useEffect(() => {
    if (done || mine || !expected) return;
    const t = setTimeout(() => play(expected.san), 650);
    return () => clearTimeout(t);
  }, [idx, mine, done]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMove = (san: string) => {
    if (!expected) return;
    if (san === expected.san) { setFlash({ kind: 'good', text: `${san}: correct` }); play(san); return; }
    setFlash({ kind: 'bad', text: `${san} isn't the move. Try again.` });
    setNonce((n) => n + 1); setWrongHere((w) => w + 1); setSlips((x) => x + 1);
    if (wrongHere + 1 >= 2) setShow(true);
  };
  const restart = (newTry: boolean) => {
    chess.load(startFen); setFen(startFen); setIdx(0); setLast(null); setWrongHere(0); setSlips(0); setShow(false); setNote(intro ?? null); setFlash(null); setNonce((n) => n + 1);
    if (newTry) setTries((t) => t + 1);
  };
  const perfect = slips === 0;

  return (
    <div className="cs-split space-y-3">
      <div className="flex items-center justify-between text-[13px] font-bold">
        <span style={{ color: MUTED }}>{drill ? `Try ${tries} · ${perfect ? 'no mistakes so far' : `${slips} mistake${slips === 1 ? '' : 's'}`}` : ''}</span>
        <span style={{ color: MUTED }}>Move {Math.min(idx + 1, moves.length)} of {moves.length}</span>
      </div>
      {done ? (drill && !perfect
          ? <Banner kind="bad">Line finished with {slips} mistake{slips === 1 ? '' : 's'}. Play it once with no mistakes to complete it.</Banner>
          : <Banner kind="good">{drill ? 'Perfect run! Line learned.' : 'Line complete!'}</Banner>)
        : flash ? <Banner kind={flash.kind}>{flash.text}</Banner>
        : <Banner kind="info">{mine ? `Your move (${userColor === 'w' ? 'White' : 'Black'})` : 'Their move…'}</Banner>}
      <div className="cs-split-main"><ChessBoard key={nonce} fen={fen} flipped={userColor === 'b'} practiceMode={mine} expectedMoveSan={expected?.san ?? null} onMovePlayed={onMove}
        lastMove={last} arrows={mine && expected && show ? [{ from: expected.from, to: expected.to, color: 'rgba(129,182,76,0.85)' }] : undefined} maxWidthOverride="100%" suppressConfirmMoves /></div>
      {note && <Note>{note}</Note>}
      {!done && (
        <div className="flex gap-2">
          {mine && !show && <button onClick={() => { setShow(true); setSlips((x) => x + 1); }} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[13.5px] font-bold" style={{ background: CARD2 }}><Lightbulb size={15} /> Show me{drill ? ' (counts as a mistake)' : ''}</button>}
          {idx > 0 && <button onClick={() => restart(drill && !perfect)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[13.5px] font-bold" style={{ background: CARD2 }}><RotateCcw size={15} /> Start again</button>}
        </div>
      )}
      {done && (drill && !perfect ? (
        <div className="space-y-2">
          <button onClick={() => restart(true)} className="cs-cta"><RotateCcw size={17} /> Play it again</button>
          {tries >= 3 && onSkip && <button onClick={onSkip} className="w-full rounded-[14px] py-3 text-[14px] font-bold" style={{ background: CARD2, color: '#F5F7F6' }}>Skip for now (doesn't count)</button>}
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => restart(false)} className="inline-flex items-center gap-1.5 rounded-[14px] px-3.5 text-[13.5px] font-bold" style={{ background: CARD2 }}><RotateCcw size={15} /> Again</button>
          <button onClick={onDone} className="cs-cta flex-1">Done <ChevronRight size={17} /></button>
        </div>
      ))}
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

type Moment = { ply: number; fenBefore: string; san: string; grade: DeviceGrade };
const BAD = new Set(['blunder', 'mistake', 'missed_win', 'inaccuracy']);
const LABEL: Record<string, string> = { blunder: 'Blunder', mistake: 'Mistake', missed_win: 'Missed win', inaccuracy: 'Inaccuracy' };

/** Grade your moves on this device and walk through the biggest moments. */
function GameReview({ pgn, color, title, fullHref, onDone, doneLabel = 'Done' }: { pgn: string; color: 'w' | 'b'; title: string; fullHref?: string; onDone: () => void; doneLabel?: string }) {
  const positions = useMemo(() => {
    const out: { fen: string; san: string; ply: number }[] = [];
    try {
      const g = new Chess(); g.loadPgn(pgn);
      const hist = g.history();
      const c = new Chess();
      try { const h = g.header(); if (h.FEN) c.load(h.FEN); } catch { /* */ }
      hist.forEach((san, ply) => { if (c.turn() === color) out.push({ fen: c.fen(), san, ply }); c.move(san); });
    } catch { /* bad pgn */ }
    return out;
  }, [pgn, color]);
  const [graded, setGraded] = useState(0);
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [at, setAt] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    (async () => {
      const all: Moment[] = []; const cnt: Record<string, number> = {};
      for (const p of positions) {
        if (!alive.current) return;
        const g = await gradeMove(p.fen, p.san, 11);
        if (g) { all.push({ ply: p.ply, fenBefore: p.fen, san: p.san, grade: g }); cnt[g.quality] = (cnt[g.quality] ?? 0) + 1; }
        setGraded((n) => n + 1);
      }
      if (!alive.current) return;
      setCounts(cnt);
      setMoments(all.filter((m) => BAD.has(m.grade.quality)).sort((a, b) => b.grade.cpLoss - a.grade.cpLoss).slice(0, 3).sort((a, b) => a.ply - b.ply));
    })();
    return () => { alive.current = false; };
  }, [positions]);

  if (!positions.length) return <Note tone="warn">This game couldn't be read.</Note>;
  if (!moments) return (
    <div className="space-y-3">
      <Note>Checking your {positions.length} moves in {title}… {graded}/{positions.length}</Note>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}><div className="h-full rounded-full transition-all" style={{ width: `${(graded / positions.length) * 100}%`, background: GREEN }} /></div>
    </div>
  );
  const good = (counts.best ?? 0) + (counts.excellent ?? 0) + (counts.good ?? 0) + (counts.checkmate ?? 0);
  const m = moments[at];
  const best = m?.grade.bestMoveSan ? (() => { try { const x = new Chess(m.fenBefore).move(m.grade.bestMoveSan!); return x ? { from: x.from, to: x.to } : null; } catch { return null; } })() : null;
  const played = m ? (() => { try { const x = new Chess(m.fenBefore).move(m.san); return x ? { from: x.from, to: x.to } : null; } catch { return null; } })() : null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        {[['Good', good, GREEN], ['Inaccuracies', counts.inaccuracy ?? 0, '#F0C95A'], ['Mistakes', counts.mistake ?? 0, '#F08A4B'], ['Blunders', (counts.blunder ?? 0) + (counts.missed_win ?? 0), '#E8524A']].map(([l, n, c]) => (
          <div key={l as string} className="rounded-[12px] py-2" style={{ background: CARD, border: `1px solid ${BORDER}` }}><b className="block text-[18px] font-black" style={{ color: c as string }}>{n as number}</b><span className="text-[11px]" style={{ color: MUTED }}>{l as string}</span></div>
        ))}
      </div>
      {!m ? <Note tone="good">No big mistakes in this game. Well played!</Note> : <>
        <div className="flex items-center justify-between text-[13px] font-bold"><span>Moment {at + 1} of {moments.length}</span><span style={{ color: MUTED }}>Move {Math.floor(m.ply / 2) + 1}</span></div>
        <ChessBoard fen={m.fenBefore} flipped={color === 'b'} arrows={[...(played ? [{ from: played.from, to: played.to, color: 'rgba(232,82,74,0.85)' }] : []), ...(best ? [{ from: best.from, to: best.to, color: 'rgba(129,182,76,0.9)' }] : [])]} maxWidthOverride="100%" />
        <Note tone="warn"><b>{LABEL[m.grade.quality] ?? 'Slip'}:</b> you played <b>{m.san}</b> (red).{m.grade.bestMoveSan && <> Better was <b style={{ color: GREEN }}>{m.grade.bestMoveSan}</b> (green).</>}</Note>
      </>}
      <div className="flex gap-2">
        {m && at > 0 && <button onClick={() => setAt(at - 1)} className="rounded-xl px-3 py-2 text-[13px] font-bold" style={{ background: CARD2 }}>Back</button>}
        {m && at < moments.length - 1 ? <button onClick={() => setAt(at + 1)} className="cs-cta flex-1">Next moment</button>
          : <button onClick={onDone} className="cs-cta flex-1">{doneLabel}</button>}
      </div>
      {fullHref && <Link href={fullHref} className="block text-center text-[13px] font-bold underline" style={{ color: MUTED }}>Open the full review</Link>}
    </div>
  );
}

const QCOL: Record<string, string> = { checkmate: '#81B64C', best: '#81B64C', excellent: '#97C46A', good: '#B5C9A0', inaccuracy: '#F0C95A', mistake: '#F08A4B', blunder: '#E8524A', missed_win: '#E8524A' };
const QNAME: Record<string, string> = { checkmate: 'Checkmate', best: 'Best move', excellent: 'Excellent', good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder', missed_win: 'Missed win' };

/** The whole game, every one of your moves graded by the engine on this device (no coach):
 *  step through it move by move, jump to the next mistake, best move shown in green. */
function FullEngineReview({ pgn, color, title, onDone, doneLabel = 'Done' }: { pgn: string; color: 'w' | 'b'; title: string; onDone: () => void; doneLabel?: string }) {
  const plies = useMemo(() => {
    const out: { fen: string; san: string; from: string; to: string; side: 'w' | 'b'; ply: number }[] = [];
    try {
      const g = new Chess(); g.loadPgn(pgn);
      const c = new Chess();
      try { const h = g.header(); if (h.FEN) c.load(h.FEN); } catch { /* */ }
      g.history().forEach((san, ply) => { const fen = c.fen(); const m = c.move(san); out.push({ fen, san: m.san, from: m.from, to: m.to, side: m.color, ply }); });
    } catch { /* bad pgn */ }
    return out;
  }, [pgn]);
  const mine = useMemo(() => plies.filter((p) => p.side === color), [plies, color]);
  const [grades, setGrades] = useState<Record<number, DeviceGrade>>({});
  const [checked, setChecked] = useState(0);
  const [cur, setCur] = useState(-1); // -1 = summary
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const p of mine) {
        if (!alive) return;
        const g = await gradeMove(p.fen, p.san, 12);
        if (!alive) return;
        if (g) setGrades((x) => ({ ...x, [p.ply]: g }));
        setChecked((n) => n + 1);
      }
    })();
    return () => { alive = false; };
  }, [mine]);
  if (!plies.length) return <Note tone="warn">This game couldn't be read.</Note>;
  const doneGrading = checked >= mine.length;
  const count = (qs: string[]) => mine.filter((p) => grades[p.ply] && qs.includes(grades[p.ply].quality)).length;
  const bad = (i: number) => { const g = grades[plies[i].ply]; return plies[i].side === color && g && ['inaccuracy', 'mistake', 'blunder', 'missed_win'].includes(g.quality); };
  const nextBad = (() => { for (let i = cur + 1; i < plies.length; i++) if (bad(i)) return i; return -1; })();
  const p = cur >= 0 ? plies[cur] : null;
  const g = p ? grades[p.ply] : undefined;
  const best = p && g?.bestMoveSan && !g.isTopMove ? (() => { try { const x = new Chess(p.fen).move(g.bestMoveSan!); return x ? { from: x.from, to: x.to } : null; } catch { return null; } })() : null;
  const arrows = p ? [{ from: p.from, to: p.to, color: p.side === color && g ? `${QCOL[g.quality]}dd` : 'rgba(201,209,211,.7)' }, ...(best ? [{ from: best.from, to: best.to, color: 'rgba(129,182,76,0.95)' }] : [])] : undefined;
  return (
    <div className="cs-split space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        {([['Good', count(['best', 'excellent', 'good', 'checkmate']), GREEN], ['Inaccuracies', count(['inaccuracy']), '#F0C95A'], ['Mistakes', count(['mistake']), '#F08A4B'], ['Blunders', count(['blunder', 'missed_win']), '#E8524A']] as const).map(([l, n, c]) => (
          <div key={l} className="rounded-[12px] py-2" style={{ background: CARD, border: `1px solid ${BORDER}` }}><b className="block text-[18px] font-black" style={{ color: c }}>{n}</b><span className="text-[11px]" style={{ color: MUTED }}>{l}</span></div>
        ))}
      </div>
      {!doneGrading && <div className="space-y-1"><span className="text-[12.5px] font-bold" style={{ color: MUTED }}>The engine is checking {title}… {checked}/{mine.length}</span>
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}><div className="h-full rounded-full" style={{ width: `${(checked / Math.max(1, mine.length)) * 100}%`, background: GREEN }} /></div></div>}
      <div className="cs-split-main"><ChessBoard fen={p ? p.fen : plies[0].fen} flipped={color === 'b'} arrows={arrows} maxWidthOverride="100%" /></div>
      {p ? (
        <div className="rounded-[14px] px-3.5 py-3 text-[14px] leading-snug" style={{ background: CARD, border: `1.5px solid ${p.side === color && g ? QCOL[g.quality] : BORDER}` }}>
          <b>{Math.floor(p.ply / 2) + 1}{p.side === 'w' ? '.' : '…'} {p.san}</b>
          {p.side !== color ? <span style={{ color: MUTED }}> · their move</span>
            : g ? <> · <b style={{ color: QCOL[g.quality] }}>{QNAME[g.quality]}</b>{best && g.bestMoveSan && <> · better was <b style={{ color: GREEN }}>{g.bestMoveSan}</b> (green)</>}</>
            : <span style={{ color: MUTED }}> · checking…</span>}
        </div>
      ) : <Note>Tap a move, use the arrows, or jump to your next mistake.</Note>}
      <div className="flex gap-2">
        <button onClick={() => setCur((c) => Math.max(-1, c - 1))} disabled={cur < 0} className="rounded-xl px-4 py-2.5 text-[15px] font-black disabled:opacity-40" style={{ background: CARD2 }}>‹</button>
        <button onClick={() => setCur((c) => Math.min(plies.length - 1, c + 1))} disabled={cur >= plies.length - 1} className="rounded-xl px-4 py-2.5 text-[15px] font-black disabled:opacity-40" style={{ background: CARD2 }}>›</button>
        <button onClick={() => nextBad >= 0 && setCur(nextBad)} disabled={nextBad < 0} className="flex-1 rounded-xl px-3 py-2.5 text-[13.5px] font-bold disabled:opacity-40" style={{ background: CARD2 }}>Next mistake</button>
      </div>
      <div className="flex max-h-[160px] flex-wrap gap-1 overflow-y-auto rounded-[14px] p-2" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        {plies.map((x, i) => {
          const q = x.side === color ? grades[x.ply]?.quality : undefined;
          return <button key={i} onClick={() => setCur(i)} className="rounded-[8px] px-1.5 py-0.5 text-[12.5px] font-bold"
            style={{ background: i === cur ? '#3A4446' : 'transparent', color: q ? QCOL[q] : x.side === color ? '#F5F7F6' : MUTED }}>{x.side === 'w' ? `${Math.floor(x.ply / 2) + 1}.` : ''}{x.san}</button>;
        })}
      </div>
      <button onClick={onDone} disabled={!doneGrading} className="cs-cta">{doneGrading ? <>{doneLabel} <ChevronRight size={17} /></> : 'Checking the game…'}</button>
    </div>
  );
}

/** Finds the game (your latest game against this bot, or your latest imported game) and opens
 *  the full Game Review for it. */
function OpenFullReview({ find, bot, at, stepKey, onNone }: { find: 'bot' | 'recent'; bot?: string; at?: number; stepKey: string | null; onNone?: () => void }) {
  const [, navigate] = useLocation();
  const [none, setNone] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(find === 'bot' ? '/api/games?source=bots&limit=10' : '/api/games?limit=1', { credentials: 'include' });
        const d = r.ok ? await r.json() : null;
        const list = (d?.games ?? d ?? []) as { id: number; whiteUsername?: string; blackUsername?: string; playedAt?: string }[];
        // the path game: against this bot, saved when that game ended (not a later game from the bot list)
        const vsBot = list.filter((x) => [x.whiteUsername, x.blackUsername].some((n) => (n ?? '').toLowerCase().startsWith(`${(bot ?? '').toLowerCase()} (bot)`)));
        const g = find === 'bot' ? (at ? vsBot.find((x) => x.playedAt && Math.abs(Date.parse(x.playedAt) - at) < 10 * 60_000) : vsBot[0]) : list[0];
        if (!g) { if (find === 'recent') setHasGames(false); setNone(true); return; }
        setPathReview(g.id, stepKey);
        navigate(`/games/${g.id}`);
      } catch { setNone(true); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (none) return find === 'recent'
    ? <div className="space-y-3"><Note>No imported games yet, so this step is skipped.</Note><button onClick={onNone} className="cs-cta">Continue</button></div>
    : <Note tone="warn">That game hasn't been saved yet. Give it a moment and try again.</Note>;
  return <Note>Opening the full review…</Note>;
}

/** Your most recent imported game, loaded for the review step. */
function RecentReview({ onDone }: { onDone: () => void }) {
  const [g, setG] = useState<{ id: number; pgn: string; color: 'w' | 'b'; title: string } | null | 'none'>(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch('/api/games?limit=1', { credentials: 'include' });
        const d = r.ok ? await r.json() : null;
        const first = (d?.games ?? d ?? [])[0];
        if (!first) { setHasGames(false); setG('none'); return; }
        const full = await (await apiFetch(`/api/games/${first.id}`, { credentials: 'include' })).json();
        const me = String(full.yourSide ?? first.yourSide ?? '').toLowerCase();
        const color: 'w' | 'b' = me.startsWith('b') ? 'b' : 'w';
        setG({ id: first.id, pgn: full.pgn, color, title: `your game vs ${color === 'w' ? full.blackUsername : full.whiteUsername}` });
      } catch { setG('none'); }
    })();
  }, []);
  if (g === null) return <Note>Finding your latest game…</Note>;
  if (g === 'none') return <div className="space-y-3"><Note>No imported games yet, so this step is skipped.</Note><button onClick={onDone} className="cs-cta">Back to the path</button></div>;
  return <FullEngineReview pgn={g.pgn} color={g.color} title={g.title} onDone={onDone} doneLabel="Next" />;
}

function Body({ level, step, finish }: { level: Level; step: Step; finish: () => void }) {
  const c = level.content;
  const [, navigate] = useLocation();
  switch (step.kind) {
    case 'lesson': {
      const d = level.motif.demo;
      if (!d) return <Note>{level.motif.blurb}</Note>;
      const color = new Chess(d.fen).turn();
      return (<div className="space-y-3"><Note><b>{level.motif.name}.</b> {level.motif.blurb}</Note>
        <LinePlayer startFen={d.fen} moves={d.steps.map((x) => x.san)} notes={d.steps.map((x) => x.say)} userColor={color} intro={d.intro} onDone={finish} /></div>);
    }
    case 'tactic': return <PuzzleSet puzzles={c.tactic} onDone={finish} />;
    case 'puzzles': return <PuzzleSet puzzles={c.puzzles} onDone={finish} />;
    case 'opening': {
      const o = step.key.endsWith('white') ? level.white : level.black;
      if (!o) return null;
      return (<div className="space-y-3">{o.ideas?.length ? <Note><b>The ideas:</b> {o.ideas.join(' · ')}</Note> : null}
        <LinePlayer moves={o.moves} userColor={o.userColor} drill onDone={finish} onSkip={() => navigate('/path')} /></div>);
    }
    case 'trap': return (<div className="space-y-3"><Note>{c.trap.summary}</Note>
      <LinePlayer moves={c.trap.trapLineSan} notes={c.trap.moveNotes} userColor={c.trap.trapSide === 'white' ? 'w' : 'b'} drill onDone={finish} onSkip={() => navigate('/path')} /></div>);
    case 'review': {
      const g = lastBotGame(level.bot.name);
      if (!g) return <div className="space-y-3"><Note>Play {level.bot.name} from the path first: this reviews that game (bot games played elsewhere aren't reviewed here).</Note><Link href={`/practice?bot=${encodeURIComponent(level.bot.name)}`} onClick={() => { const b = level.steps.find((x) => x.kind === 'bot'); if (b) startStep(b); }} className="cs-cta block text-center">Play {level.bot.name}</Link></div>;
      // a lost game can be reviewed too, but the step only counts once the bot is beaten
      const beaten = !!readPath().done[`L${level.n}-bot`];
      return (<div className="space-y-3">
        {!beaten && <Note tone="warn">You haven't beaten {level.bot.name} yet. Look at what went wrong, then try again.</Note>}
        <FullEngineReview pgn={g.pgn} color={g.color} title={`your game vs ${level.bot.name}`} onDone={beaten ? finish : () => { const b = level.steps.find((x) => x.kind === 'bot'); if (b) { startStep(b); navigate(b.href); } }} doneLabel={beaten ? 'Next' : `Play ${level.bot.name} again`} />
      </div>);
    }
    case 'recent': return <RecentReview onDone={finish} />;
    default: return null;
  }
}

export default function PathStepPage() {
  const { key } = useParams<{ key: string }>();
  const [, navigate] = useLocation();
  const found = stepByKey(key ?? '');
  const [done, setDone] = useState(false);
  if (!found) return <div className="p-6"><Note>That step isn't on the path. <Link href="/path" className="underline">Back to the path</Link></Note></div>;
  const { level, step } = found;
  const finish = () => {
    completeStep(step.key);
    if (step.kind === 'review' || step.kind === 'recent') {
      const after = level.steps.find((x) => !readPath().done[x.key]);
      if (after && (after.kind === 'recent' || after.kind === 'review')) { navigate(after.href); return; }
      navigate('/path'); return;
    }
    setDone(true);
  };
  const s = readPath();
  const next = level.steps.find((x) => !s.done[x.key] && x.key !== step.key);

  return (
    <div className="cs-split-wide relative z-10 mx-auto w-full max-w-[560px] px-4 pb-32 pt-3" style={{ color: '#F5F7F6' }}>
      <div className="mb-3 flex items-center gap-3">
        <Link href="/path" aria-label="Back to the path" className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: GREEN }}><ArrowLeft size={22} /></Link>
        <ScoutIcon name={step.icon} size={34} />
        <div className="min-w-0">
          <b className="block truncate text-[18px] font-black">{step.title}</b>
          <span className="text-[12.5px]" style={{ color: MUTED }}>Level {level.n} · {level.bot.name}</span>
        </div>
      </div>
      {done ? (
        <div className="space-y-3 pt-4 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full" style={{ background: GREEN }}><Check size={34} strokeWidth={4} color="#fff" /></div>
          <b className="block text-[20px] font-black">Step complete</b>
          {next ? <button onClick={() => { setDone(false); startStep(next); navigate(next.href); }} className="cs-cta">Next: {next.title}</button> : null}
          <Link href="/path" className="block text-[14px] font-bold underline" style={{ color: MUTED }}>Back to the path</Link>
        </div>
      ) : <Body key={step.key} level={level} step={step} finish={finish} />}
    </div>
  );
}
