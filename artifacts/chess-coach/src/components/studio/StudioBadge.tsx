import React from 'react';
import { motion } from 'framer-motion';

// Content Studio graphics: the move badge (a glossy medallion with the glyph
// plus a ribbon with the word, a shine sweep and, for the big ones, a turning
// starburst behind), rank medallions for compilations, the countdown ring and
// the eval swing chip. Sized in em, so the parent's font size sets the scale.

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
export const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

export function Medallion({ glyph, color, size = 2.3, spin = false }: { glyph: React.ReactNode; color: string; size?: number; spin?: boolean }) {
  const light = shade(color, 0.38), dark = shade(color, -0.4);
  return (
    <motion.div initial={spin ? { rotateY: 180 } : false} animate={{ rotateY: 0 }} transition={{ duration: 0.55, ease: 'backOut' }}
      className="relative z-10 grid shrink-0 place-items-center rounded-full font-black text-white"
      style={{
        width: `${size}em`, height: `${size}em`,
        background: `radial-gradient(circle at 34% 26%, ${light} 0%, ${color} 52%, ${dark} 100%)`,
        border: `${size * 0.06}em solid #fff`,
        boxShadow: `inset 0 -${size * 0.07}em 0 ${alpha(dark, 0.6)}, inset 0 ${size * 0.05}em 0 rgba(255,255,255,.35), 0 ${size * 0.08}em ${size * 0.2}em rgba(0,0,0,.45)`,
      }}>
      <span className="pointer-events-none absolute inset-[9%] rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.38) 0%, rgba(255,255,255,0) 48%)' }} />
      <span className="relative leading-none" style={{ fontSize: `${size * (typeof glyph === 'string' && glyph.length >= 2 ? (glyph.length >= 3 ? 0.3 : 0.37) : 0.46)}em`, letterSpacing: '-0.04em', textShadow: `0 ${size * 0.03}em 0 ${dark}, 0 0 ${size * 0.12}em ${alpha(dark, 0.7)}` }}>{glyph}</span>
    </motion.div>
  );
}

/** The burst of rays that turns behind a big moment. */
export function Rays({ color, size = 8 }: { color: string; size?: number }) {
  const mask = 'radial-gradient(circle, #000 18%, transparent 68%)';
  return (
    <motion.div aria-hidden initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1, rotate: 360 }}
      transition={{ scale: { duration: 0.4 }, opacity: { duration: 0.4 }, rotate: { duration: 9, repeat: Infinity, ease: 'linear' } }}
      className="pointer-events-none absolute left-1/2 top-1/2 -z-10 rounded-full"
      style={{
        width: `${size}em`, height: `${size}em`, marginLeft: `-${size / 2}em`, marginTop: `-${size / 2}em`,
        background: `repeating-conic-gradient(${alpha(shade(color, 0.45), 0.75)} 0deg 9deg, transparent 9deg 24deg)`,
        maskImage: mask, WebkitMaskImage: mask,
      }} />
  );
}

export function StudioBadge({ glyph, text, color, rays = false }: { glyph: string; text: string; color: string; rays?: boolean }) {
  const light = shade(color, 0.3), dark = shade(color, -0.38);
  return (
    <div className="relative inline-flex items-center" style={{ filter: 'drop-shadow(0 0.22em 0.45em rgba(0,0,0,.55))' }}>
      {rays && <Rays color={color} size={6} />}
      <Medallion glyph={glyph} color={color} spin />
      <motion.div initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} transition={{ delay: 0.12, duration: 0.32, ease: 'backOut' }}
        className="relative overflow-hidden whitespace-nowrap font-black uppercase text-white"
        style={{
          transformOrigin: 'left center', marginLeft: '-0.9em', padding: '0.28em 0.75em 0.28em 1.25em',
          borderRadius: '0 0.55em 0.55em 0', border: '0.13em solid #fff', borderLeft: 'none',
          background: `linear-gradient(180deg, ${light} 0%, ${color} 52%, ${dark} 100%)`,
          boxShadow: `inset 0 -0.12em 0 ${alpha(dark, 0.55)}`, letterSpacing: '0.02em',
          textShadow: `0 0.06em 0 ${dark}`,
        }}>
        {text}
        <motion.span aria-hidden initial={{ x: '-130%' }} animate={{ x: '130%' }} transition={{ delay: 0.35, duration: 0.8, ease: 'easeInOut' }}
          className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,.7) 50%, transparent 70%)' }} />
      </motion.div>
    </div>
  );
}

/** #1 gold, #2 silver, #3 bronze, the rest ChessScout green. */
export const rankColor = (n: number) => (n === 1 ? '#E2A92B' : n === 2 ? '#9FA9B3' : n === 3 ? '#B87333' : '#81B64C');

/** The countdown: the number inside a ring that drains over the frame. */
export function CountdownRing({ n, seconds, color = '#81B64C' }: { n: number; seconds: number; color?: string }) {
  const R = 44, C = 2 * Math.PI * R;
  return (
    <div className="relative grid place-items-center" style={{ width: '1.6em', height: '1.6em' }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="rgba(8,12,10,.82)" stroke="rgba(255,255,255,.18)" strokeWidth="7" />
        <motion.circle key={n} cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={C} initial={{ strokeDashoffset: 0 }} animate={{ strokeDashoffset: C }} transition={{ duration: seconds, ease: 'linear' }} />
      </svg>
      <span className="relative font-black leading-none text-white" style={{ fontSize: '0.95em', textShadow: '0 0.04em 0.12em rgba(0,0,0,.7)' }}>{n}</span>
    </div>
  );
}

export function EvalSwing({ from, to, color }: { from: string; to: string; color: string }) {
  return (
    <motion.div initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }}
      className="mx-auto mt-[0.45em] flex w-fit items-center gap-[0.4em] rounded-full bg-black/80 px-[0.75em] py-[0.25em] font-black tabular-nums text-white ring-1 ring-white/25">
      <span className="text-[0.62em] tracking-wider text-white/55">EVAL</span>
      <span>{from}</span>
      <svg viewBox="0 0 24 24" className="h-[0.9em] w-[0.9em]" fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h15M13 6l6 6-6 6" /></svg>
      <span style={{ color: shade(color, 0.25) }}>{to}</span>
    </motion.div>
  );
}
