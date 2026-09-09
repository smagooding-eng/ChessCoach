import React from 'react';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Play, Pause } from 'lucide-react';

const GREEN = '#81b64c';
const GREEN_DARK = '#5f8f36';
const TEXT_MUTED = '#9e9b98';
const TEXT_LIGHT = '#e8e6e3';

interface MoveNavigationBarProps {
  isPlaying: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onLast: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  // Page-specific extras (flip board, AI review, speed, undo, etc.) render
  // as a second row of small icon buttons below the core transport
  // controls, so each page can keep its own actions without every page
  // needing to hand-build the whole bar from scratch.
  extra?: React.ReactNode;
}

// One shared control cluster for all three move-by-move players (Game
// Lookup, course lessons, game replay) instead of three separately built,
// separately styled versions of the same five buttons. The previous
// per-page versions read as a loose row of nearly-identical icon buttons
// with barely any gap between them -- grouping them in one bordered
// capsule with real spacing and making Play the one clearly-primary
// action (larger, filled, colored) is what actually reads as an
// intentional transport control rather than a row of leftover icons.
export function MoveNavigationBar({
  isPlaying, onFirst, onPrev, onPlayPause, onNext, onLast,
  canGoBack = true, canGoForward = true, extra,
}: MoveNavigationBarProps) {
  const navBtn = (onClick: () => void, disabled: boolean, icon: React.ReactNode, label: string) => (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-10 h-10 flex items-center justify-center rounded-full transition-all duration-150 active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
      style={{ color: TEXT_LIGHT, background: 'rgba(255,255,255,0.06)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full"
        style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {navBtn(onFirst, !canGoBack, <ChevronsLeft className="w-[18px] h-[18px]" />, 'Go to start')}
        {navBtn(onPrev, !canGoBack, <ChevronLeft className="w-[18px] h-[18px]" />, 'Previous move')}
        <button
          onClick={onPlayPause}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-12 h-12 mx-1 flex items-center justify-center rounded-full transition-transform duration-150 active:scale-90"
          style={{
            background: `linear-gradient(180deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`,
            boxShadow: '0 2px 0 rgba(0,0,0,0.25), 0 4px 10px rgba(0,0,0,0.25)',
            color: '#fff',
          }}
        >
          {isPlaying ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5 ml-0.5" fill="currentColor" />}
        </button>
        {navBtn(onNext, !canGoForward, <ChevronRight className="w-[18px] h-[18px]" />, 'Next move')}
        {navBtn(onLast, !canGoForward, <ChevronsRight className="w-[18px] h-[18px]" />, 'Go to end')}
      </div>
      {extra && (
        <div className="flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
          {extra}
        </div>
      )}
    </div>
  );
}
