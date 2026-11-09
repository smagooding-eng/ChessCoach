// "Solve it": treat a scanned (or built) position as a puzzle. Stockfish scores
// every legal move first (the Position Explorer's engine), nothing is shown, and
// the player tries a move: best, good, or not quite, with the better move as an
// arrow. Handy for a page of a puzzle book or a diagram from a lesson.
import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Loader2, RotateCcw, Eye, Compass, Swords } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { apiFetch } from '@/lib/api';

interface Scored { uci: string; san: string; from: string; to: string; cp: number | null; mate: number | null }
type Verdict = { kind: 'best' | 'good' | 'miss'; san: string; best: Scored; text: string };

// One number per move from the mover's side: mates beat any score, faster mates first.
const value = (m: Scored) => (m.mate != null ? (m.mate > 0 ? 100_000 - m.mate : -100_000 - m.mate) : m.cp ?? 0);
const plain = (san: string) => san.replace(/[+#!?]+$/, '');

export function SolvePosition({ fen, flipped, onExplore, onPlay }: { fen: string; flipped: boolean; onExplore: () => void; onPlay: () => void }) {
  const [moves, setMoves] = useState<Scored[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [boardFen, setBoardFen] = useState(fen);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [tries, setTries] = useState(0);
  const [shown, setShown] = useState(false);
  const turn = fen.split(' ')[1] === 'b' ? 'Black' : 'White';

  useEffect(() => {
    let live = true;
    setMoves(null); setErr(null); setBoardFen(fen); setVerdict(null); setTries(0); setShown(false);
    apiFetch('/api/explore/moves', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fen }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!live) return; if (!r.ok) { setErr(d.error || 'The engine couldn’t look at this position.'); return; } setMoves(d.moves ?? []); })
      .catch(() => live && setErr('Couldn’t reach the engine. Check your connection.'));
    return () => { live = false; };
  }, [fen]);

  const best = useMemo(() => (moves?.length ? [...moves].sort((a, b) => value(b) - value(a))[0] : null), [moves]);
  const onlyMove = moves?.length === 1;

  const judge = (san: string) => {
    if (!moves || !best) return;
    try { const c = new Chess(fen); c.move(san); setBoardFen(c.fen()); } catch { return; }
    const mine = moves.find((m) => plain(m.san) === plain(san));
    setTries((t) => t + 1);
    if (!mine) return;
    const gap = value(best) - value(mine);
    const mateNote = best.mate != null && best.mate > 0 && mine.mate == null ? ` There was a mate in ${best.mate}.` : '';
    if (gap <= 15 || plain(mine.san) === plain(best.san)) setVerdict({ kind: 'best', san, best, text: onlyMove ? 'The only move.' : tries === 0 ? 'Found it first try!' : 'That’s the best move.' });
    else if (gap <= 80 && !mateNote) setVerdict({ kind: 'good', san, best, text: `Good move. ${best.san} was a little better.` });
    else setVerdict({ kind: 'miss', san, best, text: `Not quite.${mateNote || ` ${best.san} is much stronger.`}` });
  };
  const retry = () => { setBoardFen(fen); setVerdict(null); };

  const arrows = (verdict && verdict.kind !== 'best') || shown ? (best ? [{ from: best.from, to: best.to, color: '#81b64c' }] : []) : [];
  const color = verdict?.kind === 'best' ? '#81b64c' : verdict?.kind === 'good' ? '#E8B447' : '#F0605D';

  return (
    <div className="space-y-3">
      <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: '#121B1D', border: '1px solid rgba(255,255,255,.08)' }}>
        <p className="text-[15px] font-black text-white">{turn} to move. Find the best move.</p>
        <p className="text-[12px] text-white/50">{moves ? `${tries ? `${tries} ${tries === 1 ? 'try' : 'tries'} · ` : ''}No engine hints until you play.` : err ? '' : 'Stockfish is looking at every move…'}</p>
      </div>
      <div className="relative">
        <ChessBoard fen={boardFen} flipped={flipped} practiceMode={!!moves && !verdict} onMovePlayed={(san) => judge(san)} arrows={arrows} />
        {!moves && !err && <div className="absolute inset-0 grid place-items-center rounded-[10px] bg-black/40"><Loader2 className="h-7 w-7 animate-spin text-white/80" /></div>}
      </div>
      {err && <p className="text-center text-[13px] text-rose-400">{err}</p>}
      {verdict && (
        <div className="rounded-xl px-3 py-2.5" style={{ background: '#121B1D', border: `1px solid ${color}` }}>
          <p className="text-[14.5px] font-black" style={{ color }}>{verdict.kind === 'best' ? '✓ ' : verdict.kind === 'good' ? '≈ ' : '✗ '}{verdict.san}</p>
          <p className="text-[13px] text-white/80">{verdict.text}</p>
        </div>
      )}
      <div className="flex gap-2">
        {verdict && verdict.kind !== 'best' && (
          <button onClick={retry} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white" style={{ background: '#81b64c' }}><RotateCcw className="h-3.5 w-3.5" />Try again</button>
        )}
        {!verdict && moves && !shown && (
          <button onClick={() => setShown(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-xs font-bold text-white/60"><Eye className="h-3.5 w-3.5" />Show the answer</button>
        )}
        <button onClick={onExplore} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-xs font-bold text-white/70"><Compass className="h-3.5 w-3.5" />Explore</button>
        <button onClick={onPlay} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-xs font-bold text-white/70"><Swords className="h-3.5 w-3.5" />Play it out</button>
      </div>
      {shown && best && !verdict && <p className="text-center text-[13px] text-white/70">Best: <b className="text-white">{best.san}</b></p>}
    </div>
  );
}
