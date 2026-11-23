// Field Notes: a notebook page for each tactic. A page opens at Silver (20 solved) and is
// written from your own games: the moment you missed it, which you later solved as a case.
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Loader2, Lock } from 'lucide-react';
import { Chess } from 'chess.js';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { RedesignHeader } from '@/components/RedesignHeader';
import { MiniBoard } from '@/components/MiniBoard';

const MUTED = '#8F9997', GREEN = '#81B64C';
const NOTES: Record<string, { name: string; idea: string; look: string }> = {
  fork: { name: 'Fork', idea: 'One piece attacks two things at once, and only one can be saved.', look: 'Knights and queens on squares that touch two loose pieces or the king.' },
  pin: { name: 'Pin', idea: 'A piece can’t move because something more valuable stands behind it.', look: 'Pieces lined up with the king or queen on a file, rank or diagonal.' },
  skewer: { name: 'Skewer', idea: 'A pin in reverse: the valuable piece is in front, and when it moves the one behind falls.', look: 'King or queen in line with a rook or bishop behind it.' },
  discoveredAttack: { name: 'Discovered attack', idea: 'Moving one piece uncovers an attack by another.', look: 'Your bishop, rook or queen blocked by one of your own pieces.' },
  hangingPiece: { name: 'Hanging piece', idea: 'A piece nobody defends can simply be taken.', look: 'After every move: what is loose on both sides?' },
  sacrifice: { name: 'Sacrifice', idea: 'Give material to get something bigger: mate, or more material back.', look: 'An exposed king, or a defender that only one piece is guarding.' },
  backRankMate: { name: 'Back-rank mate', idea: 'A king trapped behind its own pawns is mated by a rook or queen on the back rank.', look: 'No escape square for the king, and the back rank undefended.' },
  deflection: { name: 'Deflection', idea: 'Lure a defender away from the square or piece it guards.', look: 'A piece doing two jobs at once.' },
  attraction: { name: 'Attraction', idea: 'Force a piece, often the king, onto a square where it gets hit.', look: 'Checks and captures that drag the king forward.' },
  doubleCheck: { name: 'Double check', idea: 'Two pieces give check at once; the king has to move.', look: 'A discovered check where the moving piece also checks.' },
  mateIn1: { name: 'Mate in 1', idea: 'One move ends the game.', look: 'Every check first. Always.' },
  mateIn2: { name: 'Mate in 2', idea: 'A forcing move, then mate.', look: 'Checks that take away the king’s last squares.' },
  endgame: { name: 'Endgame technique', idea: 'With few pieces left, king activity and passed pawns decide.', look: 'Use the king; count the pawn races.' },
  promotion: { name: 'Promotion', idea: 'A pawn reaching the last rank becomes a queen (or better, the right piece).', look: 'Passed pawns, and the squares in front of them.' },
};
type Pattern = { theme: string; tried: number; solved: number };
type Case = { id: number; themes: string[]; solved: boolean; moveNumber: number | null };

function Example({ id }: { id: number }) {
  const [p, setP] = useState<{ fen: string; san: string; from: string; to: string } | null>(null);
  useEffect(() => {
    apiFetch(`/api/puzzles/${id}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const u = d?.moves?.split(' ')?.[0]; if (!d?.fen || !u) return;
      try { const c = new Chess(d.fen); const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined }); if (m) setP({ fen: d.fen, san: m.san, from: m.from, to: m.to }); } catch { /* */ }
    }).catch(() => {});
  }, [id]);
  if (!p) return null;
  const black = p.fen.split(' ')[1] === 'b';
  return (
    <div className="mt-3 flex items-center gap-3 rounded-[12px] p-2.5" style={{ background: 'var(--rd-card-light, #212B2D)' }}>
      <MiniBoard fen={p.fen} size={110} flipped={black} lastMove={{ from: p.from, to: p.to }} />
      <p className="text-[13px] leading-snug">From one of your games: you missed it at the time, then found <b style={{ color: GREEN }}>{p.san}</b> when you closed the case.</p>
    </div>
  );
}

export default function FieldNotesPage() {
  const { authUser } = useUser();
  const [pats, setPats] = useState<Pattern[] | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  useEffect(() => {
    if (!authUser) return;
    apiFetch('/api/puzzles/patterns', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { patterns: [] })).then((d) => setPats(d.patterns ?? [])).catch(() => setPats([]));
    apiFetch('/api/puzzles/my-puzzles', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { puzzles: [] })).then((d) => setCases(d.puzzles ?? [])).catch(() => {});
  }, [authUser]);
  const list = Object.keys(NOTES).map((t) => ({ theme: t, solved: pats?.find((p) => p.theme === t)?.solved ?? 0 })).sort((a, b) => b.solved - a.solved);
  const open = list.filter((p) => p.solved >= 20).length;
  return (
    <div className="mx-auto w-full max-w-[600px] space-y-3 px-4 pb-28 pt-3" style={{ color: '#F5F7F6' }}>
      <RedesignHeader dense title="Field Notes" backHref="/progress" />
      <p className="px-1 text-[13px]" style={{ color: MUTED }}>{open} of {list.length} pages written. A page opens when you reach Silver in that tactic (20 solved).</p>
      {!pats ? <div className="grid place-items-center py-16"><Loader2 className="animate-spin" style={{ color: MUTED }} /></div> : list.map(({ theme, solved }) => {
        const n = NOTES[theme]; const unlocked = solved >= 20;
        const ex = cases.find((c) => c.solved && c.themes.includes(theme));
        return (
          <div key={theme} className="rounded-[14px] p-4" style={{ background: 'var(--rd-card-solid, #182123)', borderLeft: `4px solid ${unlocked ? (solved >= 50 ? '#F2B53A' : '#C9D1D3') : 'rgba(255,255,255,.08)'}` }}>
            <div className="flex items-center justify-between">
              <b className="text-[16px] font-black">{n.name}</b>
              <span className="text-[12px] font-bold" style={{ color: unlocked ? (solved >= 50 ? '#F2B53A' : '#C9D1D3') : MUTED }}>{solved >= 50 ? 'Gold' : unlocked ? 'Silver' : `${solved}/20`}</span>
            </div>
            {unlocked ? (
              <>
                <p className="mt-1.5 text-[13.5px] leading-snug">{n.idea}</p>
                <p className="mt-1 text-[12.5px]" style={{ color: MUTED }}><b style={{ color: '#DDE3E1' }}>Look for:</b> {n.look}</p>
                {ex ? <Example id={ex.id} /> : <p className="mt-2 text-[12px]" style={{ color: MUTED }}>Close a case of this kind from your games and your own example goes here.</p>}
              </>
            ) : (
              <div className="mt-1.5 flex items-center gap-2 text-[12.5px]" style={{ color: MUTED }}>
                <Lock size={14} /> {20 - solved} more to open this page. <Link href={`/puzzles?puzzleTheme=${theme}`} className="font-bold underline" style={{ color: GREEN }}>Practise</Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
