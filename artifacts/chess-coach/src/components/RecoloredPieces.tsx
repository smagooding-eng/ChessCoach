import React from 'react';

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
