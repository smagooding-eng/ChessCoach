// Raw phone screenshots of the live public pages for the Play Store listing
// (framed and captioned separately). Run by .github/workflows/store-shots.yml.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const SITE = process.env.SITE || 'https://chessscout.net';
const OUT = process.env.OUT || 'store-assets/raw';
const PAGES = [
  ['home', '/'],
  ['scout', '/players/hikaru'],
  ['players', '/players'],
  ['tournaments', '/tournaments'],
  ['settings', '/settings'],
  ['learn', '/learn'],
  ['pricing', '/pricing'],
];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 ChessScoutStoreShots',
});
await ctx.addInitScript(() => { try { localStorage.setItem('cs_lang', 'en'); } catch {} });
const page = await ctx.newPage();
for (const [name, path] of PAGES) {
  try {
    await page.goto(`${SITE}${path}`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log('ok', name);
  } catch (err) { console.error('failed', name, err?.message ?? err); }
}
await browser.close();
