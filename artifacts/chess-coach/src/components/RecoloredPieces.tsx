import React from 'react';
import { defaultPieces } from 'react-chessboard';
import { getPieceColorScheme } from '@/lib/utils';

// Recolors react-chessboard's own stock piece SVGs by walking the
// rendered element tree and remapping specific style values, instead of
// reimplementing the pieces' SVG geometry from scratch. Fill is never
// touched here -- it comes from the stock component exactly as it always
// has (passed in via the `fill` prop, same as before any of this) --
// only the outline (always '#000000' in the stock pieces, regardless of
// what fill color is used) and the detail accents (white lines/knight
// eyes on the black pieces, black eyes on the white knight) get remapped
// to computed colors.
//
// This exists because a full from-scratch SVG recreation (see git
// history) caused pieces to render with no fill at all on some styles.
// The cause was never conclusively found despite the recreated
// components rendering correctly in isolated server-side tests -- rather
// than keep guessing at a live-only discrepancy, this rebuilds the same
// idea on top of code that is already proven correct, since it's the
// exact same stock rendering that's always worked.
function remapStyle(style: React.CSSProperties | undefined, outline: string, detail: string): React.CSSProperties | undefined {
  if (!style) return style;
  const next = { ...style };
  const fill = (style as any).fill;
  const stroke = (style as any).stroke;

  // Knight eyes: fill and stroke set to the same color together (either
  // '#000000' on the white knight or '#ffffff' on the black knight) --
  // this exact fill+stroke pairing only occurs on the eye paths, never
  // on a body shape (body shapes have a real fill color and a stroke
  // that's always '#000000', not matched together like this).
  if ((fill === '#000000' && stroke === '#000000') || (fill === '#ffffff' && stroke === '#ffffff')) {
    (next as any).fill = detail;
    (next as any).stroke = detail;
    return next;
  }
  // Standalone white detail/engraving lines on the black pieces (never
  // filled, just a stroke).
  if (stroke === '#ffffff') {
    (next as any).stroke = detail;
    return next;
  }
  // Standalone highlight fills with no stroke at all (e.g. the black
  // knight's mane highlight) -- same detail treatment as the eyes/lines
  // above, just without a matching stroke to key off of.
  if ((fill === '#ffffff' || fill === '#000000') && (stroke === undefined || stroke === 'none')) {
    (next as any).fill = detail;
    return next;
  }
  // Everything else's stroke is the outline -- this covers both the
  // outer body outline (which also has a real, untouched fill) and any
  // plain black accent lines. Also thins the stroke slightly (the
  // original 1.5 reads as thick once the color is lighter than pure
  // black -- a thin dark line disappears into the fill at that width,
  // but a thin *lighter* line at the same width reads as bold/wide).
  if (stroke === '#000000') {
    (next as any).stroke = outline;
    (next as any).strokeWidth = '1';
  }
  return next;
}

function remapElement(node: React.ReactNode, outline: string, detail: string): React.ReactNode {
  if (!React.isValidElement(node)) return node;
  const props = node.props as { style?: React.CSSProperties; children?: React.ReactNode };
  const newStyle = remapStyle(props.style, outline, detail);
  const newChildren = props.children
    ? React.Children.map(props.children, (child) => remapElement(child, outline, detail))
    : props.children;
  return React.cloneElement(node, { style: newStyle } as any, newChildren);
}

export interface RecoloredPieceProps {
  fill: string;
  outline: string;
  detail: string;
  svgStyle?: React.CSSProperties;
}

// Wraps one of react-chessboard's own stock piece components, calling it
// exactly as before (same fill, same svgStyle) and then remapping the
// element tree it returns.
export function withRecoloredOutline(
  StockPiece: (props?: { fill?: string; square?: string; svgStyle?: React.CSSProperties }) => React.ReactElement,
) {
  return function RecoloredPiece({ fill, outline, detail, svgStyle }: RecoloredPieceProps) {
    const rendered = StockPiece({ fill, svgStyle });
    return remapElement(rendered, outline, detail) as React.ReactElement;
  };
}

// The one place that actually builds a piece set for react-chessboard's
// `pieces` prop -- ChessBoard.tsx, LessonBoardPlayer.tsx, and Puzzles.tsx
// each used to have their own hand-copied version of this loop. Puzzles
// specifically kept showing pieces with no fill in production despite
// its copy looking byte-for-byte identical to the one that worked fine
// everywhere else, and the cause was never pinned down even after
// extensive isolated testing of the piece-rendering logic itself. Rather
// than keep hunting for how two "identical" copies could diverge, this
// removes the duplication outright: every board now calls this one
// function, so there is no second copy left to diverge from the first.
export function buildTintedPieceSet(opts: {
  pieceColors: { light: string; dark: string; baseLight: string; baseDark: string; finish: React.CSSProperties };
  pieceShape: string;
  pieceStyle: string;
  // Only ChessBoard.tsx has its own <defs> block with a dynamic gradient
  // for custom colors (see ChessBoard.tsx's cc-grad-custom-light/dark).
  // Other boards don't have that <defs> block, so a url(#...) reference
  // there would resolve to nothing -- they get the flat custom color
  // instead, same as any other flat-color style.
  useGradientForCustom?: boolean;
}): Record<string, (props?: { fill?: string; square?: string; svgStyle?: React.CSSProperties }) => React.ReactElement> {
  const { pieceColors: rawPieceColors, pieceShape, pieceStyle, useGradientForCustom } = opts;

  // Defensive fallback: if pieceColors is ever missing, empty, or
  // malformed for any reason (an upstream loading race, a corrupted
  // stored value, anything not yet root-caused), fall back to the same
  // colors Classic uses rather than let an invalid value silently
  // produce a piece with no fill. A wrong-but-visible color is a much
  // smaller problem than an invisible piece.
  const isValidHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
  // The actual fill (light/dark) legitimately can be a url(#...) gradient
  // reference instead of a hex color -- the Shaded/3D Wood/3D Marble/
  // Chrome presets all store their fill this way. The original version of
  // this check only accepted hex, which meant it was silently discarding
  // every gradient-preset fill as "invalid" and replacing it with a flat
  // fallback color -- a real regression this defensive check itself
  // introduced, not the bug it was meant to guard against. baseLight/
  // baseDark stay hex-only below since those specifically feed the
  // outline/detail color math, which needs a real color to blend, not a
  // paint-server reference.
  const isValidFill = (v: unknown): v is string => isValidHex(v) || (typeof v === 'string' && /^url\(#[\w-]+\)$/.test(v));
  const rawIsValid = isValidFill(rawPieceColors?.light) && isValidFill(rawPieceColors?.dark);
  if (!rawIsValid && typeof console !== 'undefined') {
    console.warn('[buildTintedPieceSet] pieceColors was missing/invalid, falling back to Classic colors. Received:', rawPieceColors);
  }
  const pieceColors = {
    light: isValidFill(rawPieceColors?.light) ? rawPieceColors.light : '#ffffff',
    dark: isValidFill(rawPieceColors?.dark) ? rawPieceColors.dark : '#2b2b2b',
    baseLight: isValidHex(rawPieceColors?.baseLight) ? rawPieceColors.baseLight : (isValidHex(rawPieceColors?.light) ? rawPieceColors.light : '#ffffff'),
    baseDark: isValidHex(rawPieceColors?.baseDark) ? rawPieceColors.baseDark : (isValidHex(rawPieceColors?.dark) ? rawPieceColors.dark : '#2b2b2b'),
    finish: rawPieceColors?.finish ?? {},
  };

  if (pieceShape === 'cburnett') {
    const wrapped: Record<string, (props?: any) => React.ReactElement> = {};
    for (const key of ['wP', 'wR', 'wN', 'wB', 'wQ', 'wK', 'bP', 'bR', 'bN', 'bB', 'bQ', 'bK']) {
      wrapped[key] = ({ svgStyle }: any = {}) => (
        <img src={`/pieces/cburnett/${key}.svg`} alt={key} style={{ width: '100%', height: '100%', ...svgStyle }} />
      );
    }
    return wrapped;
  }

  const lightScheme = getPieceColorScheme(pieceColors.baseLight);
  const darkScheme = getPieceColorScheme(pieceColors.baseDark);
  const wrapped: Record<string, (props?: any) => React.ReactElement> = {};
  for (const [key, PieceComponent] of Object.entries(defaultPieces)) {
    const isWhitePiece = key.startsWith('w');
    const scheme = isWhitePiece ? lightScheme : darkScheme;
    const fill = pieceStyle === 'custom' && useGradientForCustom
      ? `url(#cc-grad-custom-${isWhitePiece ? 'light' : 'dark'})`
      : (isWhitePiece ? pieceColors.light : pieceColors.dark);
    const Recolored = withRecoloredOutline(PieceComponent);
    wrapped[key] = (props?: any) => (
      <Recolored fill={fill} outline={scheme.outline} detail={scheme.detail} svgStyle={{ ...props?.svgStyle, ...pieceColors.finish }} />
    );
  }
  return wrapped;
}
