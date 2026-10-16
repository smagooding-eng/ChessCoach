// Link-preview pictures: real screenshots of the live public pages.
// Run by .github/workflows/link-previews.yml (daily + on demand). Each page is
// rendered at 630x630 (so the whole shot survives the square crop Facebook
// uses on phones), then centred on a 1200x630 card over a blurred copy of
// itself. Output: artifacts/chess-coach/public/shots/<name>.jpg
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const SITE = process.env.SITE || 'https://chessscout.net';
const OUT = process.env.OUT || 'artifacts/chess-coach/public/shots';
const PAGES = [
  ['home', '/'], ['players', '/players'], ['tournaments', '/tournaments'],
  ['pricing', '/pricing'], ['learn', '/learn'],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 630, height: 630 }, deviceScaleFactor: 2, locale: 'en-US' });
// Keep the shots in English (the site follows the browser language).
await ctx.addInitScript(() => { try { localStorage.setItem('cs_lang', 'en'); } catch {} });
const page = await ctx.newPage();
const compose = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
let failed = 0;
for (const [name, path] of PAGES) {
  try {
    await page.goto(`${SITE}${path}`, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.waitForTimeout(3500); // splash + fade-ins
    const shot = (await page.screenshot({ type: 'jpeg', quality: 88 })).toString('base64');
    const src = `data:image/jpeg;base64,${shot}`;
    await compose.setContent(`<!doctype html><html><body style="margin:0;width:1200px;height:630px;overflow:hidden;background:#050A0B;position:relative">
      <div style="position:absolute;inset:-40px;background:url(${src}) center/cover;filter:blur(28px) brightness(.45)"></div>
      <img src="${src}" style="position:absolute;left:285px;top:0;width:630px;height:630px;box-shadow:0 0 60px rgba(0,0,0,.6)">
    </body></html>`, { waitUntil: 'load' });
    await compose.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 85 });
    console.log('ok', name);
  } catch (err) {
    failed++;
    console.error('failed', name, err?.message ?? err);
  }
}
await browser.close();
if (failed === PAGES.length) process.exit(1);
