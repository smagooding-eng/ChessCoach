import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Check, Save, Trash2, RotateCcw, Star } from 'lucide-react';
import {
  useSettings, BOARD_THEMES, BOARD_TEXTURES, PIECE_STYLES, PIECE_SHAPES, BOARD_SIZES, APP_BACKGROUNDS,
  type BoardTheme, type BoardTexture, type PieceStyle, type PieceShape, type BoardSize, type AppBackground, type SavedTheme,
} from '@/context/SettingsContext';

const CHESSCOM_GREEN = '#81b64c';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const BG_CARD = '#302e2b';

function SwatchButton({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all"
      style={{
        background: active ? 'rgba(129,182,76,0.12)' : 'rgba(255,255,255,0.03)',
        border: active ? `1.5px solid ${CHESSCOM_GREEN}` : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {children}
      <span className="text-[11px] font-bold flex items-center gap-1 text-center leading-tight" style={{ color: active ? CHESSCOM_GREEN : TEXT_MUTED }}>
        {active && <Check className="w-3 h-3 shrink-0" />} {label}
      </span>
    </button>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 p-4 rounded-xl text-left"
      style={{ background: BG_CARD, border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div>
        <p className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{description}</p>
      </div>
      <div className="shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors" style={{ background: checked ? CHESSCOM_GREEN : 'rgba(255,255,255,0.15)' }}>
        <div className="w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
      </div>
    </button>
  );
}

function ColorPickerRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 p-3 rounded-xl cursor-pointer" style={{ background: BG_CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
      <span className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono" style={{ color: TEXT_MUTED }}>{value}</span>
        <div className="relative w-9 h-9 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute -inset-1 w-12 h-12 cursor-pointer" style={{ background: value }} />
        </div>
      </div>
    </label>
  );
}

export default function SettingsPage() {
  const {
    boardTheme, setBoardTheme,
    boardTexture, setBoardTexture,
    pieceStyle, setPieceStyle,
    pieceShape, setPieceShape,
    appBackground, setAppBackground,
    boardCustomColors, setBoardCustomColor,
    pieceCustomColors, setPieceCustomColor,
    confirmMoves, setConfirmMoves,
    showCoordinates, setShowCoordinates,
    soundEnabled, setSoundEnabled,
    promotionChoice, setPromotionChoice,
    boardSize, setBoardSize,
    savedThemes, saveCurrentAsTheme, applyTheme, deleteTheme,
    setAsMyDefault, hasCustomDefault, revertToDefault,
  } = useSettings();

  const [themeNameInput, setThemeNameInput] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [defaultFlash, setDefaultFlash] = useState(false);

  const handleSaveTheme = () => {
    saveCurrentAsTheme(themeNameInput || 'My Theme');
    setThemeNameInput('');
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const handleSetDefault = () => {
    setAsMyDefault();
    setDefaultFlash(true);
    setTimeout(() => setDefaultFlash(false), 1500);
  };

  return (
    <div className="p-4 md:p-0 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm" style={{ color: TEXT_MUTED }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <button
          onClick={revertToDefault}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.05)', color: TEXT_MUTED, border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {hasCustomDefault ? 'Revert to My Default' : 'Revert to Default'}
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-black" style={{ color: TEXT_LIGHT }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>Customize how ChessScout.net looks and plays</p>
      </div>

      <section>
        <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: TEXT_MUTED }}>Board Color</h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
          {(Object.keys(BOARD_THEMES) as Exclude<BoardTheme, 'custom'>[]).map((key) => {
            const t = BOARD_THEMES[key];
            return (
              <SwatchButton key={key} active={boardTheme === key} onClick={() => setBoardTheme(key)} label={t.label}>
                <div className="w-full aspect-square rounded-lg overflow-hidden grid grid-cols-2 grid-rows-2" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ background: t.light }} /><div style={{ background: t.dark }} />
                  <div style={{ background: t.dark }} /><div style={{ background: t.light }} />
                </div>
              </SwatchButton>
            );
          })}
          <SwatchButton active={boardTheme === 'custom'} onClick={() => setBoardTheme('custom')} label="Custom">
            <div className="w-full aspect-square rounded-lg overflow-hidden grid grid-cols-2 grid-rows-2" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ background: boardCustomColors.light }} /><div style={{ background: boardCustomColors.dark }} />
              <div style={{ background: boardCustomColors.dark }} /><div style={{ background: boardCustomColors.light }} />
            </div>
          </SwatchButton>
        </div>
        {boardTheme === 'custom' && (
          <div className="space-y-2 mb-3">
            <ColorPickerRow label="Light Squares" value={boardCustomColors.light} onChange={(c) => setBoardCustomColor('light', c)} />
            <ColorPickerRow label="Dark Squares" value={boardCustomColors.dark} onChange={(c) => setBoardCustomColor('dark', c)} />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-black uppercase tracking-wide mb-1" style={{ color: TEXT_MUTED }}>Board Texture</h2>
        <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>A subtle surface pattern on top of your board color</p>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(BOARD_TEXTURES) as BoardTexture[]).map((key) => {
            const t = BOARD_TEXTURES[key];
            return (
              <SwatchButton key={key} active={boardTexture === key} onClick={() => setBoardTexture(key)} label={t.label}>
                <div className="w-full aspect-square rounded-lg" style={{ background: '#769656', backgroundImage: t.backgroundImage, backgroundSize: t.backgroundSize, border: '1px solid rgba(255,255,255,0.1)' }} />
              </SwatchButton>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-black uppercase tracking-wide mb-1" style={{ color: TEXT_MUTED }}>Piece Shape</h2>
        <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>Real alternate artwork, not just a recolor</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {(Object.keys(PIECE_SHAPES) as PieceShape[]).map((key) => (
            <SwatchButton key={key} active={pieceShape === key} onClick={() => setPieceShape(key)} label={PIECE_SHAPES[key].label}>
              <span className="text-3xl leading-none">♞</span>
            </SwatchButton>
          ))}
        </div>
        {pieceShape !== 'default' && PIECE_SHAPES[pieceShape].attribution && (
          <p className="text-[10px]" style={{ color: TEXT_MUTED }}>{PIECE_SHAPES[pieceShape].attribution}</p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-black uppercase tracking-wide mb-1" style={{ color: TEXT_MUTED }}>Piece Style</h2>
        <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>
          Color and finish for the pieces themselves{pieceShape !== 'default' ? ' — not used with a non-default shape' : ''}
        </p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {(Object.keys(PIECE_STYLES) as Exclude<PieceStyle, 'custom'>[]).map((key) => {
            const t = PIECE_STYLES[key];
            return (
              <SwatchButton key={key} active={pieceStyle === key} onClick={() => setPieceStyle(key)} label={t.label}>
                <div className="flex items-center gap-0.5">
                  <span className="text-2xl leading-none" style={{ color: t.light, WebkitTextStroke: '1px #555', ...t.finish }}>♞</span>
                  <span className="text-2xl leading-none" style={{ color: t.dark, WebkitTextStroke: '1px #999', ...t.finish }}>♞</span>
                </div>
              </SwatchButton>
            );
          })}
          <SwatchButton active={pieceStyle === 'custom'} onClick={() => setPieceStyle('custom')} label="Custom">
            <div className="flex items-center gap-0.5">
              <span className="text-2xl leading-none" style={{ color: pieceCustomColors.light, WebkitTextStroke: '1px #555' }}>♞</span>
              <span className="text-2xl leading-none" style={{ color: pieceCustomColors.dark, WebkitTextStroke: '1px #999' }}>♞</span>
            </div>
          </SwatchButton>
        </div>
        {pieceStyle === 'custom' && (
          <div className="space-y-2">
            <ColorPickerRow label="White Pieces" value={pieceCustomColors.light} onChange={(c) => setPieceCustomColor('light', c)} />
            <ColorPickerRow label="Black Pieces" value={pieceCustomColors.dark} onChange={(c) => setPieceCustomColor('dark', c)} />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-black uppercase tracking-wide mb-1" style={{ color: TEXT_MUTED }}>App Background</h2>
        <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>A subtle tint behind the whole app, not just the board</p>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(APP_BACKGROUNDS) as AppBackground[]).map((key) => {
            const t = APP_BACKGROUNDS[key];
            return (
              <SwatchButton key={key} active={appBackground === key} onClick={() => setAppBackground(key)} label={t.label}>
                <div className="w-full aspect-square rounded-lg" style={{ background: '#141413', ...t.css, border: '1px solid rgba(255,255,255,0.1)' }} />
              </SwatchButton>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: TEXT_MUTED }}>My Themes</h2>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={themeNameInput}
            onChange={(e) => setThemeNameInput(e.target.value)}
            placeholder="Theme name (e.g. Sunset Blitz)"
            className="flex-1 px-3 py-2.5 rounded-xl text-sm"
            style={{ background: BG_CARD, border: '1px solid rgba(255,255,255,0.1)', color: TEXT_LIGHT }}
          />
          <button
            onClick={handleSaveTheme}
            className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5 shrink-0"
            style={{ background: savedFlash ? 'rgba(129,182,76,0.2)' : CHESSCOM_GREEN, color: savedFlash ? CHESSCOM_GREEN : '#000' }}
          >
            {savedFlash ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedFlash ? 'Saved' : 'Save Current'}
          </button>
        </div>
        {savedThemes.length > 0 && (
          <div className="space-y-2">
            {savedThemes.map((t: SavedTheme) => (
              <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-xl" style={{ background: BG_CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
                <button onClick={() => applyTheme(t)} className="flex items-center gap-3 flex-1 text-left">
                  <div className="flex rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
                    <div className="w-5 h-5" style={{ background: t.boardColors.light }} />
                    <div className="w-5 h-5" style={{ background: t.boardColors.dark }} />
                  </div>
                  <span className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>{t.name}</span>
                </button>
                <button onClick={() => deleteTheme(t.id)} className="p-1.5 rounded-lg" style={{ color: TEXT_MUTED }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: TEXT_MUTED }}>Board Size</h2>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(BOARD_SIZES) as BoardSize[]).map((key) => {
            const t = BOARD_SIZES[key];
            return (
              <SwatchButton key={key} active={boardSize === key} onClick={() => setBoardSize(key)} label={t.label}>
                <div className="w-full flex items-center justify-center h-8">
                  <div className="rounded" style={{ width: `${20 + (t.maxWidth / 720) * 24}px`, height: `${20 + (t.maxWidth / 720) * 24}px`, background: 'rgba(129,182,76,0.3)', border: '1px solid rgba(129,182,76,0.5)' }} />
                </div>
              </SwatchButton>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-black uppercase tracking-wide mb-1" style={{ color: TEXT_MUTED }}>Gameplay</h2>
        <ToggleRow label="Confirm Moves" description="Tap a big confirm button before your move is played — like pressing a chess clock" checked={confirmMoves} onChange={setConfirmMoves} />
        <ToggleRow label="Board Coordinates" description="Show file/rank labels (a-h, 1-8) around the board edge" checked={showCoordinates} onChange={setShowCoordinates} />
        <ToggleRow label="Ask on Promotion" description="Choose which piece to promote to, instead of always auto-queening" checked={promotionChoice === 'ask'} onChange={(v) => setPromotionChoice(v ? 'ask' : 'queen')} />
        <ToggleRow label="Move Sounds" description="Play a short sound when a move or capture is made" checked={soundEnabled} onChange={setSoundEnabled} />
      </section>

      <button
        onClick={handleSetDefault}
        className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
        style={{ background: defaultFlash ? 'rgba(129,182,76,0.15)' : 'rgba(255,255,255,0.04)', color: defaultFlash ? CHESSCOM_GREEN : TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {defaultFlash ? <Check className="w-4 h-4" /> : <Star className="w-4 h-4" />}
        {defaultFlash ? 'Set as My Default' : 'Set Current Settings as My Default'}
      </button>
      <p className="text-xs text-center" style={{ color: TEXT_MUTED }}>
        Your default is what "Revert to Default" restores, and what new sessions on this device start with.
      </p>
    </div>
  );
}
