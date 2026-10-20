// Beginner path -- the rules for one exercise. Same flow as the kids
// levels, worded for older students, plus real-position exercise kinds.
// Every wrong answer is explained in plain words AND drawn on the board
// (arrows for the lines a piece travels, what blocks it, what attacks a
// square), because new players can't yet "see" why a move is illegal.

import { useCallback, useMemo, useRef, useState } from 'react';
import { Chess, type Square, type Move } from 'chess.js';
import { reach, attacks, PIECE_NAMES, type Level, type Occupant, type BoardPiece, type PieceType } from '@/lib/kids/levels';
import { playSfxAlways, type Sfx } from '@/lib/kids/progress';
import { learnState } from './progress';
import {
  explainReach, moveArrows, checkArrows, explainKingSquare, explainNoCastle, attackedTargets, recapture, escapes,
  attackersOf, kingSquare, RULE, whyMate, type Arrow, type Mark,
} from './explain';
import type { LearnItem } from '@/components/learn/LearnBoard';

export type Tone = 'normal' | 'good' | 'oops';
export interface Msg { text: string; tone: Tone }

interface Piece extends BoardPiece { id: string }
interface Target { id: string; sq: string }

const sfx = (k: Sfx) => { if (learnState().sound) playSfxAlways(k); };
const strip = (san: string) => san.replace(/[+#]/g, '');
const NAME = PIECE_NAMES;

/**
 * `guides`: show the arrows for where the piece can move. On for the first
 * two exercises of a lesson (learning), off after that (practising on your
 * own); the Hint button still draws them on request.
 */
export function useExercise(level: Level, onSolved: (mistakes: number) => void, guides = true) {
  const usesGame = ['mate', 'best', 'escape', 'tapLegal'].includes(level.kind) || (level.kind === 'tapSquare' && !!level.fen) || (level.kind === 'quiz' && !!level.fen);
  const game = useRef<Chess | null>(usesGame && level.fen ? new Chess(level.fen) : null);
  const ids = useRef<Map<string, string>>(new Map());
  if (game.current && ids.current.size === 0) {
    game.current.board().forEach((row) => row.forEach((c) => { if (c) ids.current.set(c.square, `${c.color}${c.type}${c.square}`); }));
  }
  const [, force] = useState(0);

  const startCheck = level.kind === 'escape' && game.current ? checkArrows(game.current) : null;

  // tapLegal: show from the start which squares around the King are attacked
  // (one red line per attacking piece, and an X on every square it covers).
  const dangerZone = useMemo(() => {
    const g = game.current;
    if (level.kind !== 'tapLegal' || !g || !level.from) return null;
    const legal = new Set(g.moves({ square: level.from as Square, verbose: true }).map((m) => m.to as string));
    const [kx, ky] = [level.from.charCodeAt(0) - 97, Number(level.from[1]) - 1];
    const byAttacker = new Map<string, string[]>();
    const marks: Mark[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const x = kx + dx, y = ky + dy;
      if (x < 0 || x > 7 || y < 0 || y > 7) continue;
      const sq = String.fromCharCode(97 + x) + (y + 1);
      if (legal.has(sq)) continue;
      const att = attackersOf(g, sq, 'b', level.from);
      if (!att.length) continue;
      marks.push({ sq, kind: 'x' });
      for (const a of att) byAttacker.set(a, [...(byAttacker.get(a) ?? []), sq]);
    }
    const dist = (a: string, b: string) => Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));
    const arrows: Arrow[] = [...byAttacker.entries()].map(([a, sqs]) => {
      const far = sqs.reduce((m, q) => (dist(a, q) > dist(a, m) ? q : m), sqs[0]);
      return { from: a, to: far, color: 'bad' as const, knight: g.get(a as Square)?.type === 'n' };
    });
    return { arrows, marks };
  }, [level]);

  const [pieces, setPieces] = useState<Piece[]>(() => (level.pieces ?? []).map((p, i) => ({ ...p, id: `p${i}` })));
  const [targetsLeft, setTargets] = useState<Target[]>(() => (level.shapes ?? []).map((s, i) => ({ sq: s.sq, id: `t${i}` })));
  const [found, setFound] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const mistakesRef = useRef(0);
  mistakesRef.current = mistakes;
  const [msg, setMsg] = useState<Msg>({ text: startCheck?.text ? `${level.say} ${startCheck.text}` : level.say, tone: 'normal' });
  const [viz, setViz] = useState<{ arrows: Arrow[]; marks: Mark[] }>({ arrows: [], marks: [] });
  const [shake, setShake] = useState<{ sq: string; n: number } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [danger, setDanger] = useState<string | null>(null);
  const [selectedState, setSelected] = useState<string | null>(level.kind === 'tapLegal' ? level.from ?? null : null);
  const selected = selectedState;
  const [busy, setBusy] = useState(false);
  const [solved, setSolved] = useState(false);
  const [moves, setMoves] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  /** A pawn reached the last rank: waiting for the student to choose the new piece. */
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const hintSquares = useRef<string[]>([]);

  const say = useCallback((text: string, tone: Tone = 'normal') => setMsg({ text, tone }), []);
  const show = (arrows: Arrow[] = [], marks: Mark[] = []) => setViz({ arrows, marks });
  const miss = (sq: string | null, text: string, arrows: Arrow[] = [], marks: Mark[] = []) => {
    sfx('oops');
    setMistakes((m) => m + 1);
    if (sq) setShake({ sq, n: Date.now() });
    say(text, 'oops');
    show(arrows, marks);
  };
  const win = (text: string, delay = 500, arrows: Arrow[] = []) => {
    setBusy(true);
    say(level.explain ? `${text} ${level.explain}` : text, 'good');
    show(arrows);
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
  const whatAt = (sq: string) => {
    if (targetsLeft.some((t) => t.sq === sq)) return 'target';
    const p = pieces.find((x) => x.sq === sq);
    return p ? `${p.side === 'w' ? 'white' : 'black'} ${NAME[p.type]}` : 'piece';
  };
  const r = useMemo(() => (me && !game.current ? reach(me.type, 'w', me.sq, occ) : null), [me, occ]);
  const answers = useMemo(() => {
    if (level.kind === 'tapAll' && r) return new Set([...r.captures].filter((s) => s !== enemyKing?.sq)); // Kings are never captured
    if (level.kind === 'tapSquare') return new Set(level.squares ?? []);
    if (level.kind === 'tapLegal' && game.current && level.from) {
      return new Set(game.current.moves({ square: level.from as Square, verbose: true }).map((m) => m.to as string));
    }
    return new Set<string>();
  }, [level, r, enemyKing?.sq]);

  // ---------------------------------------------------------- real-position kinds
  const legalFrom = useMemo(() => {
    const g = game.current;
    if (!g || !selected || level.kind === 'tapLegal') return [] as Move[];
    return g.moves({ square: selected as Square, verbose: true });
  }, [selected, busy, level.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const playGameMove = (m: Move) => {
    const g = game.current!;
    const capturedId = ids.current.get(m.to);
    const id = ids.current.get(m.from);
    g.move(m);
    if (id) { ids.current.delete(m.from); ids.current.set(m.to, id); }
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

  /** Leave the wrong move (and its explanation) on the board long enough to read, then take it back. */
  const retryAfter = (undo: () => void, ms = 3200) => {
    setBusy(true);
    window.setTimeout(() => { undo(); setDanger(null); show(); setBusy(false); }, ms);
  };

  const isGoal = (m: Move) => {
    const goal = level.goal ?? 'any';
    return goal === 'any' || (goal === 'king' && m.piece === 'k') || (goal === 'capture' && !!m.captured) || (goal === 'block' && m.piece !== 'k' && !m.captured);
  };

  const tapGame = (sq: string, fromOverride?: string, promoteTo?: string) => {
    const g = game.current!;
    const selected = fromOverride ?? selectedState;
    const legal = selected ? g.moves({ square: selected as Square, verbose: true }) : [];
    const m = legal.find((x) => x.to === sq && (!x.promotion || x.promotion === (promoteTo ?? 'q')));
    if (selected && m && m.promotion && !promoteTo) {
      // let the student pick the piece, like a real game
      sfx('tap');
      setSelected(selected);
      setPromo({ from: selected, to: sq });
      say('Promotion! Your Pawn reached the last rank. Choose what it becomes: Queen, Rook, Bishop or Knight.');
      return;
    }
    if (selected && m) {
      sfx('move');
      setMoves((n) => n + 1);
      const moveArrow: Arrow = { from: m.from, to: m.to, color: 'good', knight: m.piece === 'n' };
      const undo = playGameMove(m);

      if (level.kind === 'mate') {
        if (g.isCheckmate()) {
          sfx('check'); setDanger(kingSquare(g, 'b'));
          const why = whyMate(g);
          win(`Checkmate! The King is in check (red arrow) and has no way out.\n${why.text}`, 900, why.arrows);
          setViz({ arrows: why.arrows, marks: why.marks });
          return;
        }
        setMistakes((n) => n + 1);
        if (g.inCheck()) { sfx('check'); setDanger(kingSquare(g, 'b')); } else sfx('oops');
        const e = escapes(g);
        say(e.text, 'oops'); show([...checkArrows(g).arrows, ...e.arrows], e.marks);
        retryAfter(undo, 4200);
        return;
      }

      if (level.kind === 'best') {
        if ((level.answers ?? []).includes(strip(m.san))) {
          sfx('pop');
          const t = attackedTargets(g, m.to);
          const extra = t.names.length >= 2 ? ` Now it attacks ${t.names.join(' and ')} at the same time.` : '';
          win(`Correct!${extra}`, 600, [moveArrow, ...(t.names.length >= 2 ? t.arrows : [])]);
          return;
        }
        setMistakes((n) => n + 1);
        sfx('oops');
        const rc = recapture(g, m);
        const base = level.wrong?.[strip(m.san)] ?? 'That move is legal, but it\'s not the one this exercise is looking for.';
        say(`${base}${rc && !level.wrong?.[strip(m.san)] ? ` ${rc.text}` : ''} Try again.`, 'oops');
        show([{ ...moveArrow, color: 'warn' }, ...(rc?.arrows ?? [])]);
        retryAfter(undo, 4200);
        return;
      }

      if (level.kind === 'escape') {
        if (isGoal(m)) {
          sfx('pop');
          const how = m.piece === 'k' ? 'The King stepped to a square nothing attacks.' : m.captured ? 'The attacker is gone, so nothing attacks your King.' : 'Your piece now stands between the attacker and the King, so the line is cut.';
          win(`Out of check! ${how}`, 600, [moveArrow]);
          return;
        }
        setMistakes((n) => n + 1);
        sfx('oops');
        const how = m.piece === 'k' ? 'by moving the King' : m.captured ? 'by capturing' : 'by blocking';
        const want = level.goal === 'king' ? 'move the King' : level.goal === 'block' ? 'block the attack' : 'capture the attacker';
        say(`That does get you out of check (${how}), but this exercise asks you to ${want}. Try again.`, 'oops');
        show([{ ...moveArrow, color: 'warn' }]);
        retryAfter(undo, 3600);
        return;
      }
    }

    const p = g.get(sq as Square);
    if (p && p.color === 'w') { sfx('tap'); setSelected(sq); show(startCheck?.arrows ?? []); return; }

    if (selected) {
      const sp = g.get(selected as Square);
      // tapped a square the selected piece can't go to: explain why
      if (sp?.type === 'k') {
        const backRank = selected === 'e1' && (sq === 'g1' || sq === 'c1');
        if (backRank) {
          const e = explainNoCastle(g, sq === 'g1' ? 'k' : 'q');
          if (e) { miss(null, e.text, e.arrows, e.marks); setSelected(selected); return; }
        }
        const e = explainKingSquare(g, selected, sq);
        miss(null, e.text, [...e.arrows, ...(startCheck?.arrows ?? [])], e.marks);
        setSelected(selected);
        return;
      }
      if (level.kind === 'escape' && sp) {
        const c = checkArrows(g);
        miss(null, `Moving the ${NAME[sp.type as PieceType]} there wouldn't stop the check. ${c.text} When you're in check, your move MUST get the King out of check: move the King, block the line, or capture the attacker.`, c.arrows, [{ sq, kind: 'x' }]);
        setSelected(selected);
        return;
      }
      if (sp) {
        setSelected(selected);
        say(`The ${NAME[sp.type as PieceType]} on ${selected} can't move to ${sq}. The green dots show every square it can legally move to.`, 'normal');
        return;
      }
    }
    sfx('tap');
    say('First pick up one of your (white) pieces: tap it, then tap where it should go. You can also drag it.', 'normal');
  };

  // ---------------------------------------------------------- taps
  const onTap = (sq: string) => {
    if (busy || solved || promo) return;
    show(startCheck?.arrows ?? []);

    if (level.kind === 'tapSquare') {
      if (answers.has(sq)) {
        if (found.has(sq)) return;
        const next = new Set(found); next.add(sq); setFound(next); sfx('pop');
        const rest = [...answers].filter((a) => !next.has(a));
        if (!rest.length) win(`Correct! That's ${sq}.`, 400);
        else say(`Yes, that's ${sq}. Now find ${rest.join(' and ')}.`, 'good');
      } else {
        const rest = [...answers].filter((a) => !found.has(a));
        const t = rest[0];
        miss(null, `That square is ${sq}: column (file) "${sq[0]}", row (rank) ${sq[1]}. You're looking for ${rest.join(' and ')}. For ${t}, find the letter "${t[0]}" along the bottom edge, then go up to row ${t[1]} (numbers on the left edge).`, [], [{ sq, kind: 'ring' }]);
      }
      return;
    }

    if (level.kind === 'tapLegal') {
      if (sq === level.from) return;
      if (answers.has(sq)) {
        if (found.has(sq)) return;
        const next = new Set(found); next.add(sq); setFound(next); sfx('pop');
        const left = answers.size - next.size;
        const yes = `Yes, ${sq} is safe: no black piece attacks it.`;
        const keep = dangerZone ?? { arrows: [], marks: [] };
        if (left === 0) win(`${yes} That's every legal move.`, 400, [...keep.arrows, { from: level.from!, to: sq, color: 'good' }]);
        else { say(`${yes} ${left} more.`, 'good'); show([...keep.arrows, { from: level.from!, to: sq, color: 'good' }], keep.marks); }
      } else {
        const e = explainKingSquare(game.current!, level.from!, sq);
        miss(sq, e.text, e.arrows, e.marks);
        if (mistakesRef.current + 1 >= 2) setShowHint(true);
      }
      return;
    }

    if (game.current) return tapGame(sq);
    if (!me || !r) return;

    if (level.kind === 'tapAll') {
      const isKing = enemyKing?.sq === sq;
      const isTarget = targetsLeft.some((t) => t.sq === sq) || pieces.some((p) => p.side === 'b' && p.sq === sq);
      if (!isTarget) {
        sfx('tap');
        say(`Tap the ${level.shapes?.length ? 'targets' : 'black pieces'}. For each one, ask: can the ${NAME[me.type]} reach it in one move, with nothing in the way?`);
        show(guides ? moveArrows(me.type, 'w', me.sq, occ) : []);
        return;
      }
      const ok = answers.has(sq);
      const e = explainReach(me.type, me.sq, sq, occ, { ok, what: whatAt(sq), whatAt, isKing, guides });
      if (isKing) { sfx('oops'); say(e.text, 'oops'); show(e.arrows, e.marks); setShake({ sq, n: Date.now() }); return; }
      if (ok) {
        if (found.has(sq)) return;
        const next = new Set(found); next.add(sq); setFound(next); sfx('pop');
        const left = answers.size - next.size;
        if (left === 0) win(`${e.text} You found all of them!`, 600, e.arrows);
        else { say(`${e.text} ${left} more.`, 'good'); show(e.arrows, e.marks); }
        return;
      }
      miss(sq, e.text, e.arrows, e.marks);
      if (mistakesRef.current + 1 >= 2) setShowHint(true);
      return;
    }

    // collect + check: pick the piece up first (tap or drag), then move it
    if (sq === me.sq) { sfx('tap'); setSelected(selected === me.sq ? null : me.sq); return; }
    if (selected !== me.sq) {
      sfx('tap');
      setShake({ sq: me.sq, n: Date.now() });
      say(`First pick up your ${NAME[me.type]}: tap it, then tap the square you want it to go to. You can also drag it there.`);
      return;
    }
    movePiece(sq);
  };

  const movePiece = (sq: string) => {
    if (!me || !r) return;
    const legal = r.moves.has(sq) && sq !== enemyKing?.sq;
    if (!legal) {
      if (enemyKing && sq === enemyKing.sq) {
        miss(me.sq, 'Kings are never captured. Instead, you attack the King. That\'s called "check". Find a square where your piece attacks it.', [], [{ sq, kind: 'ring' }]);
        return;
      }
      if (occ(sq) === 'friend') { miss(me.sq, 'That\'s your own piece. You can never capture (or land on) your own pieces.', [], [{ sq, kind: 'x' }]); return; }
      const e = explainReach(me.type, me.sq, sq, occ, { ok: false, what: whatAt(sq), whatAt, guides });
      miss(me.sq, e.text, e.arrows, e.marks);
      return;
    }
    const tHere = targetsLeft.find((t) => t.sq === sq);
    const eHere = pieces.find((p) => p.side === 'b' && p.sq === sq);
    const from = me.sq;
    setMoves((n) => n + 1);
    setSelected(null);
    setPieces((ps) => ps.filter((p) => p !== eHere).map((p) => (p.id === me.id ? { ...p, sq } : p)));
    if (tHere) setTargets((ts) => ts.filter((t) => t !== tHere));

    if (level.kind === 'collect') {
      const remaining = targetsLeft.length - (tHere ? 1 : 0) + pieces.filter((p) => p.side === 'b').length - (eHere ? 1 : 0);
      if (tHere || eHere) {
        sfx('pop');
        if (remaining === 0) win('Done!', 400); else say(`${eHere ? 'Captured' : 'Got it'}! ${remaining} to go.`, 'good');
      } else sfx('move');
      return;
    }

    // check
    sfx('move');
    const after = (x: string): Occupant => (x === enemyKing?.sq ? 'enemy' : x === sq ? 'friend' : occ(x) === 'friend' ? 'empty' : occ(x));
    if (enemyKing && attacks(me.type, 'w', sq, after).has(enemyKing.sq)) {
      setDanger(enemyKing.sq); sfx('check');
      win(`Check! From ${sq} the ${NAME[me.type]} attacks the King on ${enemyKing.sq} (red arrow). Black must now get the King out of check.`, 900,
        [{ from: sq, to: enemyKing.sq, color: 'bad', knight: me.type === 'n' }]);
    } else {
      setMistakes((n) => n + 1);
      const at2 = (x: string): Occupant => (x === sq ? 'friend' : x === from ? 'empty' : occ(x));
      say(guides
        ? `From ${sq} the ${NAME[me.type]} attacks the squares along the arrows, but the King on ${enemyKing?.sq} isn't on any of them, so it's not check. Try another square.`
        : `From ${sq} the ${NAME[me.type]} doesn't attack the King on ${enemyKing?.sq}, so it's not check. Try another square.`, 'oops');
      if (guides) show(me.type === 'p' ? moveArrows('p', 'w', sq, at2).filter((a) => a.dashed || a.color === 'good') : moveArrows(me.type, 'w', sq, at2), enemyKing ? [{ sq: enemyKing.sq, kind: 'ring' }] : []);
      setBusy(true);
      window.setTimeout(() => { setPieces((ps) => ps.map((p) => (p.id === me.id ? { ...p, sq: from } : p))); show(); setBusy(false); }, 3000);
    }
  };

  const movesPieces = level.kind === 'collect' || level.kind === 'check' || level.kind === 'mate' || level.kind === 'best' || level.kind === 'escape';
  const canDrag = (sq: string) => {
    if (!movesPieces || busy || solved) return false;
    if (game.current) return game.current.get(sq as Square)?.color === 'w';
    return !!me && sq === me.sq;
  };
  const onDrop = (from: string, to: string) => {
    if (busy || solved || promo) return;
    show(startCheck?.arrows ?? []);
    if (game.current) { setSelected(from); tapGame(to, from); return; }
    if (me && from === me.sq) { setSelected(me.sq); movePiece(to); }
  };

  const choosePromotion = (piece: 'q' | 'r' | 'b' | 'n' | null) => {
    const p = promo;
    setPromo(null);
    if (!p) return;
    if (!piece) { say(level.say); return; }
    tapGame(p.to, p.from, piece);
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
        if (level.kind === 'escape') return isGoal(m);
        g.move(m); const ok = g.isCheckmate(); g.undo(); return ok;
      });
      if (good) {
        setSelected(good.from); hintSquares.current = [good.to];
        say(`Try moving the ${NAME[good.piece as PieceType]} on ${good.from} (arrow).`);
        show([...(startCheck?.arrows ?? []), { from: good.from, to: good.to, color: 'info', dashed: true, knight: good.piece === 'n' }]);
      }
    } else if (level.kind === 'tapLegal' && g && level.from) {
      const legal = [...answers];
      const [kx, ky] = [level.from.charCodeAt(0) - 97, Number(level.from[1]) - 1];
      const red: Arrow[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const x = kx + dx, y = ky + dy;
        if (x < 0 || x > 7 || y < 0 || y > 7) continue;
        const s = String.fromCharCode(97 + x) + (y + 1);
        if (legal.includes(s)) continue;
        for (const a of attackersOf(g, s, 'b', level.from)) red.push({ from: a, to: s, color: 'bad', knight: g.get(a as Square)?.type === 'n' });
      }
      say('Outlined squares are safe. The red arrows show which black piece attacks each of the other squares around the King.');
      show(red);
    } else if (level.kind === 'tapAll' && me) {
      say(`The arrows show every line the ${NAME[me.type]} can travel this move. It captures the FIRST target or black piece it meets on each line.`);
      show(moveArrows(me.type, 'w', me.sq, occ));
    } else if (level.kind === 'tapSquare') {
      hintSquares.current = [...answers].filter((s) => !found.has(s));
      say('Outlined. Letters along the bottom are files (columns), numbers up the side are ranks (rows).');
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
    if (level.kind === 'tapAll') hintSet = showHint && r ? new Set([...r.moves].filter((s) => s !== enemyKing?.sq)) : undefined;
    else if (level.kind === 'tapSquare') hintSet = showHint ? new Set(hintSquares.current) : undefined;
    else if (r && !busy && selected === me?.sq && (level.kind === 'collect' || level.kind === 'check')) dots = new Set([...r.moves].filter((s) => s !== enemyKing?.sq));
  }

  // escape: keep the check visible until the student does something else
  const guideArrows = guides && me && !game.current && !solved && !busy && (level.kind === 'collect' || level.kind === 'tapAll' || level.kind === 'check')
    ? moveArrows(me.type, 'w', me.sq, occ) : [];
  const idle = !viz.arrows.length && !viz.marks.length;
  const levelGuide = level.guide && !solved && !busy ? level.guide : null;
  const arrows = !idle ? viz.arrows : (startCheck && !solved && !busy ? startCheck.arrows : dangerZone ? dangerZone.arrows : levelGuide ? levelGuide.arrows : guideArrows);
  const marks = !idle ? viz.marks : dangerZone ? dangerZone.marks : levelGuide?.marks ?? [];

  // the rule reminder for whatever piece is in play
  const selPiece = game.current && selected ? game.current.get(selected as Square) : null;
  const ruleType: PieceType | null = me && !game.current ? me.type : selPiece ? (selPiece.type as PieceType) : null;

  const bounce = level.kind === 'tapLegal' ? level.from : undefined;
  return {
    board: { items, dots, selected: selected ?? bounce ?? null, found, shake, hint: hintSet, danger, onTap,
      highlight: level.kind === 'tapSquare' || level.kind === 'tapLegal' ? found : undefined, arrows, marks,
      canDrag: movesPieces ? canDrag : undefined, onDrop: movesPieces ? onDrop : undefined },
    msg, mistakes, solved, moves, picked, answerQuiz, hint,
    promo, choosePromotion,
    checklist: level.kind === 'tapSquare' ? (level.squares ?? []).map((sq) => ({ sq, done: found.has(sq) })) : null,
    rule: ruleType && level.kind !== 'quiz' && level.kind !== 'tapSquare' ? RULE[ruleType] : null,
    progress: { found: found.size, total: answers.size, left: targetsLeft.length + pieces.filter((p) => p.side === 'b' && p.type !== 'k').length },
  };
}
