// Desktop screenshots of the live site, to check layouts at common desktop
// sizes. Run by .github/workflows/desktop-shots.yml. Signed-in pages are
// included only when DESKTOP_SHOT_TOKEN (a session token) is set.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const SITE = process.env.SITE || 'https://chessscout.net';
const OUT = process.env.OUT || 'desktop-shots';
const TOKEN = process.env.DESKTOP_SHOT_TOKEN || '';
const PUBLIC = [
  ['home', '/'], ['pricing', '/pricing'], ['players', '/players'], ['player', '/players/hikaru'],
  ['openings-public', '/chess-openings'], ['traps-public', '/chess-traps'], ['learn', '/learn'], ['blog', '/blog'],
  ['download', '/download'], ['terms', '/terms'], ['vs-aimchess', '/vs/aimchess'], ['setup', '/setup'],
  ['tournaments', '/tournaments'], ['kids', '/kids'], ['beginner', '/beginner'], ['scan', '/scan'],
];
const SIGNED_IN = [
  ['dashboard', '/'], ['games', '/games'], ['analysis', '/analysis'], ['play', '/play'], ['live', '/live'],
  ['practice', '/practice'], ['daily', '/daily'], ['puzzles', '/puzzles'], ['courses', '/courses'], ['openings', '/openings'],
  ['endgames', '/endgames'], ['traps', '/traps'], ['opponents', '/opponents'], ['friends', '/friends'],
  ['notifications', '/notifications'], ['profile', '/profile'], ['settings', '/settings'], ['subscription', '/subscription'],
  ['import', '/import'], ['lookup', '/lookup'], ['shop', '/shop'], ['tournaments-in', '/tournaments'], ['learning', '/learning'],
  ['scan-in', '/scan'], ['affiliate', '/affiliate'], ['beginner-in', '/beginner'], ['kids-in', '/kids'],
];
const SIZES = [
  { id: '1280', viewport: { width: 1280, height: 720 } },
  { id: '1920', viewport: { width: 1920, height: 1080 } },
];
const browser = await chromium.launch();
const report = [];
async function run(list, signedIn) {
  for (const s of SIZES) {
    mkdirSync(`${OUT}/${s.id}`, { recursive: true });
    const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: 1, locale: 'en-US',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 ChessScoutStoreShots' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('cs_lang', 'en'); if (t) localStorage.setItem('chess_coach_token', t); } catch {} }, signedIn ? TOKEN : '');
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 200)));
    for (const [name, path] of list) {
      errors.length = 0;
      try {
        await page.goto(`${SITE}${path}${path.includes('?') ? '&' : '?'}cs_shot=1`, { waitUntil: 'load', timeout: 45_000 });
        // Live pages keep sockets open, so wait a fixed time instead of for network idle.
        await page.waitForTimeout(6000);
        // Layout facts: horizontal overflow, elements cut off at the right edge, page height.
        const facts = await page.evaluate(() => {
          const W = document.documentElement.clientWidth;
          const over = [];
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.right > W + 2 && getComputedStyle(el).position !== 'fixed') {
              over.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(r.right)}`);
              if (over.length > 8) break;
            }
          }
          return { url: location.pathname, scrollW: document.documentElement.scrollWidth, W, H: document.documentElement.scrollHeight, over };
        });
        await page.screenshot({ path: `${OUT}/${s.id}/${signedIn ? 'in-' : ''}${name}.png`, fullPage: true });
        report.push({ size: s.id, name, signedIn, ...facts, errors: [...errors] });
        console.log('ok', s.id, name);
      } catch (err) { report.push({ size: s.id, name, signedIn, failed: String(err?.message ?? err).slice(0, 200) }); }
    }
    await ctx.close();
  }
}
if (!process.env.SIGNED_IN_ONLY) await run(PUBLIC, false);
if (TOKEN) await run(SIGNED_IN, true);
await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
