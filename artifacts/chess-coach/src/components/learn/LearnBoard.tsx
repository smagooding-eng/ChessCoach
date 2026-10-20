// Beginner path board: the student's own board colors and piece set (from
// Settings), with targets, move dots, hints and check highlights on top.

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings, boardSkin } from '@/context/SettingsContext';
import { buildTintedPieceSet } from '@/components/RecoloredPieces';
import { PieceGradientDefs } from '@/components/PieceGradientDefs';
import { FILES, sqToXY, type BoardPiece } from '@/lib/kids/levels';
import type { Arrow, Mark } from '@/lib/learn/explain';
import { useBoardPointer } from './useBoardPointer';

export interface LearnItem { id: string; sq: string; piece?: BoardPiece; target?: boolean }

export interface LearnBoardProps {
  items: LearnItem[];
  dots?: Set<string>;
  selected?: string | null;
  found?: Set<string>;
  shake?: { sq: string; n: number } | null;
  hint?: Set<string>;
  highlight?: Set<string>;
  danger?: string | null;
  coords?: boolean;
  onTap?: (sq: string) => void;
  accent?: string;
  arrows?: Arrow[];
  marks?: Mark[];
  /** Pieces that can be dragged (tap-to-move always works too). */
  canDrag?: (sq: string) => boolean;
  onDrop?: (from: string, to: string) => void;
}

function pos(sq: string) {
  const [x, y] = sqToXY(sq);
  return { left: `${x * 12.5}%`, top: `${(7 - y) * 12.5}%` };
}

export function TargetToken() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
      <circle cx="50" cy="50" r="30" fill="#e0a03a" stroke="#fff" strokeWidth="5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(224,160,58,0.45)" strokeWidth="4" />
      <path d="M50 33 L55 45 L68 46 L58 54 L61 67 L50 60 L39 67 L42 54 L32 46 L45 45 Z" fill="#fff" />
    </svg>
  );
}

export function LearnBoard({ items, dots, selected, found, shake, hint, highlight, danger, coords = true, onTap, accent = '#4a9eda', arrows, marks, canDrag, onDrop }: LearnBoardProps) {
  const { boardColors, boardTextureCss, pieceColors, pieceShape, pieceStyle } = useSettings();
  const skin = boardSkin(boardColors, boardTextureCss);
  const set = useMemo(() => buildTintedPieceSet({ pieceColors, pieceShape, pieceStyle }), [pieceColors, pieceShape, pieceStyle]);
  const squares: string[] = [];
  for (let y = 7; y >= 0; y--) for (let x = 0; x < 8; x++) squares.push(FILES[x] + (y + 1));
  const at = new Map(items.map((i) => [i.sq, i]));
  const ptr = useBoardPointer({ canDrag, onTap, onDrop });
  const dragItem = ptr.drag?.moved ? at.get(ptr.drag.from) : undefined;
  const DragComp = dragItem?.piece ? set[`${dragItem.piece.side}${dragItem.piece.type.toUpperCase()}`] : null;

  return (
    <div className="w-full mx-auto select-none" style={{ maxWidth: 520 }}>
      <PieceGradientDefs />
      <div ref={ptr.box} {...(onTap ? ptr.handlers : {})} className="relative w-full rounded-lg overflow-hidden"
        style={{ aspectRatio: '1 / 1', boxShadow: '0 10px 30px rgba(0,0,0,0.35)', touchAction: onTap ? 'none' : undefined, ...skin.boardStyle }}>
        <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
          {squares.map((sq) => {
            const [x, y] = sqToXY(sq);
            const dark = (x + y) % 2 === 0;
            const item = at.get(sq);
            const label = item?.piece ? `${sq}, ${item.piece.side === 'w' ? 'white' : 'black'} ${item.piece.type}` : item?.target ? `${sq}, target` : sq;
            return (
              <button key={sq} type="button" aria-label={label} onClick={(e) => ptr.keyTap(sq, e.detail)} disabled={!onTap}
                className="relative outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                style={{ ...(dark ? skin.darkSquareStyle : skin.lightSquareStyle), WebkitTapHighlightColor: 'transparent', cursor: onTap ? 'pointer' : 'default' }}>
                {highlight?.has(sq) && <span className="absolute inset-0" style={{ background: `${accent}55` }} />}
                {selected === sq && <span className="absolute inset-0" style={{ background: 'rgba(255,214,80,0.5)' }} />}
                {hint?.has(sq) && (
                  <motion.span className="absolute inset-[8%] rounded-md" style={{ border: `3px dashed ${accent}`, background: `${accent}22` }}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
                )}
                {danger === sq && (
                  <motion.span className="absolute inset-0" style={{ background: 'radial-gradient(circle, rgba(235,64,52,0.9) 0%, rgba(235,64,52,0.15) 72%)' }}
                    animate={{ opacity: [0.65, 1, 0.65] }} transition={{ duration: 0.9, repeat: Infinity }} />
                )}
                {coords && x === 0 && (
                  <span className="absolute top-0.5 left-1 text-[10px] font-bold leading-none" style={{ color: dark ? boardColors.light : boardColors.dark }}>{y + 1}</span>
                )}
                {coords && y === 0 && (
                  <span className="absolute bottom-0.5 right-1 text-[10px] font-bold leading-none" style={{ color: dark ? boardColors.light : boardColors.dark }}>{FILES[x]}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="absolute inset-0 pointer-events-none">
          {dots && [...dots].map((sq) => (
            <span key={`d-${sq}`} className="absolute flex items-center justify-center" style={{ ...pos(sq), width: '12.5%', height: '12.5%' }}>
              {at.has(sq)
                ? <span className="absolute inset-[3%] rounded-full" style={{ border: '4px solid rgba(91,184,91,0.85)' }} />
                : <span className="rounded-full" style={{ width: '30%', height: '30%', background: 'rgba(91,184,91,0.85)', boxShadow: '0 0 0 2px rgba(255,255,255,0.6)' }} />}
            </span>
          ))}
        </div>

        <div className="absolute inset-0 pointer-events-none">
          <AnimatePresence>
            {items.map((it) => {
              const isFound = found?.has(it.sq);
              const shaking = shake?.sq === it.sq;
              const Comp = it.piece ? set[`${it.piece.side}${it.piece.type.toUpperCase()}`] : null;
              return (
                <motion.div key={it.id} className="absolute flex items-center justify-center" style={{ width: '12.5%', height: '12.5%' }}
                  initial={{ ...pos(it.sq), opacity: 0, scale: 0.6 }} animate={{ ...pos(it.sq), opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.4, transition: { duration: 0.25 } }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
                  <motion.div className={it.target ? 'w-[62%] h-[62%]' : 'w-full h-full'} key={shaking ? `s${shake?.n}` : 'still'}
                    animate={shaking ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.4 }}
                    style={{ opacity: isFound || dragItem === it ? 0.3 : 1 }}>
                    {Comp && Comp({ svgStyle: { width: '100%', height: '100%' } })}
                    {it.target && <TargetToken />}
                  </motion.div>
                  {isFound && (
                    <motion.span className="absolute w-[42%] h-[42%] rounded-full flex items-center justify-center"
                      style={{ background: '#5bb85b', border: '2px solid #fff' }}
                      initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }}>
                      <svg viewBox="0 0 24 24" className="w-[70%] h-[70%]" aria-hidden="true"><path d="M5 12.5 L10 17 L19 7" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </motion.span>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        <ArrowLayer arrows={arrows ?? []} marks={marks ?? []} />
        {DragComp && ptr.drag && (
          <div className="absolute pointer-events-none z-10" style={{ left: ptr.drag.x, top: ptr.drag.y, width: '12.5%', height: '12.5%', transform: 'translate(-50%, -60%) scale(1.15)' }}>
            {DragComp({ svgStyle: { width: '100%', height: '100%' } })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Board items from a FEN's piece placement (no legality check, so diagrams can show a lone piece). */
export function fenItems(fen: string): LearnItem[] {
  const out: LearnItem[] = [];
  fen.split(' ')[0].split('/').forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      const sq = FILES[f] + String(8 - r);
      const side = ch === ch.toUpperCase() ? 'w' : 'b';
      out.push({ id: sq, sq, piece: { type: ch.toLowerCase() as BoardPiece['type'], side, sq } });
      f++;
    }
  });
  return out;
}

const ARROW_COLORS: Record<string, string> = { good: '#5bb85b', bad: '#e5484d', info: '#4a9eda', warn: '#f0a030' };

function center(sq: string) {
  const [x, y] = sqToXY(sq);
  return [x * 100 + 50, (7 - y) * 100 + 50];
}

/** Arrows and marks drawn over the board (lichess-style, slightly see-through). */
export function ArrowLayer({ arrows, marks }: { arrows: Arrow[]; marks: Mark[] }) {
  if (!arrows.length && !marks.length) return null;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 800" aria-hidden="true">
      <defs>
        {Object.entries(ARROW_COLORS).map(([k, c]) => (
          <marker key={k} id={`lb-head-${k}`} viewBox="0 0 10 10" refX="5.5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" fill={c} />
          </marker>
        ))}
      </defs>
      {arrows.map((a, i) => {
        const [x1, y1] = center(a.from);
        const [x2, y2] = center(a.to);
        const c = ARROW_COLORS[a.color];
        const common = { stroke: c, strokeWidth: 15, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
          markerEnd: `url(#lb-head-${a.color})`, strokeDasharray: a.dashed ? '1 26' : undefined, opacity: a.color === 'info' ? 0.7 : 0.85 };
        if (a.knight) {
          // long leg first, then the short one
          const [fx, fy] = sqToXY(a.from); const [tx, ty] = sqToXY(a.to);
          const longX = Math.abs(tx - fx) === 2;
          const [cx, cy] = longX ? [x2, y1] : [x1, y2];
          const shorten = (ax: number, ay: number, bx: number, by: number, d: number) => {
            const len = Math.hypot(bx - ax, by - ay) || 1; return [bx - ((bx - ax) / len) * d, by - ((by - ay) / len) * d];
          };
          const [ex, ey] = shorten(cx, cy, x2, y2, 22);
          return <motion.path key={i} d={`M${x1} ${y1} L${cx} ${cy} L${ex} ${ey}`} {...common}
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: i * 0.04 }} />;
        }
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
        const sx = x1 + ux * 18, sy = y1 + uy * 18, ex = x2 - ux * 22, ey = y2 - uy * 22;
        return <motion.path key={i} d={`M${sx} ${sy} L${ex} ${ey}`} {...common}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: i * 0.04 }} />;
      })}
      {marks.map((m, i) => {
        const [x, y] = center(m.sq);
        return m.kind === 'x'
          ? <g key={`m${i}`} stroke="#e5484d" strokeWidth="12" strokeLinecap="round" opacity="0.9"><path d={`M${x - 24} ${y - 24} L${x + 24} ${y + 24} M${x + 24} ${y - 24} L${x - 24} ${y + 24}`} /></g>
          : <circle key={`m${i}`} cx={x} cy={y} r="44" fill="none" stroke="#f0a030" strokeWidth="8" opacity="0.9" />;
      })}
    </svg>
  );
}
