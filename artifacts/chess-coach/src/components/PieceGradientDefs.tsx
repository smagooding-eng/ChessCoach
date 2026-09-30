import React from 'react';

// Gradient fills referenced by the static "3D-look" piece styles
// (Shaded, 3D Wood, 3D Marble, Chrome, Gold, Copper, Obsidian, Ivory --
// see PIECE_STYLES in SettingsContext.tsx) via fill="url(#id)". SVG
// url() references only resolve against elements actually present in
// the same document, so any board that can render one of these styles
// needs this rendered somewhere on the page -- not just ChessBoard.tsx,
// which is where this used to live exclusively.
//
// That was the actual bug behind pieces going fully transparent on
// Puzzles, Analysis, WeaknessDetail, and LessonBoardPlayer specifically:
// those pages render pieces via react-chessboard's own <Chessboard>
// directly, not the ChessCoach ChessBoard.tsx wrapper, so they never had
// access to these gradient ids at all -- a url(#cc-grad-gold-light)
// reference with no matching element anywhere in the DOM resolves to no
// paint at all, which is indistinguishable from "invisible."
//
// This does NOT include the dynamic "Custom" color gradient (built from
// whatever hex the user picks) -- that one still lives in ChessBoard.tsx
// only, because pages without it already have a working, deliberate
// fallback to a flat color instead (see useGradientForCustom in
// RecoloredPieces.tsx) rather than needing the literal gradient.
//
// Zero-size and aria-hidden since it renders nothing visible on its own;
// safe to mount once per page alongside any board.
export function PieceGradientDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="cc-grad-shaded-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fdfdfd" />
          <stop offset="55%" stopColor="#e2e2e2" />
          <stop offset="100%" stopColor="#bdbdbd" />
        </linearGradient>
        <linearGradient id="cc-grad-shaded-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5a5a5a" />
          <stop offset="55%" stopColor="#333333" />
          <stop offset="100%" stopColor="#151515" />
        </linearGradient>
        <linearGradient id="cc-grad-wood-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbe9c6" />
          <stop offset="50%" stopColor="#e8c583" />
          <stop offset="100%" stopColor="#c08f43" />
        </linearGradient>
        <linearGradient id="cc-grad-wood-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8a5a2e" />
          <stop offset="50%" stopColor="#5c3a1a" />
          <stop offset="100%" stopColor="#2e1a0a" />
        </linearGradient>
        <linearGradient id="cc-grad-marble-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#e6e6ee" />
          <stop offset="100%" stopColor="#c4c4d2" />
        </linearGradient>
        <linearGradient id="cc-grad-marble-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4a4a54" />
          <stop offset="60%" stopColor="#26262e" />
          <stop offset="100%" stopColor="#0e0e12" />
        </linearGradient>
        <linearGradient id="cc-grad-chrome-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#c9d3d9" />
          <stop offset="60%" stopColor="#eef3f5" />
          <stop offset="100%" stopColor="#8a97a0" />
        </linearGradient>
        <linearGradient id="cc-grad-chrome-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7a828a" />
          <stop offset="35%" stopColor="#2a2d31" />
          <stop offset="60%" stopColor="#4a4f55" />
          <stop offset="100%" stopColor="#0a0b0c" />
        </linearGradient>
        <linearGradient id="cc-grad-gold-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff4d1" />
          <stop offset="50%" stopColor="#e8c04a" />
          <stop offset="100%" stopColor="#a8791f" />
        </linearGradient>
        <linearGradient id="cc-grad-gold-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c99a2e" />
          <stop offset="50%" stopColor="#7a5714" />
          <stop offset="100%" stopColor="#3d2a09" />
        </linearGradient>
        <linearGradient id="cc-grad-copper-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffd9b8" />
          <stop offset="50%" stopColor="#d4823f" />
          <stop offset="100%" stopColor="#8a4a1e" />
        </linearGradient>
        <linearGradient id="cc-grad-copper-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a8622e" />
          <stop offset="50%" stopColor="#6b3818" />
          <stop offset="100%" stopColor="#331a09" />
        </linearGradient>
        <linearGradient id="cc-grad-obsidian-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8a8494" />
          <stop offset="55%" stopColor="#4a4458" />
          <stop offset="100%" stopColor="#1c1824" />
        </linearGradient>
        <linearGradient id="cc-grad-obsidian-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38333f" />
          <stop offset="55%" stopColor="#1a1620" />
          <stop offset="100%" stopColor="#05040a" />
        </linearGradient>
        <linearGradient id="cc-grad-ivory-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fffdf2" />
          <stop offset="55%" stopColor="#f3e8c8" />
          <stop offset="100%" stopColor="#d9c396" />
        </linearGradient>
        <linearGradient id="cc-grad-ivory-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#b8a06a" />
          <stop offset="55%" stopColor="#8a7345" />
          <stop offset="100%" stopColor="#5c4a28" />
        </linearGradient>
      </defs>
    </svg>
  );
}
