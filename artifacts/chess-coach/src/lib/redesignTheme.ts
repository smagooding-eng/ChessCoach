// Shared palette + small helpers for the redesigned pages (the design
// with the near-black background and neon-green accent). Pages that
// hardcode their colors import from here so they all stay identical;
// pages that use the app's theme tokens are themed by the
// `html.cs-redesign` block in index.css instead.
export const RD = {
  bg: '#050A0B',
  card: 'linear-gradient(160deg, #0F1819 0%, #0B1213 100%)',
  cardSolid: '#0D1516',
  cardLight: '#121B1D',
  border: 'rgba(255,255,255,.08)',
  green: '#81B64C',
  greenDark: '#5F8F36',
  text: '#F5F7F6',
  muted: '#87918E',
  red: '#FF5058',
  gold: '#E8B447',
} as const;

export const RESULT_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  win: { bg: 'rgba(95,143,54,.16)', fg: '#95C45A', label: 'WIN' },
  loss: { bg: 'rgba(255,80,88,.16)', fg: '#FF7A80', label: 'LOSS' },
  draw: { bg: 'rgba(255,255,255,.10)', fg: '#B9C2BF', label: 'DRAW' },
};

// Difficulty chips (Chess Traps etc.)
export const DIFFICULTY_BADGE: Record<string, { bg: string; fg: string }> = {
  beginner: { bg: 'rgba(95,143,54,.16)', fg: '#95C45A' },
  intermediate: { bg: 'rgba(232,180,71,.16)', fg: '#E8B447' },
  advanced: { bg: 'rgba(255,80,88,.16)', fg: '#FF7A80' },
};

// The redesign toggle's last known value (cached by useDashboardRedesignFlag),
// readable at module load. Files that define plain-hex colour constants (which
// are concatenated with alpha suffixes or used in SVG attributes, so can't be
// CSS variables) use this to pick the redesign palette.
export const REDESIGN_ON: boolean = (() => {
  try { return localStorage.getItem('cs_dashboard_redesign') === '1'; } catch { return false; }
})();
