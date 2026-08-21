import React, { createContext, useContext, useState, useEffect } from 'react';

export type BoardTheme = 'classic' | 'green' | 'blue' | 'gray' | 'purple' | 'crimson' | 'teal' | 'coal' | 'sunset';
export type PieceStyle = 'classic' | 'glossy' | 'outlined' | 'ocean' | 'crimson' | 'emerald' | 'royal' | 'flat';
export type PromotionChoice = 'queen' | 'ask';
export type BoardSize = 'compact' | 'standard' | 'large';

export const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string; label: string }> = {
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

// Piece styles combine a real fill-color change with a distinct visual
// finish (outline/glossy/flat), applied via svgStyle CSS on top of the
// color override -- this library ships exactly one piece artwork set (no
// alternate shapes available), so "style" here means color + finish, not
// different piece shapes.
export const PIECE_STYLES: Record<PieceStyle, { light: string; dark: string; label: string; finish: React.CSSProperties }> = {
  classic:  { light: '#ffffff', dark: '#2b2b2b', label: 'Classic',  finish: {} },
  glossy:   { light: '#ffffff', dark: '#2b2b2b', label: 'Glossy',   finish: { filter: 'drop-shadow(0 2px 1px rgba(0,0,0,0.35)) brightness(1.08) contrast(1.1)' } },
  outlined: { light: '#ffffff', dark: '#1a1a1a', label: 'Outlined', finish: { filter: 'drop-shadow(0 0 0.5px #000) drop-shadow(0 0 0.5px #000) drop-shadow(0 0 0.5px #000)' } },
  ocean:    { light: '#dff1ff', dark: '#1c4b7a', label: 'Ocean',    finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' } },
  crimson:  { light: '#ffe9e9', dark: '#7a1c2b', label: 'Crimson',  finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' } },
  emerald:  { light: '#e8fff2', dark: '#166b45', label: 'Emerald',  finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' } },
  royal:    { light: '#f3e9ff', dark: '#4a1c7a', label: 'Royal',    finish: { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' } },
  flat:     { light: '#f2f2f2', dark: '#232323', label: 'Flat',     finish: { filter: 'contrast(0.92) saturate(0.85)' } },
};

export const BOARD_SIZES: Record<BoardSize, { maxWidth: number; label: string }> = {
  compact:  { maxWidth: 420, label: 'Compact' },
  standard: { maxWidth: 580, label: 'Standard' },
  large:    { maxWidth: 720, label: 'Large' },
};

interface Settings {
  boardTheme: BoardTheme;
  pieceStyle: PieceStyle;
  confirmMoves: boolean;
  showCoordinates: boolean;
  soundEnabled: boolean;
  promotionChoice: PromotionChoice;
  boardSize: BoardSize;
}

const DEFAULT_SETTINGS: Settings = {
  boardTheme: 'green',
  pieceStyle: 'classic',
  confirmMoves: false,
  showCoordinates: true,
  soundEnabled: true,
  promotionChoice: 'queen',
  boardSize: 'standard',
};

const STORAGE_KEY = 'chessscout_settings';

interface SettingsContextValue extends Settings {
  setBoardTheme: (t: BoardTheme) => void;
  setPieceStyle: (t: PieceStyle) => void;
  setConfirmMoves: (v: boolean) => void;
  setShowCoordinates: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setPromotionChoice: (v: PromotionChoice) => void;
  setBoardSize: (v: BoardSize) => void;
  boardColors: { light: string; dark: string };
  pieceColors: { light: string; dark: string; finish: React.CSSProperties };
  boardMaxWidth: number;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Migrate old key name from an earlier version of this feature.
        if (parsed.pieceTint && !parsed.pieceStyle) parsed.pieceStyle = 'classic';
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const value: SettingsContextValue = {
    ...settings,
    setBoardTheme: (t) => setSettings((s) => ({ ...s, boardTheme: t })),
    setPieceStyle: (t) => setSettings((s) => ({ ...s, pieceStyle: t })),
    setConfirmMoves: (v) => setSettings((s) => ({ ...s, confirmMoves: v })),
    setShowCoordinates: (v) => setSettings((s) => ({ ...s, showCoordinates: v })),
    setSoundEnabled: (v) => setSettings((s) => ({ ...s, soundEnabled: v })),
    setPromotionChoice: (v) => setSettings((s) => ({ ...s, promotionChoice: v })),
    setBoardSize: (v) => setSettings((s) => ({ ...s, boardSize: v })),
    boardColors: BOARD_THEMES[settings.boardTheme],
    pieceColors: PIECE_STYLES[settings.pieceStyle],
    boardMaxWidth: BOARD_SIZES[settings.boardSize].maxWidth,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

// Tiny synthesized move/capture sound via Web Audio -- no external audio
// files needed, so nothing to source, host, or verify.
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
