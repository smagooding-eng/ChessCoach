// Endgame verdict from Lichess's 7-piece tablebase: once 7 or fewer pieces are
// left, the result with perfect play from here ("White wins: mate in 23"), and
// the move that keeps it. Shows nothing for bigger positions or if it can't answer.
import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface TB { available: boolean; category?: string; dtm?: number | null; dtz?: number | null; checkmate?: boolean; stalemate?: boolean; best?: { san: string } | null }
const pieces = (fen: string) => (fen.split(' ')[0].match(/[pnbrqk]/gi) ?? []).length;

export function TablebaseBadge({ fen, className = '' }: { fen: string | null | undefined; className?: string }) {
  const [tb, setTb] = useState<TB | null>(null);
  useEffect(() => {
    setTb(null);
    if (!fen || pieces(fen) > 7) return;
    let live = true;
    const t = setTimeout(() => {
      apiFetch(`/api/lichess/tablebase?fen=${encodeURIComponent(fen)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live) setTb(d); }).catch(() => {});
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [fen]);
  if (!fen || !tb?.available || tb.checkmate || !tb.category) return null;
  const toMove = fen.split(' ')[1] === 'w' ? 'White' : 'Black', other = toMove === 'White' ? 'Black' : 'White';
  // The category is from the side to move's point of view.
  const c = tb.category;
  const verdict = tb.stalemate ? 'Stalemate' : c === 'win' ? `${toMove} wins` : c === 'loss' ? `${other} wins` : c === 'draw' || c === 'blessed-loss' || c === 'cursed-win' ? 'Draw with best play' : c === 'maybe-win' ? `${toMove} may win` : c === 'maybe-loss' ? `${other} may win` : 'Unknown';
  const mate = tb.dtm != null && (c === 'win' || c === 'loss') ? `: mate in ${Math.ceil(Math.abs(tb.dtm) / 2)}` : '';
  const color = c === 'win' || c === 'loss' ? '#81B64C' : '#B9C2BF';
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl px-3 py-2 text-[12.5px] font-bold ${className}`} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#F5F7F6' }}>
      <span className="rounded px-1.5 py-0.5 text-[10.5px] font-black uppercase tracking-wide" style={{ background: 'rgba(129,182,76,.2)', color: '#B8E08C' }}>Tablebase</span>
      <span style={{ color }}>{verdict}{mate}</span>
      {tb.best && (c === 'win' || c === 'draw' || c === 'cursed-win') && <span style={{ color: '#87918E' }}>· best: {tb.best.san}</span>}
    </p>
  );
}
