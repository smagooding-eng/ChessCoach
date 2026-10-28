import React, { useMemo } from 'react';
import { useSettings, boardSkin } from '@/context/SettingsContext';
import { buildTintedPieceSet } from '@/components/RecoloredPieces';
import { PieceGradientDefs } from '@/components/PieceGradientDefs';
import { parseFenPlacement } from '@/components/MiniBoard';

// A small, still board (no moves, sounds or buzzes) in the player's own board
// colours, texture and piece set -- for game lists like "Your games".
export function ThemedMiniBoard({ fen, size, flipped = false, lastMove }: { fen: string; size: number; flipped?: boolean; lastMove?: { from: string; to: string } | null }) {
  const { boardColors, boardTextureCss, pieceColors, pieceShape, pieceStyle } = useSettings();
  const skin = boardSkin(boardColors, boardTextureCss);
  const pieces = useMemo(() => buildTintedPieceSet({ pieceColors, pieceShape, pieceStyle }), [pieceColors, pieceShape, pieceStyle]);
  const cells = parseFenPlacement(fen);
  const sq = (r: number, f: number) => 'abcdefgh'[f] + (8 - r);
  return (
    <div className="relative shrink-0 overflow-hidden rounded-[6px]" aria-hidden="true"
      style={{ width: size, height: size, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)', boxShadow: '0 1px 4px rgba(0,0,0,.45)', ...skin.boardStyle }}>
      <span className="absolute h-0 w-0 overflow-hidden"><PieceGradientDefs /></span>
      {Array.from({ length: 64 }, (_, i) => {
        const r = flipped ? 7 - Math.floor(i / 8) : Math.floor(i / 8);
        const f = flipped ? 7 - (i % 8) : i % 8;
        const p = cells[r * 8 + f];
        const dark = (r + f) % 2 === 1;
        const name = sq(r, f);
        const hl = lastMove && (lastMove.from === name || lastMove.to === name);
        const render = p ? pieces[`${p === p.toUpperCase() ? 'w' : 'b'}${p.toUpperCase()}`] : null;
        return (
          <div key={i} className="relative" style={dark ? skin.darkSquareStyle : skin.lightSquareStyle}>
            {hl && <div className="absolute inset-0" style={{ background: 'rgba(255, 240, 80, 0.45)' }} />}
            {render && <div className="absolute inset-0">{render({ svgStyle: { width: '100%', height: '100%', display: 'block' } })}</div>}
          </div>
        );
      })}
    </div>
  );
}
