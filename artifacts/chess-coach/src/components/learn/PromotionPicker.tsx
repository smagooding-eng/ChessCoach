// The "what does your Pawn become?" choice, shown over a learning board.

import { motion } from 'framer-motion';
import { L, usePieceIcon } from './theme';

const PROMO: { p: 'q' | 'r' | 'b' | 'n'; name: string; pts: number; note: string }[] = [
  { p: 'q', name: 'Queen', pts: 9, note: 'Moves like a Rook and a Bishop. Almost always the best choice.' },
  { p: 'r', name: 'Rook', pts: 5, note: 'Straight lines only.' },
  { p: 'b', name: 'Bishop', pts: 3, note: 'Diagonals only.' },
  { p: 'n', name: 'Knight', pts: 3, note: 'L-shaped jumps. Rarely, it gives a surprise fork.' },
];

export function PromotionPicker({ onPick }: { onPick: (p: 'q' | 'r' | 'b' | 'n' | null) => void }) {
  const icon = usePieceIcon();
  return (
    <motion.div className="absolute inset-0 z-20 flex items-center justify-center p-3 rounded-lg" style={{ background: 'rgba(10,10,10,0.6)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="w-full max-w-[360px] rounded-2xl p-4" style={{ background: L.card, border: `1px solid ${L.line}` }}
        initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }}>
        <p className="font-black text-lg mb-0.5">Promote your Pawn</p>
        <p className="text-xs mb-3" style={{ color: L.muted }}>A Pawn that reaches the last rank must become one of these pieces (never a King).</p>
        <div className="grid grid-cols-2 gap-2">
          {PROMO.map((x) => (
            <button key={x.p} type="button" onClick={() => onPick(x.p)} aria-label={`Promote to ${x.name}`}
              className="rounded-xl p-2 text-left flex gap-2 items-start transition-colors hover:bg-white/5"
              style={{ background: L.card2, border: `1px solid ${L.line}` }}>
              <div className="shrink-0">{icon(`w${x.p.toUpperCase()}`, 44)}</div>
              <div className="min-w-0">
                <p className="text-sm font-black leading-tight">{x.name} <span className="font-bold" style={{ color: L.muted }}>· {x.pts}</span></p>
                <p className="text-[11px] leading-snug" style={{ color: L.muted }}>{x.note}</p>
              </div>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onPick(null)} className="mt-3 w-full text-sm font-bold py-2 rounded-lg" style={{ color: L.muted }}>Cancel</button>
      </motion.div>
    </motion.div>
  );
}
