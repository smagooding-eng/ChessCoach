import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useUser } from '@/context/UserContext';
import { useDashboardRedesignFlag, useDefaultLook, type DefaultLook } from '@/hooks/use-app-config';
import { playSound, SOUND_PACKS, type SoundPack, type SoundEvent } from '@/lib/sounds';
import { REDESIGN_ON } from '@/lib/redesignTheme';
export { SOUND_PACKS, type SoundPack };

export type BoardTheme = 'classic' | 'green' | 'blue' | 'gray' | 'purple' | 'crimson' | 'teal' | 'coal' | 'sunset' | 'rose' | 'amber' | 'mint' | 'indigo' | 'midnight' | 'arctic' | 'custom';
export type BoardTexture = 'flat' | 'wood' | 'marble' | 'felt' | 'granite' | 'leather' | 'glass' | 'canvas' | 'sandstone' | 'slate' | 'silk'
  // Photographic boards cut from the ChessScout asset pack (see CS_BOARDS below)
  | 'cs-emerald' | 'cs-obsidian' | 'cs-ivory' | 'cs-walnut' | 'cs-steel' | 'cs-tournament'
  // Enhanced-UI-only photographic boards (see ENHANCED_BOARD_KEYS below)
  | 'ex-rosewood-blue-marble' | 'ex-green-felt' | 'ex-brushed-aluminum' | 'ex-oak-walnut' | 'ex-sahara-noir' | 'ex-granite' | 'ex-nero-gold' | 'ex-copper-patina' | 'ex-burl-rosewood' | 'ex-travertine' | 'ex-saddle-leather' | 'ex-grigio-marble' | 'ex-maple-ebony' | 'ex-soapstone' | 'ex-crema-marfil' | 'ex-jade-marble' | 'ex-verde-alpi' | 'ex-classic-oak' | 'ex-birch-rosewood';
export type AppBackground = 'default' | 'warm-gradient' | 'cool-gradient' | 'noise';
/** standard: solid cards. photo: one of our photos behind the whole app, with see-through cards. */
export type UiStyle = 'standard' | 'photo';
export type CardGlass = 'light' | 'medium' | 'strong';

/** A backdrop behind the app (UiStyle 'photo'): one of our photos, a plain
 *  colour, or one of our chess boards. `src` is an image; `css` is a CSS
 *  background used instead (plain colours, square patterns). `blur`/`shade`
 *  override the card-transparency defaults; `tone: 'light'` is for bright
 *  backdrops (stronger cards, shadowed text). */
export type BgBackdrop = {
  id: string; label: string; group: 'photo' | 'colour' | 'board';
  src?: string; css?: string; thumb?: string;
  blur?: number; shade?: number; tone?: 'light' | 'dark';
};
const checker = (light: string, dark: string) =>
  `repeating-conic-gradient(${dark} 0 25%, ${light} 0 50%) 0 0 / min(25vw, 25vh) min(25vw, 25vh)`;
const boardBg = (id: string, file: string, label: string, thumb = false): BgBackdrop =>
  ({ id, label, group: 'board', src: `/boards/${file}.webp`, thumb: thumb ? `/boards/${file}-thumb.webp` : undefined, blur: 1 });

/** Backdrops you can put behind the app (UiStyle 'photo'). */
export const BG_PHOTOS: BgBackdrop[] = [
  { id: 'library', label: 'Classic set', group: 'photo', src: '/photo/assets/courses/course-library.webp' },
  { id: 'golden-knight', label: 'Golden hour', group: 'photo', src: '/photo/assets/courses/course-training-hero.webp' },
  { id: 'lone-king', label: 'Lone king', group: 'photo', src: '/photo/assets/courses/course-endgame.webp' },
  { id: 'blue-knight', label: 'Blue knight', group: 'photo', src: '/photo/assets/courses/course-opening.webp' },
  { id: 'face-off', label: 'Face-off', group: 'photo', src: '/photo/assets/courses/course-tactical.webp' },
  { id: 'fire', label: 'Fire', group: 'photo', src: '/photo/assets/courses/course-discovered.webp' },
  { id: 'army', label: 'The army', group: 'photo', src: '/photo/chessscout/scenes/hero-lookup.webp' },
  { id: 'sunset', label: 'Sunset', group: 'photo', src: '/photo/chessscout/scenes/hero-endgames.webp' },
  { id: 'wood', label: 'Wooden board', group: 'photo', src: '/photo/chessscout/scenes/profile-card.webp' },
  { id: 'red-board', label: 'Red board', group: 'photo', src: '/photo/chessscout/scenes/play-online.webp' },
  { id: 'silver', label: 'Silver', group: 'photo', src: '/photo/chessscout/scenes/play-daily.webp' },
  // plain colours
  { id: 'solid-black', label: 'Black', group: 'colour', css: '#000000', blur: 0, shade: 0 },
  { id: 'solid-white', label: 'White', group: 'colour', css: '#F4F5F3', blur: 0, shade: 0, tone: 'light' },
  { id: 'solid-green', label: 'ChessScout green', group: 'colour', css: '#81B64C', blur: 0, shade: 0.12, tone: 'light' },
  // our boards: photographic sets
  boardBg('board-walnut', 'walnut', 'Walnut'),
  boardBg('board-emerald', 'emerald', 'Emerald Marble'),
  boardBg('board-obsidian', 'obsidian', 'Obsidian'),
  boardBg('board-tournament', 'tournament', 'Tournament'),
  boardBg('board-green-felt', 'green-felt', 'Green Felt', true),
  boardBg('board-nero-gold', 'nero-gold', 'Nero Gold', true),
  boardBg('board-grigio', 'grigio-marble', 'Grigio Marble', true),
  boardBg('board-classic-oak', 'classic-oak', 'Classic Oak', true),
  // our boards: colour sets as a square pattern
  { id: 'squares-classic', label: 'Classic Wood squares', group: 'board', css: checker('#f0d9b5', '#b58863'), blur: 0 },
  { id: 'squares-green', label: 'Green squares', group: 'board', css: checker('#eeeed2', '#769656'), blur: 0 },
  { id: 'squares-blue', label: 'Ocean Blue squares', group: 'board', css: checker('#dee3e6', '#8ca2ad'), blur: 0 },
  { id: 'squares-coal', label: 'Coal squares', group: 'board', css: checker('#d6d6d6', '#2b2b2b'), blur: 0 },
  { id: 'squares-midnight', label: 'Midnight squares', group: 'board', css: checker('#c9ccd6', '#1a1d29'), blur: 0 },
];
export const CARD_GLASS: Record<CardGlass, { label: string; sub: string }> = {
  light: { label: 'See-through', sub: 'Most of the photo' },
  medium: { label: 'Balanced', sub: 'Recommended' },
  strong: { label: 'Subtle', sub: 'Easiest to read' },
};
export type PieceStyle = 'classic' | 'glossy' | 'outlined' | 'ocean' | 'crimson' | 'emerald' | 'royal' | 'flat' | 'depth' | 'shaded' | 'wood3d' | 'marble3d' | 'chrome' | 'gold' | 'copper' | 'obsidian' | 'ivory' | 'custom';
export type PieceShape = 'default' | 'cburnett' | 'celtic' | 'chessnut' | 'fantasy' | 'spatial' | 'rhosgfx' | 'kiwen-suwi' | 'firi' | 'totoy' | 'papercut' | 'ink-cream' | 'frost-mosaic' | 'walnut-maple' | 'carved-jade' | 'brushed-steel' | 'futuristic-ceramic' | 'crystal-ice' | 'marble-gold' | 'glossy-vinyl' | 'ruby-sapphire' | 'pixel-art' | 'stained-glass' | 'minimal-rounded' | 'pixel-art-2' | 'chunky-cartoon' | 'steampunk-brass' | 'gothic-spires' | 'bronze-silver' | 'celtic-stone';
export type PromotionChoice = 'queen' | 'ask';
export type BoardSize = 'compact' | 'standard' | 'large';

// Every shape below (other than 'default') is real, distinct piece
// artwork sourced directly from lichess-org/lila's own repository
// (public/piece/<shape>), not a recolor of the default shape. Because
// it's static SVG artwork with color baked in, the Piece Style color
// picker doesn't apply on top of any of them -- shape and color are
// independent choices, but each of these brings its own coloring.
//
// IMPORTANT LICENSING NOTE: lila bundles dozens of piece sets under very
// different licenses -- most are GPL/AGPL (copyleft: combining them into
// a closed-source commercial app could obligate releasing this app's own
// source) or CC BY-NC-SA (explicitly non-commercial). Only the sets
// below were verified against lila's own COPYING.md as safe for a
// commercial closed-source product (permissive license, no share-alike,
// no non-commercial restriction) -- this is not "all available sets,"
// it's deliberately the safe subset.
//
// Cburnett is the one exception worth flagging: lila's current
// COPYING.md lists it as GPLv2+ ONLY (earlier research suggested a CC
// BY-SA 3.0 dual-license option that doesn't appear in the current file
// -- corrected here). GPL's copyleft obligation is clearest for linked
// code; whether serving a GPL-licensed static SVG *asset* to users
// triggers the same obligation is a genuinely disputed question, not
// something to resolve here -- flagged for a real legal read, not
// removed unilaterally since it's already live.
// `raster` sets are WebP sprites in /pieces/<key>/ rather than SVG; bump `version` when their files are replaced.
export const PIECE_SHAPES: Record<PieceShape, { label: string; attribution: string | null; hidden?: boolean; raster?: boolean; version?: number }> = {
  default:    { label: 'Default', attribution: null },
  cburnett:   { label: 'Cburnett', attribution: 'Piece set "Cburnett" by Colin M.L. Burnett, GPLv2+ (see licensing note above)' },
  celtic:     { label: 'Celtic', attribution: 'Piece set "Celtic" by Maurizio Monge, MIT License' },
  chessnut:   { label: 'Chessnut', attribution: 'Piece set "Chessnut" by Alexis Luengas, Apache License 2.0' },
  fantasy:    { label: 'Fantasy', attribution: 'Piece set "Fantasy" by Maurizio Monge, MIT License' },
  spatial:    { label: 'Spatial', attribution: 'Piece set "Spatial" by Maurizio Monge, MIT License' },
  rhosgfx:    { label: 'RhosGFX', attribution: 'Piece set by RhosGFX, CC0 1.0 (public domain)' },
  'kiwen-suwi': { label: 'Kiwen-Suwi', attribution: 'Piece set "Kiwen-Suwi" by neverRare, CC BY 4.0' },
  firi:       { label: 'Firi', attribution: 'Piece set "Firi" by James Faure, CC BY 4.0' },
  totoy:      { label: 'Totoy', attribution: 'Piece set "Totoy" by Kosal Sen, CC BY 4.0' },
  papercut:   { label: 'Papercut', attribution: 'Piece set "Papercut" by Nikolay Anzarov, CC BY 4.0' },
  // ChessScout's own artwork: squat "tops only" pieces (see lib/pieceThemes.ts). Raster = WebP sprites in /pieces/<key>/.
  'ink-cream': { label: 'Ink & Cream', attribution: null, raster: true, version: 1 },
  'frost-mosaic': { label: 'Frost Mosaic', attribution: null, raster: true, version: 1 },
  'walnut-maple': { label: 'Walnut & Maple', attribution: null, raster: true, version: 1 },
  'carved-jade': { label: 'Carved Jade', attribution: null, raster: true, version: 1 },
  'brushed-steel': { label: 'Brushed Steel', attribution: null, raster: true, version: 1 },
  'futuristic-ceramic': { label: 'Futuristic Ceramic', attribution: null, raster: true, version: 1 },
  'crystal-ice': { label: 'Crystal & Ice', attribution: null, raster: true, version: 1 },
  'marble-gold': { label: 'Marble & Gold', attribution: null, raster: true, version: 1 },
  'glossy-vinyl': { label: 'Glossy Toy Vinyl', attribution: null, raster: true, version: 1 },
  'ruby-sapphire': { label: 'Ruby & Sapphire', attribution: null, raster: true, version: 1 },
  'pixel-art': { label: 'Pixel Art', attribution: null, raster: true, version: 1 },
  'stained-glass': { label: 'Stained Glass', attribution: null, raster: true, version: 1 },
  'minimal-rounded': { label: 'Minimal Rounded', attribution: null, raster: true, version: 1 },
  'pixel-art-2': { label: 'Pixel Art II', attribution: null, raster: true, version: 1 },
  'chunky-cartoon': { label: 'Chunky Cartoon', attribution: null, raster: true, version: 1 },
  'steampunk-brass': { label: 'Steampunk Brass', attribution: null, raster: true, version: 1 },
  'gothic-spires': { label: 'Gothic Spires', attribution: null, raster: true, version: 1 },
  'bronze-silver': { label: 'Antique Bronze & Silver', attribution: null, raster: true, version: 1 },
  'celtic-stone': { label: 'Celtic Stone', attribution: null, raster: true, version: 1 },
};

export const BOARD_THEMES: Record<Exclude<BoardTheme, 'custom'>, { light: string; dark: string; label: string }> = {
  classic: { light: '#f0d9b5', dark: '#b58863', label: 'Classic Wood' },
  green:   { light: '#eeeed2', dark: '#769656', label: 'Green' },
  blue:    { light: '#dee3e6', dark: '#8ca2ad', label: 'Ocean Blue' },
  gray:    { light: '#e8e8e8', dark: '#7a7a7a', label: 'Slate Gray' },
  purple:  { light: '#e8dff5', dark: '#9370b8', label: 'Purple' },
  crimson: { light: '#f5dede', dark: '#a1454a', label: 'Crimson' },
  teal:    { light: '#dcf0ec', dark: '#3f8f7f', label: 'Teal' },
  coal:    { light: '#d6d6d6', dark: '#2b2b2b', label: 'Coal' },
  sunset:  { light: '#fbe8c9', dark: '#c8813a', label: 'Sunset' },
  rose:     { light: '#f9e0e5', dark: '#c76b7f', label: 'Rose' },
  amber:    { light: '#fdf0d5', dark: '#d99a3f', label: 'Amber' },
  mint:     { light: '#e3f5ec', dark: '#4fa989', label: 'Mint' },
  indigo:   { light: '#e5e3f7', dark: '#5b52a3', label: 'Indigo' },
  midnight: { light: '#c9ccd6', dark: '#1a1d29', label: 'Midnight' },
  arctic:   { light: '#f5fbff', dark: '#a8c5d6', label: 'Arctic' },
};

// CSS-only textures (no image assets exist to source/verify, so these are
// gradient/pattern-based rather than photographic). Applied as an overlay
// backgroundImage on top of the existing solid boardColors, so texture and
// color stay independent choices.
// Photographic boards from the ChessScout asset pack. Each is a true edge-to-edge
// 8x8 image, so it is used as ONE continuous background behind transparent squares
// (marble veins and wood grain flow across squares, rather than one tile repeating).
// `boardImage` drives that; the light/dark tiles cut from the same board remain as a
// fallback for any surface that can only style individual squares. The boards replace
// the board colour entirely, unlike the subtle CSS textures below.
const csBoard = (file: string, label: string) => ({
  label,
  boardImage: `/boards/${file}.webp`,
  backgroundImage: `url('/boards/${file}-light.webp')`,
  backgroundImageDark: `url('/boards/${file}-dark.webp')`,
  backgroundSize: 'cover',
});

export type BoardTextureDef = { label: string; backgroundImage: string; backgroundImageDark?: string; backgroundSize?: string; boardImage?: string; thumb?: string; enhancedOnly?: boolean };

// Photographic boards (both the original cs- set and the enhanced-only ex- set) replace
// the board colour, so they're listed in the board pickers rather than the texture list.
export const isPhotoBoard = (key: string) => key.startsWith('cs-') || key.startsWith('ex-');

export const BOARD_TEXTURES: Record<BoardTexture, BoardTextureDef> = {
  flat:   { label: 'Flat', backgroundImage: 'none' },
  'cs-emerald':    csBoard('emerald', 'Emerald Marble'),
  'cs-obsidian':   csBoard('obsidian', 'Obsidian'),
  'cs-ivory':      csBoard('ivory', 'Ivory'),
  'cs-walnut':     csBoard('walnut', 'Walnut'),
  'cs-steel':      csBoard('steel', 'Steel'),
  'cs-tournament': csBoard('tournament', 'Tournament'),
  // Enhanced UI only. Same continuous-image technique as the cs- boards, plus a small
  // thumbnail so the Settings picker doesn't download every full-size board at once.
  'ex-rosewood-blue-marble': { ...csBoard('rosewood-blue-marble', 'Rosewood & Blue Marble'), thumb: '/boards/rosewood-blue-marble-thumb.webp', enhancedOnly: true },
  'ex-green-felt': { ...csBoard('green-felt', 'Green Felt'), thumb: '/boards/green-felt-thumb.webp', enhancedOnly: true },
  'ex-brushed-aluminum': { ...csBoard('brushed-aluminum', 'Brushed Aluminum'), thumb: '/boards/brushed-aluminum-thumb.webp', enhancedOnly: true },
  'ex-oak-walnut': { ...csBoard('oak-walnut', 'Oak & Walnut'), thumb: '/boards/oak-walnut-thumb.webp', enhancedOnly: true },
  'ex-sahara-noir': { ...csBoard('sahara-noir', 'Sahara Noir'), thumb: '/boards/sahara-noir-thumb.webp', enhancedOnly: true },
  'ex-granite': { ...csBoard('granite', 'Granite'), thumb: '/boards/granite-thumb.webp', enhancedOnly: true },
  'ex-nero-gold': { ...csBoard('nero-gold', 'Nero Gold'), thumb: '/boards/nero-gold-thumb.webp', enhancedOnly: true },
  'ex-copper-patina': { ...csBoard('copper-patina', 'Copper Patina'), thumb: '/boards/copper-patina-thumb.webp', enhancedOnly: true },
  'ex-burl-rosewood': { ...csBoard('burl-rosewood', 'Burl & Rosewood'), thumb: '/boards/burl-rosewood-thumb.webp', enhancedOnly: true },
  'ex-travertine': { ...csBoard('travertine', 'Travertine'), thumb: '/boards/travertine-thumb.webp', enhancedOnly: true },
  'ex-saddle-leather': { ...csBoard('saddle-leather', 'Saddle Leather'), thumb: '/boards/saddle-leather-thumb.webp', enhancedOnly: true },
  'ex-grigio-marble': { ...csBoard('grigio-marble', 'Grigio Marble'), thumb: '/boards/grigio-marble-thumb.webp', enhancedOnly: true },
  'ex-maple-ebony': { ...csBoard('maple-ebony', 'Maple & Ebony'), thumb: '/boards/maple-ebony-thumb.webp', enhancedOnly: true },
  'ex-soapstone': { ...csBoard('soapstone', 'Soapstone'), thumb: '/boards/soapstone-thumb.webp', enhancedOnly: true },
  'ex-crema-marfil': { ...csBoard('crema-marfil', 'Crema Marfil'), thumb: '/boards/crema-marfil-thumb.webp', enhancedOnly: true },
  'ex-jade-marble': { ...csBoard('jade-marble', 'Jade Marble'), thumb: '/boards/jade-marble-thumb.webp', enhancedOnly: true },
  'ex-verde-alpi': { ...csBoard('verde-alpi', 'Verde Alpi'), thumb: '/boards/verde-alpi-thumb.webp', enhancedOnly: true },
  'ex-classic-oak': { ...csBoard('classic-oak', 'Classic Oak'), thumb: '/boards/classic-oak-thumb.webp', enhancedOnly: true },
  'ex-birch-rosewood': { ...csBoard('birch-rosewood', 'Birch & Rosewood'), thumb: '/boards/birch-rosewood-thumb.webp', enhancedOnly: true },
  // Plain CSS gradients are inherently regular/mathematical -- a
  // repeating-linear-gradient can only ever look like a hatch pattern or
  // a grid of dots, never organic grain or fabric fiber. An inline SVG
  // feTurbulence filter, rendered as a data-URI background image, can
  // actually generate fractal noise -- which is what wood grain and felt
  // fiber both fundamentally are. No new image assets, no runtime cost
  // (it's declarative, rendered once by the browser like any other
  // background-image), just a more honest tool for this specific job.
  wood:   {
    label: 'Wood Grain',
    // Anisotropic base frequency (very low along X, higher along Y) is
    // what makes turbulence noise read as long grain streaks rather than
    // an even blob -- low X frequency means the pattern barely changes
    // along the grain's length, higher Y frequency creates many distinct
    // bands running across it, the way real growth rings do. Tinted warm
    // brown via feColorMatrix and kept low-alpha so it reads as texture
    // on top of the existing square color, not a color change.
    //
    // backgroundImage (light squares) has the frequencies as X,Y --
    // grain runs horizontally. backgroundImageDark (dark squares) is the
    // same filter with X and Y swapped, so its grain runs vertically
    // instead -- real wooden chessboards are often built this way on
    // purpose, alternating grain direction between the two square colors
    // for contrast, rather than every square looking identically milled.
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='w'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012 0.18' numOctaves='4' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0.32  0 0 0 0 0.19  0 0 0 0 0.07  0 0 0 0.35 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23w)'/%3E%3C/svg%3E")`,
    backgroundImageDark: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='wd'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.18 0.012' numOctaves='4' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0.32  0 0 0 0 0.19  0 0 0 0 0.07  0 0 0 0.35 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23wd)'/%3E%3C/svg%3E")`,
    backgroundSize: '140px 140px',
  },
  marble: {
    label: 'Marble',
    backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.08) 0%, transparent 35%), radial-gradient(circle at 75% 65%, rgba(0,0,0,0.06) 0%, transparent 40%), radial-gradient(circle at 45% 85%, rgba(255,255,255,0.05) 0%, transparent 30%)',
  },
  felt:   {
    label: 'Felt',
    // High, near-isotropic base frequency for fine, dense fiber-like
    // noise rather than wood's long streaks; stitchTiles keeps a small
    // tile seamless so it reads as uniform fabric instead of a visibly
    // repeating square.
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.16 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E")`,
    backgroundSize: '28px 28px',
  },
  // Isotropic (equal X/Y frequency) turbulence at a mid frequency with
  // more octaves than felt -- reads as mottled mineral speckle rather
  // than fabric fiber or wood grain. Neutral gray tint (not warm brown
  // like wood, not colorless like marble's soft radial highlights) is
  // what separates granite from the other two textured options.
  granite: {
    label: 'Granite',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cfilter id='gr'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.35' numOctaves='5' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0.25  0 0 0 0 0.25  0 0 0 0 0.27  0 0 0 0.3 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23gr)'/%3E%3C/svg%3E")`,
    backgroundSize: '60px 60px',
  },
  // Same fine-grain technique as felt (leather's surface is also a dense
  // organic fiber pattern up close), but lower alpha and a warm
  // brown-red tint instead of felt's neutral gray-black -- felt reads as
  // matte fabric, this reads as a worn, warm hide instead.
  leather: {
    label: 'Leather',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cfilter id='lt'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' seed='19' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0.3  0 0 0 0 0.15  0 0 0 0 0.08  0 0 0 0.22 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23lt)'/%3E%3C/svg%3E")`,
    backgroundSize: '40px 40px',
  },
  // No turbulence at all -- glass isn't organic noise, it's a smooth
  // surface with a hard directional highlight. A single sharp-edged
  // diagonal band (linear-gradient with tight color stops rather than a
  // smooth fade) reads as a reflective sheen catching the light, the way
  // marble's soft radial gradients read as veining.
  glass: {
    label: 'Glass',
    backgroundImage: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.10) 45%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.10) 55%, transparent 70%)',
  },
  // Low frequency, few octaves -- coarser and more angular than felt's
  // fine dense fiber, reading as a looser, chunkier weave rather than
  // smooth fabric. Neutral beige keeps it distinct from felt's gray-black.
  canvas: {
    label: 'Canvas',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cfilter id='cv'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='1' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.32  0 0 0 0.18 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23cv)'/%3E%3C/svg%3E")`,
    backgroundSize: '24px 24px',
  },
  // Same mottled-mineral technique as granite, but warm tan instead of
  // neutral gray, and a slightly lower frequency for softer, larger
  // mottling -- reads as sun-worn stone rather than granite's fine speckle.
  sandstone: {
    label: 'Sandstone',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='70' height='70'%3E%3Cfilter id='sd'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.25' numOctaves='4' seed='23' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0.55  0 0 0 0 0.42  0 0 0 0 0.28  0 0 0 0.28 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23sd)'/%3E%3C/svg%3E")`,
    backgroundSize: '70px 70px',
  },
  // High frequency, more octaves than granite for a smoother, finer grain,
  // with a cool blue-gray tint (granite's is neutral) -- reads as
  // polished dark stone rather than granite's rougher, warmer speckle.
  slate: {
    label: 'Slate',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45'%3E%3Cfilter id='sl'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.5' numOctaves='6' seed='31' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0.2  0 0 0 0 0.24  0 0 0 0 0.3  0 0 0 0.32 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23sl)'/%3E%3C/svg%3E")`,
    backgroundSize: '45px 45px',
  },
  // Gradient-based like glass, not turbulence -- but a wider, softer,
  // warm-tinted band at a different angle reads as fabric shimmer
  // catching the light rather than glass's hard, cool reflection.
  silk: {
    label: 'Silk',
    backgroundImage: 'linear-gradient(70deg, transparent 20%, rgba(255,240,220,0.06) 35%, rgba(255,245,230,0.13) 50%, rgba(255,240,220,0.06) 65%, transparent 80%)',
  },
};

export const APP_BACKGROUNDS: Record<AppBackground, { label: string; css: React.CSSProperties }> = {
  default:       { label: 'Default', css: {} },
  'warm-gradient': { label: 'Warm', css: { backgroundImage: 'radial-gradient(circle at 15% 0%, rgba(201,162,75,0.08) 0%, transparent 45%), radial-gradient(circle at 85% 100%, rgba(129,182,76,0.05) 0%, transparent 40%)' } },
  'cool-gradient': { label: 'Cool', css: { backgroundImage: 'radial-gradient(circle at 15% 0%, rgba(107,164,232,0.08) 0%, transparent 45%), radial-gradient(circle at 85% 100%, rgba(199,125,212,0.05) 0%, transparent 40%)' } },
  noise:         { label: 'Textured', css: { backgroundImage: 'radial-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '3px 3px' } },
};

export const PIECE_STYLES: Record<Exclude<PieceStyle, 'custom'>, { light: string; dark: string; label: string; finish: React.CSSProperties; previewLight?: string; previewDark?: string; baseLight: string; baseDark: string }> = {
  classic:  { light: '#ffffff', dark: '#2b2b2b', label: 'Classic',  finish: {}, baseLight: '#ffffff', baseDark: '#2b2b2b' },
  glossy:   { light: '#ffffff', dark: '#2b2b2b', label: 'Glossy',   finish: { filter: 'drop-shadow(0 2px 1px rgba(0,0,0,0.35)) brightness(1.08) contrast(1.1)' }, baseLight: '#ffffff', baseDark: '#2b2b2b' },
  outlined: { light: '#ffffff', dark: '#1a1a1a', label: 'Outlined', finish: { filter: 'drop-shadow(0 0 0.5px #000) drop-shadow(0 0 0.5px #000) drop-shadow(0 0 0.5px #000)' }, baseLight: '#ffffff', baseDark: '#1a1a1a' },
  ocean:    { light: '#dff1ff', dark: '#1c4b7a', label: 'Ocean',    finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }, baseLight: '#dff1ff', baseDark: '#1c4b7a' },
  crimson:  { light: '#ffe9e9', dark: '#7a1c2b', label: 'Crimson',  finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }, baseLight: '#ffe9e9', baseDark: '#7a1c2b' },
  emerald:  { light: '#e8fff2', dark: '#166b45', label: 'Emerald',  finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }, baseLight: '#e8fff2', baseDark: '#166b45' },
  royal:    { light: '#f3e9ff', dark: '#4a1c7a', label: 'Royal',    finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }, baseLight: '#f3e9ff', baseDark: '#4a1c7a' },
  flat:     { light: '#f2f2f2', dark: '#232323', label: 'Flat',     finish: { filter: 'contrast(0.92) saturate(0.85)' }, baseLight: '#f2f2f2', baseDark: '#232323' },
  depth:    { light: '#ffffff', dark: '#2b2b2b', label: 'Depth',    finish: { filter: 'drop-shadow(0 3px 2px rgba(0,0,0,0.5)) drop-shadow(0 1px 0 rgba(255,255,255,0.15)) brightness(1.05)' }, baseLight: '#ffffff', baseDark: '#2b2b2b' },
  // These four use a gradient fill (defined once in ChessBoard.tsx's
  // <defs>, referenced here by url(#id)) instead of a flat color -- a
  // flat-filled silhouette plus a drop-shadow filter can only ever fake
  // an outer shadow, it can't suggest a curved or beveled surface. A
  // light-to-dark gradient across the piece itself is what actually
  // reads as "shaded" or "3D" rather than "flat piece with a shadow
  // behind it".
  // previewLight/previewDark mirror the SVG gradient stops above, but as
  // CSS linear-gradient() strings -- the Settings picker's swatch preview
  // renders a plain text glyph with CSS `color`, which can't resolve an
  // SVG url(#id) fill reference the way the real board pieces can. These
  // give that preview an accurate gradient via background-clip:text
  // instead (see Settings.tsx).
  // baseLight/baseDark: a representative flat hex (the gradient's middle
  // stop) for computing outline/detail colors from -- getPieceColorScheme
  // needs one concrete color to work from, not a gradient reference.
  shaded:   { light: 'url(#cc-grad-shaded-light)', dark: 'url(#cc-grad-shaded-dark)', label: 'Shaded', finish: { filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.45))' },
    previewLight: 'linear-gradient(135deg, #fdfdfd 0%, #e2e2e2 55%, #bdbdbd 100%)', previewDark: 'linear-gradient(135deg, #5a5a5a 0%, #333333 55%, #151515 100%)', baseLight: '#e2e2e2', baseDark: '#333333' },
  wood3d:   { light: 'url(#cc-grad-wood-light)', dark: 'url(#cc-grad-wood-dark)', label: '3D Wood', finish: { filter: 'drop-shadow(0 3px 2px rgba(40,20,0,0.5)) drop-shadow(0 1px 0 rgba(255,235,200,0.25))' },
    previewLight: 'linear-gradient(135deg, #fbe9c6 0%, #e8c583 50%, #c08f43 100%)', previewDark: 'linear-gradient(135deg, #8a5a2e 0%, #5c3a1a 50%, #2e1a0a 100%)', baseLight: '#e8c583', baseDark: '#5c3a1a' },
  marble3d: { light: 'url(#cc-grad-marble-light)', dark: 'url(#cc-grad-marble-dark)', label: '3D Marble', finish: { filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.4)) drop-shadow(0 1px 0 rgba(255,255,255,0.3))' },
    previewLight: 'linear-gradient(135deg, #ffffff 0%, #e6e6ee 60%, #c4c4d2 100%)', previewDark: 'linear-gradient(135deg, #4a4a54 0%, #26262e 60%, #0e0e12 100%)', baseLight: '#e6e6ee', baseDark: '#26262e' },
  chrome:   { light: 'url(#cc-grad-chrome-light)', dark: 'url(#cc-grad-chrome-dark)', label: 'Chrome', finish: { filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5)) contrast(1.15)' },
    previewLight: 'linear-gradient(135deg, #ffffff 0%, #c9d3d9 35%, #eef3f5 60%, #8a97a0 100%)', previewDark: 'linear-gradient(135deg, #7a828a 0%, #2a2d31 35%, #4a4f55 60%, #0a0b0c 100%)', baseLight: '#c9d3d9', baseDark: '#2a2d31' },
  gold:     { light: 'url(#cc-grad-gold-light)', dark: 'url(#cc-grad-gold-dark)', label: 'Gold', finish: { filter: 'drop-shadow(0 2px 2px rgba(60,40,0,0.5)) drop-shadow(0 1px 0 rgba(255,240,180,0.3)) contrast(1.08)' },
    previewLight: 'linear-gradient(135deg, #fff4d1 0%, #e8c04a 50%, #a8791f 100%)', previewDark: 'linear-gradient(135deg, #c99a2e 0%, #7a5714 50%, #3d2a09 100%)', baseLight: '#e8c04a', baseDark: '#7a5714' },
  copper:   { light: 'url(#cc-grad-copper-light)', dark: 'url(#cc-grad-copper-dark)', label: 'Copper', finish: { filter: 'drop-shadow(0 2px 2px rgba(50,20,0,0.5)) drop-shadow(0 1px 0 rgba(255,200,150,0.25))' },
    previewLight: 'linear-gradient(135deg, #ffd9b8 0%, #d4823f 50%, #8a4a1e 100%)', previewDark: 'linear-gradient(135deg, #a8622e 0%, #6b3818 50%, #331a09 100%)', baseLight: '#d4823f', baseDark: '#6b3818' },
  obsidian: { light: 'url(#cc-grad-obsidian-light)', dark: 'url(#cc-grad-obsidian-dark)', label: 'Obsidian', finish: { filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6)) drop-shadow(0 1px 0 rgba(180,160,255,0.15))' },
    previewLight: 'linear-gradient(135deg, #8a8494 0%, #4a4458 55%, #1c1824 100%)', previewDark: 'linear-gradient(135deg, #38333f 0%, #1a1620 55%, #05040a 100%)', baseLight: '#4a4458', baseDark: '#1a1620' },
  ivory:    { light: 'url(#cc-grad-ivory-light)', dark: 'url(#cc-grad-ivory-dark)', label: 'Ivory', finish: { filter: 'drop-shadow(0 2px 2px rgba(60,50,20,0.35))' },
    previewLight: 'linear-gradient(135deg, #fffdf2 0%, #f3e8c8 55%, #d9c396 100%)', previewDark: 'linear-gradient(135deg, #b8a06a 0%, #8a7345 55%, #5c4a28 100%)', baseLight: '#f3e8c8', baseDark: '#8a7345' },
};

// Square styling for react-chessboard, shared by every themed board. A photographic
// board is painted once on the board itself with transparent squares (so highlights,
// legal-move dots and last-move marks still draw on top); everything else keeps the
// per-square colour + optional texture it always had.
export function boardSkin(
  colors: { light: string; dark: string },
  tex: { backgroundImage: string; backgroundImageDark?: string; backgroundSize?: string; boardImage?: string },
): { boardStyle: React.CSSProperties; lightSquareStyle: React.CSSProperties; darkSquareStyle: React.CSSProperties } {
  if (tex.boardImage) {
    return {
      boardStyle: { backgroundImage: `url('${tex.boardImage}')`, backgroundSize: '100% 100%' },
      lightSquareStyle: { backgroundColor: 'transparent' },
      darkSquareStyle: { backgroundColor: 'transparent' },
    };
  }
  return {
    boardStyle: {},
    lightSquareStyle: { backgroundColor: colors.light, backgroundImage: tex.backgroundImage, backgroundSize: tex.backgroundSize },
    darkSquareStyle: { backgroundColor: colors.dark, backgroundImage: tex.backgroundImageDark ?? tex.backgroundImage, backgroundSize: tex.backgroundSize },
  };
}

export const BOARD_SIZES: Record<BoardSize, { maxWidth: number; label: string }> = {
  compact:  { maxWidth: 420, label: 'Compact' },
  standard: { maxWidth: 580, label: 'Standard' },
  large:    { maxWidth: 720, label: 'Large' },
};

interface ColorPair { light: string; dark: string }

export interface SavedTheme {
  id: string;
  name: string;
  boardColors: ColorPair;
  pieceColors: ColorPair;
}

interface Settings {
  boardTheme: BoardTheme;
  boardTexture: BoardTexture;
  pieceStyle: PieceStyle;
  pieceShape: PieceShape;
  appBackground: AppBackground;
  boardCustomColors: ColorPair;
  pieceCustomColors: ColorPair;
  confirmMoves: boolean;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  soundEnabled: boolean;
  /** Vibrate on moves, captures, checks and game end (phones that support it). */
  hapticsEnabled: boolean;
  soundPack: SoundPack;
  promotionChoice: PromotionChoice;
  boardSize: BoardSize;
  uiStyle: UiStyle;
  bgPhoto: string;
  cardGlass: CardGlass;
}

// Out-of-the-box look. In the enhanced UI that's the Tournament board with
// the Ink & Cream pieces; the classic UI keeps its original green board and
// default pieces. Only applies to people who haven't picked their own (saved
// settings always win), and to "Revert to Default" when no personal default
// has been set.
const APP_DEFAULT_SETTINGS: Settings = {
  boardTheme: 'green',
  boardTexture: REDESIGN_ON ? 'cs-tournament' : 'flat',
  pieceStyle: 'classic',
  pieceShape: REDESIGN_ON ? 'ink-cream' : 'default',
  appBackground: 'default',
  boardCustomColors: { light: '#eeeed2', dark: '#769656' },
  pieceCustomColors: { light: '#ffffff', dark: '#2b2b2b' },
  confirmMoves: false,
  showCoordinates: true,
  showLegalMoves: true,
  soundEnabled: true,
  hapticsEnabled: true,
  soundPack: 'classic',
  promotionChoice: 'queen',
  boardSize: 'standard',
  uiStyle: 'standard',
  bgPhoto: 'library',
  cardGlass: 'medium',
};

// Base key names -- actual storage keys are these suffixed with the
// current account's user id (see scopedKey below). This is the fix for
// settings leaking between accounts on a shared device/browser:
// localStorage is scoped to the browser, not the logged-in account, so
// without per-user keys, switching accounts on the same device would
// show one person's board/piece choices to another.
const STORAGE_KEY = 'chessscout_settings';
const DEFAULT_KEY = 'chessscout_user_default';
const THEMES_KEY = 'chessscout_saved_themes';
// Which look settings this user has picked themselves. The admin's default
// look (Admin > Default look) fills in only the ones they haven't.
const PICKED_KEY = 'chessscout_picked';
type LookKey = keyof DefaultLook;
const LOOK_KEYS: LookKey[] = ['pieceShape', 'pieceStyle', 'boardTheme', 'boardTexture', 'uiStyle', 'bgPhoto', 'cardGlass', 'appBackground'];
function lookValueValid(k: LookKey, v: string): boolean {
  switch (k) {
    case 'pieceShape': return !!PIECE_SHAPES[v as PieceShape];
    case 'pieceStyle': return v === 'custom' ? false : !!(PIECE_STYLES as Record<string, unknown>)[v];
    case 'boardTheme': return !!(BOARD_THEMES as Record<string, unknown>)[v];
    case 'boardTexture': return !!BOARD_TEXTURES[v as BoardTexture];
    case 'uiStyle': return v === 'standard' || v === 'photo';
    case 'bgPhoto': return BG_PHOTOS.some((p) => p.id === v);
    case 'cardGlass': return !!CARD_GLASS[v as CardGlass];
    case 'appBackground': return !!APP_BACKGROUNDS[v as AppBackground];
  }
}

function scopedKey(base: string, userId: string): string {
  return `${base}_${userId}`;
}

interface SettingsContextValue extends Settings {
  setBoardTheme: (t: BoardTheme) => void;
  setBoardTexture: (t: BoardTexture) => void;
  setPieceStyle: (t: PieceStyle) => void;
  setPieceShape: (t: PieceShape) => void;
  setAppBackground: (t: AppBackground) => void;
  setBoardCustomColor: (which: 'light' | 'dark', color: string) => void;
  setPieceCustomColor: (which: 'light' | 'dark', color: string) => void;
  setConfirmMoves: (v: boolean) => void;
  setShowCoordinates: (v: boolean) => void;
  setShowLegalMoves: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setHapticsEnabled: (v: boolean) => void;
  setPromotionChoice: (v: PromotionChoice) => void;
  setSoundPack: (v: SoundPack) => void;
  setBoardSize: (v: BoardSize) => void;
  setUiStyle: (v: UiStyle) => void;
  setBgPhoto: (id: string) => void;
  setCardGlass: (v: CardGlass) => void;
  boardColors: ColorPair;
  boardTextureCss: { backgroundImage: string; backgroundImageDark?: string; backgroundSize?: string; boardImage?: string };
  appBackgroundCss: React.CSSProperties;
  pieceColors: ColorPair & { finish: React.CSSProperties; baseLight: string; baseDark: string };
  boardMaxWidth: number;
  savedThemes: SavedTheme[];
  saveCurrentAsTheme: (name: string) => void;
  applyTheme: (theme: SavedTheme) => void;
  deleteTheme: (id: string) => void;
  setAsMyDefault: () => void;
  hasCustomDefault: boolean;
  revertToDefault: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

// A saved piece choice that no longer exists (e.g. a retired set) must not leave the user with a blank
// selection or a missing-image board: fall back to the default pieces.
function sanitizeSettings(st: Settings): Settings {
  let out = PIECE_SHAPES[st.pieceShape as PieceShape] ? st : { ...st, pieceShape: 'default' as PieceShape };
  if (!SOUND_PACKS[out.soundPack as SoundPack]) out = { ...out, soundPack: 'classic' };
  if (out.uiStyle !== 'photo' && out.uiStyle !== 'standard') out = { ...out, uiStyle: 'standard' };
  if (!BG_PHOTOS.some((p) => p.id === out.bgPhoto)) out = { ...out, bgPhoto: 'library' };
  if (!CARD_GLASS[out.cardGlass as CardGlass]) out = { ...out, cardGlass: 'medium' };
  return out;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...(fallback as any), ...JSON.parse(raw) };
  } catch {}
  return fallback;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // Anonymous/logged-out browsing (e.g. scanning a position before
  // signing in) gets its own isolated "guest" bucket -- never shared with
  // any real account, and never leaked into once someone actually logs in.
  const { authUser } = useUser();
  const userId = authUser?.id ?? 'guest';

  const [userDefault, setUserDefault] = useState<Settings | null>(null);
  const [settings, setSettings] = useState<Settings>(APP_DEFAULT_SETTINGS);
  const [savedThemes, setSavedThemes] = useState<SavedTheme[]>([]);
  const [picked, setPicked] = useState<LookKey[]>([]);
  const loadedUserIdRef = useRef<string | null>(null);
  const defaultLook = useDefaultLook();

  // (Re)load this specific account's settings whenever the logged-in user
  // changes -- covers both the initial load once auth resolves, and
  // switching accounts on the same device without a full page reload.
  useEffect(() => {
    if (loadedUserIdRef.current === userId) return;
    loadedUserIdRef.current = userId;

    let loadedDefault: Settings | null = null;
    try {
      const raw = localStorage.getItem(scopedKey(DEFAULT_KEY, userId));
      loadedDefault = raw ? JSON.parse(raw) : null;
    } catch {}
    setUserDefault(loadedDefault ? sanitizeSettings(loadedDefault) : null);
    const stored = sanitizeSettings(loadJSON(scopedKey(STORAGE_KEY, userId), loadedDefault ?? APP_DEFAULT_SETTINGS));
    setSettings(stored);
    // Which look settings were picked by the user. Accounts from before this
    // was tracked: anything that differs from the built-in default counts as
    // their own pick (a personal default counts too).
    let pk: LookKey[] | null = null;
    try { const raw = localStorage.getItem(scopedKey(PICKED_KEY, userId)); pk = raw ? JSON.parse(raw) : null; } catch {}
    if (!Array.isArray(pk)) {
      const hadSaved = (() => { try { return !!localStorage.getItem(scopedKey(STORAGE_KEY, userId)); } catch { return false; } })();
      pk = loadedDefault ? [...LOOK_KEYS]
        : hadSaved ? LOOK_KEYS.filter((k) => (stored as unknown as Record<string, unknown>)[k] !== (APP_DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k])
        : [];
    }
    setPicked(pk.filter((k) => LOOK_KEYS.includes(k)));

    try {
      const raw = localStorage.getItem(scopedKey(THEMES_KEY, userId));
      setSavedThemes(raw ? JSON.parse(raw) : []);
    } catch {
      setSavedThemes([]);
    }
  }, [userId]);

  useEffect(() => {
    try { localStorage.setItem(scopedKey(STORAGE_KEY, userId), JSON.stringify(settings)); } catch {}
  }, [settings, userId]);

  useEffect(() => {
    try { localStorage.setItem(scopedKey(THEMES_KEY, userId), JSON.stringify(savedThemes)); } catch {}
  }, [savedThemes, userId]);

  useEffect(() => {
    if (loadedUserIdRef.current !== userId) return;
    try { localStorage.setItem(scopedKey(PICKED_KEY, userId), JSON.stringify(picked)); } catch {}
  }, [picked, userId]);
  const pick = (...keys: LookKey[]) => setPicked((p) => Array.from(new Set([...p, ...keys])));

  // What the app actually uses: the user's own picks, and the admin's default
  // look for anything they haven't picked.
  const eff: Settings = (() => {
    let out = settings;
    for (const k of LOOK_KEYS) {
      const v = defaultLook[k];
      if (!picked.includes(k) && typeof v === 'string' && lookValueValid(k, v)) out = { ...out, [k]: v } as Settings;
    }
    return out;
  })();

  // Enhanced-only boards render only while the enhanced UI is on. If the flag is off, the
  // board quietly shows the plain board colour instead; the saved choice is kept, so it
  // comes back as soon as the enhanced UI is switched on again.
  const { enabled: enhancedUi } = useDashboardRedesignFlag();
  const chosenTexture = BOARD_TEXTURES[eff.boardTexture] ?? BOARD_TEXTURES.flat;
  const resolvedBoardTexture = chosenTexture.enhancedOnly && !enhancedUi ? BOARD_TEXTURES.flat : chosenTexture;

  const resolvedBoardColors: ColorPair =
    eff.boardTheme === 'custom' ? eff.boardCustomColors : BOARD_THEMES[eff.boardTheme];
  const resolvedPieceStyle =
    eff.pieceStyle === 'custom'
      ? { ...eff.pieceCustomColors, finish: {} as React.CSSProperties, baseLight: eff.pieceCustomColors.light, baseDark: eff.pieceCustomColors.dark }
      : { ...PIECE_STYLES[eff.pieceStyle] };

  activeSoundPack = eff.soundPack ?? 'classic';
  activeSoundEnabled = eff.soundEnabled !== false;
  activeHaptics = eff.hapticsEnabled !== false;

  const value: SettingsContextValue = {
    ...eff,
    setBoardTheme: (t) => { pick('boardTheme'); setSettings((s) => ({ ...s, boardTheme: t })); },
    setBoardTexture: (t) => { pick('boardTexture'); setSettings((s) => ({ ...s, boardTexture: t })); },
    setPieceStyle: (t) => { pick('pieceStyle'); setSettings((s) => ({ ...s, pieceStyle: t })); },
    setPieceShape: (t) => { pick('pieceShape'); setSettings((s) => ({ ...s, pieceShape: t })); },
    setAppBackground: (t) => { pick('appBackground'); setSettings((s) => ({ ...s, appBackground: t })); },
    setBoardCustomColor: (which, color) => {
      pick('boardTheme');
      setSettings((s) => ({ ...s, boardTheme: 'custom', boardCustomColors: { ...s.boardCustomColors, [which]: color } }));
    },
    setPieceCustomColor: (which, color) => {
      pick('pieceStyle');
      setSettings((s) => ({ ...s, pieceStyle: 'custom', pieceCustomColors: { ...s.pieceCustomColors, [which]: color } }));
    },
    setConfirmMoves: (v) => setSettings((s) => ({ ...s, confirmMoves: v })),
    setShowCoordinates: (v) => setSettings((s) => ({ ...s, showCoordinates: v })),
    setShowLegalMoves: (v) => setSettings((s) => ({ ...s, showLegalMoves: v })),
    setSoundEnabled: (v) => setSettings((s) => ({ ...s, soundEnabled: v })),
    setHapticsEnabled: (v) => setSettings((s) => ({ ...s, hapticsEnabled: v })),
    setPromotionChoice: (v) => setSettings((s) => ({ ...s, promotionChoice: v })),
    setSoundPack: (v) => setSettings((s) => ({ ...s, soundPack: v })),
    setBoardSize: (v) => setSettings((s) => ({ ...s, boardSize: v })),
    setUiStyle: (v) => { pick('uiStyle'); setSettings((s) => ({ ...s, uiStyle: v })); },
    setBgPhoto: (id) => { pick('bgPhoto'); setSettings((s) => ({ ...s, bgPhoto: id })); },
    setCardGlass: (v) => { pick('cardGlass'); setSettings((s) => ({ ...s, cardGlass: v })); },
    boardColors: resolvedBoardColors,
    boardTextureCss: resolvedBoardTexture,
    appBackgroundCss: APP_BACKGROUNDS[eff.appBackground].css,
    pieceColors: resolvedPieceStyle,
    boardMaxWidth: BOARD_SIZES[eff.boardSize].maxWidth,
    savedThemes,
    saveCurrentAsTheme: (name) => {
      // A gradient piece style's "color" is a url(#id) SVG fill
      // reference, not a plain color -- storing that literally as a
      // saved theme's custom color would silently break the flat color
      // picker/swatch if the user later switches to "Custom". Falls back
      // to a representative flat color instead when that's the case.
      const flatOrFallback = (v: string, fallback: string) => (v.startsWith('url(') ? fallback : v);
      const theme: SavedTheme = {
        id: `${Date.now()}`,
        name: name.trim() || 'My Theme',
        boardColors: resolvedBoardColors,
        pieceColors: {
          light: flatOrFallback(resolvedPieceStyle.light, '#e2e2e2'),
          dark: flatOrFallback(resolvedPieceStyle.dark, '#333333'),
        },
      };
      setSavedThemes((prev) => [...prev, theme]);
    },
    applyTheme: (theme) => {
      pick('boardTheme', 'pieceStyle');
      setSettings((s) => ({
        ...s,
        boardTheme: 'custom',
        boardCustomColors: theme.boardColors,
        pieceStyle: 'custom',
        pieceCustomColors: theme.pieceColors,
      }));
    },
    deleteTheme: (id) => setSavedThemes((prev) => prev.filter((t) => t.id !== id)),
    setAsMyDefault: () => {
      setUserDefault(eff);
      setSettings(eff);
      pick(...LOOK_KEYS);
      try { localStorage.setItem(scopedKey(DEFAULT_KEY, userId), JSON.stringify(eff)); } catch {}
    },
    hasCustomDefault: userDefault !== null,
    revertToDefault: () => {
      // Back to their own default if they set one; otherwise back to the
      // app's default look (the admin's choice where there is one).
      const target = userDefault ?? APP_DEFAULT_SETTINGS;
      setSettings(target);
      setPicked(userDefault ? [...LOOK_KEYS] : []);
    },
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

// The selected sound pack, mirrored here by SettingsProvider so the plain
// playMoveSound() function (called from boards and the puzzle page) always uses it.
let activeSoundPack: SoundPack = 'classic';
let activeSoundEnabled = true;
let activeHaptics = true;
export function playMoveSound(kind: SoundEvent = 'move') {
  playSound(kind, activeSoundPack);
}

/** Can this device vibrate? (Android browsers and the Play app; not iPhone Safari.) */
export const hapticsSupported = (): boolean => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

// Short, distinct buzzes: a tap for a move, firmer for a capture, a double
// pulse for check, a longer pattern at the end of the game.
const HAPTIC: Record<SoundEvent, number | number[]> = {
  move: 12, castle: [12, 40, 12], capture: 28, check: [22, 50, 22], promote: [15, 40, 30], gameEnd: [40, 70, 60, 70, 90], illegal: [8, 30, 8],
};
// One buzz per move: when two parts of the app ask for the same move a few ms
// apart (e.g. holding the forward arrow and the board both react), the second
// call would cancel the first before the motor spins up, and nothing is felt.
let lastVibeAt = 0;
export function vibrateFor(kind: SoundEvent = 'move') {
  if (!activeHaptics || !hapticsSupported()) return;
  const now = Date.now();
  if (now - lastVibeAt < 50) return;
  lastVibeAt = now;
  try { navigator.vibrate(HAPTIC[kind] ?? 12); } catch { /* not allowed right now */ }
}

/** A move happened on a board: sound and/or haptics, per the player's settings. */
export function moveFeedback(kind: SoundEvent = 'move') {
  if (activeSoundEnabled) playSound(kind, activeSoundPack);
  vibrateFor(kind);
}

/** The photo backdrop look is on: cards drop their own pictures and use a compact layout. */
export function usePhotoLook(): boolean {
  return useSettings().uiStyle === 'photo';
}

// ── Board looks for content (admin remix / Content Studio) ────────────────
export interface BoardLook { boardTheme: Exclude<BoardTheme, 'custom'>; boardTexture: BoardTexture; pieceStyle: Exclude<PieceStyle, 'custom'>; pieceShape: PieceShape }

const pickOne = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
/** A random board + pieces: either a photographic board, or a classic colour with one of the classic textures. */
export function randomLook(): BoardLook {
  const textures = Object.keys(BOARD_TEXTURES) as BoardTexture[];
  const photo = textures.filter((t) => isPhotoBoard(t));
  const classic = textures.filter((t) => !isPhotoBoard(t));
  const shapes = (Object.keys(PIECE_SHAPES) as PieceShape[]).filter((k) => !PIECE_SHAPES[k].hidden);
  const styles = (Object.keys(PIECE_STYLES) as Exclude<PieceStyle, 'custom'>[]);
  return {
    boardTheme: pickOne(Object.keys(BOARD_THEMES) as Exclude<BoardTheme, 'custom'>[]),
    boardTexture: Math.random() < 0.5 ? pickOne(photo) : pickOne(classic),
    pieceStyle: pickOne(styles),
    pieceShape: pickOne(shapes),
  };
}
export function lookLabel(l: BoardLook): string {
  const tex = BOARD_TEXTURES[l.boardTexture];
  const board = isPhotoBoard(l.boardTexture) ? tex.label : `${BOARD_THEMES[l.boardTheme].label}${l.boardTexture !== 'flat' ? ` · ${tex.label}` : ''}`;
  return `${board} · ${PIECE_SHAPES[l.pieceShape].label} pieces`;
}

/** Boards inside use this look instead of the person's own settings (nothing is saved). */
export function LookOverride({ look, children }: { look: BoardLook | null; children: React.ReactNode }) {
  const base = useContext(SettingsContext);
  if (!base || !look) return <>{children}</>;
  const value: SettingsContextValue = {
    ...base,
    ...look,
    boardColors: BOARD_THEMES[look.boardTheme] ?? base.boardColors,
    boardTextureCss: BOARD_TEXTURES[look.boardTexture] ?? base.boardTextureCss,
    pieceColors: PIECE_STYLES[look.pieceStyle] ? { ...PIECE_STYLES[look.pieceStyle] } : base.pieceColors,
  };
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
