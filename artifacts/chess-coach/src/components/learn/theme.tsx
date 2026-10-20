// Beginner path -- shared colors and a small piece icon in the user's set.

import { useMemo } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { buildTintedPieceSet } from '@/components/RecoloredPieces';

export const L = {
  bg: '#141413', card: '#1c1b19', card2: '#232220', text: '#e8e6e3', muted: '#9e9b98',
  accent: '#4a9eda', good: '#5bb85b', warn: '#e0a03a', bad: '#e05a5a', line: 'rgba(255,255,255,0.07)',
};

export function usePieceIcon() {
  const { pieceColors, pieceShape, pieceStyle } = useSettings();
  const set = useMemo(() => buildTintedPieceSet({ pieceColors, pieceShape, pieceStyle }), [pieceColors, pieceShape, pieceStyle]);
  return (key: string, size = 36) => (
    <div style={{ width: size, height: size }}>{set[key]?.({ svgStyle: { width: '100%', height: '100%' } })}</div>
  );
}
