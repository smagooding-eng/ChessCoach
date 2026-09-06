import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useUser } from '@/context/UserContext';

export type BoardTheme = 'classic' | 'green' | 'blue' | 'gray' | 'purple' | 'crimson' | 'teal' | 'coal' | 'sunset' | 'custom';
export type BoardTexture = 'flat' | 'wood' | 'marble' | 'felt';
export type AppBackground = 'default' | 'warm-gradient' | 'cool-gradient' | 'noise';
export type PieceStyle = 'classic' | 'glossy' | 'outlined' | 'ocean' | 'crimson' | 'emerald' | 'royal' | 'flat' | 'depth' | 'custom';
export type PieceShape = 'default' | 'cburnett';
export type PromotionChoice = 'queen' | 'ask';
export type BoardSize = 'compact' | 'standard' | 'large';

// Cburnett is a real, distinct piece artwork set (not just a recolor of
// the default) -- the same set Lichess uses by default. Licensed CC-BY-SA
// 3.0 / GPLv2+ by Colin M.L. Burnett (per lichess-org/lila's own
// COPYING.md), which permits commercial use with attribution. Because
// it's static SVG artwork with color baked in, the Piece Style color
// picker doesn't apply on top of it -- shape and color are independent
// choices, but this shape brings its own coloring.
export const PIECE_SHAPES: Record<PieceShape, { label: string; attribution: string | null }> = {
  default:  { label: 'Default', attribution: null },
  cburnett: { label: 'Cburnett', attribution: 'Piece set "Cburnett" by Colin M.L. Burnett, CC BY-SA 3.0 / GPLv2+' },
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
};

// CSS-only textures (no image assets exist to source/verify, so these are
// gradient/pattern-based rather than photographic). Applied as an overlay
// backgroundImage on top of the existing solid boardColors, so texture and
// color stay independent choices.
export const BOARD_TEXTURES: Record<BoardTexture, { label: string; backgroundImage: string; backgroundSize?: string }> = {
  flat:   { label: 'Flat', backgroundImage: 'none' },
  wood:   {
    label: 'Wood Grain',
    backgroundImage: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 1px, transparent 1px, transparent 3px), repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, transparent 2px, rgba(0,0,0,0.03) 4px, transparent 6px)',
  },
  marble: {
    label: 'Marble',
    backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.08) 0%, transparent 35%), radial-gradient(circle at 75% 65%, rgba(0,0,0,0.06) 0%, transparent 40%), radial-gradient(circle at 45% 85%, rgba(255,255,255,0.05) 0%, transparent 30%)',
  },
  felt:   {
    label: 'Felt',
    backgroundImage: 'radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)',
    backgroundSize: '3px 3px',
  },
};

export const APP_BACKGROUNDS: Record<AppBackground, { label: string; css: React.CSSProperties }> = {
  default:       { label: 'Default', css: {} },
  'warm-gradient': { label: 'Warm', css: { backgroundImage: 'radial-gradient(circle at 15% 0%, rgba(201,162,75,0.08) 0%, transparent 45%), radial-gradient(circle at 85% 100%, rgba(129,182,76,0.05) 0%, transparent 40%)' } },
  'cool-gradient': { label: 'Cool', css: { backgroundImage: 'radial-gradient(circle at 15% 0%, rgba(107,164,232,0.08) 0%, transparent 45%), radial-gradient(circle at 85% 100%, rgba(199,125,212,0.05) 0%, transparent 40%)' } },
  noise:         { label: 'Textured', css: { backgroundImage: 'radial-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '3px 3px' } },
};

export const PIECE_STYLES: Record<Exclude<PieceStyle, 'custom'>, { light: string; dark: string; label: string; finish: React.CSSProperties }> = {
  classic:  { light: '#ffffff', dark: '#2b2b2b', label: 'Classic',  finish: {} },
  glossy:   { light: '#ffffff', dark: '#2b2b2b', label: 'Glossy',   finish: { filter: 'drop-shadow(0 2px 1px rgba(0,0,0,0.35)) brightness(1.08) contrast(1.1)' } },
  outlined: { light: '#ffffff', dark: '#1a1a1a', label: 'Outlined', finish: { filter: 'drop-shadow(0 0 0.5px #000) drop-shadow(0 0 0.5px #000) drop-shadow(0 0 0.5px #000)' } },
  ocean:    { light: '#dff1ff', dark: '#1c4b7a', label: 'Ocean',    finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' } },
  crimson:  { light: '#ffe9e9', dark: '#7a1c2b', label: 'Crimson',  finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' } },
  emerald:  { light: '#e8fff2', dark: '#166b45', label: 'Emerald',  finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' } },
  royal:    { light: '#f3e9ff', dark: '#4a1c7a', label: 'Royal',    finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' } },
  flat:     { light: '#f2f2f2', dark: '#232323', label: 'Flat',     finish: { filter: 'contrast(0.92) saturate(0.85)' } },
  depth:    { light: '#ffffff', dark: '#2b2b2b', label: 'Depth',    finish: { filter: 'drop-shadow(0 3px 2px rgba(0,0,0,0.5)) drop-shadow(0 1px 0 rgba(255,255,255,0.15)) brightness(1.05)' } },
};

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
  promotionChoice: PromotionChoice;
  boardSize: BoardSize;
}

const APP_DEFAULT_SETTINGS: Settings = {
  boardTheme: 'green',
  boardTexture: 'flat',
  pieceStyle: 'classic',
  pieceShape: 'default',
  appBackground: 'default',
  boardCustomColors: { light: '#eeeed2', dark: '#769656' },
  pieceCustomColors: { light: '#ffffff', dark: '#2b2b2b' },
  confirmMoves: false,
  showCoordinates: true,
  showLegalMoves: true,
  soundEnabled: true,
  promotionChoice: 'queen',
  boardSize: 'standard',
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
  setPromotionChoice: (v: PromotionChoice) => void;
  setBoardSize: (v: BoardSize) => void;
  boardColors: ColorPair;
  boardTextureCss: { backgroundImage: string; backgroundSize?: string };
  appBackgroundCss: React.CSSProperties;
  pieceColors: ColorPair & { finish: React.CSSProperties };
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
  const loadedUserIdRef = useRef<string | null>(null);

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
    setUserDefault(loadedDefault);
    setSettings(loadJSON(scopedKey(STORAGE_KEY, userId), loadedDefault ?? APP_DEFAULT_SETTINGS));

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

  const resolvedBoardColors: ColorPair =
    settings.boardTheme === 'custom' ? settings.boardCustomColors : BOARD_THEMES[settings.boardTheme];
  const resolvedPieceStyle =
    settings.pieceStyle === 'custom'
      ? { ...settings.pieceCustomColors, finish: {} as React.CSSProperties }
      : { ...PIECE_STYLES[settings.pieceStyle] };

  const value: SettingsContextValue = {
    ...settings,
    setBoardTheme: (t) => setSettings((s) => ({ ...s, boardTheme: t })),
    setBoardTexture: (t) => setSettings((s) => ({ ...s, boardTexture: t })),
    setPieceStyle: (t) => setSettings((s) => ({ ...s, pieceStyle: t })),
    setPieceShape: (t) => setSettings((s) => ({ ...s, pieceShape: t })),
    setAppBackground: (t) => setSettings((s) => ({ ...s, appBackground: t })),
    setBoardCustomColor: (which, color) =>
      setSettings((s) => ({ ...s, boardTheme: 'custom', boardCustomColors: { ...s.boardCustomColors, [which]: color } })),
    setPieceCustomColor: (which, color) =>
      setSettings((s) => ({ ...s, pieceStyle: 'custom', pieceCustomColors: { ...s.pieceCustomColors, [which]: color } })),
    setConfirmMoves: (v) => setSettings((s) => ({ ...s, confirmMoves: v })),
    setShowCoordinates: (v) => setSettings((s) => ({ ...s, showCoordinates: v })),
    setShowLegalMoves: (v) => setSettings((s) => ({ ...s, showLegalMoves: v })),
    setSoundEnabled: (v) => setSettings((s) => ({ ...s, soundEnabled: v })),
    setPromotionChoice: (v) => setSettings((s) => ({ ...s, promotionChoice: v })),
    setBoardSize: (v) => setSettings((s) => ({ ...s, boardSize: v })),
    boardColors: resolvedBoardColors,
    boardTextureCss: BOARD_TEXTURES[settings.boardTexture],
    appBackgroundCss: APP_BACKGROUNDS[settings.appBackground].css,
    pieceColors: resolvedPieceStyle,
    boardMaxWidth: BOARD_SIZES[settings.boardSize].maxWidth,
    savedThemes,
    saveCurrentAsTheme: (name) => {
      const theme: SavedTheme = {
        id: `${Date.now()}`,
        name: name.trim() || 'My Theme',
        boardColors: resolvedBoardColors,
        pieceColors: { light: resolvedPieceStyle.light, dark: resolvedPieceStyle.dark },
      };
      setSavedThemes((prev) => [...prev, theme]);
    },
    applyTheme: (theme) => {
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
      setUserDefault(settings);
      try { localStorage.setItem(scopedKey(DEFAULT_KEY, userId), JSON.stringify(settings)); } catch {}
    },
    hasCustomDefault: userDefault !== null,
    revertToDefault: () => {
      const target = userDefault ?? APP_DEFAULT_SETTINGS;
      setSettings(target);
    },
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

let audioCtx: AudioContext | null = null;
export function playMoveSound(kind: 'move' | 'capture' = 'move') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = kind === 'capture' ? 220 : 440;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {}
}
