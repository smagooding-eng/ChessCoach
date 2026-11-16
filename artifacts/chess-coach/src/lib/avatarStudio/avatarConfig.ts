// Avatar Studio: the saved description of a player's 3D avatar.
// Stored as JSON on the server (user_avatar_configs.config). Only this small config is saved,
// never images or 3D files. Anything read back is passed through normalizeAvatarConfig, so
// older or partial saves (or future fields) never break the editor.

export const AVATAR_CONFIG_VERSION = 1;

export type HairStyle = 'short' | 'long' | 'curly' | 'bald';
export const HAIR_STYLES: readonly HairStyle[] = ['short', 'long', 'curly', 'bald'];

export interface AvatarConfig {
  version: number;
  skinTone: string;
  hairColor: string;
  hairStyle: HairStyle;
  eyeColor: string;
  beard: boolean;
  glasses: boolean;
  shirtColor: string;
}

export const defaultAvatar: AvatarConfig = {
  version: AVATAR_CONFIG_VERSION,
  skinTone: '#c98968',
  hairColor: '#29212a',
  hairStyle: 'short',
  eyeColor: '#3b261b',
  beard: true,
  glasses: true,
  shirtColor: '#394b68',
};

export const SKIN_SWATCHES = ['#c98968', '#f0c6a4', '#9a6048', '#70412f', '#e1a77f', '#56372e'];
export const HAIR_SWATCHES = ['#211b1c', '#4a2d20', '#8a5b35', '#d5b16b', '#b94b35', '#dedede', '#6b4b83'];
export const EYE_SWATCHES = ['#3b261b', '#315b72', '#4f7654', '#252525', '#78604b'];
export const SHIRT_SWATCHES = ['#394b68', '#202124', '#a34c48', '#527b66', '#8063a5', '#d2a34a'];

const HEX = /^#[0-9a-f]{6}$/i;
const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback);
const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** A safe, complete config from anything (a saved row, an old version, or junk). */
export function normalizeAvatarConfig(raw: unknown): AvatarConfig {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    version: AVATAR_CONFIG_VERSION,
    skinTone: color(o.skinTone, defaultAvatar.skinTone),
    hairColor: color(o.hairColor, defaultAvatar.hairColor),
    hairStyle: HAIR_STYLES.includes(o.hairStyle as HairStyle) ? (o.hairStyle as HairStyle) : defaultAvatar.hairStyle,
    eyeColor: color(o.eyeColor, defaultAvatar.eyeColor),
    beard: flag(o.beard, defaultAvatar.beard),
    glasses: flag(o.glasses, defaultAvatar.glasses),
    shirtColor: color(o.shirtColor, defaultAvatar.shirtColor),
  };
}

export const sameAvatar = (a: AvatarConfig, b: AvatarConfig) => JSON.stringify(normalizeAvatarConfig(a)) === JSON.stringify(normalizeAvatarConfig(b));
