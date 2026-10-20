// Beginner path -- the rules for one exercise. Same flow as the kids
// levels, worded for older students, plus real-position exercise kinds.

import { useCallback, useMemo, useRef, useState } from 'react';
import { Chess, type Square, type Move } from 'chess.js';
import { reach, attacks, whyNot, PIECE_NAMES, type Level, type Occupant, type BoardPiece, type PieceType } from '@/lib/kids/levels';
import { playSfxAlways, type Sfx } from '@/lib/kids/progress';
import { learnState } from './progress';
import type { LearnItem } from '@/components/learn/LearnBoard';

export type Tone = 'normal' | 'good' | 'oops';
export interface Msg { text: string; tone: Tone }

interface Piece extends BoardPiece { id: string }
interface Target { id: string; sq: string }

const sfx = (k: Sfx) => { if (learnState().sound) playSfxAlways(k); };
const strip = (san: string) => san.replace(/[+#]/g, '');

export function useExercise(level: Level, onSolved: (mistakes: number) => void) {
  const usesGame = ['mate', 'best', 'escape', 'tapLegal'].includes(level.kind) || (level.kind === 'tapSquare' && !!level.fen) || (level.kind === 'quiz' && !!level.fen);
  const game = useRef<Chess | null>(usesGame && level.fen ? new Chess(level.fen) : null);
  const ids = useRef<Map<string, string>>(new Map());
  if (game.current && ids.current.size === 0) {
    game.current.board().forEach((row) => row.forEach((c) => { if (c) ids.current.set(c.square, `${c.color}${c.type}${c.square}`); }));
  }
  const [, force] = useState(0);

  const [pieces, setPieces] = useState<Piece[]>(() => (level.pieces ?? []).map((p, i) => ({ ...p, id: `p${i}` })));
  const [targetsLeft, setTargets] = useState<Target[]>(() => (level.shapes ?? []).map((s, i) => ({ sq: s.sq, id: `t${i}` })));
  const [found, setFound] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const mistakesRef = useRef(0);
  mistakesRef.current = mistakes;
  const [msg, setMsg] = useState<Msg>({ text: level.say, tone: 'normal' });
  const [shake, setShake] = useState<{ sq: string; n: number } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [danger, setDanger] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(level.kind === 'tapLegal' ? level.from ?? null : null);
  const [busy, setBusy] = useState(false);
  const [solved, setSolved] = useState(false);
  const [moves, setMoves] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const hintSquares = useRef<string[]>([]);

  const say = useCallback((text: string, tone: Tone = 'normal') => setMsg({ text, tone }), []);
  const miss = (sq: string | null, text: string) => {
    sfx('oops');
    setMistakes((m) => m + 1);
    if (sq) setShake({ sq, n: Date.now() });
    say(text, 'oops');
  };
  const win = (text: string, delay = 500) => {
    setBusy(true);
    say(level.explain ? `${text} ${level.explain}` : text, 'good');
    window.setTimeout(() => { setSolved(true); onSolved(mistakesRef.current); }, delay);
  };

  // ---------------------------------------------------------- piece-based kinds
  const me = pieces.find((p) => p.side === 'w');
  const enemyKing = pieces.find((p) => p.side === 'b' && p.type === 'k');
  const occ = useCallback((sq: string): Occupant => {
    if (targetsLeft.some((t) => t.sq === sq)) return me?.type === 'p' && level.kind === 'collect' ? 'empty' : 'shape';
    const p = pieces.find((x) => x.sq === sq);
    if (!p) return 'empty';
    return p.side === 'w' ? 'friend' : 'enemy';
  }, [targetsLeft, pieces, me?.type, level.kind]);
  const r = useMemo(() => (me && !game.current ? reach(me.type, 'w', me.sq, occ) : null), [me, occ]);
  const answers = useMemo(() => {
    if (level.kind === 'tapAll' && r) return new Set([...r.captures]);
    if (level.kind === 'tapSquare') return new Set(level.squares ?? []);
    if (level.kind === 'tapLegal' && game.current && level.from) {
      return new Set(game.current.moves({ square: level.from as Square, verbose: true }).map((m) => m.to as string));
    }
    return new Set<string>();
  }, [level, r]);

  // ---------------------------------------------------------- real-position kinds
  const legalFrom = useMemo(() => {
    const g = game.current;
    if (!g || !selected || level.kind === 'tapLegal') return [] as Move[];
    return g.moves({ square: selected as Square, verbose: true });
  }, [selected, busy, level.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const kingSq = (g: Chess, color: 'w' | 'b') => {
    for (const row of g.board()) for (const c of row) if (c && c.type === 'k' && c.color === color) return c.square as string;
    return null;
  };

  const playGameMove = (m: Move) => {
    const g = game.current!;
    const capturedId = ids.current.get(m.to);
    const id = ids.current.get(m.from);
    g.move(m);
    if (id) { ids.current.delete(m.from); ids.current.set(m.to, id); }
    // castling moves the rook too
    if (m.flags.includes('k') || m.flags.includes('q')) {
      const rank = m.color === 'w' ? '1' : '8';
      const [rf, rt] = m.flags.includes('k') ? ['h' + rank, 'f' + rank] : ['a' + rank, 'd' + rank];
      const rid = ids.current.get(rf);
      if (rid) { ids.current.delete(rf); ids.current.set(rt, rid); }
    }
    setSelected(null);
    force((n) => n + 1);
    return () => {
      g.undo();
      ids.current = new Map();
      g.board().forEach((row) => row.forEach((c) => { if (c) ids.current.set(c.square, `${c.color}${c.type}${c.square}`); }));
      if (capturedId && !ids.current.has(m.to)) ids.current.set(m.to, capturedId);
      force((n) => n + 1);
    };
  };

  const retryAfter = (undo: () => void, ms = 1300) => {
    setBusy(true);
    window.setTimeout(() => { undo(); setDanger(null); setBusy(false); }, ms);
  };

  const tapGame = (sq: string) => {
    const g = game.current!;
    const m = legalFrom.find((x) => x.to === sq && (!x.promotion || x.promotion === 'q'));
    if (selected && m) {
      sfx('move');
      setMoves((n) => n + 1);
      const undo = playGameMove(m);
      if (level.kind === 'mate') {
        if (g.isCheckmate()) { sfx('check'); setDanger(kingSq(g, 'b')); win('Checkmate!', 900); return; }
        setMistakes((n) => n + 1);
        if (g.isStalemate()) { sfx('oops'); say('Stalemate! Black has no legal move but isn\'t in check, so the game is a draw. Try again.', 'oops'); }
        else if (g.inCheck()) { sfx('check'); setDanger(kingSq(g, 'b')); say('Check, but the King can still escape. Try another move.', 'oops'); }
        else { sfx('oops'); say('Not checkmate. Look for a move that attacks the King and covers every escape.', 'oops'); }
        retryAfter(undo);
        return;
      }
      if (level.kind === 'best') {
        if ((level.answers ?? []).includes(strip(m.san))) { sfx('pop'); win('Correct!'); return; }
        setMistakes((n) => n + 1);
        sfx('oops');
        say(level.wrong?.[strip(m.san)] ?? 'That\'s legal, but not the move we\'re looking for. Try again.', 'oops');
        retryAfter(undo, 1600);
        return;
      }
      if (level.kind === 'escape') {
        const goal = level.goal ?? 'any';
        const ok = goal === 'any' || (goal === 'king' && m.piece === 'k') || (goal === 'capture' && !!m.captured) || (goal === 'block' && m.piece !== 'k' && !m.captured);
        if (ok) { sfx('pop'); win('Out of check!'); return; }
        setMistakes((n) => n + 1);
        sfx('oops');
        const how = m.piece === 'k' ? 'by moving the King' : m.captured ? 'by capturing' : 'by blocking';
        say(`That does get you out of check ${how}, but this exercise asks you to ${goal === 'king' ? 'move the King' : goal === 'block' ? 'block the attack' : 'capture the attacker'}.`, 'oops');
        retryAfter(undo, 1800);
        return;
      }
    }
    const p = g.get(sq as Square);
    if (p && p.color === 'w') { sfx('tap'); setSelected(sq); return; }
    if (selected && level.kind === 'escape') { miss(null, 'That move would leave your King in check, so it isn\'t allowed.'); setSelected(null); return; }
    setSelected(null);
  };

  // ---------------------------------------------------------- taps
  const onTap = (sq: string) => {
    if (busy || solved) return;

    if (level.kind === 'tapSquare') {
      if (answers.has(sq)) {
        if (found.has(sq)) return;
        const next = new Set(found); next.add(sq); setFound(next); sfx('pop');
        const left = answers.size - next.size;
        if (left === 0) win('Correct!', 400); else say(`Yes, that's ${sq}. ${left} more.`, 'good');
      } else {
        miss(null, `That's ${sq}. Find the file letter along the bottom, then the rank number up the side.`);
      }
      return;
    }

    if (level.kind === 'tapLegal') {
      if (sq === level.from) return;
      if (answers.has(sq)) {
        if (found.has(sq)) return;
        const next = new Set(found); next.add(sq); setFound(next); sfx('pop');
        const left = answers.size - next.size;
        if (left === 0) win('All of them!', 400); else say(`Yes. ${left} more.`, 'good');
      } else {
        const g = game.current!;
        const piece = level.from ? g.get(level.from as Square) : null;
        const [fx, fy] = [sq.charCodeAt(0) - 97, Number(sq[1]) - 1];
        const [kx, ky] = level.from ? [level.from.charCodeAt(0) - 97, Number(level.from[1]) - 1] : [0, 0];
        const adjacent = Math.max(Math.abs(fx - kx), Math.abs(fy - ky)) === 1;
        miss(sq, piece?.type === 'k' && adjacent
          ? `${sq} is attacked by a black piece. The King can never move into check.`
          : `The ${PIECE_NAMES[(piece?.type ?? 'k') as PieceType]} can't move to ${sq}.`);
        if (mistakesRef.current + 1 >= 2) setShowHint(true);
      }
      return;
    }

    if (game.current) return tapGame(sq);
    if (!me || !r) return;

    if (level.kind === 'tapAll') {
      const isTarget = targetsLeft.some((t) => t.sq === sq) || pieces.some((p) => p.side === 'b' && p.sq === sq);
      if (!isTarget) { sfx('tap'); say(`Tap the ${level.shapes?.length ? 'targets' : 'black pieces'} the ${PIECE_NAMES[me.type]} could capture.`); return; }
      if (answers.has(sq)) {
        if (found.has(sq)) return;
        const next = new Set(found); next.add(sq); setFound(next); sfx('pop');
        const left = answers.size - next.size;
        if (left === 0) win('You found all of them!', 400); else say(`Yes. ${left} more.`, 'good');
        return;
      }
      miss(sq, whyNot(me.type, 'w', me.sq, sq, occ, 'plain'));
      if (mistakesRef.current + 1 >= 2) setShowHint(true);
      return;
    }

    if (sq === me.sq) { sfx('tap'); return; }
    const legal = r.moves.has(sq) && sq !== enemyKing?.sq;
    if (!legal) {
      if (enemyKing && sq === enemyKing.sq) { miss(me.sq, 'Kings are never captured. Attack it instead: that\'s check.'); return; }
      const o = occ(sq);
      miss(me.sq, o === 'friend' ? 'You can\'t capture your own piece.' : whyNot(me.type, 'w', me.sq, sq, occ, 'plain'));
      return;
    }
    const tHere = targetsLeft.find((t) => t.sq === sq);
    const eHere = pieces.find((p) => p.side === 'b' && p.sq === sq);
    const from = me.sq;
    setMoves((n) => n + 1);
    setPieces((ps) => ps.filter((p) => p !== eHere).map((p) => (p.id === me.id ? { ...p, sq } : p)));
    if (tHere) setTargets((ts) => ts.filter((t) => t !== tHere));

    if (level.kind === 'collect') {
      const remaining = targetsLeft.length - (tHere ? 1 : 0) + pieces.filter((p) => p.side === 'b').length - (eHere ? 1 : 0);
      if (tHere || eHere) {
        sfx('pop');
        if (remaining === 0) win('Done!', 400); else say(`${remaining} to go.`, 'good');
      } else sfx('move');
      return;
    }

    // check
    sfx('move');
    const after = (x: string): Occupant => (x === enemyKing?.sq ? 'enemy' : x === sq ? 'friend' : occ(x) === 'friend' ? 'empty' : occ(x));
    if (enemyKing && attacks(me.type, 'w', sq, after).has(enemyKing.sq)) {
      setDanger(enemyKing.sq); sfx('check'); win('Check!', 800);
    } else {
      setMistakes((n) => n + 1);
      say('That doesn\'t attack the King. Try another square.', 'oops');
      setBusy(true);
      window.setTimeout(() => { setPieces((ps) => ps.map((p) => (p.id === me.id ? { ...p, sq: from } : p))); setBusy(false); }, 1000);
    }
  };

  const answerQuiz = (i: number) => {
    if (solved || busy) return;
    setPicked(i);
    if (i === level.correct) { sfx('pop'); win('Correct.', 900); }
    else { miss(null, 'Not quite. Try again.'); }
  };

  const hint = () => {
    if (!showHint) setMistakes((n) => n + 1);
    setShowHint(true);
    const g = game.current;
    if (g && (level.kind === 'mate' || level.kind === 'best' || level.kind === 'escape')) {
      const all = g.moves({ verbose: true });
      const good = all.find((m) => {
        if (level.kind === 'best') return (level.answers ?? []).includes(strip(m.san));
        if (level.kind === 'escape') {
          const goal = level.goal ?? 'any';
          return goal === 'any' || (goal === 'king' && m.piece === 'k') || (goal === 'capture' && !!m.captured) || (goal === 'block' && m.piece !== 'k' && !m.captured);
        }
        g.move(m); const ok = g.isCheckmate(); g.undo(); return ok;
      });
      if (good) { setSelected(good.from); hintSquares.current = [good.to]; say(`Try the piece on ${good.from}.`); }
    } else if (level.kind === 'tapAll' || level.kind === 'tapLegal') {
      say('The outlined squares show everywhere the piece can go.');
    } else if (level.kind === 'tapSquare') {
      hintSquares.current = [...answers].filter((s) => !found.has(s));
      say('Outlined.');
    }
    force((n) => n + 1);
  };

  // ---------------------------------------------------------- draw
  let items: LearnItem[];
  let dots: Set<string> | undefined;
  let hintSet: Set<string> | undefined;
  if (game.current) {
    items = [];
    game.current.board().forEach((row) => row.forEach((c) => {
      if (c) items.push({ id: ids.current.get(c.square) ?? c.square, sq: c.square, piece: { type: c.type as PieceType, side: c.color, sq: c.square } });
    }));
    if (level.kind !== 'tapLegal' && level.kind !== 'tapSquare' && level.kind !== 'quiz' && !busy) dots = new Set(legalFrom.map((m) => m.to as string));
    if (showHint) {
      if (level.kind === 'tapLegal') hintSet = new Set([...answers]);
      else if (hintSquares.current.length) hintSet = new Set(hintSquares.current);
    }
  } else {
    items = [
      ...targetsLeft.map((t) => ({ id: t.id, sq: t.sq, target: true })),
      ...pieces.map((p) => ({ id: p.id, sq: p.sq, piece: p as BoardPiece })),
    ];
    if (level.kind === 'tapAll') hintSet = showHint && r ? new Set([...r.moves]) : undefined;
    else if (level.kind === 'tapSquare') hintSet = showHint ? new Set(hintSquares.current) : undefined;
    else if (r && !busy && (level.kind === 'collect' || level.kind === 'check')) dots = new Set([...r.moves].filter((s) => s !== enemyKing?.sq));
  }

  const bounce = level.kind === 'tapLegal' ? level.from : undefined;
  return {
    board: { items, dots, selected: selected ?? bounce ?? null, found, shake, hint: hintSet, danger, onTap,
      highlight: level.kind === 'tapSquare' || level.kind === 'tapLegal' ? found : undefined },
    msg, mistakes, solved, moves, picked, answerQuiz, hint,
    progress: { found: found.size, total: answers.size, left: targetsLeft.length + pieces.filter((p) => p.side === 'b').length },
  };
}
