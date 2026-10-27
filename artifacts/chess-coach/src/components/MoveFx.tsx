import React from 'react';
import { motion } from 'framer-motion';
import { Chess } from 'chess.js';
import { detectSingleMove } from '@/lib/sounds';

// Animated pieces (used by the Content Studio): when the board advances by one
// move, the piece lifts off, hops to its square (knights jump higher), lands
// with a little squash and a dust ring, and a captured piece spins away. The
// board itself shows the new position minus the moving pieces while this
// plays, so nothing is drawn twice.

export interface MoveFxPlan {
  id: number;
  hiddenFen: string;
  movers: { piece: string; from: string; to: string }[];
  captured: { piece: string; square: string } | null;
  knight: boolean;
}

export function planMoveFx(prevFen: string, nextFen: string): MoveFxPlan | null {
  const hit = detectSingleMove(prevFen, nextFen);
  if (!hit) return null;
  const m = hit.move;
  const side = m.color;
  const movers = [{ piece: `${side}${m.piece.toUpperCase()}`, from: m.from, to: m.to }];
  if (m.flags.includes('k')) movers.push({ piece: `${side}R`, from: side === 'w' ? 'h1' : 'h8', to: side === 'w' ? 'f1' : 'f8' });
  if (m.flags.includes('q')) movers.push({ piece: `${side}R`, from: side === 'w' ? 'a1' : 'a8', to: side === 'w' ? 'd1' : 'd8' });
  const captured = m.captured
    ? { piece: `${side === 'w' ? 'b' : 'w'}${m.captured.toUpperCase()}`, square: m.flags.includes('e') ? `${m.to[0]}${m.from[1]}` : m.to }
    : null;
  try {
    const c = new Chess(nextFen);
    for (const mv of movers) c.remove(mv.to as Parameters<Chess['remove']>[0]);
    return { id: Date.now() + Math.random(), hiddenFen: c.fen(), movers, captured, knight: m.piece === 'n' };
  } catch {
    return null;
  }
}

type PieceSet = Record<string, ((props?: Record<string, unknown>) => React.ReactElement) | undefined>;

export function MoveFxLayer({ plan, pieces, flipped, ms }: { plan: MoveFxPlan; pieces: PieceSet; flipped: boolean; ms: number }) {
  const at = (sq: string) => {
    const f = sq.charCodeAt(0) - 97, r = Number(sq[1]);
    return { col: flipped ? 7 - f : f, row: flipped ? r - 1 : 8 - r };
  };
  const box = (p: { col: number; row: number }): React.CSSProperties => ({ left: `${p.col * 12.5}%`, top: `${p.row * 12.5}%`, width: '12.5%', height: '12.5%' });
  const s = ms / 1000;
  const land = at(plan.movers[0].to);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[6] aspect-square" aria-hidden>
      {plan.captured && (
        <motion.div key={`c${plan.id}`} className="absolute" style={box(at(plan.captured.square))}
          initial={{ opacity: 1, scale: 1, rotate: 0, y: '0%' }}
          animate={{ opacity: [1, 1, 0], scale: [1, 1.05, 1.55], rotate: [0, 0, 220], y: ['0%', '0%', '-70%'] }}
          transition={{ duration: s + 0.35, times: [0, 0.6, 1], ease: 'easeOut' }}>
          {pieces[plan.captured.piece]?.()}
        </motion.div>
      )}
      {plan.movers.map((mv, k) => {
        const a = at(mv.from), b = at(mv.to);
        const dx = (b.col - a.col) * 100, dy = (b.row - a.row) * 100;
        const lift = plan.knight && k === 0 ? 95 : 30 + Math.hypot(b.col - a.col, b.row - a.row) * 9;
        return (
          <motion.div key={`${plan.id}-${k}`} className="absolute" style={{ ...box(a), zIndex: 2 }}
            initial={{ x: '0%', y: '0%', scale: 1 }}
            animate={{ x: ['0%', `${dx / 2}%`, `${dx}%`, `${dx}%`], y: ['0%', `${dy / 2 - lift}%`, `${dy}%`, `${dy}%`], scale: [1, 1.3, 0.92, 1], rotate: plan.knight && k === 0 ? [0, -14, 6, 0] : [0, 0, 0, 0] }}
            transition={{ duration: s, times: [0, 0.48, 0.84, 1], ease: 'easeInOut' }}>
            <motion.div className="h-full w-full"
              animate={{ filter: ['drop-shadow(0 0 0 rgba(0,0,0,0))', 'drop-shadow(0 14px 10px rgba(0,0,0,.5))', 'drop-shadow(0 2px 2px rgba(0,0,0,.3))'] }}
              transition={{ duration: s, times: [0, 0.48, 1] }}>
              {pieces[mv.piece]?.()}
            </motion.div>
          </motion.div>
        );
      })}
      <motion.div key={`r${plan.id}`} className="absolute rounded-full" style={{ ...box(land), border: '3px solid rgba(255,255,255,.85)' }}
        initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: [0.3, 0.3, 1.5], opacity: [0, 0.9, 0] }}
        transition={{ duration: s + 0.3, times: [0, 0.8 * s / (s + 0.3), 1], ease: 'easeOut' }} />
    </div>
  );
}
