// Chess for Kids -- the big, friendly board.

import { motion, AnimatePresence } from 'framer-motion';
import { KidPiece, KidShape, KidBush } from './KidsArt';
import { FILES, sqToXY, type BoardPiece, type ShapeKind } from '@/lib/kids/levels';
import { useBoardPointer } from '@/components/learn/useBoardPointer';
import { ArrowLayer } from '@/components/learn/LearnBoard';
import type { Arrow } from '@/lib/learn/explain';

export interface BoardItem {
  id: string;
  sq: string;
  piece?: BoardPiece;
  shape?: ShapeKind;
  bush?: boolean;
}

export interface KidsBoardProps {
  items: BoardItem[];
  frame: string;
  dots?: Set<string>;
  selected?: string | null;
  found?: Set<string>;        // shapes the child already tapped correctly
  shake?: { sq: string; n: number } | null;
  hint?: Set<string>;         // squares lit up to show where the piece goes
  danger?: string | null;     // a king in check
  bounce?: string | null;     // the piece that's "alive" (gently bobs)
  onTap: (sq: string) => void;
  canDrag?: (sq: string) => boolean;
  onDrop?: (from: string, to: string) => void;
  /** Arrows over the board (attacks, threats, the last move). */
  arrows?: Arrow[];
}

const LIGHT = '#FFF7E3';
const DARK = '#9EDCB9';

function pos(sq: string) {
  const [x, y] = sqToXY(sq);
  return { left: `${x * 12.5}%`, top: `${(7 - y) * 12.5}%` };
}

export function KidsBoard({ items, frame, dots, selected, found, shake, hint, danger, bounce, onTap, canDrag, onDrop, arrows }: KidsBoardProps) {
  const squares: string[] = [];
  for (let y = 7; y >= 0; y--) for (let x = 0; x < 8; x++) squares.push(FILES[x] + (y + 1));
  const at = new Map(items.map((i) => [i.sq, i]));
  const ptr = useBoardPointer({ canDrag, onTap, onDrop });
  const dragItem = ptr.drag?.moved ? at.get(ptr.drag.from) : undefined;

  return (
    <div className="w-full mx-auto select-none" style={{ maxWidth: 520 }}>
      <div className="rounded-[26px] p-2" style={{ background: frame, boxShadow: '0 8px 0 rgba(47,34,87,0.22), inset 0 3px 0 rgba(255,255,255,0.35)' }}>
        <div ref={ptr.box} {...ptr.handlers} className="relative w-full rounded-[18px] overflow-hidden" style={{ aspectRatio: '1 / 1', touchAction: 'none' }}>
          {/* squares */}
          <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
            {squares.map((sq) => {
              const [x, y] = sqToXY(sq);
              const dark = (x + y) % 2 === 0;
              const item = at.get(sq);
              const label = item?.piece ? `${sq}, ${item.piece.side === 'w' ? 'your' : 'plum'} piece`
                : item?.shape ? `${sq}, ${item.shape}` : item?.bush ? `${sq}, bush` : sq;
              return (
                <button key={sq} type="button" data-sq={sq} aria-label={label} onClick={(e) => ptr.keyTap(sq, e.detail)}
                  className="relative outline-none focus-visible:ring-4 focus-visible:ring-white/80"
                  style={{ background: dark ? DARK : LIGHT, WebkitTapHighlightColor: 'transparent' }}>
                  {selected === sq && <span className="absolute inset-0" style={{ background: 'rgba(255,214,92,0.65)' }} />}
                  {hint?.has(sq) && (
                    <motion.span className="absolute inset-[6%] rounded-xl" style={{ background: 'rgba(148,121,224,0.30)', border: '3px dashed rgba(108,81,194,0.55)' }}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
                  )}
                  {danger === sq && (
                    <motion.span className="absolute inset-0" style={{ background: 'radial-gradient(circle, rgba(255,80,80,0.85) 0%, rgba(255,80,80,0.15) 70%)' }}
                      animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 0.9, repeat: Infinity }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* move dots */}
          <div className="absolute inset-0 pointer-events-none">
            {dots && [...dots].map((sq) => {
              const occupied = at.has(sq);
              return (
                <motion.span key={`dot-${sq}`} className="absolute flex items-center justify-center"
                  style={{ ...pos(sq), width: '12.5%', height: '12.5%' }}
                  initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}>
                  {occupied
                    ? <span className="absolute inset-[4%] rounded-full" style={{ border: '5px solid rgba(108,81,194,0.45)' }} />
                    : <span className="rounded-full" style={{ width: '30%', height: '30%', background: 'rgba(108,81,194,0.38)' }} />}
                </motion.span>
              );
            })}
          </div>

          {/* things on the board */}
          <div className="absolute inset-0 pointer-events-none">
            <AnimatePresence>
              {items.map((it) => {
                const isFound = !!it.shape && found?.has(it.sq);
                const shaking = shake?.sq === it.sq;
                return (
                  <motion.div key={it.id} className="absolute flex items-center justify-center"
                    style={{ width: '12.5%', height: '12.5%' }}
                    initial={{ ...pos(it.sq), scale: 0, opacity: 0 }}
                    animate={{ ...pos(it.sq), scale: 1, opacity: 1 }}
                    exit={{ scale: 1.6, opacity: 0, rotate: 20, transition: { duration: 0.35 } }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
                    <motion.div className="w-[96%] h-[96%] flex items-center justify-center"
                      key={shaking ? `s${shake?.n}` : 'still'}
                      animate={shaking ? { x: [0, -7, 7, -5, 5, 0] } : bounce === it.sq ? { y: [0, -4, 0] } : { y: 0 }}
                      transition={shaking ? { duration: 0.45 } : { duration: 1.6, repeat: bounce === it.sq ? Infinity : 0, ease: 'easeInOut' }}>
                      <div className="w-full h-full" style={{ opacity: isFound ? 0.35 : dragItem === it ? 0.3 : 1, transition: 'opacity .3s' }}>
                        {it.piece && <KidPiece type={it.piece.type} side={it.piece.side} size="100%"
                          mood={danger === it.sq ? 'wow' : undefined} />}
                        {it.shape && <KidShape kind={it.shape} size="100%" />}
                        {it.bush && <KidBush size="100%" />}
                      </div>
                    </motion.div>
                    {isFound && (
                      <motion.span className="absolute w-[46%] h-[46%] rounded-full flex items-center justify-center"
                        style={{ background: '#2FBF71', border: '3px solid #fff', boxShadow: '0 3px 0 rgba(0,0,0,0.15)' }}
                        initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
                        <svg viewBox="0 0 24 24" className="w-[70%] h-[70%]" aria-hidden="true"><path d="M5 12.5 L10 17 L19 7" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </motion.span>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          {arrows && arrows.length > 0 && <ArrowLayer arrows={arrows} marks={[]} />}
          {dragItem?.piece && ptr.drag && (
            <div className="absolute pointer-events-none z-10" style={{ left: ptr.drag.x, top: ptr.drag.y, width: '12.5%', height: '12.5%', transform: 'translate(-50%, -60%) scale(1.2)' }}>
              <KidPiece type={dragItem.piece.type} side={dragItem.piece.side} size="100%" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
