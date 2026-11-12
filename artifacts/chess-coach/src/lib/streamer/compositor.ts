// Draws the whole stream stage onto one canvas: background, the board (redrawn from the
// live position, so it's always complete and sharp), the camera / avatar, the name tag.
// That canvas is what gets recorded and broadcast, on phones as well as computers.

export interface PanelRect { x: number; y: number; w: number; h: number; z: number; hidden?: boolean; round?: boolean }

export type BoardFeed =
  | { kind: 'fen'; fen: string; flipped: boolean; last: string }
  | { kind: 'video'; video: HTMLVideoElement; zoom: number; panX: number; panY: number }
  | { kind: 'none' };

export interface CompositeInput {
  layout: Record<'board' | 'cam' | 'tag', PanelRect>;
  board: BoardFeed;
  cam: HTMLCanvasElement | null;
  name: string; subtitle: string;
  light: string; dark: string;
  pieceSrc: (key: string) => string;
  live?: boolean;
}

const imgs: Record<string, HTMLImageElement> = {};
function img(src: string): HTMLImageElement | null {
  let im = imgs[src];
  if (!im) { im = new Image(); im.src = src; imgs[src] = im; }
  return im.complete && im.naturalWidth ? im : null;
}

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

function drawBoard(c: CanvasRenderingContext2D, b: Extract<BoardFeed, { kind: 'fen' }>, x: number, y: number, size: number, inp: CompositeInput) {
  const sq = size / 8;
  const rows = b.fen.split(' ')[0].split('/');
  const last = b.last.length >= 4 ? [b.last.slice(0, 2), b.last.slice(2, 4)] : [];
  const files = 'abcdefgh';
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const dr = b.flipped ? 7 - r : r, df = b.flipped ? 7 - f : f;
    c.fillStyle = (r + f) % 2 ? inp.dark : inp.light;
    c.fillRect(x + df * sq, y + dr * sq, sq + 0.5, sq + 0.5);
    const name = files[f] + (8 - r);
    if (last.includes(name)) { c.fillStyle = 'rgba(255,214,64,.42)'; c.fillRect(x + df * sq, y + dr * sq, sq + 0.5, sq + 0.5); }
  }
  // coordinates
  c.font = `700 ${Math.round(sq * 0.18)}px "DM Sans", sans-serif`;
  for (let i = 0; i < 8; i++) {
    const rank = b.flipped ? i + 1 : 8 - i, file = b.flipped ? files[7 - i] : files[i];
    c.fillStyle = i % 2 ? inp.light : inp.dark; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(String(rank), x + sq * 0.06, y + i * sq + sq * 0.05);
    c.fillStyle = i % 2 ? inp.dark : inp.light; c.textAlign = 'right'; c.textBaseline = 'bottom';
    c.fillText(file, x + (i + 1) * sq - sq * 0.06, y + size - sq * 0.03);
  }
  for (let r = 0; r < 8 && r < rows.length; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      const key = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase();
      const im = img(inp.pieceSrc(key));
      const dr = b.flipped ? 7 - r : r, df = b.flipped ? 7 - f : f;
      if (im) c.drawImage(im, x + df * sq, y + dr * sq, sq, sq);
      f++;
    }
  }
}

export function drawComposite(c: CanvasRenderingContext2D, W: number, H: number, inp: CompositeInput) {
  // background
  const g = c.createRadialGradient(W / 2, 0, 0, W / 2, 0, Math.max(W, H) * 0.9);
  g.addColorStop(0, '#16302a'); g.addColorStop(0.6, '#050A0B'); g.addColorStop(1, '#050A0B');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // footer brand
  const icon = img('/icons/icon-192.png');
  const fh = Math.max(28, H * 0.07), fs = Math.max(12, W * 0.045);
  c.font = `800 ${fs}px "DM Sans", sans-serif`; c.textBaseline = 'middle'; c.textAlign = 'left';
  const label = ['chess', 'scout', '.net'], widths = label.map((t) => c.measureText(t).width), tw = widths.reduce((a, b) => a + b, 0);
  const ih = fh * 0.62, gap = fs * 0.4, sx = (W - (ih + gap + tw)) / 2, cy = H - fh / 2;
  if (icon) c.drawImage(icon, sx, cy - ih / 2, ih, ih);
  let tx = sx + ih + gap;
  label.forEach((t, i) => { c.fillStyle = i === 1 ? '#81B64C' : '#F5F7F6'; c.fillText(t, tx, cy); tx += widths[i]; });

  const order = (Object.keys(inp.layout) as ('board' | 'cam' | 'tag')[]).sort((a, b) => inp.layout[a].z - inp.layout[b].z);
  for (const id of order) {
    const r = inp.layout[id];
    if (r.hidden) continue;
    const x = (r.x / 100) * W, y = (r.y / 100) * H, w = (r.w / 100) * W, h = (r.h / 100) * H;
    c.save();
    if (r.round) { c.beginPath(); c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); c.clip(); }
    else { c.beginPath(); c.rect(x, y, w, h); c.clip(); }
    if (id === 'board') {
      c.fillStyle = '#050A0B'; c.fillRect(x, y, w, h);
      const b = inp.board;
      if (b.kind === 'fen') {
        const size = Math.min(w, h) * 0.98;
        drawBoard(c, b, x + (w - size) / 2, y + (h - size) / 2, size, inp);
      } else if (b.kind === 'video' && b.video.videoWidth) {
        const vw = b.video.videoWidth, vh = b.video.videoHeight;
        const s = Math.min(w / vw, h / vh) * b.zoom, dw = vw * s, dh = vh * s;
        const ox = x + (w - dw) * (dw > w ? b.panX : 0.5), oy = y + (h - dh) * (dh > h ? b.panY : 0.5);
        c.drawImage(b.video, ox, oy, dw, dh);
      } else {
        c.fillStyle = '#87918E'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `700 ${Math.max(14, w * 0.05)}px "DM Sans", sans-serif`;
        if (icon) c.drawImage(icon, x + w / 2 - w * 0.08, y + h / 2 - w * 0.2, w * 0.16, w * 0.16);
        c.fillText('Next game starting soon…', x + w / 2, y + h / 2 + w * 0.06);
      }
    } else if (id === 'cam') {
      if (inp.cam && inp.cam.width > 2) {
        const cw = inp.cam.width, ch = inp.cam.height, s = Math.max(w / cw, h / ch);
        c.drawImage(inp.cam, x + (w - cw * s) / 2, y + (h - ch * s) / 2, cw * s, ch * s);
      } else { c.fillStyle = '#0D1516'; c.fillRect(x, y, w, h); }
    } else {
      c.fillStyle = '#0D1516'; c.fillRect(x, y, w, h);
      c.fillStyle = '#81B64C'; c.fillRect(x, y, w, Math.max(2, h * 0.03));
      const ih2 = h * 0.62, pad = w * 0.04;
      if (icon) { c.save(); rr(c, x + pad, y + (h - ih2) / 2, ih2, ih2, ih2 * 0.22); c.clip(); c.drawImage(icon, x + pad, y + (h - ih2) / 2, ih2, ih2); c.restore(); }
      const tx2 = x + pad * 1.6 + ih2, maxW = w - (tx2 - x) - pad;
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillStyle = '#F5F7F6'; c.font = `800 ${Math.max(11, Math.min(h * 0.3, w * 0.07))}px "DM Sans", sans-serif`;
      c.fillText(inp.name, tx2, y + h * 0.5, maxW);
      c.fillStyle = '#81B64C'; c.font = `700 ${Math.max(9, Math.min(h * 0.2, w * 0.05))}px "DM Sans", sans-serif`;
      c.fillText(inp.subtitle, tx2, y + h * 0.78, maxW);
    }
    c.restore();
    if (id === 'cam' && r.round) {
      c.beginPath(); c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      c.lineWidth = Math.max(3, W * 0.006); c.strokeStyle = '#81B64C'; c.stroke();
    }
  }
  if (inp.live) {
    const ph = Math.max(22, H * 0.03), pw = ph * 2.6, px = W - pw - ph * 0.4, py = ph * 0.4;
    rr(c, px, py, pw, ph, ph * 0.3); c.fillStyle = '#FF5058'; c.fill();
    c.fillStyle = '#fff'; c.font = `900 ${ph * 0.55}px "DM Sans", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('● LIVE', px + pw / 2, py + ph / 2);
  }
}
