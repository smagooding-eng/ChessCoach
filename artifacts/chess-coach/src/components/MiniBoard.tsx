import React from 'react';

// Small static board drawn as ONE svg on an exact 8x8 grid, with the app's piece
// sprites. Replaces the old text-glyph grids used for thumbnails: those let each
// row size itself from the font's glyph height (and phones render some chess
// glyphs as emoji), so rows came out uneven -- stretched or squashed ranks, tiny or
// missing pieces. Here every square and piece shares the same coordinates.

const LIGHT = '#f0d9b5';
const DARK = '#b58863';

export function parseFenPlacement(fen: string): (string | null)[] {
  const cells: (string | null)[] = [];
  const rows = (fen.split(' ')[0] || '').split('/');
  for (let r = 0; r < 8; r++) {
    const row = rows[r] ?? '8';
    let filled = 0;
    for (const ch of row) {
      if (filled >= 8) break;
      if (/\d/.test(ch)) {
        const n = Math.min(parseInt(ch, 10), 8 - filled);
        for (let k = 0; k < n; k++) cells.push(null);
        filled += n;
      } else if (/[prnbqkPRNBQK]/.test(ch)) {
        cells.push(ch); filled++;
      }
    }
    while (filled < 8) { cells.push(null); filled++; }
  }
  return cells;
}

const sprite = (p: string) =>
  `${import.meta.env.BASE_URL}pieces/chessnut/${p === p.toUpperCase() ? 'w' : 'b'}${p.toUpperCase()}.svg`;

export function MiniBoard({ fen, size, flipped = false }: { fen: string; size: number; flipped?: boolean }) {
  const cells = parseFenPlacement(fen);
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" className="block" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="0" y="0" width="8" height="8" fill={LIGHT} />
      {Array.from({ length: 64 }, (_, i) => {
        const r = Math.floor(i / 8), f = i % 8;
        return (r + f) % 2 === 1 ? <rect key={`d${i}`} x={f} y={r} width="1" height="1" fill={DARK} /> : null;
      })}
      {cells.map((p, i) => {
        if (!p) return null;
        const r = Math.floor(i / 8), f = i % 8;
        const x = flipped ? 7 - f : f;
        const y = flipped ? 7 - r : r;
        return <image key={`p${i}`} href={sprite(p)} x={x} y={y} width="1" height="1" preserveAspectRatio="xMidYMid meet" shapeRendering="auto" />;
      })}
    </svg>
  );
}
