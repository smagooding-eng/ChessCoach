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

// ------------------------------------------------------------- analytics
//
// Everything Benny says is worked out on the real position, looking one
// exchange deep: a capture counts what it takes MINUS the piece lost if it
// gets taken straight back, and a "danger" only counts if the child couldn't
// win something bigger in return. So he never warns about a Knight when the
// child is really attacking his Queen.

const PTS = (t: string) => `${NAME(t)} (${VALUE[t]} point${VALUE[t] === 1 ? '' : 's'})`;
type Arrow = { from: string; to: string; color: 'good' | 'bad' | 'info' | 'warn'; dashed?: boolean; knight?: boolean };

/** What a capture really wins: the piece taken, minus ours if it's taken back. */
function captureNet(g: Chess, m: Move): number {
  if (!m.captured) return 0;
  g.move(m);
  const mate = g.isCheckmate();
  const back = g.moves({ verbose: true }).some((x) => x.to === m.to);
  g.undo();
  if (mate) return 100;
  return VALUE[m.captured] - (back ? VALUE[m.piece] : 0);
}

/** The side to move's best capture, by what it really wins. */
function bestCapture(g: Chess, skipTo?: string): { m: Move; net: number } | null {
  let best: { m: Move; net: number } | null = null;
  for (const m of g.moves({ verbose: true })) {
    if (!m.captured || m.to === skipTo) continue;
    const net = captureNet(g, m);
    if (!best || net > best.net) best = { m, net };
  }
  return best;
}

/** The same position with the other side to move (to ask "what could they take?"). */
function flipped(g: Chess): Chess | null {
  if (g.inCheck()) return null;
  const f = g.fen().split(' ');
  f[1] = f[1] === 'w' ? 'b' : 'w'; f[3] = '-';
  try { return new Chess(f.join(' ')); } catch { return null; }
}

const arrowOf = (m: Move, color: Arrow['color']): Arrow => ({ from: m.from, to: m.to, color, knight: m.piece === 'n' });

/** After the child's move (Benny to move): what can Benny win, and what does the child win back? */
function afterKidMove(g: Chess) {
  const risk = bestCapture(g);
  let back: { m: Move; net: number } | null = null;
  if (risk && risk.net > 0) { g.move(risk.m); back = bestCapture(g, risk.m.to); g.undo(); }
  const lose = risk && risk.net > 0 ? risk.net - Math.max(0, back?.net ?? 0) : 0;
  const f = flipped(g);
  const threat = f ? bestCapture(f) : null; // what the child is now attacking
  return { risk: risk && risk.net > 0 ? risk : null, back: back && back.net > 0 ? back : null, lose, threat: threat && threat.net > 0 ? threat : null };
}

/** After Benny's move (child to move): what is attacked, and what can the child win? */
function afterBennyMove(g: Chess) {
  const chance = bestCapture(g);
  const f = flipped(g);
  const danger = f ? bestCapture(f) : null;
  return { chance: chance && chance.net > 0 ? chance : null, danger: danger && danger.net > 0 ? danger : null };
}

/** Score for "Help me!": what a move wins, minus what Benny could then win. */
function score(g: Chess, m: Move): number {
  let s = m.captured ? captureNet(g, m) : 0;
  g.move(m);
  if (g.isCheckmate()) s = 1000;
  else {
    const r = bestCapture(g);
    if (r && r.net > 0) s -= r.net;
    if (g.inCheck()) s += 0.3;
    if (['d4', 'e4', 'd5', 'e5', 'c3', 'f3', 'c4', 'f4'].includes(m.to) && m.piece !== 'q' && m.piece !== 'k') s += 0.2;
  }
  g.undo();
  return s + Math.random() * 0.05;
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
        <TopBar back="/kids" />
        <div className="mt-10 text-center">
          <div className="flex justify-center"><KidBear size={120} mood="think" /></div>
          <p className="text-2xl font-extrabold mt-4">Benny is waiting for you!</p>
          <p className="text-lg font-semibold mt-1 opacity-80">Finish every world on the map, then come back and play a real game with him.</p>
          <div className="mt-6 flex justify-center"><ChunkyButton onClick={() => navigate('/kids')}>Back to the map</ChunkyButton></div>
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
  const [arrows, setArrows] = useState<Arrow[]>([]);
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
      const c = g.current;
      const kingSq = c.inCheck() ? c.board().flat().find((x) => x && x.type === 'k' && x.color === 'w')?.square ?? null : null;
      const moveArrow = arrowOf(m, 'warn');
      if (kingSq) {
        const checkers = c.attackers(kingSq as Square, 'b');
        setDanger(kingSq);
        setArrows([moveArrow, ...checkers.map((sq) => ({ from: sq, to: kingSq, color: 'bad' as const, knight: c.get(sq)?.type === 'n' }))]);
        say(`Check! My ${NAME(c.get(checkers[0])!.type)} is attacking your King (red arrow). You can move your King, put a piece in the way, or catch my ${NAME(c.get(checkers[0])!.type)}!`, 'oops', 'wow');
        return;
      }
      const { chance, danger: d } = afterBennyMove(c);
      const lines: string[] = [];
      const show: Arrow[] = [moveArrow];
      if (m.captured) lines.push(`Gotcha! I caught your ${NAME(m.captured)}.`);
      if (d) {
        show.push(arrowOf(d.m, 'bad'));
        setDanger(d.m.to);
        lines.push(`Watch out! My ${NAME(d.m.piece)} is attacking your ${PTS(d.m.captured!)} (red arrow).`);
      } else setDanger(null);
      if (chance && (!d || chance.net >= d.net)) {
        lines.push(chance.net >= 3
          ? `But look closely… one of MY pieces can be caught${d ? ', and it\'s worth more!' : '!'} Can you find it? Tap "Help me!" if you need a clue.`
          : `Psst… I left something you could catch. Can you spot it?`);
      } else if (d) {
        lines.push(`Move it to a safe square, or protect it with another piece.`);
      }
      if (!lines.length) lines.push(CHEERS[Math.floor(Math.random() * CHEERS.length)] + ' Your turn!');
      setArrows(show);
      say(lines.join(' '), d ? 'oops' : 'normal', d ? 'think' : 'happy');
    }, 1100);
  };

  const play = (from: string, to: string) => {
    if (phase !== 'you') return false;
    const legal = g.current.moves({ square: from as Square, verbose: true }).find((m) => m.to === to);
    if (!legal) return false;
    history.current.push({ fen: g.current.fen(), items, caught });
    const m = g.current.move({ from, to, promotion: 'q' });
    setItems((it) => applyMove(it, m));
    setSelected(null); setHint(undefined); setDanger(null); setArrows([]);
    if (m.captured) setCaught((c) => ({ ...c, mine: [...c.mine, m.captured!] }));
    playSfx(g.current.inCheck() ? 'check' : m.captured ? 'pop' : 'move');
    if (finish()) return true;

    // Look one exchange deep before saying anything.
    const c = g.current;
    const moveArrow = arrowOf(m, 'good');
    if (m.promotion) { setArrows([moveArrow]); say('WOW! Your Pawn reached the end and became a QUEEN (9 points)!', 'good', 'wow'); bennyTurn(); return true; }
    if (c.inCheck()) {
      const k = c.board().flat().find((x) => x && x.type === 'k' && x.color === 'b')!.square;
      setDanger(k); setArrows([moveArrow, { from: m.to, to: k, color: 'good', knight: m.piece === 'n' }]);
      say(`Check! Your ${NAME(m.piece)} is attacking my King (green arrow). I have to save him!`, 'good', 'wow');
      bennyTurn(); return true;
    }
    const a = afterKidMove(c);
    if (a.risk && a.lose >= 3) {
      // A real loss: pause and let the child decide.
      setPhase('warn'); setDanger(a.risk.m.to);
      setArrows([moveArrow, arrowOf(a.risk.m, 'bad')]);
      const yours = NAME(a.risk.m.captured!);
      say(`Uh-oh! My ${NAME(a.risk.m.piece)} could catch your ${PTS(a.risk.m.captured!)} (red arrow)${a.risk.net < VALUE[a.risk.m.captured!] ? ` — you'd catch my ${NAME(a.risk.m.piece)} back, but your ${yours} is worth more` : ' and nothing protects it'}. Do you want to take it back?`, 'oops', 'think');
      return true;
    }
    const show: Arrow[] = [moveArrow];
    const lines: string[] = [];
    if (m.captured) lines.push(`Yum! You caught my ${PTS(m.captured)}!`);
    if (a.risk && a.back) {
      show.push(arrowOf(a.risk.m, 'bad'), arrowOf(a.back.m, 'good'));
      lines.push(`Ooh, tricky! My ${NAME(a.risk.m.piece)} could catch your ${NAME(a.risk.m.captured!)} (red arrow), but then you'd catch my ${PTS(a.back.m.captured!)} (green arrow). Hmm…`);
    } else if (a.risk && a.lose > 0) {
      show.push(arrowOf(a.risk.m, 'bad'));
      lines.push(`Careful: my ${NAME(a.risk.m.piece)} could catch your ${NAME(a.risk.m.captured!)} (red arrow).`);
    } else if (a.threat) {
      show.push(arrowOf(a.threat.m, 'good'));
      lines.push(`Uh-oh, your ${NAME(a.threat.m.piece)} is attacking my ${PTS(a.threat.m.captured!)} (green arrow)! I'd better do something.`);
    }
    if (!lines.length) lines.push('Hmm… let me think…');
    setArrows(show);
    say(lines.join(' '), m.captured || a.threat ? 'good' : 'normal', m.captured || a.threat ? 'wow' : 'think');
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
    setItems(h.items); setCaught(h.caught); setSelected(null); setHint(undefined); setDanger(null); setArrows([]); setResult(null); setPhase('you');
    say('Okay, try again! Pick a safe square this time.', 'normal', 'happy');
  };

  const keepIt = () => { setDanger(null); setArrows([]); say('Brave! Let\'s see what I do…', 'normal', 'think'); bennyTurn(); };

  const help = () => {
    if (phase !== 'you') return;
    const moves = g.current.moves({ verbose: true });
    const best = moves.map((m) => ({ m, s: score(g.current, m) })).sort((a, b) => b.s - a.s)[0]?.m;
    if (!best) return;
    setSelected(null); setHint(new Set([best.from, best.to])); setArrows([arrowOf(best, 'good')]);
    const f = flipped(g.current);
    const was = f ? bestCapture(f) : null; // was this piece in danger?
    const net = best.captured ? captureNet(g.current, best) : 0;
    let why: string;
    if (best.captured && net >= VALUE[best.captured]) why = `Your ${NAME(best.piece)} can catch my ${PTS(best.captured)}, and I can't catch it back!`;
    else if (best.captured && net > 0) why = `Your ${NAME(best.piece)} can catch my ${PTS(best.captured)}. I can take back, but you still win more.`;
    else if (best.captured) why = `Your ${NAME(best.piece)} can catch my ${NAME(best.captured)}. It's a fair trade.`;
    else if (was && was.m.to === best.from) why = `My ${NAME(was.m.piece)} is attacking your ${NAME(best.piece)}. Move it here to keep it safe!`;
    else if (score(g.current, best) >= 0.3 && !best.captured) why = `Try this: it's safe, and it helps your ${NAME(best.piece)} join the game.`;
    else why = `Try moving your ${NAME(best.piece)} along the green arrow. It's a safe square.`;
    say(why, 'normal', 'think');
  };

  const newGame = () => {
    window.clearTimeout(timer.current);
    g.current = new Chess(); history.current = [];
    setItems(startItems(g.current)); setCaught({ mine: [], his: [] }); setSelected(null); setHint(undefined); setDanger(null); setArrows([]); setResult(null); setPhase('you');
    say('New game! You go first.', 'normal', 'happy');
  };

  return (
    <KidsShell tint="#FFD9A8">
      <TopBar back="/kids" />
      <div className="mb-3">
        <Bubble who={<motion.div animate={phase === 'benny' ? { rotate: [0, -6, 6, 0] } : {}} transition={{ duration: 0.8, repeat: Infinity }}><KidBear size={64} mood={talk.mood} /></motion.div>}
          text={talk.text} tone={talk.tone} />
      </div>

      <Tray label="Benny caught" pieces={caught.his} side="w" />
      <KidsBoard items={items} frame="#E8A86B" dots={dots} selected={selected} hint={hint} danger={danger} arrows={arrows}
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
            <ChunkyButton onClick={() => navigate('/kids')} color="#9479E0" shade="#6C51C2">Map</ChunkyButton>
          </div>
        </motion.div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <ChunkyButton onClick={help} disabled={phase !== 'you'} color="#FFC93C" shade="#E08A00" className="!px-2"><span style={{ fontSize: 16, whiteSpace: 'nowrap' }}>Help me!</span></ChunkyButton>
          <ChunkyButton onClick={undo} disabled={phase === 'benny' || !history.current.length} color="#45B7F7" shade="#2187C4" className="!px-2"><span style={{ fontSize: 16, whiteSpace: 'nowrap' }}>Undo</span></ChunkyButton>
          <ChunkyButton onClick={newGame} color="#9479E0" shade="#6C51C2" className="!px-2"><span style={{ fontSize: 16, whiteSpace: 'nowrap' }}>New game</span></ChunkyButton>
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
