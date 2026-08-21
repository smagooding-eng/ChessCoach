import React, { createContext, useContext, useState, useEffect } from 'react';

export type BoardTheme = 'classic' | 'green' | 'blue' | 'gray' | 'purple';
export type PieceTint = 'classic' | 'ocean' | 'crimson' | 'mono';

export const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string; label: string }> = {
  classic: { light: '#f0d9b5', dark: '#b58863', label: 'Classic Wood' },
  green:   { light: '#eeeed2', dark: '#769656', label: 'Green' },
  blue:    { light: '#dee3e6', dark: '#8ca2ad', label: 'Ocean Blue' },
  gray:    { light: '#e8e8e8', dark: '#7a7a7a', label: 'Slate Gray' },
  purple:  { light: '#e8dff5', dark: '#9370b8', label: 'Purple' },
};

export const PIECE_TINTS: Record<PieceTint, { filter: string; label: string }> = {
  classic: { filter: 'none', label: 'Classic' },
  ocean:   { filter: 'hue-rotate(180deg) saturate(1.15)', label: 'Ocean' },
  crimson: { filter: 'hue-rotate(320deg) saturate(1.3)', label: 'Crimson' },
  mono:    { filter: 'grayscale(1) contrast(1.1)', label: 'Monochrome' },
};

interface Settings {
  boardTheme: BoardTheme;
  pieceTint: PieceTint;
  confirmMoves: boolean;
  showCoordinates: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  boardTheme: 'green',
  pieceTint: 'classic',
  confirmMoves: false,
  showCoordinates: true,
};

const STORAGE_KEY = 'chessscout_settings';

interface SettingsContextValue extends Settings {
  setBoardTheme: (t: BoardTheme) => void;
  setPieceTint: (t: PieceTint) => void;
  setConfirmMoves: (v: boolean) => void;
  setShowCoordinates: (v: boolean) => void;
  boardColors: { light: string; dark: string };
  pieceFilter: string;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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
    setPieceTint: (t) => setSettings((s) => ({ ...s, pieceTint: t })),
    setConfirmMoves: (v) => setSettings((s) => ({ ...s, confirmMoves: v })),
    setShowCoordinates: (v) => setSettings((s) => ({ ...s, showCoordinates: v })),
    boardColors: BOARD_THEMES[settings.boardTheme],
    pieceFilter: PIECE_TINTS[settings.pieceTint].filter,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
