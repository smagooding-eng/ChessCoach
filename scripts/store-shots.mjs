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
// Play Store device types: phone, 7" tablet, 10" tablet, Chromebook.
const DEVICES = [
  { id: 'phone',    viewport: { width: 390, height: 780 },  scale: 3,   mobile: true,
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 ChessScoutStoreShots' },
  { id: 'tablet7',  viewport: { width: 600, height: 960 },  scale: 2,   mobile: true,
    ua: 'Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 ChessScoutStoreShots' },
  { id: 'tablet10', viewport: { width: 800, height: 1280 }, scale: 2,   mobile: true,
    ua: 'Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 ChessScoutStoreShots' },
  { id: 'chromebook', viewport: { width: 1280, height: 720 }, scale: 1.5, mobile: false,
    ua: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 ChessScoutStoreShots' },
];
const browser = await chromium.launch();
for (const d of DEVICES) {
  mkdirSync(`${OUT}/${d.id}`, { recursive: true });
  const ctx = await browser.newContext({
    viewport: d.viewport, deviceScaleFactor: d.scale, isMobile: d.mobile, hasTouch: d.mobile, locale: 'en-US', userAgent: d.ua,
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('cs_lang', 'en'); } catch {} });
  const page = await ctx.newPage();
  for (const [name, path] of PAGES) {
    try {
      await page.goto(`${SITE}${path}`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForTimeout(4000);
      await page.screenshot({ path: `${OUT}/${d.id}/${name}.png` });
      console.log('ok', d.id, name);
    } catch (err) { console.error('failed', d.id, name, err?.message ?? err); }
  }
  await ctx.close();
}
await browser.close();
