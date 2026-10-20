// Beginner path finale: a real game against the easiest bot, with a visual
// coach after every move -- a mini board with arrows showing what your move
// did, what it left unprotected and (when there was one) the better move,
// plus a material balance bar and quick safety checks.

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Chess, type Move, type Square } from 'chess.js';
import { RotateCcw, Flag, Check, X, Minus } from 'lucide-react';
import { L } from './theme';
import { LearnBoard, fenItems, type LearnItem } from './LearnBoard';
import { PromotionPicker } from './PromotionPicker';
import { BOTS, getBotMove, analyzeMoveQuality, type MoveAnalysisResult } from '@/lib/chess-bot';
import { attackersOf, attackedTargets, checkArrows, type Arrow, type Mark } from '@/lib/learn/explain';
import { playSfxAlways } from '@/lib/kids/progress';
import type { PieceType } from '@/lib/kids/levels';

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<string, string> = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

type Quality = MoveAnalysisResult['quality'];
const QUALITY: Record<Quality, { label: string; glyph: string; color: string; line: string }> = {
  checkmate: { label: 'Checkmate', glyph: '#', color: L.good, line: 'You won the game!' },
  brilliant: { label: 'Brilliant', glyph: '!!', color: '#26c2a3', line: 'A clever sacrifice that works.' },
  great: { label: 'Great move', glyph: '!', color: L.accent, line: 'The only move that keeps things together.' },
  best: { label: 'Best move', glyph: '★', color: L.good, line: 'Exactly what a strong player would play.' },
  excellent: { label: 'Excellent', glyph: '✓', color: L.good, line: 'Very close to the best move.' },
  good: { label: 'Good', glyph: '✓', color: '#8fbf5a', line: 'A sensible move.' },
  book: { label: 'Opening move', glyph: '◆', color: '#a88865', line: 'A standard, well-known opening move.' },
  inaccuracy: { label: 'Inaccuracy', glyph: '?!', color: L.warn, line: 'Not a disaster, but there was something better.' },
  mistake: { label: 'Mistake', glyph: '?', color: '#e8833a', line: 'This gives your opponent a chance.' },
  blunder: { label: 'Blunder', glyph: '??', color: L.bad, line: 'This loses material or the game. Look at the red arrows.' },
  missed_win: { label: 'Missed win', glyph: '×', color: L.warn, line: 'There was a winning move here.' },
};
const GOOD_Q: Quality[] = ['checkmate', 'brilliant', 'great', 'best', 'excellent', 'good', 'book'];

function material(g: Chess) {
  let w = 0, b = 0;
  for (const row of g.board()) for (const c of row) if (c) { if (c.color === 'w') w += VALUE[c.type]; else b += VALUE[c.type]; }
  return w - b;
}

/** Pieces of `side` the opponent can win: attacked and unprotected, or attacked by something cheaper. */
function hanging(g: Chess, side: 'w' | 'b') {
  const opp = side === 'w' ? 'b' : 'w';
  const out: { sq: string; type: string; from: string }[] = [];
  for (const row of g.board()) for (const c of row) {
    if (!c || c.color !== side || c.type === 'k') continue;
    const atk = attackersOf(g, c.square, opp);
    if (!atk.length) continue;
    const cheapest = atk.reduce((a, s) => (VALUE[g.get(s as Square)?.type ?? 'q'] < VALUE[g.get(a as Square)?.type ?? 'q'] ? s : a));
    const defended = attackersOf(g, c.square, side).length > 0;
    if (!defended || VALUE[g.get(cheapest as Square)?.type ?? 'q'] < VALUE[c.type]) out.push({ sq: c.square, type: c.type, from: cheapest });
  }
  return out;
}

const arrowFor = (m: Move, color: Arrow['color'], dashed = false): Arrow => ({ from: m.from, to: m.to, color, dashed, knight: m.piece === 'n' });

interface Coach {
  san: string; q: Quality; fen: string; arrows: Arrow[]; marks: Mark[];
  checks: { label: string; state: 'ok' | 'bad' | 'none' }[];
  notes: { tone: 'good' | 'bad' | 'info'; text: string }[];
  matBefore: number; matAfter: number;
}
interface BotNote { text: string; warn: string[]; arrows: Arrow[]; marks: Mark[] }

function coachMove(fenBefore: string, m: Move): Coach {
  const res = analyzeMoveQuality(fenBefore, m.san);
  const before = new Chess(fenBefore);
  const after = new Chess(m.after);
  let q = res.quality;
  // The quick engine search can miss a simple recapture. If the piece that
  // just moved can be won, the label must say so: a "good" badge next to a
  // red arrow on your Queen would teach the wrong lesson.
  const h = hanging(after, 'w');
  const movedHangs = h.find((x) => x.sq === m.to);
  if (movedHangs && q !== 'checkmate') {
    const defended = attackersOf(after, m.to, 'w').length > 0;
    const atkVal = VALUE[after.get(movedHangs.from as Square)?.type ?? 'p'];
    const net = (defended ? VALUE[m.piece] - atkVal : VALUE[m.piece]) - (m.captured ? VALUE[m.captured] : 0);
    if (net >= 3) q = 'blunder';
    else if (net >= 1 && GOOD_Q.includes(q)) q = 'mistake';
  }
  const arrows: Arrow[] = [arrowFor(m, GOOD_Q.includes(q) ? 'good' : q === 'inaccuracy' ? 'warn' : 'bad')];
  const marks: Mark[] = [];
  const notes: Coach['notes'] = [];

  if (m.captured) notes.push({ tone: 'good', text: `You captured a ${NAME[m.captured]} (worth ${VALUE[m.captured]}).` });
  if (after.inCheck() && !after.isCheckmate()) notes.push({ tone: 'good', text: 'Check! Black has to deal with it before doing anything else.' });
  if (m.san.startsWith('O-O')) notes.push({ tone: 'good', text: 'Castling tucked your King away safely.' });

  // What the moved piece now attacks.
  const t = attackedTargets(after, m.to);
  const targets = t.arrows.filter((a) => after.get(a.to as Square)?.type !== 'k');
  if (targets.length) {
    arrows.push(...targets.map((a) => ({ ...a, color: 'info' as const })));
    const names = targets.map((a) => `${NAME[after.get(a.to as Square)!.type]} on ${a.to}`);
    notes.push({ tone: 'info', text: `Blue arrow${targets.length > 1 ? 's' : ''}: your ${NAME[m.piece]} now attacks the ${names.join(' and the ')}${targets.length > 1 && !movedHangs ? '. Two targets at once is a fork!' : '.'}` });
  }

  // What Black can now take.
  for (const x of h) {
    arrows.push({ from: x.from, to: x.sq, color: 'bad', knight: after.get(x.from as Square)?.type === 'n' });
    marks.push({ sq: x.sq, kind: 'ring' });
  }
  if (movedHangs) notes.push({ tone: 'bad', text: `Red arrow: Black's ${NAME[after.get(movedHangs.from as Square)!.type]} can take your ${NAME[m.piece]} on ${m.to}${attackersOf(after, m.to, 'w').length ? ', and you\'d lose more than you get back' : ' for free: nothing protects it'}.` });
  const others = h.filter((x) => x.sq !== m.to);
  if (others.length) notes.push({ tone: 'bad', text: `Red ${others.length > 1 ? 'arrows' : 'arrow'}: your ${others.map((x) => `${NAME[x.type]} on ${x.sq}`).join(' and ')} can be taken.` });

  // The better move, when it mattered.
  if (res.bestMoveSan && !GOOD_Q.includes(q)) {
    const bm = before.moves({ verbose: true }).find((x) => x.san === res.bestMoveSan);
    if (bm) {
      arrows.push(arrowFor(bm, 'good', true));
      const why = bm.san.includes('#') ? 'it was checkmate' : bm.captured ? `it wins a ${NAME[bm.captured]}` : bm.san.includes('+') ? 'it gives check' : 'it keeps your pieces safer';
      notes.push({ tone: 'good', text: `Dotted green arrow: ${bm.san} was better, because ${why}.` });
    }
  } else if (movedHangs && !GOOD_Q.includes(q)) {
    notes.push({ tone: 'good', text: `Before you move a piece, check: can anything take it on its new square?` });
  }
  if (!notes.length) notes.push({ tone: 'info', text: res.pros[0] ? `${res.pros[0]}.` : 'A quiet move. Nothing was left unprotected.' });

  const checks: Coach['checks'] = [
    { label: `${NAME[m.piece]} safe`, state: movedHangs ? 'bad' : 'ok' },
    { label: 'Others protected', state: others.length ? 'bad' : 'ok' },
    { label: 'Made a threat', state: targets.length || after.inCheck() ? 'ok' : 'none' },
  ];
  return { san: m.san, q, fen: m.after, arrows, marks, checks, notes, matBefore: material(before), matAfter: material(after) };
}

function botNote(g: Chess, m: Move, bot: string): BotNote {
  const arrows: Arrow[] = [arrowFor(m, 'warn')];
  const marks: Mark[] = [];
  const warn: string[] = [];
  let text = `${bot} played ${m.san} (orange arrow).`;
  if (m.captured) text = `${bot} took your ${NAME[m.captured]} with ${m.san} (orange arrow).`;
  if (g.inCheck()) {
    const c = checkArrows(g);
    arrows.push(...c.arrows);
    warn.push('You\'re in check! Move your King, block the line, or capture the checking piece.');
  }
  for (const x of hanging(g, 'w')) {
    arrows.push({ from: x.from, to: x.sq, color: 'bad', knight: g.get(x.from as Square)?.type === 'n' });
    marks.push({ sq: x.sq, kind: 'ring' });
    warn.push(`Your ${NAME[x.type]} on ${x.sq} is under attack (red arrow). Move it or protect it.`);
  }
  const free = hanging(g, 'b');
  if (free.length && !g.inCheck()) warn.push(`Look closely: one of ${bot}'s pieces isn't protected properly. Can you take something?`);
  return { text, warn, arrows, marks };
}

function applyMove(items: LearnItem[], m: Move): LearnItem[] {
  let out = items.filter((i) => i.sq !== m.to);
  if (m.flags.includes('e')) out = out.filter((i) => i.sq !== m.to[0] + m.from[1]);
  const rank = m.from[1];
  const rook = m.flags.includes('k') ? ['h' + rank, 'f' + rank] : m.flags.includes('q') ? ['a' + rank, 'd' + rank] : null;
  return out.map((i) => {
    if (i.sq === m.from) return { ...i, sq: m.to, piece: { ...i.piece!, sq: m.to, type: (m.promotion ?? i.piece!.type) as PieceType } };
    if (rook && i.sq === rook[0]) return { ...i, sq: rook[1], piece: { ...i.piece!, sq: rook[1] } };
    return i;
  });
}

export function FirstGame({ onFinish }: { onFinish: (stars: number) => void }) {
  const bot = BOTS[0];
  const g = useRef(new Chess());
  const [items, setItems] = useState<LearnItem[]>(() => fenItems(g.current.fen()));
  const [selected, setSelected] = useState<string | null>(null);
  const [last, setLast] = useState<string[]>([]);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [note, setNote] = useState<BotNote | null>(null);
  const [thinking, setThinking] = useState(false);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [over, setOver] = useState<{ stars: number; text: string } | null>(null);
  const history = useRef<{ fen: string; items: LearnItem[]; last: string[] }[]>([]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const myTurn = !thinking && !over && !promo && g.current.turn() === 'w';
  const dots = selected ? new Set(g.current.moves({ square: selected as Square, verbose: true }).map((m) => m.to as string)) : undefined;

  const endCheck = () => {
    const c = g.current;
    if (!c.isGameOver()) return false;
    if (c.isCheckmate()) {
      const won = c.turn() === 'b';
      playSfxAlways(won ? 'win' : 'oops');
      setOver(won ? { stars: 3, text: `Checkmate! You beat ${bot.name} in your first game.` } : { stars: 1, text: `${bot.name} checkmated you. Every strong player lost their first games. Try again!` });
    } else {
      setOver({ stars: 2, text: c.isStalemate() ? 'Stalemate: it\'s a draw. The King had no legal move but wasn\'t in check.' : 'The game is a draw.' });
    }
    return true;
  };

  const botTurn = () => {
    setThinking(true);
    timer.current = window.setTimeout(async () => {
      const san = await getBotMove(g.current.fen(), bot);
      const m = san ? g.current.move(san) : null;
      if (m) {
        setItems((it) => applyMove(it, m));
        setLast([m.from, m.to]);
        setNote(botNote(g.current, m, bot.name));
        playSfxAlways(g.current.inCheck() ? 'check' : m.captured ? 'pop' : 'move');
      }
      setThinking(false);
      endCheck();
    }, 900);
  };

  const play = (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => {
    const c = g.current;
    const legal = c.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
    if (!legal.length) return false;
    if (legal[0].promotion && !promotion) { setPromo({ from, to }); return true; }
    const before = c.fen();
    history.current.push({ fen: before, items, last });
    const m = c.move({ from, to, promotion });
    setItems((it) => applyMove(it, m));
    setSelected(null);
    setLast([m.from, m.to]);
    setNote(null);
    playSfxAlways(c.inCheck() ? 'check' : m.captured ? 'pop' : 'move');
    setCoach(coachMove(before, m));
    if (!endCheck()) botTurn();
    return true;
  };

  const onTap = (sq: string) => {
    if (!myTurn) return;
    if (selected && dots?.has(sq)) { play(selected, sq); return; }
    const p = g.current.get(sq as Square);
    if (p && p.color === 'w') { setSelected(sq === selected ? null : sq); playSfxAlways('tap'); }
    else setSelected(null);
  };

  const takeBack = () => {
    const h = history.current.pop();
    if (!h) return;
    window.clearTimeout(timer.current);
    g.current.load(h.fen);
    setItems(h.items); setLast(h.last); setSelected(null); setCoach(null); setNote(null); setThinking(false); setOver(null);
  };

  const mat = material(g.current);
  const boardArrows = note?.arrows ?? [];
  const boardMarks = note?.marks ?? [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <img src={bot.avatar} alt="" className="w-11 h-11 rounded-xl" style={{ background: L.card }} />
        <div className="flex-1 min-w-0">
          <p className="font-black leading-tight">{bot.name} <span className="text-xs font-bold" style={{ color: L.muted }}>· {bot.rating}</span></p>
          <p className="text-xs" style={{ color: L.muted }}>{thinking ? 'Thinking…' : over ? 'Game over' : g.current.turn() === 'w' ? 'Your move (White)' : ''}</p>
        </div>
        <Balance mat={mat} />
      </div>

      <AnimatePresence mode="wait">
        {note && (
          <motion.div key={note.text} className="rounded-xl px-4 py-2.5 mb-3 text-[14px] leading-snug"
            style={{ background: `${L.warn}14`, borderLeft: `4px solid ${L.warn}` }} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="font-semibold">{note.text}</p>
            {note.warn.map((w) => <p key={w} className="mt-1 font-bold" style={{ color: w.startsWith('Look closely') ? L.good : '#f08a8a' }}>{w}</p>)}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <LearnBoard items={items} selected={selected} dots={dots} highlight={new Set(last)} accent="#d9c25a"
          arrows={boardArrows} marks={boardMarks} onTap={onTap}
          canDrag={(sq) => myTurn && g.current.get(sq as Square)?.color === 'w'}
          onDrop={(from, to) => { if (myTurn && !play(from, to)) setSelected(null); }} />
        <AnimatePresence>
          {promo && <PromotionPicker onPick={(p) => { const x = promo; setPromo(null); if (p) play(x.from, x.to, p); }} />}
        </AnimatePresence>
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={takeBack} disabled={!history.current.length || thinking}
          className="flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold disabled:opacity-40" style={{ background: L.card }}>
          <RotateCcw className="w-4 h-4" /> Take back
        </button>
        {!over && history.current.length > 0 && (
          <button type="button" onClick={() => setOver({ stars: 1, text: 'You stopped the game. Come back and finish one any time.' })}
            className="flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold" style={{ background: L.card, color: L.muted }}>
            <Flag className="w-4 h-4" /> End game
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {coach && !over && <CoachCard key={coach.fen} c={coach} />}
      </AnimatePresence>

      <AnimatePresence>
        {over && (
          <motion.div className="mt-4 rounded-2xl p-5 text-center" style={{ background: L.card, border: `1px solid ${L.line}` }}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <p className="font-black text-lg mb-4">{over.text}</p>
            {coach && <div className="text-left mb-4"><CoachCard c={coach} /></div>}
            <button type="button" onClick={() => onFinish(over.stars)} className="w-full rounded-xl py-3.5 font-black text-white" style={{ background: L.good }}>
              Finish lesson
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Balance({ mat }: { mat: number }) {
  const pct = 50 + Math.max(-10, Math.min(10, mat)) * 5;
  return (
    <div className="w-[128px] shrink-0" aria-label="Material balance">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: L.muted }}>
        <span>Material</span><span className="ml-2" style={{ color: mat > 0 ? L.good : mat < 0 ? L.bad : L.muted }}>{mat === 0 ? 'Even' : mat > 0 ? `+${mat}` : mat}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#3a3835' }}>
        <motion.div className="h-full" style={{ background: '#f2efe9' }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>
    </div>
  );
}

function CoachCard({ c }: { c: Coach }) {
  const meta = QUALITY[c.q];
  const delta = c.matAfter - c.matBefore;
  return (
    <motion.div className="mt-4 rounded-2xl p-3" style={{ background: L.card, border: `1px solid ${meta.color}55` }}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="flex gap-3">
        <div className="shrink-0" style={{ width: 132 }}>
          <LearnBoard items={fenItems(c.fen)} coords={false} arrows={c.arrows} marks={c.marks} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold" style={{ color: L.muted }}><span className="uppercase tracking-wider text-[10px]">Your move</span> · <span style={{ color: L.text }}>{c.san}</span></p>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0" style={{ background: meta.color }}>{meta.glyph}</span>
            <span className="font-black text-lg leading-tight" style={{ color: meta.color }}>{meta.label}</span>
          </div>
          <p className="text-xs mt-1 leading-snug" style={{ color: '#cfccc8' }}>{meta.line}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {c.checks.map((k) => (
              <span key={k.label} className="px-1.5 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1"
                style={{ background: k.state === 'ok' ? `${L.good}1f` : k.state === 'bad' ? `${L.bad}1f` : 'rgba(255,255,255,0.05)', color: k.state === 'ok' ? L.good : k.state === 'bad' ? L.bad : L.muted }}>
                {k.state === 'ok' ? <Check className="w-3 h-3" /> : k.state === 'bad' ? <X className="w-3 h-3" /> : <Minus className="w-3 h-3" />}{k.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {c.notes.map((n) => (
          <p key={n.text} className="text-[13px] leading-snug pl-2.5 py-0.5" style={{ borderLeft: `3px solid ${n.tone === 'good' ? L.good : n.tone === 'bad' ? L.bad : L.accent}` }}>{n.text}</p>
        ))}
        {delta !== 0 && (
          <p className="text-[12px] font-bold" style={{ color: delta > 0 ? L.good : L.bad }}>Material {delta > 0 ? `+${delta}` : delta} from this move.</p>
        )}
      </div>
    </motion.div>
  );
}
