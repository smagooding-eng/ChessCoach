const { chromium } = require('playwright');
const fs = require('fs');
const RAW = '/home/claude/smagooding-eng/chesscoach/store-assets/raw';
const OUT = '/home/claude/smagooding-eng/chesscoach/store-assets/play';
const SHOTS = [
  ['home', 'Play. Scout. <g>Improve.</g>', 'Every game reviewed by your coach'],
  ['scout', 'Scout <g>any opponent</g>', 'Their openings and results before you play'],
  ['players', 'What <g>top players</g> play', 'Real games from GMs and streamers'],
  ['tournaments', 'Free <g>tournaments</g>', 'Nightly arenas and weekend knockouts'],
  ['settings', 'Make the board <g>yours</g>', 'Boards, piece sets, themes and sounds'],
  ['learn', 'Stop making the <g>same mistakes</g>', 'Guides built around real games'],
];
const DEV = {
  phone:      { w: 1080, h: 1920, portrait: true },
  tablet7:    { w: 1200, h: 1920, portrait: true },
  tablet10:   { w: 1600, h: 2560, portrait: true },
  chromebook: { w: 1920, h: 1080, portrait: false },
};
const css = (w, h, portrait) => {
  const u = portrait ? w / 1080 : h / 1080;
  return `*{margin:0;box-sizing:border-box}
body{width:${w}px;height:${h}px;overflow:hidden;font-family:Inter,sans-serif;color:#F5F7F6;position:relative;
  background:radial-gradient(ellipse ${w * 0.9}px ${h * 0.55}px at ${portrait ? '50% 8%' : '20% 50%'},#173B22 0%,#0A1A12 45%,#050A0B 100%)}
g{color:#81B64C}
.logo{font-size:${34 * u}px;font-weight:800;letter-spacing:-.02em}
h1{font-size:${(portrait ? 88 : 80) * u}px;line-height:1.04;font-weight:900;letter-spacing:-.035em}
p{font-size:${(portrait ? 40 : 36) * u}px;line-height:1.3;color:#C9D1CE;font-weight:500}
.frame{position:absolute;border-radius:${40 * u}px;overflow:hidden;border:${6 * u}px solid #1E2A2B;box-shadow:0 ${30 * u}px ${80 * u}px rgba(0,0,0,.6),0 0 0 ${2 * u}px rgba(129,182,76,.25)}
.frame img{display:block;width:100%}`;
};
const html = (dev, shot, title, sub) => {
  const { w, h, portrait } = DEV[dev];
  const u = portrait ? w / 1080 : h / 1080;
  const src = 'data:image/png;base64,' + fs.readFileSync(`${RAW}/${dev}/${shot}.png`).toString('base64');
  if (portrait) {
    const fw = Math.round(w * (dev === 'phone' ? 0.8 : 0.84));
    return `<!doctype html><html><head><meta charset="utf-8"><style>${css(w, h, true)}
.cap{position:absolute;left:0;right:0;top:${90 * u}px;text-align:center;padding:0 ${60 * u}px}
.cap h1{margin-top:${28 * u}px}.cap p{margin-top:${20 * u}px}
.frame{left:${(w - fw) / 2}px;top:${h * 0.27}px;width:${fw}px}</style></head><body>
<div class="cap"><div class="logo">Chess<g>Scout</g>.net</div><h1>${title}</h1><p>${sub}</p></div>
<div class="frame"><img src="${src}"></div></body></html>`;
  }
  const fw = Math.round(w * 0.6);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css(w, h, false)}
.cap{position:absolute;left:${90 * u}px;width:${w * 0.3}px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center}
.cap h1{margin-top:${28 * u}px}.cap p{margin-top:${22 * u}px}
.frame{right:${70 * u}px;top:50%;transform:translateY(-50%);width:${fw}px;border-radius:${24 * u}px}</style></head><body>
<div class="cap"><div class="logo">Chess<g>Scout</g>.net</div><h1>${title}</h1><p>${sub}</p></div>
<div class="frame"><img src="${src}"></div></body></html>`;
};
(async () => {
  const b = await chromium.launch();
  for (const dev of Object.keys(DEV)) {
    fs.mkdirSync(`${OUT}/${dev}`, { recursive: true });
    const { w, h } = DEV[dev];
    const pg = await b.newPage({ viewport: { width: w, height: h } });
    let i = 1;
    for (const [shot, title, sub] of SHOTS) {
      await pg.setContent(html(dev, shot, title, sub), { waitUntil: 'load' });
      await pg.screenshot({ path: `${OUT}/${dev}/${i}-${shot}.jpg`, type: 'jpeg', quality: 92 });
      i++;
    }
    await pg.close();
  }
  fs.copyFileSync('feature-graphic.png', `${OUT}/feature-graphic.png`);
  await b.close();
})();
