import React from 'react';
import { RD } from '@/lib/redesignTheme';

// Move-by-move timeline from the engine review: good moves rise above the
// line (green), mistakes drop below it (red/orange, longer = bigger loss).
// Every bar is a real move from the review and jumps the board to it.
type TimelineMove = { moveIndex: number; classification: string; cpLoss?: number };

const BAD = new Set(['inaccuracy', 'mistake', 'blunder', 'missed_win']);
const UP: Record<string, number> = { brilliant: 1, great: 1, best: 0.95, excellent: 0.8, good: 0.6, book: 0.45 };

export function MoveTimeline({ moves, current, onSelect }: { moves: TimelineMove[]; current: number; onSelect: (ply: number) => void }) {
  if (moves.length === 0) return null;
  const sorted = [...moves].sort((a, b) => a.moveIndex - b.moveIndex);
  return (
    <div className="relative h-[84px] overflow-hidden rounded-[16px] px-1.5 py-1" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }} role="group" aria-label="Move quality timeline">
      <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: 'rgba(255,255,255,.12)' }} />
      <div className="flex h-full items-stretch gap-[2px]">
        {sorted.map((m) => {
          const bad = BAD.has(m.classification);
          const mag = bad ? Math.min(1, Math.max(0.18, (m.cpLoss ?? 120) / 350)) : (UP[m.classification] ?? 0.5);
          const color = !bad ? RD.green : m.classification === 'inaccuracy' ? RD.gold : m.classification === 'mistake' ? '#FF8A3D' : RD.red;
          const isCurrent = current === m.moveIndex + 1;
          return (
            <button
              key={m.moveIndex}
              onClick={() => onSelect(m.moveIndex + 1)}
              aria-label={`Move ${m.moveIndex + 1}: ${m.classification.replace('_', ' ')}`}
              className="relative min-w-[2px] flex-1"
              style={{ background: isCurrent ? 'rgba(255,255,255,.1)' : 'transparent' }}
            >
              <span
                className="absolute inset-x-0 rounded-[1px]"
                style={bad ? { top: '50%', height: `${mag * 46}%`, background: color } : { bottom: '50%', height: `${mag * 46}%`, background: color, opacity: 0.9 }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
