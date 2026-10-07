import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Chess } from 'chess.js';
import { squareBox } from './SquareBadge';

/** Both kings' squares when `fen` is checkmate, else null. */
export function checkmateSquares(fen: string): { winningKingSquare: string; losingKingSquare: string } | null {
  try {
    const c = new Chess(fen);
    if (!c.isCheckmate()) return null;
    const loser = c.turn();
    let losingKingSquare = '', winningKingSquare = '';
    c.board().forEach((row, r) => row.forEach((sq, f) => {
      if (sq?.type === 'k') {
        const s = `${'abcdefgh'[f]}${8 - r}`;
        if (sq.color === loser) losingKingSquare = s; else winningKingSquare = s;
      }
    }));
    return losingKingSquare && winningKingSquare ? { winningKingSquare, losingKingSquare } : null;
  } catch { return null; }
}

// Premium checkmate presentation, used by every board (classic and enhanced UI):
//  - winning king: a glowing gold square and a gold crown medallion in the corner
//  - mated king: a deep crimson square glow and a crimson "#" medallion
//  - a short "Checkmate" ribbon across the board that settles away after a moment,
//    so the final position is left clear to look at.
// Everything is inline SVG/CSS -- no image assets to load.

function Crown() {
  return (
    <path d="M22 66 L18 36 L36 50 L50 28 L64 50 L82 36 L78 66 Z M24 72 H76 V78 H24 Z" fill="#3B2A05" />
  );
}

function Medallion({ kind }: { kind: 'win' | 'loss' }) {
  const id = `cm-${kind}`;
  const win = kind === 'win';
  return (
    <svg viewBox="0 0 100 100" className="absolute" style={{ right: '-4%', top: '-4%', width: '46%', height: '46%', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.6))' }}>
      <defs>
        <radialGradient id={`${id}-g`} cx="35%" cy="30%" r="75%">
          {win ? (
            <>
              <stop offset="0%" stopColor="#FFF4C2" />
              <stop offset="45%" stopColor="#F2C14E" />
              <stop offset="100%" stopColor="#A86E10" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#FF9A9A" />
              <stop offset="45%" stopColor="#D32F3A" />
              <stop offset="100%" stopColor="#6E0E16" />
            </>
          )}
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill={`url(#${id}-g)`} stroke={win ? '#FFE9A3' : '#FFC2C2'} strokeWidth="5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke={win ? 'rgba(80,50,0,.35)' : 'rgba(60,0,0,.35)'} strokeWidth="2" />
      {win ? <Crown /> : (
        <text x="50" y="53" textAnchor="middle" dominantBaseline="central" fill="#fff" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="58">#</text>
      )}
    </svg>
  );
}

export function CheckmateOverlay({ winningKingSquare, losingKingSquare, flipped, positionKey }: {
  winningKingSquare: string;
  losingKingSquare: string;
  flipped: boolean;
  /** Changes when a new mate position arrives, to replay the ribbon. */
  positionKey: string;
}) {
  const [ribbon, setRibbon] = useState(true);
  useEffect(() => {
    setRibbon(true);
    const t = setTimeout(() => setRibbon(false), 2200);
    return () => clearTimeout(t);
  }, [positionKey]);

  return (
    <>
      {/* square glows */}
      <div className="absolute pointer-events-none" style={{ ...squareBox(winningKingSquare, flipped), width: '12.5%', height: '12.5%',
        background: 'radial-gradient(circle at 50% 55%, rgba(255,214,102,.55) 0%, rgba(242,193,78,.28) 45%, rgba(242,193,78,0) 75%)',
        boxShadow: 'inset 0 0 0 2px rgba(255,221,130,.85)' }} />
      <div className="absolute pointer-events-none" style={{ ...squareBox(losingKingSquare, flipped), width: '12.5%', height: '12.5%',
        background: 'radial-gradient(circle at 50% 55%, rgba(255,60,70,.55) 0%, rgba(200,30,45,.30) 45%, rgba(200,30,45,0) 75%)',
        boxShadow: 'inset 0 0 0 2px rgba(255,120,120,.85)' }} />

      {/* medallions */}
      <motion.div className="absolute pointer-events-none z-20" style={{ ...squareBox(winningKingSquare, flipped), width: '12.5%', height: '12.5%' }}
        initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.15 }}>
        <Medallion kind="win" />
      </motion.div>
      <motion.div className="absolute pointer-events-none z-20" style={{ ...squareBox(losingKingSquare, flipped), width: '12.5%', height: '12.5%' }}
        initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.05 }}>
        <Medallion kind="loss" />
      </motion.div>

      {/* ribbon */}
      <AnimatePresence>
        {ribbon && (
          <motion.div key={positionKey} className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none" style={{ containerType: 'inline-size' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
            <motion.div
              initial={{ scaleX: 0.2, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} exit={{ scaleX: 0.6, opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
              className="w-full py-[3.5%] text-center"
              style={{
                background: 'linear-gradient(90deg, rgba(10,8,2,0) 0%, rgba(10,8,2,.82) 18%, rgba(10,8,2,.82) 82%, rgba(10,8,2,0) 100%)',
                borderTop: '1px solid rgba(242,193,78,.55)', borderBottom: '1px solid rgba(242,193,78,.55)',
              }}>
              <span style={{
                fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700, letterSpacing: '0.22em',
                fontSize: 'clamp(18px, 6.5cqw, 40px)',
                background: 'linear-gradient(180deg, #FFF3C4 0%, #F2C14E 55%, #B57C14 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                textShadow: '0 2px 18px rgba(242,193,78,.25)',
              }}>CHECKMATE</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
