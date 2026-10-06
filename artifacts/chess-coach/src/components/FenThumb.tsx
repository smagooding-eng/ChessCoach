import React from 'react';

// Small static board drawn from a FEN, in the warm wood palette the mockups
// use for thumbnails. Purely presentational (no interaction).
const GLYPH: Record<string, string> = {
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

export function FenThumb({ fen, size = 60 }: { fen: string; size?: number }) {
  const rows = fen.split(' ')[0].split('/');
  const cells: { piece: string | null; dark: boolean }[] = [];
  rows.forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let k = 0; k < parseInt(ch, 10); k++) { cells.push({ piece: null, dark: (r + c) % 2 === 1 }); c++; }
      } else { cells.push({ piece: ch, dark: (r + c) % 2 === 1 }); c++; }
    }
  });
  const sq = size / 8;
  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(255,244,225,.92)', boxSizing: 'content-box' }}
    >
      {cells.slice(0, 64).map((cell, i) => (
        <div key={i} style={{ background: cell.dark ? '#b58863' : '#f0d9b5', display: 'grid', placeItems: 'center', fontSize: sq * 0.95, lineHeight: 1 }}>
          {cell.piece && (
            <span style={{ color: cell.piece === cell.piece.toUpperCase() ? '#fffdf6' : '#1d1b19', textShadow: cell.piece === cell.piece.toUpperCase() ? '0 0 1.5px #000, 0 0 1px #000' : 'none' }}>{GLYPH[cell.piece]}</span>
          )}
        </div>
      ))}
    </div>
  );
}
