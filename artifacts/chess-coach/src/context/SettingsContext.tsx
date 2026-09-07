import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useUser } from '@/context/UserContext';

export type BoardTheme = 'classic' | 'green' | 'blue' | 'gray' | 'purple' | 'crimson' | 'teal' | 'coal' | 'sunset' | 'custom';
export type BoardTexture = 'flat' | 'wood' | 'marble' | 'felt';
export type AppBackground = 'default' | 'warm-gradient' | 'cool-gradient' | 'noise';
export type PieceStyle = 'classic' | 'glossy' | 'outlined' | 'ocean' | 'crimson' | 'emerald' | 'royal' | 'flat' | 'depth' | 'shaded' | 'wood3d' | 'marble3d' | 'chrome' | 'custom';
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
export const BOARD_TEXTURES: Record<BoardTexture, { label: string; backgroundImage: string; backgroundImageDark?: string; backgroundSize?: string }> = {
  flat:   { label: 'Flat', backgroundImage: 'none' },
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
};

export const APP_BACKGROUNDS: Record<AppBackground, { label: string; css: React.CSSProperties }> = {
  default:       { label: 'Default', css: {} },
  'warm-gradient': { label: 'Warm', css: { backgroundImage: 'radial-gradient(circle at 15% 0%, rgba(201,162,75,0.08) 0%, transparent 45%), radial-gradient(circle at 85% 100%, rgba(129,182,76,0.05) 0%, transparent 40%)' } },
  'cool-gradient': { label: 'Cool', css: { backgroundImage: 'radial-gradient(circle at 15% 0%, rgba(107,164,232,0.08) 0%, transparent 45%), radial-gradient(circle at 85% 100%, rgba(199,125,212,0.05) 0%, transparent 40%)' } },
  noise:         { label: 'Textured', css: { backgroundImage: 'radial-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '3px 3px' } },
};

export const PIECE_STYLES: Record<Exclude<PieceStyle, 'custom'>, { light: string; dark: string; label: string; finish: React.CSSProperties; previewLight?: string; previewDark?: string }> = {
  classic:  { light: '#ffffff', dark: '#2b2b2b', label: 'Classic',  finish: {} },
  glossy:   { light: '#ffffff', dark: '#2b2b2b', label: 'Glossy',   finish: { filter: 'drop-shadow(0 2px 1px rgba(0,0,0,0.35)) brightness(1.08) contrast(1.1)' } },
  outlined: { light: '#ffffff', dark: '#1a1a1a', label: 'Outlined', finish: { filter: 'drop-shadow(0 0 0.5px #000) drop-shadow(0 0 0.5px #000) drop-shadow(0 0 0.5px #000)' } },
  ocean:    { light: '#dff1ff', dark: '#1c4b7a', label: 'Ocean',    finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' } },
  crimson:  { light: '#ffe9e9', dark: '#7a1c2b', label: 'Crimson',  finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' } },
  emerald:  { light: '#e8fff2', dark: '#166b45', label: 'Emerald',  finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' } },
  royal:    { light: '#f3e9ff', dark: '#4a1c7a', label: 'Royal',    finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' } },
  flat:     { light: '#f2f2f2', dark: '#232323', label: 'Flat',     finish: { filter: 'contrast(0.92) saturate(0.85)' } },
  depth:    { light: '#ffffff', dark: '#2b2b2b', label: 'Depth',    finish: { filter: 'drop-shadow(0 3px 2px rgba(0,0,0,0.5)) drop-shadow(0 1px 0 rgba(255,255,255,0.15)) brightness(1.05)' } },
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
  shaded:   { light: 'url(#cc-grad-shaded-light)', dark: 'url(#cc-grad-shaded-dark)', label: 'Shaded', finish: { filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.45))' },
    previewLight: 'linear-gradient(135deg, #fdfdfd 0%, #e2e2e2 55%, #bdbdbd 100%)', previewDark: 'linear-gradient(135deg, #5a5a5a 0%, #333333 55%, #151515 100%)' },
  wood3d:   { light: 'url(#cc-grad-wood-light)', dark: 'url(#cc-grad-wood-dark)', label: '3D Wood', finish: { filter: 'drop-shadow(0 3px 2px rgba(40,20,0,0.5)) drop-shadow(0 1px 0 rgba(255,235,200,0.25))' },
    previewLight: 'linear-gradient(135deg, #fbe9c6 0%, #e8c583 50%, #c08f43 100%)', previewDark: 'linear-gradient(135deg, #8a5a2e 0%, #5c3a1a 50%, #2e1a0a 100%)' },
  marble3d: { light: 'url(#cc-grad-marble-light)', dark: 'url(#cc-grad-marble-dark)', label: '3D Marble', finish: { filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.4)) drop-shadow(0 1px 0 rgba(255,255,255,0.3))' },
    previewLight: 'linear-gradient(135deg, #ffffff 0%, #e6e6ee 60%, #c4c4d2 100%)', previewDark: 'linear-gradient(135deg, #4a4a54 0%, #26262e 60%, #0e0e12 100%)' },
  chrome:   { light: 'url(#cc-grad-chrome-light)', dark: 'url(#cc-grad-chrome-dark)', label: 'Chrome', finish: { filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5)) contrast(1.15)' },
    previewLight: 'linear-gradient(135deg, #ffffff 0%, #c9d3d9 35%, #eef3f5 60%, #8a97a0 100%)', previewDark: 'linear-gradient(135deg, #7a828a 0%, #2a2d31 35%, #4a4f55 60%, #0a0b0c 100%)' },
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
  boardTextureCss: { backgroundImage: string; backgroundImageDark?: string; backgroundSize?: string };
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
