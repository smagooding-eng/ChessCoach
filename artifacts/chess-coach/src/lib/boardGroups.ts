import type { BoardTexture } from '@/context/SettingsContext';

// How boards are organised in Settings -> Boards (like piece sets): by material
// first, then the board. The photographic boards from both collections are
// listed by what they're made of; "classic" holds the plain two-tone colours,
// Custom and the surface textures. Adding a board: register it in
// BOARD_TEXTURES, then list its key under a group here.
export interface BoardGroup {
  id: string;
  label: string;
  blurb: string;
  boards: BoardTexture[];
}

export const BOARD_GROUPS: BoardGroup[] = [
  {
    id: 'wood',
    label: 'Wood',
    blurb: 'Hardwood boards: oak, walnut, maple, birch, burl and rosewood.',
    boards: ['ex-classic-oak', 'ex-oak-walnut', 'cs-walnut', 'ex-maple-ebony', 'ex-birch-rosewood', 'ex-burl-rosewood'],
  },
  {
    id: 'marble',
    label: 'Marble',
    blurb: 'Polished marble, from cream and grey to jade, emerald and black-and-gold.',
    boards: ['ex-crema-marfil', 'cs-ivory', 'ex-grigio-marble', 'ex-jade-marble', 'cs-emerald', 'ex-verde-alpi', 'ex-nero-gold', 'cs-obsidian', 'ex-rosewood-blue-marble'],
  },
  {
    id: 'stone',
    label: 'Stone',
    blurb: 'Granite, travertine, soapstone and sandstone.',
    boards: ['ex-granite', 'ex-travertine', 'ex-soapstone', 'ex-sahara-noir'],
  },
  {
    id: 'specialty',
    label: 'Felt, Leather & Metal',
    blurb: 'The tournament roll-up, club felt, saddle leather and brushed metals.',
    boards: ['cs-tournament', 'ex-green-felt', 'ex-saddle-leather', 'cs-steel', 'ex-brushed-aluminum', 'ex-copper-patina'],
  },
  {
    id: 'classic',
    label: 'Classic',
    blurb: 'Plain two-tone boards, your own colours with Custom, and a subtle surface texture.',
    boards: [],
  },
];

export function boardGroupOf(texture: BoardTexture): string {
  return BOARD_GROUPS.find((g) => g.boards.includes(texture))?.id ?? 'classic';
}
