// Chess for Kids -- playing one level.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Lightbulb } from 'lucide-react';
import { Chess, type Square } from 'chess.js';
import { KidsShell, TopBar, Bubble, ChunkyButton, Confetti, KID_FONT } from '@/components/kids/KidsChrome';
import { KidsBoard, type BoardItem } from '@/components/kids/KidsBoard';
import { KidPiece, KidShape, KidAvatar, StarRow } from '@/components/kids/KidsArt';
import {
  findWorld, reach, attacks, whyNot, unreachableGoals, PIECE_NAMES,
  type Level, type World, type Occupant, type BoardPiece, type PieceType, type ShapeKind,
} from '@/lib/kids/levels';
import { useKids, levelUnlocked, starsFor, playSfx, speak, stopSpeaking, worldDone } from '@/lib/kids/progress';

type Tone = 'normal' | 'good' | 'oops';
interface Msg { text: string; tone: Tone }

const CHEERS = ['Yes!', 'Great!', 'Super!', 'Nice one!', 'Awesome!', 'You got it!'];
const cheer = (n: number) => CHEERS[n % CHEERS.length];

export default function KidsPlay() {
  const { world: wid, level: lid } = useParams<{ world: string; level: string }>();
  const world = findWorld(wid ?? '');
  const index = world ? world.levels.findIndex((l) => l.id === lid) : -1;
  const { state } = useKids();
  const [round, setRound] = useState(0);

  if (!world || index < 0 || !levelUnlocked(state, world, index)) {
    return (
      <KidsShell>
        <TopBar back={world ? `/kids/${world.id}` : '/kids'} />
        <p className="text-2xl font-extrabold text-center mt-10">This level is still locked!</p>
      </KidsShell>
    );
  }
  const level = world.levels[index];
  return (
    <KidsShell tint={`${world.color}77`}>
      <TopBar back={`/kids/${world.id}`} />
      <LevelRunner key={`${level.id}-${round}`} world={world} level={level} index={index} onRestart={() => setRound((r) => r + 1)} />
    </KidsShell>
  );
}

// ------------------------------------------------------------------ runner

interface Shape { id: string; sq: string; kind: ShapeKind }
interface Piece extends BoardPiece { id: string }

function LevelRunner({ world, level, index, onRestart }: { world: World; level: Level; index: number; onRestart: () => void }) {
  const [, navigate] = useLocation();
  const { state, award } = useKids();
  const [pieces, setPieces] = useState<Piece[]>(() => (level.pieces ?? []).map((p, i) => ({ ...p, id: `p${i}` })));
  const [shapes, setShapes] = useState<Shape[]>(() => (level.shapes ?? []).map((s, i) => ({ ...s, id: `s${i}` })));
  const bushes = useMemo(() => new Set(level.bushes ?? []), [level]);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [msg, setMsg] = useState<Msg>({ text: level.say, tone: 'normal' });
  const [shake, setShake] = useState<{ sq: string; n: number } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [danger, setDanger] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { stars: number }>(null);
  const [party, setParty] = useState(0);
  const [moves, setMoves] = useState(0);

  // checkmate levels run on real chess rules
  const game = useRef<Chess | null>(level.kind === 'mate' && level.fen ? new Chess(level.fen) : null);
  const ids = useRef<Map<string, string>>(new Map());
  const [, force] = useState(0);
  if (game.current && ids.current.size === 0) {
    game.current.board().forEach((row) => row.forEach((c) => { if (c) ids.current.set(c.square, `${c.color}${c.type}${c.square}`); }));
  }

  useEffect(() => {
    const t = window.setTimeout(() => speak(level.say), 350);
    return () => { window.clearTimeout(t); stopSpeaking(); };
  }, [level]);

  const say = useCallback((text: string, tone: Tone = 'normal', aloud = true) => {
    setMsg({ text, tone });
    if (aloud) speak(text);
  }, []);
  const oops = (sq: string, text: string) => {
    playSfx('oops');
    setMistakes((m) => m + 1);
    setShake({ sq, n: Date.now() });
    say(text, 'oops');
  };

  const me = pieces.find((p) => p.side === 'w');
  const plumKing = pieces.find((p) => p.side === 'b' && p.type === 'k');

  const occ = useCallback((sq: string): Occupant => {
    if (bushes.has(sq)) return 'bush';
    if (shapes.some((s) => s.sq === sq)) return level.kind === 'collect' && me?.type === 'p' ? 'empty' : 'shape';
    const p = pieces.find((x) => x.sq === sq);
    if (!p) return 'empty';
    return p.side === 'w' ? 'friend' : 'enemy';
  }, [bushes, shapes, pieces, level.kind, me?.type]);

  const r = useMemo(() => (me ? reach(me.type, 'w', me.sq, occ) : null), [me, occ]);

  // tap-all answers are fixed by the starting position
  const answers = useMemo(() => {
    if (level.kind !== 'tapAll' || !r) return new Set<string>();
    // the King is never captured, so he is never an answer
    return new Set([...r.captures].filter((s) => s !== plumKing?.sq));
  }, [level.kind, r, plumKing?.sq]);

  const finish = (extraDelay = 0) => {
    setBusy(true);
    window.setTimeout(() => {
      const stars = starsFor(mistakesRef.current);
      award(level.id, stars);
      setDone({ stars });
      setParty((n) => n + 1);
      playSfx('win');
      speak(stars === 3 ? 'Perfect! You are a superstar!' : 'Great job! You did it!');
    }, 450 + extraDelay);
  };
  const mistakesRef = useRef(0);
  mistakesRef.current = mistakes;

  // ---------------------------------------------------------- taps
  const onTap = (sq: string) => {
    if (busy || done) return;

    if (level.kind === 'mate') return tapMate(sq);
    if (!me || !r) return;

    if (level.kind === 'tapAll') {
      const target = shapes.find((s) => s.sq === sq) ?? pieces.find((p) => p.side === 'b' && p.sq === sq);
      if (!target) {
        playSfx('tap');
        say(`Tap the ${level.shapes?.length ? 'shapes' : 'plum pieces'} the ${PIECE_NAMES[me.type]} can capture!`, 'normal');
        return;
      }
      if (plumKing && sq === plumKing.sq) {
        playSfx('oops');
        setShake({ sq, n: Date.now() });
        say('We never capture the King! Attacking the King is called check.', 'oops');
        return;
      }
      if (answers.has(sq)) {
        if (found.has(sq)) return;
        const next = new Set(found); next.add(sq);
        setFound(next);
        playSfx('pop');
        const left = answers.size - next.size;
        if (left === 0) { say('You found them all!', 'good'); finish(300); }
        else say(`${cheer(next.size)} ${left} more to find.`, 'good', false);
        return;
      }
      oops(sq, whyNot(me.type, 'w', me.sq, sq, occ));
      if (mistakes + 1 >= 2) setShowHint(true);
      return;
    }

    // collect + check: pick the piece up first (tap or drag), then move it
    if (sq === me.sq) { playSfx('tap'); setSelected(selected === me.sq ? null : me.sq); return; }
    if (selected !== me.sq) {
      playSfx('tap');
      setShake({ sq: me.sq, n: Date.now() });
      say(`Tap your ${PIECE_NAMES[me.type]} first, then tap where it should go! Or drag it.`, 'normal');
      return;
    }
    movePiece(sq);
  };

  const movePiece = (sq: string) => {
    if (!me || !r) return;
    const legal = r.moves.has(sq) && !(plumKing && sq === plumKing.sq);
    if (!legal) {
      if (plumKing && sq === plumKing.sq) { oops(me.sq, "We don't capture the King. Just attack him!"); return; }
      oops(me.sq, whyNot(me.type, 'w', me.sq, sq, occ));
      return;
    }

    const shapeHere = shapes.find((s) => s.sq === sq);
    const enemyHere = pieces.find((p) => p.side === 'b' && p.sq === sq);
    const from = me.sq;
    setMoves((m) => m + 1);
    setSelected(null);
    setPieces((ps) => ps.filter((p) => p !== enemyHere).map((p) => (p.id === me.id ? { ...p, sq } : p)));
    if (shapeHere) setShapes((ss) => ss.filter((s) => s !== shapeHere));

    if (level.kind === 'collect') {
      const remaining = shapes.length - (shapeHere ? 1 : 0) + pieces.filter((p) => p.side === 'b').length - (enemyHere ? 1 : 0);
      if (remaining > 0) {
        const lost = unreachableGoals(me.type, sq, pieces.filter((p) => p !== enemyHere && p.id !== me.id), shapes.filter((s) => s !== shapeHere), bushes);
        if (lost.length) {
          playSfx('oops');
          setMistakes((m) => m + 1);
          say(me.type === 'p'
            ? `Oh no! From ${sq} I can't reach the ${lost[0].name === 'star' ? 'star' : `plum ${lost[0].name}`} anymore. Pawns only walk forward! Let's try again.`
            : `Oh no! I can't reach the ${lost[0].name === 'star' ? 'star' : `plum ${lost[0].name}`} from here anymore. Let's try again.`, 'oops');
          setBusy(true);
          window.setTimeout(() => {
            setPieces((level.pieces ?? []).map((p, i) => ({ ...p, id: `p${i}` })));
            setShapes((level.shapes ?? []).map((s, i) => ({ ...s, id: `s${i}` })));
            setMoves(0); setBusy(false); say(level.say);
          }, 3500);
          return;
        }
      }
      if (shapeHere || enemyHere) {
        playSfx('pop');
        if (remaining === 0) { say(enemyHere ? 'You captured them all!' : 'You caught every star!', 'good'); finish(300); }
        else say(`${cheer(moves)} ${remaining} more to go!`, 'good', false);
      } else {
        playSfx('move');
      }
      return;
    }

    // check
    playSfx('move');
    const after = (x: string): Occupant => (x === plumKing?.sq ? 'enemy' : x === sq ? 'friend' : occ(x) === 'friend' ? 'empty' : occ(x));
    if (plumKing && attacks(me.type, 'w', sq, after).has(plumKing.sq)) {
      setDanger(plumKing.sq);
      playSfx('check');
      say('Check! The King is under attack!', 'good');
      finish(700);
    } else {
      setBusy(true);
      setMistakes((m) => m + 1);
      say('The King is safe there. Try another square!', 'oops');
      window.setTimeout(() => {
        setPieces((ps) => ps.map((p) => (p.id === me.id ? { ...p, sq: from } : p)));
        setBusy(false);
      }, 1000);
    }
  };

  // checkmate world
  const mateDots = useMemo(() => {
    const g = game.current;
    if (!g || !selected) return new Set<string>();
    return new Set(g.moves({ square: selected as Square, verbose: true }).map((m) => m.to));
  }, [selected, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const tapMate = (sq: string, fromOverride?: string) => {
    const g = game.current;
    if (!g) return;
    const sel = fromOverride ?? selected;
    const legalTo = sel ? new Set(g.moves({ square: sel as Square, verbose: true }).map((m) => m.to as string)) : mateDots;
    if (sel && legalTo.has(sq)) {
      const from = sel;
      const mv = g.move({ from: from as Square, to: sq as Square, promotion: 'q' });
      const id = ids.current.get(from);
      const capturedId = ids.current.get(sq);
      if (id) { ids.current.delete(from); ids.current.set(sq, id); }
      setSelected(null);
      force((n) => n + 1);
      if (g.isCheckmate()) {
        playSfx('check');
        setDanger(kingSquare(g, 'b'));
        say('Checkmate! You win the game!', 'good');
        finish(700);
        return;
      }
      setBusy(true);
      setMistakes((m) => m + 1);
      if (g.inCheck()) { playSfx('check'); setDanger(kingSquare(g, 'b')); say('Check! But the King can still escape. Try another move!', 'oops'); }
      else { playSfx('oops'); say('Not checkmate yet. Look for a move that attacks the King!', 'oops'); }
      window.setTimeout(() => {
        g.undo();
        if (id) { ids.current.delete(sq); ids.current.set(from, id); }
        if (capturedId) ids.current.set(sq, capturedId);
        void mv;
        setDanger(null);
        setBusy(false);
        force((n) => n + 1);
      }, 1300);
      return;
    }
    const p = g.get(sq as Square);
    if (p && p.color === 'w') { playSfx('tap'); setSelected(sq); return; }
    if (!sel) { playSfx('tap'); say('Tap one of your pieces first, then tap where it should go! Or drag it.', 'normal'); return; }
    setSelected(null);
  };

  const canDrag = (sq: string) => {
    if (busy || done) return false;
    if (game.current) return game.current.get(sq as Square)?.color === 'w';
    return (level.kind === 'collect' || level.kind === 'check') && !!me && sq === me.sq;
  };
  const onDrop = (from: string, to: string) => {
    if (busy || done) return;
    if (game.current) { setSelected(from); tapMate(to, from); return; }
    if (me && from === me.sq) { setSelected(me.sq); movePiece(to); }
  };

  const showMeMate = () => {
    const g = game.current;
    if (!g) return;
    const m = g.moves({ verbose: true }).find((x) => { g.move(x); const ok = g.isCheckmate(); g.undo(); return ok; });
    if (m) { setSelected(m.from); setShowHint(true); hintTarget.current = m.to; }
  };
  const hintTarget = useRef<string | null>(null);

  // ---------------------------------------------------------- what to draw
  let items: BoardItem[];
  let dots: Set<string> | undefined;
  let hint: Set<string> | undefined;
  if (game.current) {
    items = [];
    game.current.board().forEach((row) => row.forEach((c) => {
      if (c) items.push({ id: ids.current.get(c.square) ?? c.square, sq: c.square, piece: { type: c.type as PieceType, side: c.color, sq: c.square } });
    }));
    dots = mateDots;
    hint = showHint && hintTarget.current ? new Set([hintTarget.current]) : undefined;
  } else {
    items = [
      ...[...bushes].map((sq) => ({ id: `bush-${sq}`, sq, bush: true })),
      ...shapes.map((s) => ({ id: s.id, sq: s.sq, shape: s.kind })),
      ...pieces.map((p) => ({ id: p.id, sq: p.sq, piece: p })),
    ];
    if (level.kind === 'tapAll') {
      hint = showHint && r ? new Set([...r.moves]) : undefined;
    } else if (r && !busy && selected === me?.sq) {
      dots = new Set([...r.moves].filter((s) => s !== plumKing?.sq));
    }
  }

  const nextLevel = world.levels[index + 1];
  const worldFinished = done && worldDone({ ...state, stars: { ...state.stars, [level.id]: Math.max(state.stars[level.id] ?? 0, done.stars) } }, world);

  return (
    <div>
      {/* level header */}
      <div className="flex items-center justify-between gap-3 mt-1">
        <div className="min-w-0">
          <p className="text-sm font-extrabold uppercase tracking-wider" style={{ color: '#6C51C2' }}>{world.name} · Level {index + 1}</p>
          <h1 className="text-[30px] leading-tight font-extrabold" style={{ color: '#2F2257', fontFamily: KID_FONT }}>{level.title}</h1>
        </div>
        <div className="flex gap-1.5 shrink-0" aria-label={`Level ${index + 1} of ${world.levels.length}`}>
          {world.levels.map((l, i) => (
            <span key={l.id} className="w-3 h-3 rounded-full" style={{ background: i < index || state.stars[l.id] ? '#FFC93C' : i === index ? '#fff' : 'rgba(255,255,255,0.5)', border: i === index ? `3px solid ${world.color}` : 'none' }} />
          ))}
        </div>
      </div>

      <div className="mt-3 mb-4">
        <Bubble who={<KidPiece type={level.kind === 'mate' || level.kind === 'check' ? 'k' : (me?.type ?? world.piece)} side="w" size={58} mood={msg.tone === 'oops' ? 'wow' : 'happy'} />}
          text={msg.text} tone={msg.tone} />
      </div>

      <KidsBoard items={items} frame={world.color} dots={dots} selected={selected}
        found={found} shake={shake} hint={hint} danger={danger}
        bounce={level.kind === 'mate' ? selected : me?.sq ?? null} onTap={onTap}
        canDrag={level.kind === 'tapAll' ? undefined : canDrag} onDrop={level.kind === 'tapAll' ? undefined : onDrop} />

      {/* status + helpers */}
      <div className="mt-5 flex items-center gap-3">
        <div className="flex-1 rounded-2xl bg-white/85 px-3 py-2 flex items-center gap-2 min-h-[52px]" style={{ boxShadow: '0 4px 0 rgba(47,34,87,0.12)' }}>
          {level.kind === 'tapAll' && (
            <>
              <div className="flex -space-x-1">
                {[...answers].map((sq, i) => (
                  <motion.span key={sq} className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: i < found.size ? '#2FBF71' : '#EEE9F8', border: '2px solid #fff' }}
                    animate={i === found.size - 1 ? { scale: [1, 1.3, 1] } : {}}>
                    {i < found.size && <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true"><path d="M5 12.5 L10 17 L19 7" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </motion.span>
                ))}
              </div>
              <span className="text-lg font-extrabold">{found.size} of {answers.size} found</span>
            </>
          )}
          {level.kind === 'collect' && (
            <>
              {shapes.length > 0 ? <KidShape kind="star" size={30} /> : <KidPiece type={pieces.find((p) => p.side === 'b')?.type ?? 'p'} side="b" size={30} />}
              <span className="text-lg font-extrabold">
                {shapes.length + pieces.filter((p) => p.side === 'b').length} left · {moves} {moves === 1 ? 'move' : 'moves'}
              </span>
            </>
          )}
          {(level.kind === 'check' || level.kind === 'mate') && (
            <>
              <KidPiece type="k" side="b" size={30} />
              <span className="text-lg font-extrabold">{level.kind === 'check' ? 'One move: check!' : 'One move: checkmate!'}</span>
            </>
          )}
        </div>
        {(level.kind === 'tapAll' || level.kind === 'mate') && (
          <motion.button type="button" whileTap={{ y: 3 }} aria-label="Show me a hint"
            onClick={() => {
              playSfx('tap');
              if (level.kind === 'mate') showMeMate(); else setShowHint(true);
              if (!showHint) setMistakes((m) => m + 1);
              say(level.kind === 'mate' ? 'Try this piece!' : `The purple squares are everywhere the ${PIECE_NAMES[me?.type ?? 'q']} can go.`);
            }}
            className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center" style={{ background: '#FFE27A', boxShadow: '0 4px 0 #E0A800' }}>
            <Lightbulb className="w-6 h-6" style={{ color: '#8A5A00' }} />
          </motion.button>
        )}
        <motion.button type="button" whileTap={{ y: 3 }} aria-label="Start this level again" onClick={() => { playSfx('tap'); onRestart(); }}
          className="w-[52px] h-[52px] rounded-2xl bg-white flex items-center justify-center" style={{ boxShadow: '0 4px 0 rgba(47,34,87,0.18)' }}>
          <RotateCcw className="w-6 h-6" style={{ color: '#4A3A86' }} />
        </motion.button>
      </div>

      <Confetti run={party} />

      <AnimatePresence>
        {done && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
            style={{ background: 'rgba(47,34,87,0.45)', fontFamily: KID_FONT, color: '#2F2257' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <motion.div className="w-full max-w-[440px] rounded-[30px] bg-white p-6 text-center"
              initial={{ y: 80, scale: 0.9 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.15 }}>
              <motion.div className="mx-auto w-fit" animate={{ rotate: [0, -8, 8, -8, 0], y: [0, -10, 0] }} transition={{ duration: 1.1, delay: 0.4 }}>
                <KidAvatar id={state.avatar ?? 'fox'} size={92} />
              </motion.div>
              <h2 className="text-[38px] leading-tight font-extrabold mt-2">
                {done.stars === 3 ? 'Perfect!' : done.stars === 2 ? 'Great job!' : 'You did it!'}
              </h2>
              <div className="flex justify-center my-3">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 12, delay: 0.5 }}>
                  <StarRow n={done.stars} size={52} gap={6} />
                </motion.div>
              </div>
              {worldFinished && !nextLevel ? (
                <div className="rounded-3xl p-3 mb-4 flex items-center gap-3 text-left" style={{ background: `${world.color}33` }}>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ background: world.color, border: '3px solid #fff' }}>
                    <KidPiece type={world.piece} side="w" size={40} />
                  </div>
                  <p className="text-lg font-extrabold leading-snug">You won the {world.name} sticker!</p>
                </div>
              ) : (
                <p className="text-lg font-bold opacity-70 mb-4">{done.stars < 3 ? 'Play again for 3 stars, or keep going!' : 'You did not make a single mistake!'}</p>
              )}
              <div className="flex flex-col gap-3">
                {nextLevel ? (
                  <ChunkyButton color="#5CCB86" shade="#35A060" className="text-2xl"
                    onClick={() => navigate(`/kids/${world.id}/${nextLevel.id}`)}>Next level</ChunkyButton>
                ) : (
                  <ChunkyButton color="#5CCB86" shade="#35A060" className="text-2xl" onClick={() => navigate('/kids')}>Back to the map</ChunkyButton>
                )}
                <ChunkyButton color="#9479E0" shade="#6C51C2" onClick={onRestart}>Play again</ChunkyButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function kingSquare(g: Chess, color: 'w' | 'b'): string | null {
  for (const row of g.board()) for (const c of row) if (c && c.type === 'k' && c.color === color) return c.square;
  return null;
}
