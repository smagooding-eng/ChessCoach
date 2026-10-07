import React from 'react';

// A small move-classification marker pinned to the inside top-right corner of the
// square a move landed on (the way chess sites mark "!!", "?" etc.). It replaces the
// big label that used to float in the board's top-right corner and cover h8/a1.
// Drawn as an SVG so it scales with the board at any size.

export function squareBox(square: string, flipped: boolean): { left: string; top: string } {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;
  return { left: `${col * 12.5}%`, top: `${row * 12.5}%` };
}

export function SquareBadge({ square, flipped, color, glyph, label }: {
  square: string;
  flipped: boolean;
  color: string;
  glyph: string;
  label: string;
}) {
  if (!/^[a-h][1-8]$/.test(square)) return null;
  const small = glyph.length > 1;
  return (
    <div className="absolute pointer-events-none z-10" style={{ ...squareBox(square, flipped), width: '12.5%', height: '12.5%' }} role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 100 100" className="absolute" style={{ right: '-2%', top: '-2%', width: '42%', height: '42%', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.55))' }}>
        <circle cx="50" cy="50" r="46" fill={color} stroke="rgba(255,255,255,.95)" strokeWidth="7" />
        <text x="50" y="51" textAnchor="middle" dominantBaseline="central" fill="#fff" fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif" fontWeight="900" fontSize={small ? 42 : 56}>{glyph}</text>
      </svg>
    </div>
  );
}
