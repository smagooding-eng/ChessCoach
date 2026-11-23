// ChessScout's own colourful icon set (menus, Home tiles, the trail): small flat illustrations
// with two or three colours each, instead of the same grey line icons everywhere.
// AppIcon picks one by name; navIcon(href) maps a page to its icon.
import React from 'react';

type P = { size?: number; className?: string; style?: React.CSSProperties };
const S = ({ size = 24, className, style, children }: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} aria-hidden="true">{children}</svg>
);

const G = '#81B64C', GD = '#5F8F36', GOLD = '#F2B53A', GOLDD = '#C9861E', RED = '#E8524A', REDD = '#B8343E',
  BLUE = '#4FA3E8', BLUED = '#2E73B8', PURP = '#9B7BE8', PURPD = '#6C50C2', CREAM = '#F3EEE2', GREY = '#9AA4A2', DARK = '#26302F', ORANGE = '#F08A3C', TEAL = '#3CC3B0';

const ICONS: Record<string, (p: P) => React.ReactElement> = {
  home: (p) => <S {...p}><path d="M3 11 12 3.5 21 11v9a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z" fill={G} /><path d="M3 11 12 3.5 21 11" fill="none" stroke={GD} strokeWidth="2" strokeLinejoin="round" /><rect x="10" y="15" width="4" height="6" rx=".5" fill={GD} /></S>,
  play: (p) => <S {...p}><circle cx="12" cy="12" r="10" fill={G} /><circle cx="12" cy="12" r="10" fill="none" stroke={GD} strokeWidth="1.5" /><path d="M10 7.5v9l7-4.5z" fill="#fff" /></S>,
  games: (p) => <S {...p}><rect x="4" y="2.5" width="16" height="19" rx="2.5" fill={CREAM} /><rect x="4" y="2.5" width="16" height="5" rx="2.5" fill={G} /><path d="M4 6h16v1.5H4z" fill={G} /><path d="M7.5 11h3M13.5 11h3M7.5 14.5h3M13.5 14.5h3M7.5 18h3" stroke={GREY} strokeWidth="1.6" strokeLinecap="round" /><circle cx="15" cy="18" r="1.4" fill={RED} /></S>,
  analysis: (p) => <S {...p}><rect x="3" y="13" width="4.5" height="8" rx="1" fill={BLUE} /><rect x="9.75" y="8" width="4.5" height="13" rx="1" fill={G} /><rect x="16.5" y="3" width="4.5" height="18" rx="1" fill={GOLD} /></S>,
  puzzles: (p) => <S {...p}><path d="M3 7h5.2a2.6 2.6 0 1 1 5 0H18v5.2a2.6 2.6 0 1 1 0 5V21H3z" fill={ORANGE} /><path d="M3 7h5.2a2.6 2.6 0 1 1 5 0H18v5.2a2.6 2.6 0 1 1 0 5V21H3z" fill="none" stroke="#C76420" strokeWidth="1.3" strokeLinejoin="round" /><path d="M6 11.5h5" stroke="#FFD0A8" strokeWidth="1.4" strokeLinecap="round" /></S>,
  openings: (p) => <S {...p}><path d="M2.5 5c3-1 6.5-.6 9.5 1.5v14C9 18.4 5.5 18 2.5 19z" fill={BLUE} /><path d="M21.5 5c-3-1-6.5-.6-9.5 1.5v14c3-2.1 6.5-2.5 9.5-1.5z" fill={BLUED} /><path d="M5 9c1.8-.4 3.6-.2 5 .5M5 12c1.8-.4 3.6-.2 5 .5" stroke="#CFE6FA" strokeWidth="1.1" fill="none" strokeLinecap="round" /></S>,
  tactics: (p) => <S {...p}><path d="M13.5 2 4 13.5h6.5L9 22l11-13h-7z" fill={GOLD} /><path d="M13.5 2 4 13.5h6.5L9 22l11-13h-7z" fill="none" stroke={GOLDD} strokeWidth="1.2" strokeLinejoin="round" /></S>,
  endgames: (p) => <S {...p}><path d="M12 2.5v3M10.5 4h3" stroke={GOLDD} strokeWidth="1.6" strokeLinecap="round" /><path d="M8 9.5c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5c0 1.6-1 2.6-1.8 3.5h-4.4C9 12.1 8 11.1 8 9.5z" fill={CREAM} /><path d="M7 21h10l-1.2-4.5-1.6-3.5H9.8l-1.6 3.5z" fill={CREAM} /><path d="M6 21h12" stroke={GREY} strokeWidth="2" strokeLinecap="round" /></S>,
  traps: (p) => <S {...p}><circle cx="12" cy="12" r="9.5" fill={RED} /><circle cx="12" cy="12" r="6.2" fill="#fff" /><circle cx="12" cy="12" r="3" fill={RED} /><path d="M19 5 13 11" stroke={DARK} strokeWidth="1.8" strokeLinecap="round" /><path d="M17.5 3.5 21 3l-.5 3.5" fill={DARK} /></S>,
  courses: (p) => <S {...p}><path d="m12 4 10 4.5L12 13 2 8.5z" fill={PURP} /><path d="M6 10.6V15c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.4L12 13z" fill={PURPD} /><path d="M21 9v6" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" /><circle cx="21" cy="15.5" r="1.3" fill={GOLD} /></S>,
  bots: (p) => <S {...p}><path d="M12 2.5v3" stroke={GREY} strokeWidth="1.6" strokeLinecap="round" /><circle cx="12" cy="2.5" r="1.4" fill={RED} /><rect x="4" y="6" width="16" height="13" rx="4" fill={TEAL} /><rect x="6.5" y="9" width="11" height="6" rx="3" fill={DARK} /><circle cx="9.5" cy="12" r="1.4" fill="#BFF5EC" /><circle cx="14.5" cy="12" r="1.4" fill="#BFF5EC" /><path d="M2 11v4M22 11v4" stroke={TEAL} strokeWidth="2" strokeLinecap="round" /></S>,
  articles: (p) => <S {...p}><rect x="3" y="4" width="15" height="17" rx="2" fill={CREAM} /><path d="M18 8h2.5v11a2 2 0 0 1-2 2H18z" fill={GREY} /><rect x="5.5" y="7" width="10" height="4" rx=".8" fill={RED} /><path d="M5.5 14h10M5.5 17h7" stroke={GREY} strokeWidth="1.4" strokeLinecap="round" /></S>,
  live: (p) => <S {...p}><path d="M4 3.5h3l10 10-3 3-10-10z" fill="#D9DEDD" /><path d="M20 3.5h-3l-10 10 3 3 10-10z" fill={GOLD} /><path d="m5 16 3 3M19 16l-3 3" stroke={DARK} strokeWidth="2.4" strokeLinecap="round" /><circle cx="4.5" cy="19.5" r="1.8" fill={RED} /><circle cx="19.5" cy="19.5" r="1.8" fill={BLUE} /></S>,
  watch: (p) => <S {...p}><rect x="2" y="9" width="8.5" height="10" rx="4.25" fill={PURP} /><rect x="13.5" y="9" width="8.5" height="10" rx="4.25" fill={PURP} /><rect x="9" y="10" width="6" height="4" rx="1" fill={PURPD} /><circle cx="6.25" cy="14.5" r="2.5" fill="#D9CEFA" /><circle cx="17.75" cy="14.5" r="2.5" fill="#D9CEFA" /><path d="M5 9 6.5 5h3L10 9M14 9l.5-4h3L19 9" fill={PURPD} /></S>,
  friends: (p) => <S {...p}><circle cx="8.5" cy="8" r="3.5" fill={ORANGE} /><path d="M2 20c0-4 3-6.5 6.5-6.5S15 16 15 20z" fill={ORANGE} /><circle cx="16.5" cy="9" r="3" fill={BLUE} /><path d="M12.5 20c.3-3.5 2-5.5 4-5.5 2.5 0 5 2 5.5 5.5z" fill={BLUE} /></S>,
  tournaments: (p) => <S {...p}><path d="M7 3h10v5a5 5 0 0 1-10 0z" fill={GOLD} /><path d="M7 5H3.5c0 3 1.5 4.5 3.8 4.6M17 5h3.5c0 3-1.5 4.5-3.8 4.6" fill="none" stroke={GOLDD} strokeWidth="1.6" /><path d="M10.5 13h3v4h-3z" fill={GOLDD} /><rect x="7" y="17" width="10" height="4" rx="1" fill="#8A5A2B" /></S>,
  streams: (p) => <S {...p}><rect x="2" y="5" width="20" height="13" rx="2.5" fill={RED} /><path d="M10 8.5v6l5-3z" fill="#fff" /><path d="M8 21h8" stroke={GREY} strokeWidth="2" strokeLinecap="round" /></S>,
  studio: (p) => <S {...p}><rect x="2.5" y="9" width="19" height="12" rx="2" fill={DARK} /><path d="m2.5 9 1-4 18 0-1 4z" fill={CREAM} /><path d="m6 5 2 4M11 5l2 4M16 5l2 4" stroke={DARK} strokeWidth="1.6" /><circle cx="12" cy="15" r="2.6" fill={RED} /></S>,
  kids: (p) => <S {...p}><circle cx="6" cy="6" r="2.6" fill="#C7894B" /><circle cx="18" cy="6" r="2.6" fill="#C7894B" /><circle cx="12" cy="13" r="8.5" fill="#E0A564" /><ellipse cx="12" cy="16" rx="3.6" ry="2.6" fill={CREAM} /><circle cx="9" cy="11" r="1.1" fill={DARK} /><circle cx="15" cy="11" r="1.1" fill={DARK} /><circle cx="12" cy="15.2" r="1" fill={DARK} /></S>,
  import: (p) => <S {...p}><path d="M3 14v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" fill="none" stroke={GREY} strokeWidth="2.2" strokeLinecap="round" /><path d="M12 3v11" stroke={G} strokeWidth="3" strokeLinecap="round" /><path d="m7 10 5 5 5-5" fill="none" stroke={G} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></S>,
  lookup: (p) => <S {...p}><circle cx="10" cy="10" r="7" fill={BLUE} /><circle cx="10" cy="10" r="4.6" fill="#D6ECFC" /><path d="m15.5 15.5 5.5 5.5" stroke={DARK} strokeWidth="3" strokeLinecap="round" /></S>,
  opponents: (p) => <S {...p}><circle cx="12" cy="12" r="9.5" fill={G} /><circle cx="12" cy="12" r="6.5" fill="#fff" /><circle cx="12" cy="12" r="3.5" fill={G} /><circle cx="12" cy="12" r="1.3" fill="#fff" /></S>,
  scan: (p) => <S {...p}><rect x="2" y="6.5" width="20" height="14" rx="3" fill={TEAL} /><path d="M8 6.5 9.5 3.5h5L16 6.5z" fill="#2A9A8A" /><circle cx="12" cy="13.5" r="4.6" fill={DARK} /><circle cx="12" cy="13.5" r="2.6" fill="#7FE0D2" /><circle cx="18.3" cy="9.5" r="1" fill="#fff" /></S>,
  board: (p) => <S {...p}><rect x="2.5" y="2.5" width="19" height="19" rx="2.5" fill={CREAM} /><path d="M2.5 7.25h4.75V2.5M12 2.5v4.75h4.75V2.5M7.25 7.25V12H12V7.25M16.75 7.25V12h4.75M2.5 12h4.75v4.75H2.5M12 12v4.75h4.75V12M7.25 16.75v4.75H12v-4.75M16.75 16.75v4.75" fill="none" /><path d="M7.25 2.5H12v4.75H7.25zM16.75 2.5h4.75v4.75h-4.75zM2.5 7.25h4.75V12H2.5zM12 7.25h4.75V12H12zM7.25 12H12v4.75H7.25zM16.75 12h4.75v4.75h-4.75zM2.5 16.75h4.75v4.75H2.5zM12 16.75h4.75v4.75H12z" fill={G} /><path d="M6 18 18 6" stroke={GOLD} strokeWidth="2" strokeLinecap="round" /><path d="m14.5 5.5 4-.5-.5 4z" fill={GOLD} /></S>,
  subscription: (p) => <S {...p}><path d="M3 8 7 13l5-8 5 8 4-5-2 12H5z" fill={GOLD} /><path d="M3 8 7 13l5-8 5 8 4-5-2 12H5z" fill="none" stroke={GOLDD} strokeWidth="1.2" strokeLinejoin="round" /><circle cx="12" cy="15" r="1.6" fill={RED} /></S>,
  settings: (p) => <S {...p}><path d="M12 2.5 14 5l3.2-.6.6 3.2L20.5 9.5 19 12l1.5 2.5-2.7 1.9-.6 3.2L14 19l-2 2.5L10 19l-3.2.6-.6-3.2L3.5 14.5 5 12 3.5 9.5l2.7-1.9.6-3.2L10 5z" fill={GREY} /><circle cx="12" cy="12" r="3.4" fill={DARK} /></S>,
  admin: (p) => <S {...p}><path d="M12 2.5 20 5.5V11c0 5-3.4 8.6-8 10.5C7.4 19.6 4 16 4 11V5.5z" fill={BLUE} /><path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></S>,
  streak: (p) => <S {...p}><path d="M12 2c1 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.5 1.3-4 2.5-5 .2 2 1 3 2 3.3C10.5 8.5 11 5 12 2z" fill={ORANGE} /><path d="M12 12c.6 1.6 2.6 2.5 2.6 5a2.6 2.6 0 0 1-5.2 0c0-1.3.7-2.2 1.4-2.7.1 1 .5 1.5 1 1.6-.2-1.6 0-2.8.2-3.9z" fill={GOLD} /></S>,
  trail: (p) => <S {...p}><path d="M4 21c4-1 3-5 8-6s3-5 8-6" fill="none" stroke="#C49A63" strokeWidth="3.2" strokeLinecap="round" strokeDasharray=".1 4.2" /><path d="M16 3v6" stroke={DARK} strokeWidth="1.6" strokeLinecap="round" /><path d="M16 3.5h5l-1.5 1.75L21 7h-5z" fill={RED} /><circle cx="4" cy="21" r="2" fill={G} /></S>,
  leaderboard: (p) => <S {...p}><rect x="9" y="6" width="6" height="15" rx="1" fill={GOLD} /><rect x="2.5" y="11" width="6" height="10" rx="1" fill={GREY} /><rect x="15.5" y="13.5" width="6" height="7.5" rx="1" fill="#C7894B" /><path d="m12 1.8.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" fill={GOLD} /></S>,
  badge: (p) => <S {...p}><path d="M8 2h8l-1.5 7h-5z" fill={RED} /><path d="M10 2h4l-1 5h-2z" fill={BLUE} /><circle cx="12" cy="15" r="6.5" fill={GOLD} /><circle cx="12" cy="15" r="4.3" fill="#FFD777" /><path d="m12 12.3.8 1.7 1.8.2-1.3 1.2.3 1.8-1.6-.9-1.6.9.3-1.8-1.3-1.2 1.8-.2z" fill={GOLDD} /></S>,
  rush: (p) => <S {...p}><circle cx="12" cy="13" r="8.5" fill={RED} /><circle cx="12" cy="13" r="6" fill="#fff" /><path d="M12 13V9.2M12 13l2.8 1.8" stroke={DARK} strokeWidth="1.8" strokeLinecap="round" /><rect x="10" y="1.5" width="4" height="2.5" rx=".8" fill={REDD} /></S>,
  coords: (p) => <S {...p}><rect x="2.5" y="2.5" width="19" height="19" rx="2.5" fill={G} /><rect x="7" y="7" width="10" height="10" rx="1.5" fill={CREAM} /><text x="12" y="14.8" textAnchor="middle" fontSize="6.5" fontWeight="900" fill={DARK} fontFamily="system-ui">e4</text></S>,
  guess: (p) => <S {...p}><circle cx="12" cy="12" r="9.5" fill={PURP} /><path d="M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2.9-1.2 1.8v.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="17.5" r="1.3" fill="#fff" /></S>,
  class: (p) => <S {...p}><rect x="2.5" y="3.5" width="19" height="12" rx="1.5" fill="#2F6B4F" /><path d="M6 8h7M6 11h4" stroke="#E8F2EC" strokeWidth="1.4" strokeLinecap="round" /><path d="M5 20.5h14M8 15.5l-1.5 5M16 15.5l1.5 5" stroke="#8A5A2B" strokeWidth="1.6" strokeLinecap="round" /></S>,
  share: (p) => <S {...p}><circle cx="18" cy="5.5" r="3" fill={BLUE} /><circle cx="6" cy="12" r="3" fill={G} /><circle cx="18" cy="18.5" r="3" fill={ORANGE} /><path d="m8.6 10.6 6.8-3.7M8.6 13.4l6.8 3.7" stroke={GREY} strokeWidth="1.8" /></S>,
  coach: (p) => <S {...p}><circle cx="12" cy="9" r="5.5" fill="#E0A564" /><path d="M6.5 8c.5-3.5 3-5 5.5-5s5 1.5 5.5 5c-1.5-1-3.5-1.5-5.5-1.5S8 7 6.5 8z" fill={DARK} /><path d="M3.5 21c.6-4 4-6.5 8.5-6.5s7.9 2.5 8.5 6.5z" fill={G} /><path d="M12 14.5v3" stroke={GD} strokeWidth="1.4" /></S>,
};

export type AppIconName = keyof typeof ICONS;

export function AppIcon({ name, ...p }: P & { name: string }) {
  const I = ICONS[name];
  return I ? I(p) : null;
}

const BY_HREF: Record<string, string> = {
  '/': 'home', '/play': 'play', '/games': 'games', '/analysis': 'analysis', '/openings': 'openings', '/tactics': 'tactics',
  '/endgames': 'endgames', '/puzzles': 'rush', '/puzzles/hub': 'puzzles', '/traps': 'traps', '/courses': 'courses', '/practice': 'bots', '/learn': 'articles',
  '/live': 'live', '/watch': 'watch', '/friends': 'friends', '/tournaments': 'tournaments', '/streams': 'streams', '/studio': 'studio',
  '/kids': 'kids', '/import': 'import', '/lookup': 'lookup', '/opponents': 'opponents', '/scan': 'scan', '/analysis-board': 'board',
  '/subscription': 'subscription', '/settings': 'settings', '/admin': 'admin', '/admin/studio': 'studio', '/trail': 'trail',
  '/leaderboard': 'leaderboard', '/progress': 'leaderboard', '/path': 'trail', '/sprint': 'rush', '/legends': 'guess', '/bot-challenge': 'bots', '/report-card': 'analysis', '/field-notes': 'articles', '/daily': 'opponents', '/badges': 'badges', '/puzzle-rush': 'rush', '/coordinates': 'coords', '/guess-the-move': 'guess', '/classes': 'class',
};
BY_HREF['/badges'] = 'badge';

/** The colourful icon for a page, or null when it has none. */
export function navIconName(href: string): string | null {
  return BY_HREF[href] ?? null;
}
