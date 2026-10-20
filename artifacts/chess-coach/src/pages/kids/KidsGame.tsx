// Chess for Kids -- a real game against Benny the Bear, unlocked once every
// world is finished. Benny is gentle on purpose: he mostly plays random
// moves and only sometimes grabs a free piece. He talks the child through
// the game: cheers captures, warns when a piece is left where he could
// catch it (and waits so the child can take it back), and helps on request.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Chess, type Move, type Square } from 'chess.js';
import { KidsShell, TopBar, Bubble, ChunkyButton, Confetti } from '@/components/kids/KidsChrome';
import { KidsBoard, type BoardItem } from '@/components/kids/KidsBoard';
import { KidBear, KidPiece, type BearMood } from '@/components/kids/KidsArt';
import { WORLDS, PIECE_NAMES, type PieceType } from '@/lib/kids/levels';
import { useKids, worldDone, playSfx, speak, stopSpeaking } from '@/lib/kids/progress';

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = (t: string) => PIECE_NAMES[t as PieceType];
const CHEERS = ['Nice move!', 'Ooh, good one!', 'Hmm, let me think…', 'You\'re getting good at this!', 'My turn!'];

/** A piece of `side` the other side could win right now. */
function hanging(g: Chess, side: 'w' | 'b'): { sq: string; type: string; by: string } | null {
  const opp = side === 'w' ? 'b' : 'w';
  let worst: { sq: string; type: string; by: string } | null = null;
  for (const row of g.board()) for (const c of row) {
    if (!c || c.color !== side || c.type === 'k') continue;
    const atk = g.attackers(c.square, opp);
    if (!atk.length) continue;
    const cheapest = atk.reduce((a, s) => (VALUE[g.get(s)!.type] < VALUE[g.get(a)!.type] ? s : a));
    const defended = g.attackers(c.square, side).length > 0;
    if (!defended || VALUE[g.get(cheapest)!.type] < VALUE[c.type]) {
      if (!worst || VALUE[c.type] > VALUE[worst.type]) worst = { sq: c.square, type: c.type, by: g.get(cheapest)!.type };
    }
  }
  return worst;
}

/** Simple, honest score for a move: what it wins minus what it leaves hanging. */
function score(g: Chess, m: Move): number {
  g.move(m);
  let s = 0;
  if (g.isCheckmate()) s = 1000;
  else {
    s = (m.captured ? VALUE[m.captured] : 0) + (m.promotion ? 8 : 0) + (g.inCheck() ? 0.3 : 0);
    const h = hanging(g, m.color);
    if (h) s -= VALUE[h.type];
    if (['d4', 'e4', 'd5', 'e5'].includes(m.to)) s += 0.2;
  }
  g.undo();
  return s + Math.random() * 0.1;
}

/** Benny's move: mostly random, sometimes grabs a free piece, rarely spots mate. */
function bennyMove(g: Chess): Move | null {
  const moves = g.moves({ verbose: true });
  if (!moves.length) return null;
  const mate = moves.find((m) => { g.move(m); const r = g.isCheckmate(); g.undo(); return r; });
  if (mate && Math.random() < 0.3) return mate;
  const free = moves.filter((m) => m.captured && (!g.attackers(m.to, 'w').length || VALUE[m.captured] > VALUE[m.piece]));
  if (free.length && Math.random() < 0.4) return free[Math.floor(Math.random() * free.length)];
  // Don't throw the Queen away on purpose; otherwise anything goes.
  const calm = moves.filter((m) => !(m.piece === 'q' && (() => { g.move(m); const h = g.attackers(m.to, 'w').length > 0; g.undo(); return h; })()));
  const pool = calm.length ? calm : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}

function startItems(g: Chess): BoardItem[] {
  const out: BoardItem[] = [];
  for (const row of g.board()) for (const c of row) if (c) out.push({ id: c.square, sq: c.square, piece: { type: c.type as PieceType, side: c.color, sq: c.square } });
  return out;
}
function applyMove(items: BoardItem[], m: Move): BoardItem[] {
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

type Phase = 'you' | 'benny' | 'warn' | 'over';

export default function KidsGame() {
  const { state, update } = useKids();
  const [, navigate] = useLocation();
  const open = state.unlockAll || WORLDS.every((w) => worldDone(state, w));
  if (!open) {
    return (
      <KidsShell>
        <TopBar back="/admin/kids" />
        <div className="mt-10 text-center">
          <div className="flex justify-center"><KidBear size={120} mood="think" /></div>
          <p className="text-2xl font-extrabold mt-4">Benny is waiting for you!</p>
          <p className="text-lg font-semibold mt-1 opacity-80">Finish every world on the map, then come back and play a real game with him.</p>
          <div className="mt-6 flex justify-center"><ChunkyButton onClick={() => navigate('/admin/kids')}>Back to the map</ChunkyButton></div>
        </div>
      </KidsShell>
    );
  }
  return <Game wins={state.bennyWins ?? 0} onWin={() => update({ bennyWins: (state.bennyWins ?? 0) + 1 })} />;
}

function Game({ wins, onWin }: { wins: number; onWin: () => void }) {
  const [, navigate] = useLocation();
  const g = useRef(new Chess());
  const [items, setItems] = useState<BoardItem[]>(() => startItems(g.current));
  const [phase, setPhase] = useState<Phase>('you');
  const [selected, setSelected] = useState<string | null>(null);
  const [hint, setHint] = useState<Set<string> | undefined>();
  const [danger, setDanger] = useState<string | null>(null);
  const [talk, setTalk] = useState<{ text: string; tone: 'normal' | 'good' | 'oops'; mood: BearMood }>({
    text: 'Hi! I\'m Benny the Bear. Let\'s play a real game! You are the white pieces, so you go first. Try moving a Pawn in the middle!',
    tone: 'normal', mood: 'happy',
  });
  const [caught, setCaught] = useState<{ mine: string[]; his: string[] }>({ mine: [], his: [] });
  const [party, setParty] = useState(0);
  const [result, setResult] = useState<'win' | 'lose' | 'draw' | null>(null);
  const history = useRef<{ fen: string; items: BoardItem[]; caught: { mine: string[]; his: string[] } }[]>([]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => { window.clearTimeout(timer.current); stopSpeaking(); }, []);

  const say = (text: string, tone: 'normal' | 'good' | 'oops' = 'normal', mood: BearMood = 'happy') => { setTalk({ text, tone, mood }); speak(text); };

  const dots = useMemo(() => (selected ? new Set(g.current.moves({ square: selected as Square, verbose: true }).map((m) => m.to as string)) : undefined), [selected, items]);

  const finish = (): boolean => {
    const c = g.current;
    if (!c.isGameOver()) return false;
    setPhase('over');
    if (c.isCheckmate()) {
      const k = c.board().flat().find((x) => x && x.type === 'k' && x.color === c.turn());
      setDanger(k?.square ?? null);
      if (c.turn() === 'b') {
        setResult('win'); setParty(Date.now()); playSfx('win'); onWin();
        say('CHECKMATE! My King is stuck and can\'t get away. You WON! You are a real chess player!', 'good', 'wow');
      } else {
        setResult('lose'); playSfx('oops');
        say('Checkmate! I won this time. That was fun! Want a rematch?', 'normal', 'happy');
      }
    } else {
      setResult('draw');
      say(c.isStalemate() ? 'It\'s a tie! My King can\'t move, but he isn\'t in check. That\'s called stalemate.' : 'It\'s a tie game! Good playing!', 'normal', 'think');
    }
    return true;
  };

  const bennyTurn = () => {
    setPhase('benny');
    timer.current = window.setTimeout(() => {
      const m = bennyMove(g.current);
      if (!m) { finish(); return; }
      g.current.move(m);
      setItems((it) => applyMove(it, m));
      if (m.captured) setCaught((c) => ({ ...c, his: [...c.his, m.captured!] }));
      playSfx(g.current.inCheck() ? 'check' : m.captured ? 'pop' : 'move');
      if (finish()) return;
      setPhase('you');
      const kingSq = g.current.inCheck() ? g.current.board().flat().find((x) => x && x.type === 'k' && x.color === 'w')?.square ?? null : null;
      const h = hanging(g.current, 'w');
      setDanger(kingSq ?? h?.sq ?? null);
      if (kingSq) say('Check! My piece is attacking your King. Move your King, or block me, or catch my piece!', 'oops', 'wow');
      else if (m.captured) say(`Gotcha! I caught your ${NAME(m.captured)}.${h ? ` And watch out, I'm looking at your ${NAME(h.type)} too!` : ''}`, 'oops', 'happy');
      else if (h) say(`Watch out! My ${NAME(h.by)} is looking at your ${NAME(h.type)} (it's glowing). Can you keep it safe?`, 'oops', 'think');
      else say(CHEERS[Math.floor(Math.random() * CHEERS.length)] + ' Your turn!', 'normal', 'happy');
    }, 1100);
  };

  const play = (from: string, to: string) => {
    if (phase !== 'you') return false;
    const legal = g.current.moves({ square: from as Square, verbose: true }).find((m) => m.to === to);
    if (!legal) return false;
    history.current.push({ fen: g.current.fen(), items, caught });
    const m = g.current.move({ from, to, promotion: 'q' });
    setItems((it) => applyMove(it, m));
    setSelected(null); setHint(undefined); setDanger(null);
    if (m.captured) setCaught((c) => ({ ...c, mine: [...c.mine, m.captured!] }));
    playSfx(g.current.inCheck() ? 'check' : m.captured ? 'pop' : 'move');
    if (finish()) return true;

    // Did the child just leave something where Benny can catch it? Then wait.
    const h = hanging(g.current, 'w');
    if (h && h.sq === m.to) {
      setPhase('warn'); setDanger(h.sq);
      say(`Uh-oh! My ${NAME(h.by)} could catch your ${NAME(h.type)} there (it's glowing). Do you want to take it back?`, 'oops', 'think');
      return true;
    }
    if (m.promotion) say('WOW! Your Pawn reached the end and became a QUEEN!', 'good', 'wow');
    else if (g.current.inCheck()) say('Check! Oh no, my King is in danger! I have to save him.', 'good', 'wow');
    else if (m.captured) say(`Yum! You caught my ${NAME(m.captured)}!`, 'good', 'wow');
    else say('Hmm… let me think…', 'normal', 'think');
    bennyTurn();
    return true;
  };

  const onTap = (sq: string) => {
    if (phase !== 'you') return;
    if (selected && dots?.has(sq)) { play(selected, sq); return; }
    const p = g.current.get(sq as Square);
    if (p && p.color === 'w') { setSelected(sq === selected ? null : sq); playSfx('tap'); return; }
    if (selected) say('That piece can\'t go there. The green dots show where it can go!', 'oops', 'think');
    setSelected(null);
  };

  const undo = () => {
    const h = history.current.pop();
    if (!h) return;
    window.clearTimeout(timer.current);
    g.current.load(h.fen);
    setItems(h.items); setCaught(h.caught); setSelected(null); setHint(undefined); setDanger(null); setResult(null); setPhase('you');
    say('Okay, try again! Pick a safe square this time.', 'normal', 'happy');
  };

  const keepIt = () => { setDanger(null); say('Brave! Let\'s see what I do…', 'normal', 'think'); bennyTurn(); };

  const help = () => {
    if (phase !== 'you') return;
    const moves = g.current.moves({ verbose: true });
    const best = moves.map((m) => ({ m, s: score(g.current, m) })).sort((a, b) => b.s - a.s)[0]?.m;
    if (!best) return;
    setSelected(null); setHint(new Set([best.from, best.to]));
    say(best.captured ? `Psst… your ${NAME(best.piece)} can catch my ${NAME(best.captured)}! Look at the glowing squares.`
      : `Try moving your ${NAME(best.piece)} to the glowing square.`, 'normal', 'think');
  };

  const newGame = () => {
    window.clearTimeout(timer.current);
    g.current = new Chess(); history.current = [];
    setItems(startItems(g.current)); setCaught({ mine: [], his: [] }); setSelected(null); setHint(undefined); setDanger(null); setResult(null); setPhase('you');
    say('New game! You go first.', 'normal', 'happy');
  };

  return (
    <KidsShell tint="#FFD9A8">
      <TopBar back="/admin/kids" />
      <div className="mb-3">
        <Bubble who={<motion.div animate={phase === 'benny' ? { rotate: [0, -6, 6, 0] } : {}} transition={{ duration: 0.8, repeat: Infinity }}><KidBear size={64} mood={talk.mood} /></motion.div>}
          text={talk.text} tone={talk.tone} />
      </div>

      <Tray label="Benny caught" pieces={caught.his} side="w" />
      <KidsBoard items={items} frame="#E8A86B" dots={dots} selected={selected} hint={hint} danger={danger}
        bounce={selected} onTap={onTap}
        canDrag={(sq) => phase === 'you' && g.current.get(sq as Square)?.color === 'w'}
        onDrop={(from, to) => { if (!play(from, to)) { setSelected(null); } }} />
      <Tray label="You caught" pieces={caught.mine} side="b" />

      {phase === 'warn' ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <ChunkyButton onClick={undo} color="#2FBF71" shade="#1E8E50">Take it back</ChunkyButton>
          <ChunkyButton onClick={keepIt} color="#9479E0" shade="#6C51C2">Keep it</ChunkyButton>
        </div>
      ) : result ? (
        <motion.div className="mt-4 rounded-[28px] bg-white p-5 text-center" style={{ boxShadow: '0 6px 0 rgba(47,34,87,0.12)' }}
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <p className="text-3xl font-extrabold">{result === 'win' ? 'You beat Benny!' : result === 'draw' ? 'It\'s a tie!' : 'Benny won this time'}</p>
          {result === 'win' && <p className="text-lg font-bold opacity-70 mt-1">Wins against Benny: {wins}</p>}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ChunkyButton onClick={newGame}>Play again</ChunkyButton>
            <ChunkyButton onClick={() => navigate('/admin/kids')} color="#9479E0" shade="#6C51C2">Map</ChunkyButton>
          </div>
        </motion.div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <ChunkyButton onClick={help} disabled={phase !== 'you'} color="#FFC93C" shade="#E08A00" className="!px-1 !text-base whitespace-nowrap">Help me!</ChunkyButton>
          <ChunkyButton onClick={undo} disabled={phase === 'benny' || !history.current.length} color="#45B7F7" shade="#2187C4" className="!px-1 !text-base whitespace-nowrap">Undo</ChunkyButton>
          <ChunkyButton onClick={newGame} color="#9479E0" shade="#6C51C2" className="!px-1 !text-base whitespace-nowrap">New game</ChunkyButton>
        </div>
      )}
      <Confetti run={party} />
    </KidsShell>
  );
}

function Tray({ label, pieces, side }: { label: string; pieces: string[]; side: 'w' | 'b' }) {
  return (
    <div className="flex items-center gap-2 my-2 min-h-[34px]" aria-label={`${label}: ${pieces.length}`}>
      <span className="text-sm font-extrabold opacity-70 shrink-0">{label}</span>
      <div className="flex flex-wrap -space-x-1">
        {pieces.map((p, i) => (
          <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
            <KidPiece type={p as PieceType} side={side} size={32} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
