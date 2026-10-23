// Reads the signed-in account's most recent reviews and records, per game,
// whether the AI coach ran and where each move's explanation came from.
// Run by .github/workflows/desktop-shots.yml when audit_reviews is set.
import { mkdirSync, writeFileSync } from 'fs';
const API = 'https://chesscoach-api-kbf8.onrender.com';
const TOKEN = process.env.DESKTOP_SHOT_TOKEN;
const OUT = process.env.OUT || '/tmp/shots';
mkdirSync(OUT, { recursive: true });
const get = async (p) => { const r = await fetch(API + p, { headers: { Authorization: `Bearer ${TOKEN}` } }); return r.ok ? r.json() : { error: r.status }; };
const list = await get('/api/games?limit=40&source=all');
const games = (list.games ?? list ?? []).slice(0, 40);
const out = [];
for (const g of games) {
  const d = await get(`/api/games/${g.id}/review`);
  const rd = d?.reviewData;
  if (!rd?.moves?.length) { out.push({ id: g.id, platform: g.platform, status: d?.status ?? d?.error }); continue; }
  const ms = rd.moves;
  const statuses = {};
  for (const m of ms) statuses[m.coachStatus ?? 'none'] = (statuses[m.coachStatus ?? 'none'] ?? 0) + 1;
  out.push({ id: g.id, platform: g.platform, played: g.playedAt, aiCoach: rd.aiCoach, hasSummary: !!rd.gameSummary, moves: ms.length,
    withPros: ms.filter((m) => m.pros?.length || m.cons?.length).length, statuses,
    samples: ms.slice(6, 12).map((m) => ({ i: m.moveIndex, san: m.san, cls: m.classification, st: m.coachStatus, ex: m.explanation, pros: m.pros })) });
}
writeFileSync(`${OUT}/review-audit.json`, JSON.stringify(out, null, 1));
console.log('audited', out.length);
