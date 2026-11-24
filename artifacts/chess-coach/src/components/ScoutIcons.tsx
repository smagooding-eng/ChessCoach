// ChessScout's icon set: polished metal and ivory (gold, silver, ivory and green) with soft
// shading, drawn as vectors so they stay sharp at any size. One component per icon name;
// <ScoutIcon name="openings" size={28} />. Gradient ids are unique per use (useId).
import React, { useId } from 'react';

type P = { size?: number; className?: string; style?: React.CSSProperties };
type G = (k: string) => string; // gradient url for a material

const MATS: Record<string, [string, string, string]> = {
  gold: ['#FFF0B0', '#F2C14E', '#B07A1E'],
  silver: ['#FFFFFF', '#D5DBDA', '#8E9998'],
  ivory: ['#FFFDF3', '#EFE6CC', '#B9AC86'],
  green: ['#C6EC8F', '#86BE4E', '#3F6E22'],
  red: ['#FF9C8F', '#E8524A', '#9E2A25'],
  blue: ['#BFE3FF', '#5AA8E8', '#255F9E'],
  dark: ['#4A5557', '#2B3335', '#151B1C'],
};

function Base({ size = 28, className, style, draw }: P & { draw: (g: G, id: string) => React.ReactNode }) {
  const id = useId().replace(/:/g, '');
  const g: G = (k) => `url(#${id}-${k})`;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} style={style} aria-hidden="true">
      <defs>
        {Object.entries(MATS).map(([k, [a, b, c]]) => (
          <linearGradient key={k} id={`${id}-${k}`} x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor={a} /><stop offset="0.45" stopColor={b} /><stop offset="1" stopColor={c} />
          </linearGradient>
        ))}
        <radialGradient id={`${id}-shine`} cx="0.35" cy="0.25" r="0.6"><stop offset="0" stopColor="#fff" stopOpacity=".75" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <filter id={`${id}-sh`} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.2" floodColor="#000" floodOpacity=".45" /></filter>
      </defs>
      <g filter={`url(#${id}-sh)`}>{draw(g, id)}</g>
    </svg>
  );
}
const E = 'rgba(0,0,0,.35)'; // edge
const HL = 'rgba(255,255,255,.55)'; // highlight

const book = (g: G, page = 'ivory', cover = 'gold') => <>
  <path d="M4 12c6-3 13-2.5 20 1.5V40c-7-4-14-4.5-20-1.5z" fill={g(cover)} stroke={E} strokeWidth=".8" />
  <path d="M44 12c-6-3-13-2.5-20 1.5V40c7-4 14-4.5 20-1.5z" fill={g(cover)} stroke={E} strokeWidth=".8" />
  <path d="M6 11c5.5-2.6 12-2.2 18 1.4V37c-6-3.4-12.5-3.8-18-1.4z" fill={g(page)} />
  <path d="M42 11c-5.5-2.6-12-2.2-18 1.4V37c6-3.4 12.5-3.8 18-1.4z" fill={g(page)} />
  <path d="M9 17c4-1 8-.6 12 1M9 22c4-1 8-.6 12 1M9 27c4-1 8-.6 12 1M27 18c4-1.6 8-2 12-1M27 23c4-1.6 8-2 12-1M27 28c4-1.6 8-2 12-1" stroke="#B9AC86" strokeWidth="1.1" fill="none" strokeLinecap="round" />
  <path d="M24 12.4V37" stroke={E} strokeWidth="1" />
</>;
const king = (g: G, m = 'ivory') => <>
  <path d="M22.5 4h3v3h3v3h-3v3h-3v-3h-3V7h3z" fill={g('gold')} stroke={E} strokeWidth=".6" />
  <path d="M15 20c0-4.4 4-7.5 9-7.5s9 3.1 9 7.5c0 3-2 5-3.4 6.5H18.4C17 25 15 23 15 20z" fill={g(m)} stroke={E} strokeWidth=".8" />
  <path d="M17 39l2.4-10.5h9.2L31 39z" fill={g(m)} stroke={E} strokeWidth=".8" />
  <rect x="17" y="26" width="14" height="3.4" rx="1.2" fill={g('gold')} stroke={E} strokeWidth=".6" />
  <rect x="12" y="38.5" width="24" height="5" rx="2" fill={g(m)} stroke={E} strokeWidth=".8" />
  <path d="M18.5 17.5c1-2 3-3 5.5-3.2" stroke={HL} strokeWidth="1.6" fill="none" strokeLinecap="round" />
</>;
const knight = (g: G, m = 'gold') => <>
  <path d="M14 40c0-7 3-10 7-13-3 .3-5.5 1.6-7.4 3.5L10.5 27c1-5 4.5-9 8-12l-1-4.5 4 2.3c7-2 13.5 2 15.5 10.5 1.5 6.5-.5 12-2 16.7z" fill={g(m)} stroke={E} strokeWidth=".9" strokeLinejoin="round" />
  <circle cx="22.5" cy="19" r="1.5" fill="#2B2216" />
  <path d="M27 14.5c4 1.5 6.5 5 7.3 10" stroke={HL} strokeWidth="1.6" fill="none" strokeLinecap="round" />
  <rect x="11" y="38.5" width="26" height="5" rx="2" fill={g(m)} stroke={E} strokeWidth=".8" />
</>;
const crown = (g: G) => <>
  <path d="M6 16l9 8 9-14 9 14 9-8-3.5 20h-25z" fill={g('gold')} stroke={E} strokeWidth=".9" strokeLinejoin="round" />
  <rect x="9" y="35" width="30" height="6" rx="2.4" fill={g('gold')} stroke={E} strokeWidth=".8" />
  <circle cx="24" cy="28" r="3" fill={g('red')} /><circle cx="15" cy="30" r="2" fill={g('green')} /><circle cx="33" cy="30" r="2" fill={g('blue')} />
  <circle cx="6" cy="15" r="2.2" fill={g('gold')} /><circle cx="24" cy="9" r="2.2" fill={g('gold')} /><circle cx="42" cy="15" r="2.2" fill={g('gold')} />
  <path d="M12 36.5h24" stroke={HL} strokeWidth="1.3" strokeLinecap="round" />
</>;
const trophy = (g: G) => <>
  <path d="M13 6h22v10c0 7-5 12-11 12S13 23 13 16z" fill={g('gold')} stroke={E} strokeWidth=".9" />
  <path d="M13 9H6c0 6 3 10 8 10.5M35 9h7c0 6-3 10-8 10.5" fill="none" stroke={g('gold')} strokeWidth="3" />
  <path d="M21 27h6l1 7h-8z" fill={g('gold')} stroke={E} strokeWidth=".6" />
  <rect x="14" y="34" width="20" height="8" rx="2" fill={g('dark')} stroke={E} strokeWidth=".6" />
  <rect x="18" y="36.5" width="12" height="3" rx="1" fill={g('gold')} />
  <path d="M17 9c0 4 1 8 3.5 10.5" stroke={HL} strokeWidth="1.8" fill="none" strokeLinecap="round" />
</>;
const bars = (g: G, m = 'green') => <>
  <rect x="6" y="26" width="9" height="16" rx="2" fill={g(m)} stroke={E} strokeWidth=".8" />
  <rect x="19.5" y="16" width="9" height="26" rx="2" fill={g(m)} stroke={E} strokeWidth=".8" />
  <rect x="33" y="6" width="9" height="36" rx="2" fill={g('gold')} stroke={E} strokeWidth=".8" />
  <path d="M8 28v11M21.5 18v20M35 8v30" stroke={HL} strokeWidth="1.4" strokeLinecap="round" />
</>;
const target = (g: G) => <>
  <circle cx="24" cy="24" r="17" fill={g('green')} stroke={E} strokeWidth=".9" />
  <circle cx="24" cy="24" r="11.5" fill={g('ivory')} />
  <circle cx="24" cy="24" r="6.5" fill={g('gold')} stroke={E} strokeWidth=".6" />
  <path d="M24 3v8M24 37v8M3 24h8M37 24h8" stroke={g('dark')} strokeWidth="3" strokeLinecap="round" />
  <circle cx="22.5" cy="22.5" r="2" fill={HL} />
</>;
const swords = (g: G) => <>
  <path d="M8 6l4-1 20 21-3 3L8 9z" fill={g('silver')} stroke={E} strokeWidth=".7" />
  <path d="M40 6l-4-1-20 21 3 3 21-20z" fill={g('silver')} stroke={E} strokeWidth=".7" />
  <path d="M10 34l6-6 4 4-6 6zM38 34l-6-6-4 4 6 6z" fill={g('gold')} stroke={E} strokeWidth=".6" />
  <path d="M7 40l5-5M41 40l-5-5" stroke={g('dark')} strokeWidth="4" strokeLinecap="round" />
  <circle cx="6.5" cy="41.5" r="2.6" fill={g('gold')} /><circle cx="41.5" cy="41.5" r="2.6" fill={g('gold')} />
  <path d="M11 8l16 17M37 8L21 25" stroke={HL} strokeWidth="1" />
</>;
const bell = (g: G) => <>
  <path d="M24 6c-7 0-12 5-12 12v8l-4 7h32l-4-7v-8c0-7-5-12-12-12z" fill={g('gold')} stroke={E} strokeWidth=".9" strokeLinejoin="round" />
  <circle cx="24" cy="38" r="4" fill={g('gold')} stroke={E} strokeWidth=".6" /><circle cx="24" cy="5" r="2.2" fill={g('gold')} />
  <path d="M16.5 17c.5-4 3-6.5 6.5-7" stroke={HL} strokeWidth="1.8" fill="none" strokeLinecap="round" />
</>;
const board = (g: G) => <>
  <rect x="5" y="5" width="38" height="38" rx="4" fill={g('ivory')} stroke={E} strokeWidth=".9" />
  {Array.from({ length: 16 }, (_, i) => { const r = Math.floor(i / 4), c = i % 4; return (r + c) % 2 ? null : <rect key={i} x={7 + c * 8.5} y={7 + r * 8.5} width="8.5" height="8.5" fill={g('green')} />; })}
  <rect x="5" y="5" width="38" height="38" rx="4" fill="none" stroke={g('gold')} strokeWidth="2.2" />
</>;

const D: Record<string, (g: G, id: string) => React.ReactNode> = {
  openings: (g) => book(g),
  articles: (g) => <>
    <rect x="7" y="8" width="28" height="33" rx="3" fill={g('ivory')} stroke={E} strokeWidth=".8" />
    <path d="M35 14h6v23a4 4 0 0 1-4 4h-2z" fill={g('silver')} stroke={E} strokeWidth=".6" />
    <rect x="11" y="12" width="20" height="8" rx="1.5" fill={g('green')} />
    <path d="M11 25h20M11 30h20M11 35h13" stroke="#A89C78" strokeWidth="1.8" strokeLinecap="round" />
  </>,
  tactics: (g) => swords(g),
  endgames: (g) => king(g, 'silver'),
  progress: (g) => bars(g),
  'report-card': (g) => <>
    <rect x="8" y="5" width="32" height="38" rx="3.5" fill={g('ivory')} stroke={E} strokeWidth=".8" />
    <rect x="16" y="3" width="16" height="6" rx="2" fill={g('silver')} stroke={E} strokeWidth=".6" />
    <rect x="13" y="28" width="5" height="10" rx="1" fill={g('green')} /><rect x="21.5" y="22" width="5" height="16" rx="1" fill={g('green')} /><rect x="30" y="16" width="5" height="22" rx="1" fill={g('gold')} />
    <path d="M13 14h14" stroke="#A89C78" strokeWidth="2" strokeLinecap="round" />
  </>,
  puzzles: (g) => <>
    <path d="M7 15h9a4.5 4.5 0 1 1 9 0h9v9a4.5 4.5 0 1 1 0 9v9H7z" fill={g('gold')} stroke={E} strokeWidth=".9" strokeLinejoin="round" />
    <path d="M10 19v19" stroke={HL} strokeWidth="1.8" strokeLinecap="round" /><path d="M18.5 12.5a3 3 0 0 1 4.5-1" stroke={HL} strokeWidth="1.4" fill="none" strokeLinecap="round" />
  </>,
  'quick-puzzles': (g) => <>
    <path d="M27 3L9 27h12l-4 18 22-26H27z" fill={g('gold')} stroke={E} strokeWidth=".9" strokeLinejoin="round" />
    <path d="M25 8L14 24" stroke={HL} strokeWidth="1.6" strokeLinecap="round" />
  </>,
  'chess-traps': (g) => <>
    <path d="M6 30c2-9 9-15 18-15s16 6 18 15z" fill={g('silver')} stroke={E} strokeWidth=".8" />
    <path d="M8 30l3-8 3 6 3-9 3 8 4-10 4 10 3-8 3 9 3-6 3 8" fill={g('gold')} stroke={E} strokeWidth=".6" strokeLinejoin="round" />
    <ellipse cx="24" cy="33" rx="19" ry="6" fill={g('silver')} stroke={E} strokeWidth=".8" />
    <ellipse cx="24" cy="32" rx="12" ry="2.6" fill={g('dark')} />
    <circle cx="24" cy="32" r="2.4" fill={g('gold')} />
  </>,
  courses: (g) => <>
    <path d="M24 9L45 18 24 27 3 18z" fill={g('dark')} stroke={E} strokeWidth=".8" />
    <path d="M12 22.5V31c0 3.6 5.4 6.5 12 6.5s12-2.9 12-6.5v-8.5L24 28z" fill={g('silver')} stroke={E} strokeWidth=".8" />
    <path d="M24 18l15 3v12" stroke={g('gold')} strokeWidth="1.8" fill="none" /><circle cx="39" cy="34.5" r="2.8" fill={g('gold')} />
    <path d="M14 18.5l10-4.5" stroke={HL} strokeWidth="1.3" strokeLinecap="round" />
  </>,
  'practice-bots': (g) => <>
    <path d="M24 3v6" stroke={g('silver')} strokeWidth="2.4" /><circle cx="24" cy="4" r="3" fill={g('red')} />
    <rect x="8" y="10" width="32" height="27" rx="8" fill={g('silver')} stroke={E} strokeWidth=".9" />
    <rect x="12.5" y="16" width="23" height="12" rx="6" fill={g('dark')} />
    <circle cx="19" cy="22" r="3" fill={g('green')} /><circle cx="29" cy="22" r="3" fill={g('green')} />
    <rect x="3.5" y="19" width="4.5" height="10" rx="2" fill={g('gold')} /><rect x="40" y="19" width="4.5" height="10" rx="2" fill={g('gold')} />
    <rect x="15" y="38" width="18" height="5" rx="2" fill={g('gold')} stroke={E} strokeWidth=".6" />
    <path d="M12 15c2-2.5 5-3.5 8-3.5" stroke={HL} strokeWidth="1.6" fill="none" strokeLinecap="round" />
  </>,
  'play-online': (g) => <>
    <circle cx="24" cy="24" r="19" fill={g('green')} stroke={E} strokeWidth=".9" />
    <path d="M19 14.5v19l15-9.5z" fill={g('ivory')} stroke={E} strokeWidth=".6" strokeLinejoin="round" />
    <path d="M11 17c2-5 6-8 11-9" stroke={HL} strokeWidth="2" fill="none" strokeLinecap="round" />
  </>,
  'watch-live': (g) => <>
    <circle cx="24" cy="24" r="5" fill={g('red')} stroke={E} strokeWidth=".6" />
    <path d="M16 16a11.3 11.3 0 0 0 0 16M32 16a11.3 11.3 0 0 1 0 16" stroke={g('green')} strokeWidth="3.4" fill="none" strokeLinecap="round" />
    <path d="M10 10a19.8 19.8 0 0 0 0 28M38 10a19.8 19.8 0 0 1 0 28" stroke={g('green')} strokeWidth="3.4" fill="none" strokeLinecap="round" />
  </>,
  friends: (g) => <>
    <circle cx="31" cy="15" r="6.5" fill={g('ivory')} stroke={E} strokeWidth=".7" />
    <path d="M20 41c.5-8 5-13 11-13s10.5 5 11 13z" fill={g('ivory')} stroke={E} strokeWidth=".7" />
    <circle cx="17" cy="17" r="7.5" fill={g('gold')} stroke={E} strokeWidth=".8" />
    <path d="M4 43c.5-9 6-15 13-15s12.5 6 13 15z" fill={g('gold')} stroke={E} strokeWidth=".8" />
    <path d="M13 13c1.5-1.5 3-2 5-2" stroke={HL} strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </>,
  tournaments: (g) => trophy(g),
  badges: (g) => <>
    <path d="M16 3h16l-4 14h-8z" fill={g('red')} stroke={E} strokeWidth=".6" /><path d="M21 3h6l-2 9h-2z" fill={g('blue')} />
    <circle cx="24" cy="29" r="14" fill={g('gold')} stroke={E} strokeWidth=".9" />
    <circle cx="24" cy="29" r="9.5" fill={g('gold')} stroke="rgba(120,80,20,.5)" strokeWidth="1" />
    <path d="M24 22.5l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="#FFF3C4" stroke="rgba(120,80,20,.5)" strokeWidth=".6" />
  </>,
  'live-streams': (g) => <>
    <rect x="4" y="9" width="40" height="27" rx="4" fill={g('dark')} stroke={E} strokeWidth=".8" />
    <rect x="7" y="12" width="34" height="21" rx="2" fill={g('silver')} />
    <path d="M21 17v11l9-5.5z" fill={g('red')} />
    <path d="M16 42h16M24 36v6" stroke={g('silver')} strokeWidth="3" strokeLinecap="round" />
  </>,
  'streamer-studio': (g) => <>
    <rect x="5" y="19" width="38" height="24" rx="3" fill={g('dark')} stroke={E} strokeWidth=".8" />
    <path d="M5 19l2-8.5 36-2 1 8.5z" fill={g('ivory')} stroke={E} strokeWidth=".8" />
    <path d="M12 10.3l4 8.2M21 9.8l4 8.6M30 9.3l4 8.8" stroke={g('dark')} strokeWidth="2.6" />
    <circle cx="24" cy="31" r="5.5" fill={g('red')} /><circle cx="22.5" cy="29.5" r="1.6" fill={HL} />
  </>,
  'content-studio': (g) => <>
    <path d="M24 5l-14 37M24 5l14 37" stroke={g('silver')} strokeWidth="4" strokeLinecap="round" />
    <circle cx="24" cy="8" r="5" fill={g('gold')} stroke={E} strokeWidth=".7" />
    <path d="M14 30h20" stroke={g('gold')} strokeWidth="3" strokeLinecap="round" />
  </>,
  'chess-for-kids': (g) => <>
    <circle cx="13" cy="15" r="5" fill={g('ivory')} stroke={E} strokeWidth=".6" /><path d="M5 34c0-7 3.5-11 8-11s8 4 8 11z" fill={g('ivory')} stroke={E} strokeWidth=".6" />
    <circle cx="35" cy="15" r="5" fill={g('ivory')} stroke={E} strokeWidth=".6" /><path d="M27 34c0-7 3.5-11 8-11s8 4 8 11z" fill={g('ivory')} stroke={E} strokeWidth=".6" />
    <circle cx="24" cy="18" r="6" fill={g('gold')} stroke={E} strokeWidth=".7" /><path d="M14 42c0-8.5 4.5-13 10-13s10 4.5 10 13z" fill={g('gold')} stroke={E} strokeWidth=".7" />
  </>,
  'import-games': (g) => <>
    <path d="M6 28v10a4 4 0 0 0 4 4h28a4 4 0 0 0 4-4V28" stroke={g('silver')} strokeWidth="4.5" fill="none" strokeLinecap="round" />
    <path d="M24 5v23" stroke={g('green')} strokeWidth="6" strokeLinecap="round" />
    <path d="M14 20l10 10 10-10" stroke={g('green')} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  'game-lookup': (g) => <>
    <circle cx="20" cy="20" r="13" fill={g('silver')} stroke={E} strokeWidth=".9" />
    <circle cx="20" cy="20" r="9" fill={g('blue')} /><path d="M15 15a7 7 0 0 1 6-3" stroke={HL} strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M30 30l11 11" stroke={g('gold')} strokeWidth="6" strokeLinecap="round" />
  </>,
  'opponent-scout': (g) => target(g),
  'daily-scout': (g) => <>
    {target(g)}
    <rect x="28" y="28" width="16" height="16" rx="4" fill={g('red')} stroke={E} strokeWidth=".6" />
    <text x="36" y="40.5" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" fontFamily="system-ui">1</text>
  </>,
  'scan-position': (g) => <>
    <path d="M16 12l3-5h10l3 5z" fill={g('dark')} />
    <rect x="4" y="12" width="40" height="28" rx="5" fill={g('silver')} stroke={E} strokeWidth=".9" />
    <circle cx="24" cy="26" r="9.5" fill={g('dark')} /><circle cx="24" cy="26" r="6" fill={g('blue')} /><circle cx="21.5" cy="23.5" r="2" fill={HL} />
    <rect x="35" y="15.5" width="5" height="3" rx="1" fill={g('gold')} />
  </>,
  'analysis-board': (g) => board(g),
  'spot-the-square': (g) => <>
    {board(g)}
    <rect x="15.5" y="15.5" width="17" height="17" rx="2" fill="none" stroke={g('red')} strokeWidth="3" />
  </>,
  subscription: (g) => crown(g),
  'scout-a-legend': (g) => king(g, 'gold'),
  settings: (g) => <>
    <path d="M24 4l3.5 4.5 5.5-1 1.5 5.5 5 2.5-1.8 5.3L40.5 26l-4.6 3.2.2 5.6-5.6.6-2.6 5L24 38l-3.9 2.4-2.6-5-5.6-.6.2-5.6L7.5 26l2.8-5.2L8.5 15.5l5-2.5L15 7.5l5.5 1z" fill={g('silver')} stroke={E} strokeWidth=".9" strokeLinejoin="round" />
    <circle cx="24" cy="23" r="7" fill={g('dark')} /><circle cx="24" cy="23" r="3.5" fill={g('gold')} />
  </>,
  admin: (g) => <>
    <path d="M24 3L41 9v12c0 11-7.5 19-17 24C14.5 40 7 32 7 21V9z" fill={g('silver')} stroke={E} strokeWidth=".9" />
    <path d="M24 8l12 4.5v9c0 8-5 14-12 17.5z" fill={g('green')} opacity=".9" />
    <path d="M16 23l5.5 5.5L32 18" stroke="#fff" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  'sign-out': (g) => <>
    <path d="M28 8H12a4 4 0 0 0-4 4v24a4 4 0 0 0 4 4h16" stroke={g('silver')} strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M20 24h22M34 16l8 8-8 8" stroke={g('red')} strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  home: (g) => <>
    <path d="M24 5L4 22h5v20h11V30h8v12h11V22h5z" fill={g('silver')} stroke={E} strokeWidth=".9" strokeLinejoin="round" />
    <path d="M24 5L4 22" stroke={HL} strokeWidth="1.4" />
  </>,
  play: (g) => <><path d="M14 7v34l28-17z" fill={g('silver')} stroke={E} strokeWidth=".9" strokeLinejoin="round" /><path d="M17 12v14" stroke={HL} strokeWidth="1.6" strokeLinecap="round" /></>,
  games: (g) => <>
    <circle cx="24" cy="12" r="6.5" fill={g('silver')} stroke={E} strokeWidth=".8" />
    <path d="M18.5 21h11l2.5 13h-16z" fill={g('silver')} stroke={E} strokeWidth=".8" />
    <rect x="12" y="34" width="24" height="7" rx="2.5" fill={g('silver')} stroke={E} strokeWidth=".8" />
    <path d="M21 9.5a3.5 3.5 0 0 1 3-1.5" stroke={HL} strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </>,
  analysis: (g) => bars(g, 'silver'),
  'skill-map': (g) => <>
    <path d="M24 4l17 10v20L24 44 7 34V14z" fill={g('dark')} stroke={g('silver')} strokeWidth="1.6" />
    <path d="M24 10l12 8-3 13-9 7-10-8 1-12z" fill={g('green')} stroke={E} strokeWidth=".7" opacity=".95" />
    <path d="M24 4v40M7 14l34 20M41 14L7 34" stroke="rgba(255,255,255,.18)" strokeWidth="1" />
  </>,
  more: (g) => <><circle cx="10" cy="24" r="4.5" fill={g('silver')} /><circle cx="24" cy="24" r="4.5" fill={g('silver')} /><circle cx="38" cy="24" r="4.5" fill={g('silver')} /></>,
  notifications: (g) => bell(g),
  'notification-toggle': (g) => <>{bell(g)}<circle cx="37" cy="10" r="6" fill={g('green')} stroke={E} strokeWidth=".6" /></>,
  profile: (g) => <>
    <circle cx="24" cy="24" r="20" fill={g('dark')} stroke={g('silver')} strokeWidth="1.6" />
    <circle cx="24" cy="19" r="7" fill={g('ivory')} /><path d="M11 38c1.5-7 6.5-10.5 13-10.5S35.5 31 37 38a19 19 0 0 1-26 0z" fill={g('ivory')} />
  </>,
  'field-notes': (g) => <>
    <rect x="9" y="5" width="28" height="38" rx="3.5" fill={g('green')} stroke={E} strokeWidth=".9" />
    <rect x="13" y="5" width="24" height="38" rx="2.5" fill={g('ivory')} />
    <path d="M17 14h15M17 20h15M17 26h10" stroke="#A89C78" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M30 40l12-14 3 3-12 14-4 1z" fill={g('gold')} stroke={E} strokeWidth=".6" />
  </>,
  'scout-sprint': (g) => <>
    <rect x="20" y="2.5" width="8" height="5" rx="1.5" fill={g('silver')} stroke={E} strokeWidth=".6" />
    <circle cx="24" cy="27" r="17" fill={g('silver')} stroke={E} strokeWidth=".9" />
    <circle cx="24" cy="27" r="13" fill={g('ivory')} />
    <path d="M24 27V17" stroke={g('red')} strokeWidth="3" strokeLinecap="round" /><path d="M24 27l7 4" stroke={g('dark')} strokeWidth="3" strokeLinecap="round" />
    <circle cx="24" cy="27" r="2.4" fill={g('gold')} />
  </>,
  'bot-of-month': (g) => knight(g, 'gold'),
  'recent-games': (g) => knight(g, 'silver'),
  maintenance: (g) => <>
    {[30, 21, 12].map((y, i) => <g key={y}><ellipse cx="24" cy={y + 6} rx="16" ry="5" fill={g('gold')} stroke={E} strokeWidth=".7" /><rect x="8" y={y} width="32" height="6" fill={g('gold')} /><ellipse cx="24" cy={y} rx="16" ry="5" fill={i === 2 ? g('ivory') : g('gold')} stroke={E} strokeWidth=".7" /></g>)}
    <path d="M12 16v4M12 25v4M12 34v4" stroke={HL} strokeWidth="1.5" strokeLinecap="round" />
  </>,
  shop: (g) => <>
    <path d="M9 16h30l-2.5 26h-25z" fill={g('gold')} stroke={E} strokeWidth=".9" strokeLinejoin="round" />
    <path d="M17 19v-6a7 7 0 0 1 14 0v6" stroke={g('silver')} strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M13 20l-1.6 18" stroke={HL} strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="24" cy="30" r="4" fill={g('green')} />
  </>,
  gift: (g) => <>
    <rect x="6" y="20" width="36" height="22" rx="3" fill={g('green')} stroke={E} strokeWidth=".9" />
    <rect x="4" y="14" width="40" height="8" rx="2.5" fill={g('green')} stroke={E} strokeWidth=".9" />
    <rect x="21" y="14" width="6" height="28" fill={g('gold')} />
    <path d="M24 14c-3-7-12-9-12-3 0 3 6 3 12 3zM24 14c3-7 12-9 12-3 0 3-6 3-12 3z" fill={g('gold')} stroke={E} strokeWidth=".7" />
    <path d="M9 24v14" stroke={HL} strokeWidth="1.5" strokeLinecap="round" />
  </>,
  explorer: (g) => <>
    <circle cx="24" cy="24" r="19" fill={g('gold')} stroke={E} strokeWidth=".9" />
    <circle cx="24" cy="24" r="14.5" fill={g('dark')} />
    <path d="M24 11l4.5 13H19.5z" fill={g('red')} /><path d="M24 37l-4.5-13h9z" fill={g('ivory')} />
    <circle cx="24" cy="24" r="2.4" fill={g('gold')} />
    <path d="M12 16c2-4 6-7 10-7.5" stroke={HL} strokeWidth="1.6" fill="none" strokeLinecap="round" />
  </>,
  'google-play': () => <>
    <path d="M9 5l21 19L9 43c-1-.5-1.5-1.5-1.5-3V8c0-1.5.5-2.5 1.5-3z" fill="#2196F3" />
    <path d="M9 5l21 19 6.5-6.5L12.5 4C11.2 3.3 10 3.6 9 5z" fill="#4CAF50" />
    <path d="M9 43l21-19 6.5 6.5L12.5 44c-1.3.7-2.5.4-3.5-1z" fill="#F44336" />
    <path d="M36.5 17.5L30 24l6.5 6.5 5-2.9c2-1.2 2-3.9 0-5.1z" fill="#FFC107" />
  </>,
};

export const SCOUT_ICON_NAMES = Object.keys(D);
export function ScoutIcon({ name, ...p }: P & { name: string }) {
  const d = D[name];
  return d ? <Base {...p} draw={d} /> : null;
}
