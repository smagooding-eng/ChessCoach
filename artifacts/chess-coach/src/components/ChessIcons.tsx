import React from 'react';

// Custom, chess-grounded icon set — hand-drawn silhouettes rather than the
// generic outline-icon-library glyphs (Lucide et al.) used almost
// universally in templated/AI-scaffolded UIs. Each icon here is built
// around an actual chess piece or board motif specific to what it
// represents, not a borrowed generic symbol.

type IconProps = { className?: string; style?: React.CSSProperties; strokeWidth?: number };

// Home — a knight's head in profile. The knight is the most immediately
// recognizable chess silhouette to a non-player, making it a natural
// "home base" mark for the app itself.
export function KnightIcon({ className, style, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path
        d="M7 21h11M8.5 21c-.3-2 .2-3.3 1.2-4.3.9-.9 1.3-1.8 1.1-3-.2-1.3-1.1-1.8-2-1.4-.6.3-1 .2-1.1-.4-.2-1 .3-2 1.3-2.7C10 8.4 10.8 7 10.3 5.6 9.9 4.4 8.8 4 7.8 4.6 6.6 5.3 6 6.7 6.3 8c.2.9-.1 1.4-.9 1.7-1.1.4-1.9 1.4-1.9 2.8 0 1.8 1 3 2.3 4.3 1.1 1.1 1.5 2.5 1.2 4.2Z"
        stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="8.3" cy="7.1" r="0.6" fill="currentColor" />
    </svg>
  );
}

// Opponent Scout — a king silhouette behind a spyglass ring, for "studying
// an opponent" rather than the generic crossed-swords "battle" metaphor.
export function ScoutIcon({ className, style, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path
        d="M12 3.2v2M10.6 4.2h2.8M9 9.5c0-1.7 1.3-3 3-3s3 1.3 3 3c0 1.1-.5 1.8-1.2 2.6-.5.6-.8 1.1-.8 1.9h-2c0-.8-.3-1.3-.8-1.9C9.5 11.3 9 10.6 9 9.5Z"
        stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M8 17h8l1 4H7l1-4Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M10.5 14h3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <circle cx="18.5" cy="8.5" r="3" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M20.6 10.6 22.5 12.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

// Games — a chess clock (two stacked buttons on a rounded case), the
// actual object tied to game history, instead of a generic clock-face icon.
export function ChessClockIcon({ className, style, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <rect x="4" y="6" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M9 6V4.5M15 6V4.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <circle cx="9" cy="12.5" r="2.6" stroke="currentColor" strokeWidth={strokeWidth * 0.85} />
      <circle cx="15" cy="12.5" r="2.6" stroke="currentColor" strokeWidth={strokeWidth * 0.85} />
      <path d="M9 11v1.5l1 .8M15 11v1.5l-1 .8" stroke="currentColor" strokeWidth={strokeWidth * 0.85} strokeLinecap="round" />
    </svg>
  );
}

// Analysis — a queen silhouette (the most tactically far-reaching piece)
// behind a small pulse/waveform line, for "deep engine analysis."
export function AnalysisIcon({ className, style, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path
        d="M7 20h10M7.5 20c-.3-2.3.3-3.6 1-4.6 1-1.4 1.3-2.4.9-3.7L14.6 11.7c-.4 1.3-.1 2.3.9 3.7.7 1 1.3 2.3 1 4.6"
        stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M8.7 9.2 9.4 12M12 8.4V11.6M15.3 9.2 14.6 12" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7.6" cy="7.4" r="1" fill="currentColor" />
      <circle cx="12" cy="6.4" r="1" fill="currentColor" />
      <circle cx="16.4" cy="7.4" r="1" fill="currentColor" />
    </svg>
  );
}

// Puzzles — a shattered/segmented rook (tactics break a position apart),
// instead of a generic jigsaw-piece glyph.
export function TacticsIcon({ className, style, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M8 20h8M9 20l.4-2.6M15 20l-.4-2.6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path
        d="M7.5 17.4c-.4-1.6-.1-2.9.9-4l.4-3.6-1-1V6.4h2v1.4h1.4V6h1.6v1.8H14V6.4h2v2.4l-1 1 .4 3.6c1 1.1 1.3 2.4.9 4Z"
        stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round"
      />
      <path d="M9.3 13.4h5.4" stroke="currentColor" strokeWidth={strokeWidth * 0.8} strokeLinecap="round" strokeDasharray="0.5 2.2" />
    </svg>
  );
}

// Practice Bots — a pawn with small circuit-node marks, for "a
// programmed opponent" without resorting to a generic robot-head glyph.
export function BotPawnIcon({ className, style, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path
        d="M9 20h6M9.6 20c-.4-1.7 0-2.7.9-3.5.8-.7 1-1.3.8-2.2-1.4.3-2.5-.5-2.5-2 0-1.2.9-2.1 2-2.3-.5-.4-.8-1-.8-1.7C10 6.9 10.9 6 12 6s2 .9 2 2.3c0 .7-.3 1.3-.8 1.7 1.1.2 2 1.1 2 2.3 0 1.5-1.1 2.3-2.5 2 -.2.9 0 1.5.8 2.2.9.8 1.3 1.8.9 3.5Z"
        stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round"
      />
      <circle cx="8.3" cy="12.5" r="0.9" stroke="currentColor" strokeWidth={strokeWidth * 0.8} />
      <circle cx="15.7" cy="12.5" r="0.9" stroke="currentColor" strokeWidth={strokeWidth * 0.8} />
      <path d="M9.2 12.5H10M14 12.5h.8" stroke="currentColor" strokeWidth={strokeWidth * 0.8} strokeLinecap="round" />
    </svg>
  );
}
