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
// Run one fresh review (the newest unreviewed game with moves) to see what a
// review made today looks like.
const fresh = process.env.FRESH_ID ? { id: Number(process.env.FRESH_ID) } : games.find((g) => out.find((o) => o.id === g.id && o.status === 'none'));
if (fresh) {
  const post = async (p) => { const r = await fetch(API + p, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } }); return r.ok ? r.json() : { error: r.status, body: (await r.text()).slice(0, 300) }; };
  let r = await post(`/api/games/${fresh.id}/review${process.env.FRESH_ID ? '?force=true' : ''}`);
  const t0 = Date.now();
  while (r?.status === 'pending' && r.jobId && Date.now() - t0 < 6 * 60_000) {
    await new Promise((res) => setTimeout(res, 5000));
    const s2 = await get(`/api/games/review-status/${r.jobId}`);
    if (s2?.status !== 'pending' && s2?.status !== 'running') { r = s2; break; }
  }
  const ms = r?.reviewData?.moves ?? [];
  const statuses = {};
  for (const m of ms) statuses[m.coachStatus ?? 'none'] = (statuses[m.coachStatus ?? 'none'] ?? 0) + 1;
  out.push({ fresh: fresh.id, result: r?.status ?? r?.error, err: r?.error ?? r?.body, aiCoach: r?.reviewData?.aiCoach, hasSummary: !!r?.reviewData?.gameSummary, moves: ms.length,
    withPros: ms.filter((m) => m.pros?.length || m.cons?.length).length, statuses, seconds: Math.round((Date.now() - t0) / 1000),
    samples: ms.slice(0, 10).map((m) => ({ i: m.moveIndex, san: m.san, cls: m.classification, st: m.coachStatus, ex: m.explanation, pros: m.pros })) });
}
writeFileSync(`${OUT}/review-audit.json`, JSON.stringify(out, null, 1));
console.log('audited', out.length);
