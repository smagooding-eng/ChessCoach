// Bot portraits: a round metal medallion with a polished chess piece that climbs with the bot's
// rating (pawn → knight → bishop → rook → queen), in ChessScout's gold, silver and ivory. Drawn as
// an SVG data URL so it drops into any <img src>.
const MAT: Record<string, [string, string, string]> = {
  ivory: ['#FFFDF3', '#EFE6CC', '#A89A72'],
  silver: ['#FFFFFF', '#CDD4D3', '#7D8988'],
  gold: ['#FFF0B0', '#F2C14E', '#A06C16'],
  dark: ['#5A6668', '#2F3739', '#121718'],
  green: ['#C6EC8F', '#86BE4E', '#3F6E22'],
};
const PIECE: Record<string, string> = {
  pawn: '<circle cx="24" cy="13.5" r="6.2" fill="url(#m)" stroke="rgba(0,0,0,.35)" stroke-width=".8"/><rect x="18" y="20.5" width="12" height="3.6" rx="1.4" fill="url(#m)" stroke="rgba(0,0,0,.35)" stroke-width=".7"/><path d="M17.5 37c1-7.5 3.3-11.5 6.5-13 3.2 1.5 5.5 5.5 6.5 13z" fill="url(#m)" stroke="rgba(0,0,0,.35)" stroke-width=".8"/><path d="M20.5 11.5a4 4 0 0 1 3.5-2.3" stroke="rgba(255,255,255,.7)" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  knight: '<path d="M15 37c0-6.5 2.8-9.5 6.5-12.2-2.8.3-5.1 1.5-6.9 3.3L11.5 25c1-4.7 4.2-8.4 7.5-11.2l-1-4.2 3.8 2.1c6.5-1.9 12.6 1.9 14.5 9.8 1.4 6-.5 11.2-1.9 15.5z" fill="url(#m)" stroke="rgba(0,0,0,.4)" stroke-width=".9" stroke-linejoin="round"/><circle cx="22.6" cy="17.8" r="1.4" fill="#2B2216"/><path d="M26.8 13.6c3.7 1.4 6 4.7 6.8 9.4" stroke="rgba(255,255,255,.65)" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  bishop: '<circle cx="24" cy="7.5" r="2.6" fill="url(#m)" stroke="rgba(0,0,0,.35)" stroke-width=".7"/><path d="M24 10c-5.5 4-8 8.8-8 12.8 0 3.6 2.8 5.7 8 5.7s8-2.1 8-5.7c0-4-2.5-8.8-8-12.8z" fill="url(#m)" stroke="rgba(0,0,0,.35)" stroke-width=".8"/><path d="M26.5 14.5l-4 6" stroke="rgba(0,0,0,.4)" stroke-width="1.6" stroke-linecap="round"/><rect x="18" y="27.5" width="12" height="3.2" rx="1.3" fill="url(#m)" stroke="rgba(0,0,0,.35)" stroke-width=".7"/><path d="M18.5 37l2-6.3h7l2 6.3z" fill="url(#m)" stroke="rgba(0,0,0,.35)" stroke-width=".8"/><path d="M19.5 20c.4-2.6 1.8-4.8 3.6-6.4" stroke="rgba(255,255,255,.7)" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  rook: '<path d="M14.5 8h4.3v3.6h3.2V8h4v3.6h3.2V8h4.3v8l-3 2.6V35h-13V18.6l-3-2.6z" fill="url(#m)" stroke="rgba(0,0,0,.38)" stroke-width=".9" stroke-linejoin="round"/><path d="M17.5 16h13" stroke="rgba(0,0,0,.3)" stroke-width="1"/><path d="M19.5 19.5v13" stroke="rgba(255,255,255,.65)" stroke-width="1.6" stroke-linecap="round"/>',
  queen: '<circle cx="12" cy="11" r="2.2" fill="url(#m)"/><circle cx="18" cy="8" r="2.2" fill="url(#m)"/><circle cx="24" cy="6.5" r="2.4" fill="url(#m)"/><circle cx="30" cy="8" r="2.2" fill="url(#m)"/><circle cx="36" cy="11" r="2.2" fill="url(#m)"/><path d="M12 12.5l5 11 1-14 4 13 2-14 2 14 4-13 1 14 5-11-3.5 17h-17z" fill="url(#m)" stroke="rgba(0,0,0,.38)" stroke-width=".9" stroke-linejoin="round"/><rect x="15.5" y="29" width="17" height="3.4" rx="1.4" fill="url(#m)" stroke="rgba(0,0,0,.35)" stroke-width=".7"/><path d="M17 37l1.5-4.6h11L31 37z" fill="url(#m)" stroke="rgba(0,0,0,.35)" stroke-width=".8"/>',
};
const BASE = '<rect x="12" y="36" width="24" height="5.5" rx="2.2" fill="url(#m)" stroke="rgba(0,0,0,.38)" stroke-width=".8"/>';

// by the bots' order: [piece, piece material, rim]
const LOOK: [string, string, string][] = [
  ['pawn', 'ivory', 'bronze'], ['pawn', 'silver', 'bronze'], ['knight', 'ivory', 'bronze'], ['knight', 'silver', 'silver'],
  ['bishop', 'ivory', 'silver'], ['bishop', 'silver', 'silver'], ['rook', 'silver', 'gold'], ['rook', 'gold', 'gold'],
  ['queen', 'gold', 'gold'], ['queen', 'green', 'gold'],
];
const RIM: Record<string, [string, string, string]> = { bronze: ['#F4CFA0', '#C7894B', '#6E4220'], silver: MAT.silver, gold: MAT.gold };

const cache = new Map<number, string>();
/** The medallion for the bot at this position in the bots' order (0 = the easiest). */
export function botMedallion(index: number): string {
  const i = Math.max(0, Math.min(LOOK.length - 1, index));
  const hit = cache.get(i); if (hit) return hit;
  const [piece, mat, rim] = LOOK[i];
  const [a, b, c] = MAT[mat], [ra, rb, rc] = RIM[rim];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs>`
    + `<linearGradient id="m" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".45" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`
    + `<linearGradient id="r" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="${ra}"/><stop offset=".5" stop-color="${rb}"/><stop offset="1" stop-color="${rc}"/></linearGradient>`
    + `<radialGradient id="bg" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#2E3A3C"/><stop offset="1" stop-color="#0F1516"/></radialGradient>`
    + `<filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.2" flood-color="#000" flood-opacity=".55"/></filter></defs>`
    + `<circle cx="48" cy="48" r="47" fill="url(#r)"/><circle cx="48" cy="48" r="41.5" fill="url(#bg)"/>`
    + `<path d="M20 34a30 30 0 0 1 22-20" stroke="rgba(255,255,255,.12)" stroke-width="3" fill="none" stroke-linecap="round"/>`
    + `<g transform="translate(18 16) scale(1.25)" filter="url(#s)">${PIECE[piece]}${BASE}</g></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(i, url); return url;
}
