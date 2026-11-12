// Types for the vendored DiceBear bundle (see dicebear.js header for licenses).
export interface DiceBearStyle { schema: { properties: Record<string, unknown> } }
export interface DiceBearResult { toString(): string; toDataUri(): string }
export function createAvatar(style: DiceBearStyle, options?: Record<string, unknown>): DiceBearResult;
export const avataaars: DiceBearStyle;
export const bottts: DiceBearStyle;
export const openPeeps: DiceBearStyle;
export const funEmoji: DiceBearStyle;
export const bigSmile: DiceBearStyle;
export const adventurer: DiceBearStyle;
export const toonHead: DiceBearStyle;
