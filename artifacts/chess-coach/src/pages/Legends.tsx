// Scout a Legend (Guess the Move): read a short scouting report on a great player, then guess
// their moves through a famous game. The master's move scores 3; another move that Stockfish
// (on your device) rates good scores 1. Then the game goes on with what was really played.
import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Loader2 } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { RedesignHeader } from '@/components/RedesignHeader';
import { AppIcon } from '@/components/AppIcon';
import { engineSupported, gradeMove } from '@/lib/deviceEngine';
import { recordActivity } from '@/lib/activity';

const MUTED = '#8F9997', GREEN = '#81B64C', GOLD = '#F2B53A';
type Legend = { id: string; player: string; game: string; year: number; side: 'w' | 'b'; report: string[]; pgn: string };
const LEGENDS: Legend[] = [
  { id: 'morphy-opera', player: 'Paul Morphy', game: 'vs Duke Karl & Count Isouard, Paris Opera', year: 1858, side: 'w',
    report: ['Develops fast and opens lines before the opponent is ready.', 'Gives material freely to get at the king.', 'Look for: developing moves with tempo, then sacrifices on the open file.'],
    pgn: '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#' },
  { id: 'anderssen-immortal', player: 'Adolf Anderssen', game: 'vs Lionel Kieseritzky, London ("The Immortal Game")', year: 1851, side: 'w',
    report: ['Plays for the attack at any cost.', 'Ignores attacks on his own rooks if the king hunt is faster.', 'Look for: pieces flooding toward the king, then quiet killer moves.'],
    pgn: '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7#' },
  { id: 'anderssen-evergreen', player: 'Adolf Anderssen', game: 'vs Jean Dufresne, Berlin ("The Evergreen Game")', year: 1852, side: 'w',
    report: ['Gambits a pawn for a big lead in development.', 'Keeps the opponent\'s king in the centre, then opens it up.', 'Look for: rook to the open file, and a final run of checks.'],
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7#' },
  { id: 'reti-tartakower', player: 'Richard Réti', game: 'vs Savielly Tartakower, Vienna', year: 1910, side: 'w',
    report: ['Punishes a slow, greedy opening right away.', 'Spots the queen sacrifice that forces mate.', 'Look for: castling long to bring a rook to the d-file, then a double check.'],
    pgn: '1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Qd3 e5 6. dxe5 Qa5+ 7. Bd2 Qxe5 8. O-O-O Nxe4 9. Qd8+ Kxd8 10. Bg5+ Kc7 11. Bd8#' },
];

type Step = { fen: string; san: string; from: string; to: string };
function steps(pgn: string): Step[] {
  const c = new Chess();
  try { c.loadPgn(pgn); } catch { return []; }
  const h = c.history({ verbose: true }); const r = new Chess(); const out: Step[] = [];
  for (const m of h) { const fen = r.fen(); r.move(m.san); out.push({ fen, san: m.san, from: m.from, to: m.to }); }
  return out;
}

function Play({ lg, onExit }: { lg: Legend; onExit: () => void }) {
  const all = useMemo(() => steps(lg.pgn), [lg]);
  const [i, setI] = useState(lg.side === 'w' ? 0 : 1); // index of the move to guess
  const [score, setScore] = useState(0);
  const [note, setNote] = useState<{ t: string; c: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const max = all.filter((_, k) => (k % 2 === 0) === (lg.side === 'w')).length * 3;
  const done = i >= all.length;
  const fen = done ? new Chess(all[all.length - 1].fen).fen() : all[i].fen;
  const shownFen = useMemo(() => { if (!done) return fen; const c = new Chess(all[all.length - 1].fen); c.move(all[all.length - 1].san); return c.fen(); }, [done, fen, all]);
  useEffect(() => { if (done) recordActivity('lesson'); }, [done]);

  const guess = async (san: string) => {
    if (done || busy) return;
    const real = all[i];
    let pts = 0, t = '';
    if (san === real.san) { pts = 3; t = `${real.san}! Exactly what ${lg.player.split(' ').pop()} played.`; }
    else {
      setBusy(true);
      const g = engineSupported() ? await gradeMove(real.fen, san, 12).catch(() => null) : null;
      setBusy(false);
      if (g && (g.quality === 'best' || g.quality === 'excellent' || g.quality === 'good')) { pts = 1; t = `${san} is good too. The game went ${real.san}.`; }
      else t = `The game went ${real.san}.`;
    }
    setScore((s) => s + pts);
    setNote({ t, c: pts === 3 ? GREEN : pts === 1 ? GOLD : MUTED });
    setLast({ from: real.from, to: real.to });
    // play the real move and the reply
    setI(i + 2);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-[12px] px-3.5 py-2.5" style={{ background: 'var(--rd-card-solid, #182123)' }}>
        <span className="min-w-0 truncate text-[13px]"><b>{lg.player}</b> <span style={{ color: MUTED }}>{lg.year}</span></span>
        <b className="text-[16px] tabular-nums">{score}<span className="text-[12px] font-bold" style={{ color: MUTED }}>/{max}</span></b>
      </div>
      <ChessBoard fen={done ? shownFen : fen} flipped={lg.side === 'b'} practiceMode={!done && !busy} suppressConfirmMoves onMovePlayed={(s) => void guess(s)}
        lastMove={i > 0 && all[i - 1] ? { from: all[i - 1].from, to: all[i - 1].to } : last} maxWidthOverride="100%" />
      <p className="min-h-[20px] px-1 text-[13.5px] font-semibold" style={{ color: note?.c ?? MUTED }}>
        {busy ? <Loader2 size={14} className="inline animate-spin" /> : done ? `Game over. You scored ${score} of ${max}.` : note?.t ?? `Your move as ${lg.player}: what did he play?`}
      </p>
      {done && <button onClick={onExit} className="cs-cta">Another legend</button>}
    </div>
  );
}

export default function LegendsPage() {
  const [pick, setPick] = useState<Legend | null>(null);
  const list = useMemo(() => LEGENDS.filter((l) => steps(l.pgn).length > 4), []);
  return (
    <div className="mx-auto w-full max-w-[620px] space-y-3 px-4 pb-28 pt-3" style={{ color: '#F5F7F6' }}>
      <RedesignHeader dense title="Scout a Legend" backHref="/progress" />
      {pick ? <Play lg={pick} onExit={() => setPick(null)} /> : (
        <>
          <p className="px-1 text-[13px]" style={{ color: MUTED }}>Read the scouting report, then guess every move the master played. Their move: 3 points. Another good move: 1.</p>
          {list.map((l) => (
            <div key={l.id} className="rounded-[14px] p-4" style={{ background: 'var(--rd-card-solid, #182123)' }}>
              <div className="flex items-center gap-2"><AppIcon name="guess" size={26} /><b className="text-[16px]">{l.player}</b><span className="text-[12px]" style={{ color: MUTED }}>{l.year}</span></div>
              <p className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>{l.game}</p>
              <ul className="mt-2 space-y-1">{l.report.map((r) => <li key={r} className="text-[13px] leading-snug">• {r}</li>)}</ul>
              <button onClick={() => setPick(l)} className="mt-3 rounded-[12px] px-4 py-2 text-[14px] font-extrabold text-white" style={{ background: GREEN }}>Scout this game</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
