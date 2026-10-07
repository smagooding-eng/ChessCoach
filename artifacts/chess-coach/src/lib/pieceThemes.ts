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
    id: 'stylized-neutral',
    label: 'Neutral',
    blurb: 'Stylized illustrated pieces in light, grey and steel tones.',
    shapes: ['sty-classic', 'sty-glossy', 'sty-outlined', 'sty-ivory', 'sty-silver', 'sty-steel'],
  },
  {
    id: 'stylized-gems',
    label: 'Jewel Tones',
    blurb: 'Stylized illustrated pieces in bold jewel and glow colours.',
    shapes: ['sty-amethyst', 'sty-emerald', 'sty-ruby', 'sty-sapphire', 'sty-ocean', 'sty-neon'],
  },
  {
    id: 'stylized-metals',
    label: 'Warm Metals',
    blurb: 'Stylized illustrated pieces in bronze, copper and gold, plus dark obsidian.',
    shapes: ['sty-bronze', 'sty-copper', 'sty-gold', 'sty-obsidian'],
  },
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
    shapes: ['set-marble-gold', 'marble', 'bronze', 'set-classic', 'set-classic-alt'],
  },
  {
    id: 'gems',
    label: 'Gems',
    blurb: 'Polished jewel-tone sets, each with a light and a dark side.',
    shapes: ['set-emerald', 'set-ruby', 'set-sapphire', 'set-amethyst', 'set-crystal'],
  },
  {
    id: 'metals',
    label: 'Metals',
    blurb: 'Cast and gilded metal pieces.',
    shapes: ['set-steel', 'set-bronze', 'set-royal-gold'],
  },
  {
    id: 'stone-wood',
    label: 'Stone & Wood',
    blurb: 'Natural materials: marble, carved stone and turned wood.',
    shapes: ['set-marble', 'set-carved-stone', 'set-wood'],
  },
  {
    id: 'sculpted',
    label: 'Sculpted',
    blurb: 'Distinctive designs: Celtic knotwork, Gothic spires and faceted low-poly.',
    shapes: ['set-celtic', 'set-gothic', 'set-faceted'],
  },
];

export function themeTypeOf(shape: PieceShape): string {
  return PIECE_THEME_TYPES.find((t) => t.shapes.includes(shape))?.id ?? PIECE_THEME_TYPES[0].id;
}
