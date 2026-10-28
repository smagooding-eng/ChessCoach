import React from 'react';
import { MiniBoard } from '@/components/MiniBoard';

// A small, still board in the player's own theme, with rounded corners and a
// shadow -- for game lists like "Your games".
export function ThemedMiniBoard({ fen, size, flipped = false, lastMove }: { fen: string; size: number; flipped?: boolean; lastMove?: { from: string; to: string } | null }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-[6px]" style={{ width: size, height: size, boxShadow: '0 1px 4px rgba(0,0,0,.45)' }}>
      <MiniBoard fen={fen} size={size} flipped={flipped} lastMove={lastMove} />
    </div>
  );
}
