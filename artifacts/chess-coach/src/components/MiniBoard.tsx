import React, { useMemo } from 'react';
import { useSettingsOptional, boardSkin } from '@/context/SettingsContext';
import { buildTintedPieceSet } from '@/components/RecoloredPieces';
import { PieceGradientDefs } from '@/components/PieceGradientDefs';

// Small static board on an exact 8x8 grid. Replaces the old text-glyph grids used for thumbnails: those let each
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

// One tinted piece set per settings combination, shared by every thumbnail on
// the page (a games list can show dozens).
const pieceSetCache = new Map<string, ReturnType<typeof buildTintedPieceSet>>();
function cachedPieceSet(opts: Parameters<typeof buildTintedPieceSet>[0]) {
  const key = JSON.stringify([opts.pieceColors, opts.pieceShape, opts.pieceStyle]);
  let set = pieceSetCache.get(key);
  if (!set) {
    if (pieceSetCache.size > 20) pieceSetCache.clear();
    set = buildTintedPieceSet(opts);
    pieceSetCache.set(key, set);
  }
  return set;
}

// The player's board skin and piece renderer (falls back to the classic wood
// board and sprites outside the settings provider). Shared by every small or
// hand-drawn board so they all match the Settings theme.
export function useBoardTheme() {
  const settings = useSettingsOptional();
  const skin = settings
    ? boardSkin(settings.boardColors, settings.boardTextureCss)
    : { boardStyle: {} as React.CSSProperties, lightSquareStyle: { backgroundColor: LIGHT } as React.CSSProperties, darkSquareStyle: { backgroundColor: DARK } as React.CSSProperties };
  const pieces = useMemo(
    () => settings ? cachedPieceSet({ pieceColors: settings.pieceColors, pieceShape: settings.pieceShape, pieceStyle: settings.pieceStyle }) : null,
    [settings?.pieceColors, settings?.pieceShape, settings?.pieceStyle],
  );
  // p is a FEN letter (K, q, ...). Fills its (relative) parent.
  const renderPiece = (p: string): React.ReactNode => {
    const render = pieces?.[`${p === p.toUpperCase() ? 'w' : 'b'}${p.toUpperCase()}`];
    if (render) return <div className="pointer-events-none absolute inset-0">{render({ svgStyle: { width: '100%', height: '100%', display: 'block' } })}</div>;
    return <img src={sprite(p)} alt="" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />;
  };
  return { skin, renderPiece, defs: pieces ? <span className="absolute h-0 w-0 overflow-hidden"><PieceGradientDefs /></span> : null };
}

// Every small static board in the app: drawn in the player's own board colours,
// texture and piece set (from Settings), on an exact 8x8 grid.
export function MiniBoard({ fen, size, flipped = false, lastMove }: { fen: string; size: number; flipped?: boolean; lastMove?: { from: string; to: string } | null }) {
  const { skin, renderPiece, defs } = useBoardTheme();
  const cells = parseFenPlacement(fen);
  return (
    <div className="relative block" aria-hidden="true"
      style={{ width: size, height: 'auto', maxWidth: '100%', aspectRatio: '1 / 1', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)', ...skin.boardStyle }}>
      {defs}
      {Array.from({ length: 64 }, (_, i) => {
        const r = flipped ? 7 - Math.floor(i / 8) : Math.floor(i / 8);
        const f = flipped ? 7 - (i % 8) : i % 8;
        const p = cells[r * 8 + f];
        const name = 'abcdefgh'[f] + (8 - r);
        const hl = lastMove && (lastMove.from === name || lastMove.to === name);
        return (
          <div key={i} className="relative" style={(r + f) % 2 === 1 ? skin.darkSquareStyle : skin.lightSquareStyle}>
            {hl && <div className="absolute inset-0" style={{ background: 'rgba(255, 240, 80, 0.45)' }} />}
            {p && renderPiece(p)}
          </div>
        );
      })}
    </div>
  );
}
