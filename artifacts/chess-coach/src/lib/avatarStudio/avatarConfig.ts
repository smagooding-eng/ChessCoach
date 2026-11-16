// Avatar Studio: the saved description of a player's 3D character.
// Stored as small JSON on the server (user_avatar_characters.config). Never images or 3D files:
// the character's geometry is generated from these settings. Everything read back passes
// through normalizeAvatarConfig, so older saves (version 1) and partial data keep working.

import type { CharacterLook, BrowStyle, Glasses, Extra } from './head/character';
import type { HairStyle, BeardStyle, MustacheStyle, Outfit, Headwear } from './head/styles';
import { DEFAULT_SHAPE, type FaceShape } from './head/sdf';

export const AVATAR_CONFIG_VERSION = 2;

export interface AvatarConfig extends CharacterLook { version: number }

export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'short', label: 'Short' }, { id: 'sidepart', label: 'Side part' }, { id: 'quiff', label: 'Quiff' }, { id: 'buzz', label: 'Buzz' },
  { id: 'curly', label: 'Curly' }, { id: 'afro', label: 'Afro' }, { id: 'bob', label: 'Bob' }, { id: 'long', label: 'Long' }, { id: 'bun', label: 'Bun' }, { id: 'bald', label: 'Bald' },
];
export const BEARDS: { id: BeardStyle; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'stubble', label: 'Stubble' }, { id: 'short', label: 'Short beard' }, { id: 'full', label: 'Full beard' }, { id: 'goatee', label: 'Goatee' },
];
export const MUSTACHES: { id: MustacheStyle; label: string }[] = [{ id: 'none', label: 'None' }, { id: 'classic', label: 'Moustache' }, { id: 'handlebar', label: 'Handlebar' }];
export const BROWS: { id: BrowStyle; label: string }[] = [
  { id: 'soft', label: 'Soft' }, { id: 'straight', label: 'Straight' }, { id: 'arched', label: 'Arched' }, { id: 'thick', label: 'Thick' }, { id: 'thin', label: 'Thin' },
];
export const GLASSES: { id: Glasses; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'round', label: 'Round' }, { id: 'square', label: 'Square' }, { id: 'aviator', label: 'Aviator' }, { id: 'shades', label: 'Sunglasses' },
];
export const HEADWEAR: { id: Headwear; label: string }[] = [{ id: 'none', label: 'None' }, { id: 'cap', label: 'Cap' }, { id: 'beanie', label: 'Beanie' }];
export const EXTRAS: { id: Extra; label: string }[] = [{ id: 'none', label: 'None' }, { id: 'headphones', label: 'Headphones' }, { id: 'earrings', label: 'Earrings' }, { id: 'chain', label: 'Chain' }];
export const OUTFITS: { id: Outfit; label: string }[] = [
  { id: 'tee', label: 'T-shirt' }, { id: 'hoodie', label: 'Hoodie' }, { id: 'sweater', label: 'Sweater' }, { id: 'collar', label: 'Shirt' }, { id: 'jacket', label: 'Jacket' },
];

export const SKIN_SWATCHES = ['#f6d3bd', '#eec1a2', '#e0a987', '#d9a07c', '#c98e68', '#a86f4c', '#8a5638', '#6b3f28', '#4a2b1c'];
export const HAIR_SWATCHES = ['#141210', '#2b2522', '#3a2618', '#6b3a1e', '#a8703a', '#d9b26b', '#b23a1e', '#8c8c8c', '#e8e4dc', '#6b4b83', '#2e7d6b'];
export const EYE_SWATCHES = ['#2e1e14', '#6b4424', '#8a6a3a', '#3d6b4a', '#3c6e9e', '#6e7f8c', '#4b3a6b'];
export const OUTFIT_SWATCHES = ['#3b5a8a', '#202124', '#e8e4dc', '#b23a1e', '#2e7d4a', '#8a5a9e', '#d2a34a', '#81b64c', '#c0392b'];
export const ACCENT_SWATCHES = ['#1e1e1e', '#c9a24a', '#b8bcc2', '#7a3e1e', '#2e5fa8', '#b0303a', '#f2f2f2', '#81b64c'];

export const defaultAvatar: AvatarConfig = {
  version: AVATAR_CONFIG_VERSION,
  shape: { ...DEFAULT_SHAPE },
  skinTone: '#d9a07c', eyeColor: '#6b4424', lipTint: 0.4, freckles: false, brows: 'soft',
  hair: 'sidepart', hairColor: '#3a2618',
  beard: 'none', mustache: 'none', beardColor: '#3a2618',
  glasses: 'none', glassesColor: '#1e1e1e',
  headwear: 'none', headwearColor: '#2e5fa8',
  extra: 'none', extraColor: '#c9a24a',
  outfit: 'tee', outfitColor: '#3b5a8a',
};

const HEX = /^#[0-9a-f]{6}$/i;
const color = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);
const oneOf = <T extends string>(v: unknown, list: { id: T }[], d: T): T => (list.some((x) => x.id === v) ? (v as T) : d);
const num01 = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

/** A safe, complete config from anything (a saved row, an old version, or junk). */
export function normalizeAvatarConfig(raw: unknown): AvatarConfig {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const D = defaultAvatar;
  // version 1 (the first starter) used different names
  if (o.version === 1 || ('skinTone' in o && 'hairStyle' in o)) {
    const hs = o.hairStyle === 'long' ? 'long' : o.hairStyle === 'curly' ? 'curly' : o.hairStyle === 'bald' ? 'bald' : 'short';
    return normalizeAvatarConfig({
      ...D, skinTone: o.skinTone, hairColor: o.hairColor, beardColor: o.hairColor, hair: hs, eyeColor: o.eyeColor,
      beard: o.beard === true ? 'full' : 'none', glasses: o.glasses === true ? 'round' : 'none', glassesColor: '#c9a24a', outfitColor: o.shirtColor, version: 2,
    });
  }
  const s = (o.shape && typeof o.shape === 'object' ? o.shape : {}) as Record<string, unknown>;
  const shape = Object.fromEntries(Object.entries(DEFAULT_SHAPE).map(([k, v]) => [k, num01(s[k], v)])) as unknown as FaceShape;
  return {
    version: AVATAR_CONFIG_VERSION, shape,
    skinTone: color(o.skinTone, D.skinTone), eyeColor: color(o.eyeColor, D.eyeColor), lipTint: num01(o.lipTint, D.lipTint), freckles: o.freckles === true,
    brows: oneOf(o.brows, BROWS, D.brows),
    hair: oneOf(o.hair, HAIR_STYLES, D.hair), hairColor: color(o.hairColor, D.hairColor),
    beard: oneOf(o.beard, BEARDS, D.beard), mustache: oneOf(o.mustache, MUSTACHES, D.mustache), beardColor: color(o.beardColor, D.beardColor),
    glasses: oneOf(o.glasses, GLASSES, D.glasses), glassesColor: color(o.glassesColor, D.glassesColor),
    headwear: oneOf(o.headwear, HEADWEAR, D.headwear), headwearColor: color(o.headwearColor, D.headwearColor),
    extra: oneOf(o.extra, EXTRAS, D.extra), extraColor: color(o.extraColor, D.extraColor),
    outfit: oneOf(o.outfit, OUTFITS, D.outfit), outfitColor: color(o.outfitColor, D.outfitColor),
  };
}

export const sameAvatar = (a: AvatarConfig, b: AvatarConfig) => JSON.stringify(normalizeAvatarConfig(a)) === JSON.stringify(normalizeAvatarConfig(b));
