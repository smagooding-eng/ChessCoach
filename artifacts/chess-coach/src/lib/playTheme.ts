import { RD, REDESIGN_ON } from '@/lib/redesignTheme';

// Colours for the play-with-people screens (Live, Daily, Challenge links):
// the enhanced-UI palette when that design is on, the classic one otherwise.
export const PT = REDESIGN_ON
  ? {
      bg: RD.bg,
      card: RD.card,
      cardSolid: RD.cardSolid,
      cardLight: RD.cardLight,
      border: RD.border,
      text: RD.text,
      muted: RD.muted,
      green: RD.green,
      onGreen: '#05100A',
      greenSoft: 'rgba(129,182,76,.12)',
      greenLine: 'rgba(129,182,76,.35)',
      red: RD.red,
      gold: RD.gold,
      radius: 18,
    }
  : {
      bg: '#262421',
      card: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
      cardSolid: '#302e2b',
      cardLight: '#3a3835',
      border: 'rgba(255,255,255,0.08)',
      text: '#e8e6e3',
      muted: '#9e9b98',
      green: '#81b64c',
      onGreen: '#ffffff',
      greenSoft: 'rgba(129,182,76,0.12)',
      greenLine: 'rgba(129,182,76,0.35)',
      red: '#dc4343',
      gold: '#E8B447',
      radius: 16,
    };

export const cardStyle = { background: PT.card, border: `1px solid ${PT.border}`, borderRadius: PT.radius } as const;
export const greenBtn = { background: PT.green, color: PT.onGreen } as const;
export const ghostBtn = { background: 'rgba(255,255,255,0.06)', color: PT.text, border: `1px solid ${PT.border}` } as const;

export function formatLeft(ms: number): string {
  if (ms <= 0) return 'out of time';
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) { const d = Math.floor(h / 24); const rh = h % 24; return rh ? `${d}d ${rh}h` : `${d}d`; }
  if (h >= 1) return `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m`;
}
