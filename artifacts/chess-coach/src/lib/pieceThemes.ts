import type { PieceShape } from '@/context/SettingsContext';

// How piece sets are organised in Settings -> Theme: by TYPE first, then by style.
// Adding a new set later is two steps: ship its sprites (public/pieces/<key>/wK.webp ... bP.webp
// for a raster set, or .svg for a vector set) and register the key in PIECE_SHAPES; then list the
// key under the right type here (or add a new type).
export interface PieceThemeType {
  id: string;
  label: string;
  blurb: string;
  shapes: PieceShape[];
}

export const PIECE_THEME_TYPES: PieceThemeType[] = [
  {
    id: 'classic',
    label: 'Classic',
    blurb: 'Traditional vector sets, plus the default pieces you can recolor under Piece Style.',
    shapes: ['default', 'cburnett', 'celtic', 'chessnut', 'fantasy', 'spatial', 'rhosgfx', 'kiwen-suwi', 'firi', 'totoy', 'papercut'],
  },
  {
    id: 'staunton',
    label: 'Staunton',
    blurb: 'Realistic ChessScout artwork. Best on the Premium Boards.',
    shapes: ['marble', 'bronze'],
  },
];

export function themeTypeOf(shape: PieceShape): string {
  return PIECE_THEME_TYPES.find((t) => t.shapes.includes(shape))?.id ?? PIECE_THEME_TYPES[0].id;
}
