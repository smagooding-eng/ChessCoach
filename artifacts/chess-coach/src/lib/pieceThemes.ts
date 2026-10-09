import type { PieceShape } from '@/context/SettingsContext';

// How piece sets are organised in Settings -> Theme: by TYPE first, then by style.
// Adding a set later is two steps: ship its sprites (public/pieces/<key>/wK.webp ... bP.webp for a raster
// set, or .svg for a vector set) and register the key in PIECE_SHAPES (raster sets also set `raster: true`);
// then list the key under a type here, or add a new type.
export interface PieceThemeType {
  id: string;
  label: string;
  blurb: string;
  shapes: PieceShape[];
}

export const PIECE_THEME_TYPES: PieceThemeType[] = [
  // 2D first: the default set (Ink & Cream) lives here.
  {
    id: 'tops-2d',
    label: 'ChessScout2D',
    blurb: "ChessScout's own squat, chunky pieces in flat illustrated styles: ink, cartoon, pixel art and stained glass.",
    shapes: ['ink-cream', 'pixel-art', 'stained-glass', 'minimal-rounded', 'pixel-art-2', 'chunky-cartoon'],
  },
  {
    id: 'tops-3d',
    label: 'ChessScout3D',
    blurb: "ChessScout's own squat, chunky pieces rendered in 3D: marble, wood, jade, metal, crystal and more.",
    shapes: ['frost-mosaic', 'walnut-maple', 'carved-jade', 'brushed-steel', 'futuristic-ceramic', 'crystal-ice', 'marble-gold', 'glossy-vinyl', 'ruby-sapphire', 'steampunk-brass', 'gothic-spires', 'bronze-silver', 'celtic-stone'],
  },
  {
    id: 'classic',
    label: 'Classic',
    blurb: 'Traditional vector sets, plus the default pieces you can recolor under Piece Style.',
    shapes: ['default', 'cburnett', 'celtic', 'chessnut', 'fantasy', 'spatial', 'rhosgfx', 'kiwen-suwi', 'firi', 'totoy', 'papercut'],
  },
];

export function themeTypeOf(shape: PieceShape): string {
  return PIECE_THEME_TYPES.find((t) => t.shapes.includes(shape))?.id ?? PIECE_THEME_TYPES[0].id;
}
