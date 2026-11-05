// The video maker: records one Content Studio clip to an MP4 with its sound.
// Run by .github/workflows/studio-render.yml (see api-server routes/studioRender.ts).
// It opens /studio-render?job=… signed in as the admin who asked, waits until the clip
// and its voiceover are loaded, then records the screen (Chrome's screencast: every
// frame with its time) while the page records the clip's own soundtrack, and joins them
// with ffmpeg into a 1080×1920 MP4.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';

const SITE = process.env.SITE || 'https://chessscout.net';
const API = process.env.API || 'https://chesscoach-api-kbf8.onrender.com';
const { JOB = '', SECRET = '', TOKEN = '' } = process.env;
const OUT = process.env.OUT || 'render-out';
const URL_ = process.env.RENDER_URL || `${SITE}/studio-render?job=${encodeURIComponent(JOB)}&cs_shot=1`;
const report = (status, extra = {}) => (process.env.NO_REPORT ? Promise.resolve() : fetch(`${API}/api/studio/render/${JOB}/report`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: SECRET, status, ...extra }),
}).catch(() => {}));

async function main() {
  await report('rendering');
  mkdirSync(`${OUT}/f`, { recursive: true });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({
    viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 ChessScoutRender',
  });
  await ctx.addInitScript((t) => { try { if (t) localStorage.setItem('chess_coach_token', t); localStorage.setItem('cs_lang', 'en'); } catch {} }, TOKEN);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text().slice(0, 200)); });
  await page.goto(URL_, { waitUntil: 'load', timeout: 120_000 });
  // The clip and the whole voiceover loaded (the voice is made on the server; long clips take a while).
  await page.waitForFunction(() => window.__studioRender?.ready || window.__studioRender?.error, null, { timeout: 6 * 60_000, polling: 500 });
  const err = await page.evaluate(() => window.__studioRender?.error);
  if (err) throw new Error(`page: ${err}`);
  await page.waitForTimeout(1500); // fonts, images, first paint

  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    const n = frames.length;
    writeFileSync(`${OUT}/f/${String(n).padStart(6, '0')}.jpg`, Buffer.from(f.data, 'base64'));
    frames.push(f.metadata.timestamp);
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__studioRender.start());
  await page.waitForFunction(() => window.__studioRender?.done, null, { timeout: 12 * 60_000, polling: 500 });
  await page.waitForTimeout(300);
  await cdp.send('Page.stopScreencast').catch(() => {});
  const r = await page.evaluate(() => ({ audio: window.__studioRender.audio, ext: window.__studioRender.ext, startedAt: window.__studioRender.startedAt, endedAt: window.__studioRender.endedAt }));
  await browser.close();
  if (!frames.length) throw new Error('no frames recorded');

  // The picture from the moment playback (and the soundtrack) started to when it stopped.
  const t0 = r.startedAt / 1000, t1 = r.endedAt / 1000;
  let first = 0;
  for (let k = 0; k < frames.length; k++) if (frames[k] <= t0) first = k;
  const lines = [];
  for (let k = first; k < frames.length && frames[k] < t1; k++) {
    const from = Math.max(frames[k], t0), to = Math.min(k + 1 < frames.length ? frames[k + 1] : t1, t1);
    if (to <= from) continue;
    lines.push(`file 'f/${String(k).padStart(6, '0')}.jpg'`, `duration ${(to - from).toFixed(4)}`);
  }
  const lastFile = lines.filter((x) => x.startsWith('file')).pop();
  if (!lastFile) throw new Error('no frames in the clip');
  lines.push(lastFile);
  writeFileSync(`${OUT}/frames.txt`, lines.join('\n'));
  const hasAudio = !!r.audio;
  if (hasAudio) writeFileSync(`${OUT}/audio.${r.ext}`, Buffer.from(r.audio, 'base64'));
  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', `${OUT}/frames.txt`];
  if (hasAudio) args.push('-i', `${OUT}/audio.${r.ext}`);
  args.push('-vf', 'scale=1080:1920:flags=lanczos,format=yuv420p', '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high');
  if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  args.push('-t', String(Math.max(1, t1 - t0)), '-movflags', '+faststart', `${OUT}/video.mp4`);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  console.log(`made ${OUT}/video.mp4: ${(t1 - t0).toFixed(1)}s, ${frames.length} frames, audio: ${hasAudio}`);
}

main().catch(async (e) => {
  console.error(e);
  await report('failed', { error: String(e?.message ?? e).slice(0, 400) });
  process.exit(1);
});
