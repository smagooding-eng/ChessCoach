import { Link } from 'wouter';
import { ArrowLeft, Check } from 'lucide-react';
import { useSettings, BOARD_THEMES, PIECE_STYLES, BOARD_SIZES, type BoardTheme, type PieceStyle, type BoardSize } from '@/context/SettingsContext';

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
      <div
        className="shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors"
        style={{ background: checked ? CHESSCOM_GREEN : 'rgba(255,255,255,0.15)' }}
      >
        <div
          className="w-5 h-5 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </div>
    </button>
  );
}

export default function SettingsPage() {
  const {
    boardTheme, setBoardTheme,
    pieceStyle, setPieceStyle,
    confirmMoves, setConfirmMoves,
    showCoordinates, setShowCoordinates,
    soundEnabled, setSoundEnabled,
    promotionChoice, setPromotionChoice,
    boardSize, setBoardSize,
  } = useSettings();

  return (
    <div className="p-4 md:p-0 max-w-2xl mx-auto space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm" style={{ color: TEXT_MUTED }}>
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div>
        <h1 className="text-2xl font-black" style={{ color: TEXT_LIGHT }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>Customize how ChessScout looks and plays</p>
      </div>

      <section>
        <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: TEXT_MUTED }}>Board Color</h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((key) => {
            const t = BOARD_THEMES[key];
            return (
              <SwatchButton key={key} active={boardTheme === key} onClick={() => setBoardTheme(key)} label={t.label}>
                <div className="w-full aspect-square rounded-lg overflow-hidden grid grid-cols-2 grid-rows-2" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ background: t.light }} />
                  <div style={{ background: t.dark }} />
                  <div style={{ background: t.dark }} />
                  <div style={{ background: t.light }} />
                </div>
              </SwatchButton>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-black uppercase tracking-wide mb-1" style={{ color: TEXT_MUTED }}>Piece Style</h2>
        <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>Color and finish for the pieces themselves</p>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(PIECE_STYLES) as PieceStyle[]).map((key) => {
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
        </div>
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
        <ToggleRow
          label="Confirm Moves"
          description="Tap a big confirm button before your move is played — like pressing a chess clock"
          checked={confirmMoves}
          onChange={setConfirmMoves}
        />
        <ToggleRow
          label="Board Coordinates"
          description="Show file/rank labels (a-h, 1-8) around the board edge"
          checked={showCoordinates}
          onChange={setShowCoordinates}
        />
        <ToggleRow
          label="Ask on Promotion"
          description="Choose which piece to promote to, instead of always auto-queening"
          checked={promotionChoice === 'ask'}
          onChange={(v) => setPromotionChoice(v ? 'ask' : 'queen')}
        />
        <ToggleRow
          label="Move Sounds"
          description="Play a short sound when a move or capture is made"
          checked={soundEnabled}
          onChange={setSoundEnabled}
        />
      </section>
    </div>
  );
}
