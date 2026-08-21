import { Link } from 'wouter';
import { ArrowLeft, Check } from 'lucide-react';
import { useSettings, BOARD_THEMES, PIECE_TINTS, type BoardTheme, type PieceTint } from '@/context/SettingsContext';

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
      <span className="text-xs font-bold flex items-center gap-1" style={{ color: active ? CHESSCOM_GREEN : TEXT_MUTED }}>
        {active && <Check className="w-3 h-3" />} {label}
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
    pieceTint, setPieceTint,
    confirmMoves, setConfirmMoves,
    showCoordinates, setShowCoordinates,
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
        <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: TEXT_MUTED }}>Piece Style</h2>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(PIECE_TINTS) as PieceTint[]).map((key) => {
            const t = PIECE_TINTS[key];
            return (
              <SwatchButton key={key} active={pieceTint === key} onClick={() => setPieceTint(key)} label={t.label}>
                <span className="text-3xl leading-none" style={{ filter: t.filter }}>♞</span>
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
      </section>

      <p className="text-xs text-center pt-2" style={{ color: TEXT_MUTED }}>
        More settings — move sound effects, underpromotion choice, board size — coming soon.
      </p>
    </div>
  );
}
