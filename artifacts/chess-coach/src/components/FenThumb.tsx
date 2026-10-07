import React from 'react';
import { MiniBoard } from './MiniBoard';

// Small static board drawn from a FEN, in the warm wood palette the mockups
// use for thumbnails. Purely presentational (no interaction).
export function FenThumb({ fen, size = 60 }: { fen: string; size?: number }) {
  return (
    <div aria-hidden="true" style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(255,244,225,.92)', boxSizing: 'content-box' }}>
      <MiniBoard fen={fen} size={size} />
    </div>
  );
}
