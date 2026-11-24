// One Learn Path step on its own simple screen: just the board and what to do, nothing else.
// Lesson (a pattern walked through move by move), tactic and puzzle sets (fixed puzzles; a missed
// one comes back at the end), openings and traps (play your side of the line), and the reviews
// (your bot game, then one recent game of your own: the biggest moments, graded on this device).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { Chess } from 'chess.js';
import { ArrowLeft, Check, ChevronRight, Lightbulb, RotateCcw } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { TacticPuzzle, type TacticPuzzleData } from '@/components/tactics/TacticPuzzle';
import { ScoutIcon } from '@/components/ScoutIcons';
import { apiFetch } from '@/lib/api';
import { gradeMove, type DeviceGrade } from '@/lib/deviceEngine';
import { stepByKey, completeStep, startStep, readPath, lastBotGame, setHasGames, type Level, type Step } from '@/lib/learnPath';

const MUTED = '#8F9997', GREEN = '#81B64C', GOLD = '#E8B447', CARD = '#182123', CARD2 = '#212B2D', BORDER = 'rgba(255,255,255,.07)';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function Note({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'good' | 'warn' }) {
  const c = tone === 'good' ? GREEN : tone === 'warn' ? GOLD : '#F5F7F6';
  return <div className="rounded-[14px] px-3.5 py-3 text-[14px] leading-snug" style={{ background: CARD, border: `1px solid ${tone === 'plain' ? BORDER : c + '55'}`, color: c }}>{children}</div>;
}

/** Play your side of a line; the other side answers by itself. Notes follow each move. */
function LinePlayer({ startFen = START, moves, userColor, notes, intro, onDone }: {
  startFen?: string; moves: string[]; userColor: 'w' | 'b'; notes?: string[]; intro?: string; onDone: () => void;
}) {
  const chess = useMemo(() => new Chess(startFen), [startFen]);
  const [fen, setFen] = useState(startFen);
  const [idx, setIdx] = useState(0);
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [wrong, setWrong] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [note, setNote] = useState<string | null>(intro ?? null);
  const done = idx >= moves.length;
  const turn = new Chess(fen).turn();
  const mine = !done && turn === userColor;
  const expected = useMemo(() => { if (done) return null; try { const m = new Chess(fen).move(moves[idx]); return m ? { san: m.san, from: m.from, to: m.to } : null; } catch { return null; } }, [fen, idx, done, moves]);

  const play = (san: string) => {
    const m = chess.move(san); if (!m) return;
    setFen(chess.fen()); setLast({ from: m.from, to: m.to });
    if (notes?.[idx]) setNote(notes[idx]);
    setIdx((i) => i + 1); setWrong(0);
  };
  // their moves
  useEffect(() => {
    if (done || mine || !expected) return;
    const t = setTimeout(() => play(expected.san), 650);
    return () => clearTimeout(t);
  }, [idx, mine, done]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMove = (san: string) => {
    if (!expected) return;
    if (san === expected.san) { play(san); return; }
    setNonce((n) => n + 1); setWrong((w) => w + 1);
  };
  const restart = () => { chess.load(startFen); setFen(startFen); setIdx(0); setLast(null); setWrong(0); setNote(intro ?? null); setNonce((n) => n + 1); };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[13px] font-bold">
        <span style={{ color: done ? GREEN : wrong ? GOLD : '#F5F7F6' }}>
          {done ? 'Line complete!' : !mine ? 'Their move…' : wrong >= 2 ? 'Follow the green arrow' : wrong ? 'Not that one. Try again' : `Your move (${userColor === 'w' ? 'White' : 'Black'})`}
        </span>
        <span style={{ color: MUTED }}>Move {Math.min(idx + 1, moves.length)} of {moves.length}</span>
      </div>
      <ChessBoard key={nonce} fen={fen} flipped={userColor === 'b'} practiceMode={mine} expectedMoveSan={expected?.san ?? null} onMovePlayed={onMove}
        lastMove={last} arrows={mine && expected && wrong >= 2 ? [{ from: expected.from, to: expected.to, color: 'rgba(129,182,76,0.85)' }] : undefined} maxWidthOverride="100%" suppressConfirmMoves />
      {note && <Note>{note}</Note>}
      <div className="flex gap-2">
        {mine && wrong < 2 && <button onClick={() => setWrong(2)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold" style={{ background: CARD2 }}><Lightbulb size={15} /> Show me</button>}
        {idx > 0 && <button onClick={restart} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold" style={{ background: CARD2 }}><RotateCcw size={15} /> Start again</button>}
        {done && <button onClick={onDone} className="cs-cta flex-1">Done <ChevronRight size={16} className="inline" /></button>}
      </div>
    </div>
  );
}

/** A fixed set of puzzles; a missed one comes back at the end until it's solved. */
function PuzzleSet({ puzzles, onDone }: { puzzles: TacticPuzzleData[]; onDone: () => void }) {
  const [queue, setQueue] = useState(puzzles);
  const [solved, setSolved] = useState(0);
  const [result, setResult] = useState<boolean | null>(null);
  const p = queue[0];
  const next = () => {
    const ok = result;
    setResult(null);
    if (ok) { const left = queue.slice(1); setQueue(left); if (!left.length) onDone(); }
    else setQueue([...queue.slice(1), queue[0]]);
  };
  if (!p) return <Note tone="good">All solved!</Note>;
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">{puzzles.map((x, i) => <span key={x.id} className="h-2 flex-1 rounded-full" style={{ background: i < solved ? GREEN : 'rgba(255,255,255,.1)' }} />)}</div>
      <TacticPuzzle key={`${p.id}-${queue.length}`} puzzle={p} mode="drill"
        onDone={(ok) => { setResult(ok); if (ok) setSolved((n) => n + 1); }}
        onNext={next} nextLabel={result ? (queue.length > 1 ? 'Next puzzle' : 'Finish') : 'Try it again later'} />
      {result === false && <Note tone="warn">This one comes back at the end.</Note>}
    </div>
  );
}

type Moment = { ply: number; fenBefore: string; san: string; grade: DeviceGrade };
const BAD = new Set(['blunder', 'mistake', 'missed_win', 'inaccuracy']);
const LABEL: Record<string, string> = { blunder: 'Blunder', mistake: 'Mistake', missed_win: 'Missed win', inaccuracy: 'Inaccuracy' };

/** Grade your moves on this device and walk through the biggest moments. */
function GameReview({ pgn, color, title, fullHref, onDone }: { pgn: string; color: 'w' | 'b'; title: string; fullHref?: string; onDone: () => void }) {
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
          : <button onClick={onDone} className="cs-cta flex-1">Done</button>}
      </div>
      {fullHref && <Link href={fullHref} className="block text-center text-[13px] font-bold underline" style={{ color: MUTED }}>Open the full review</Link>}
    </div>
  );
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
  return <GameReview pgn={g.pgn} color={g.color} title={g.title} fullHref={`/games/${g.id}`} onDone={onDone} />;
}

function Body({ level, step, finish }: { level: Level; step: Step; finish: () => void }) {
  const c = level.content;
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
        <LinePlayer moves={o.moves} userColor={o.userColor} onDone={finish} /></div>);
    }
    case 'trap': return (<div className="space-y-3"><Note>{c.trap.summary}</Note>
      <LinePlayer moves={c.trap.trapLineSan} notes={c.trap.moveNotes} userColor={c.trap.trapSide === 'white' ? 'w' : 'b'} onDone={finish} /></div>);
    case 'review': {
      const g = lastBotGame(level.bot.name);
      if (!g) return <div className="space-y-3"><Note>Play {level.bot.name} from the path first: this reviews that game (bot games played elsewhere aren't reviewed here).</Note><Link href={`/practice?bot=${encodeURIComponent(level.bot.name)}`} onClick={() => { const b = level.steps.find((x) => x.kind === 'bot'); if (b) startStep(b); }} className="cs-cta block text-center">Play {level.bot.name}</Link></div>;
      return <GameReview pgn={g.pgn} color={g.color} title={`your game vs ${level.bot.name}`} onDone={finish} />;
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
  const finish = () => { completeStep(step.key); setDone(true); };
  const s = readPath();
  const next = level.steps.find((x) => !s.done[x.key] && x.key !== step.key);

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-32 pt-3" style={{ color: '#F5F7F6' }}>
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
