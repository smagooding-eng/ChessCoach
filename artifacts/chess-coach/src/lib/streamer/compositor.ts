// Draws the whole stream stage onto one canvas: background, the board (redrawn from the
// live position, so it's always complete and sharp), the camera / avatar, the name tag.
// That canvas is what gets recorded and broadcast, on phones as well as computers.

export interface PanelRect { x: number; y: number; w: number; h: number; z: number; hidden?: boolean; round?: boolean }

export type BoardFeed =
  | { kind: 'fen'; fen: string; flipped: boolean; last: string; top?: string; bottom?: string }
  | { kind: 'video'; video: HTMLVideoElement; zoom: number; panX: number; panY: number }
  | { kind: 'none' };

/** A game review's coach note and the eval bar + names, for a board-only view (see GuidedReview data-studio). */
export interface ReviewNotes {
  title: string; text: string; accent: string; glyph: string; glyphColor: string; evalText: string;
  cp: number | null; white: string; black: string;
  pros: string[]; cons: string[];
}

/** A board panel with review notes: the board gets a square, the notes the rest (beside it when
 *  the panel is wide, under it otherwise), so neither covers the other. Offsets within the panel. */
export function splitBoardPanel(w: number, h: number) {
  if (w / h >= 1.15) { const bs = Math.min(h, w * 0.62); return { board: { x: 0, y: 0, w: bs, h }, notes: { x: bs, y: 0, w: w - bs, h } }; }
  const nh = Math.max(h * 0.34, h - w); return { board: { x: 0, y: 0, w, h: h - nh }, notes: { x: 0, y: h - nh, w, h: nh } };
}

// A text run: the headline's rating line is drawn as coloured pieces side by side.
export interface TextRun { text: string; color: string }

export interface CompositeInput {
  layout: Record<'board' | 'cam' | 'tag', PanelRect> & { head?: PanelRect; notes?: PanelRect };
  /** Review notes, shown in the notes panel when the board is on its own. */
  notes?: ReviewNotes | null;
  /** The headline panel ("The road to 1500 ELO") and the rating line under it. */
  head?: { title: string; runs: TextRun[] } | null;
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

type Look = Pick<CompositeInput, 'light' | 'dark' | 'pieceSrc'>;

/** The board panel for a position: the board, with the players' names above and below when given. */
export function drawBoardPanel(c: CanvasRenderingContext2D, b: Extract<BoardFeed, { kind: 'fen' }>, x: number, y: number, w: number, h: number, look: Look) {
  c.fillStyle = '#050A0B'; c.fillRect(x, y, w, h);
  const names = !!(b.top || b.bottom);
  const strip = names ? Math.max(16, Math.min(w, h) * 0.07) : 0;
  const size = Math.min(w, h - strip * 2) * 0.98;
  const bx = x + (w - size) / 2, by = y + (h - size) / 2;
  drawBoard(c, b, bx, by, size, look);
  if (!names) return;
  c.font = `800 ${Math.round(strip * 0.62)}px "DM Sans", sans-serif`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#F5F7F6';
  if (b.top) c.fillText(b.top, bx + 2, by - strip / 2, size - 4);
  if (b.bottom) c.fillText(b.bottom, bx + 2, by + size + strip / 2, size - 4);
}

function drawBoard(c: CanvasRenderingContext2D, b: Extract<BoardFeed, { kind: 'fen' }>, x: number, y: number, size: number, inp: Look) {
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

  const order = (Object.keys(inp.layout) as ('board' | 'cam' | 'tag' | 'head' | 'notes')[]).filter((k) => !!inp.layout[k]).sort((a, b) => inp.layout[a]!.z - inp.layout[b]!.z);
  for (const id of order) {
    const r = inp.layout[id]!;
    if (r.hidden || (id === 'head' && !inp.head) || id === 'notes') continue; // notes are drawn inside the board panel
    const x = (r.x / 100) * W, y = (r.y / 100) * H, w = (r.w / 100) * W, h = (r.h / 100) * H;
    c.save();
    if (r.round) { c.beginPath(); c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); c.clip(); }
    else { c.beginPath(); c.rect(x, y, w, h); c.clip(); }
    if (id === 'board') {
      c.fillStyle = '#050A0B'; c.fillRect(x, y, w, h);
      const b = inp.board;
      if (b.kind === 'fen' && inp.notes) {
        const sp = splitBoardPanel(w, h);
        drawBoardPanel(c, b, x + sp.board.x, y + sp.board.y, sp.board.w, sp.board.h, inp);
        drawReviewNotes(c, inp.notes, x + sp.notes.x, y + sp.notes.y, sp.notes.w, sp.notes.h);
      } else if (b.kind === 'fen') {
        drawBoardPanel(c, b, x, y, w, h, inp);
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
    } else if (id === 'head') {
      drawHead(c, inp.head!, x, y, w, h);

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

/** Font sizes for the headline panel, shared with the on-screen stage so both match. */
export function headSizes(w: number, h: number) {
  return { title: Math.max(12, Math.min(h * 0.4, w * 0.075)), line: Math.max(10, Math.min(h * 0.26, w * 0.05)) };
}

function drawHead(c: CanvasRenderingContext2D, head: { title: string; runs: TextRun[] }, x: number, y: number, w: number, h: number) {
  c.fillStyle = '#0D1516'; c.fillRect(x, y, w, h);
  c.fillStyle = '#81B64C'; c.fillRect(x, y + h - Math.max(2, h * 0.035), w, Math.max(2, h * 0.035));
  const fz = headSizes(w, h), pad = w * 0.04, maxW = w - pad * 2, cx = x + w / 2;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#F5F7F6'; c.font = `900 ${fz.title}px "DM Sans", sans-serif`;
  c.fillText(head.title.toUpperCase(), cx, y + h * 0.5, maxW);
  if (!head.runs.length) return;
  c.font = `800 ${fz.line}px "DM Sans", sans-serif`;
  const widths = head.runs.map((r) => c.measureText(r.text).width);
  const total = widths.reduce((a, b) => a + b, 0), k = total > maxW ? maxW / total : 1;
  let tx = cx - (total * k) / 2;
  c.textAlign = 'left';
  head.runs.forEach((r, i) => { c.fillStyle = r.color; c.fillText(r.text, tx, y + h * 0.84, widths[i] * k); tx += widths[i] * k; });
}

function wrapLines(c: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean), out: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (c.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = w; if (out.length === maxLines) break; }
  }
  if (out.length < maxLines && line) out.push(line);
  if (out.length === maxLines && words.join(' ') !== out.join(' ')) { let last = out[maxLines - 1]; while (last && c.measureText(`${last}…`).width > maxW) last = last.slice(0, -1); out[maxLines - 1] = `${last}…`; }
  return out;
}

/** The coach's note (the move's grade, what it means, its pros and cons) over the eval bar and names. */
export function drawReviewNotes(c: CanvasRenderingContext2D, n: ReviewNotes, x: number, y: number, w: number, h: number) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = '#050A0B'; c.fillRect(x, y, w, h);
  const pad = Math.max(5, Math.min(w, h) * 0.035);
  const base = Math.max(10, Math.min(w * 0.064, h * 0.075, 26));
  const barH = Math.max(5, base * 0.45), namesH = base * 1.25;
  const cx = x + pad, cw = w - pad * 2, cy = y + pad, ch = h - pad * 2 - barH - namesH - pad * 0.5;
  rr(c, cx, cy, cw, ch, Math.min(14, base * 0.7)); c.fillStyle = '#162022'; c.fill();
  c.fillStyle = n.accent || '#81B64C'; c.fillRect(cx, cy + base * 0.4, Math.max(3, base * 0.18), ch - base * 0.8);
  const ix = cx + base * 0.8, iw = cw - base * 1.4, bottom = cy + ch - base * 0.4;
  let ty = cy + base * 0.55;
  // title row: grade icon, "Rxc5 is a miss", eval chip
  let tx = ix;
  const rowMid = ty + base * 0.6;
  if (n.glyph) {
    const r = base * 0.62;
    c.beginPath(); c.arc(tx + r, rowMid, r, 0, Math.PI * 2); c.fillStyle = n.glyphColor || '#81B64C'; c.fill();
    c.fillStyle = '#fff'; c.font = `900 ${base * (n.glyph.length > 1 ? 0.55 : 0.75)}px "DM Sans", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n.glyph, tx + r, rowMid + 1);
    tx += r * 2 + base * 0.4;
  }
  let right = ix + iw;
  if (n.evalText) {
    c.font = `800 ${base * 0.8}px "DM Sans", sans-serif`;
    const ew = c.measureText(n.evalText).width + base * 0.8, eh = base * 1.25;
    rr(c, right - ew, rowMid - eh / 2, ew, eh, eh * 0.25); c.fillStyle = 'rgba(255,255,255,.1)'; c.fill();
    c.fillStyle = '#F5F7F6'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n.evalText, right - ew / 2, rowMid + 1);
    right -= ew + base * 0.5;
  }
  c.fillStyle = '#F5F7F6'; c.font = `800 ${base * 1.05}px "DM Sans", sans-serif`; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText(n.title, tx, rowMid, Math.max(10, right - tx));
  ty += base * 1.55;
  // explanation, then pros and cons, as much as fits
  const line = base * 0.86, lh = line * 1.32;
  const room = () => Math.floor((bottom - ty) / lh);
  c.textBaseline = 'top';
  if (n.text && room() > 0) {
    c.font = `500 ${line}px "DM Sans", sans-serif`; c.fillStyle = 'rgba(245,247,246,.86)';
    const want = n.pros.length || n.cons.length ? Math.max(1, Math.min(3, room() - Math.min(2, n.pros.length + n.cons.length))) : room();
    for (const l of wrapLines(c, n.text, iw, want)) { c.fillText(l, ix, ty); ty += lh; }
    ty += lh * 0.25;
  }
  const list = (items: string[], mark: string, color: string) => {
    for (const it of items) {
      const left = room(); if (left <= 0) return;
      c.font = `800 ${line}px "DM Sans", sans-serif`; c.fillStyle = color; c.fillText(mark, ix, ty);
      c.font = `500 ${line}px "DM Sans", sans-serif`; c.fillStyle = 'rgba(245,247,246,.86)';
      for (const l of wrapLines(c, it, iw - line * 1.1, Math.min(2, left))) { c.fillText(l, ix + line * 1.1, ty); ty += lh; }
    }
  };
  list(n.pros, '+', '#81B64C');
  list(n.cons, '−', '#F0605D');
  // eval bar (White's share from the left) and the names
  const by = cy + ch + pad * 0.5, cp = n.cp ?? 0;
  const share = Math.abs(cp) >= 9000 ? (cp > 0 ? 1 : 0) : 0.5 + 0.5 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1500, Math.min(1500, cp)))) - 1);
  rr(c, cx, by, cw, barH, barH / 2); c.fillStyle = '#2B2F31'; c.fill();
  c.save(); rr(c, cx, by, cw, barH, barH / 2); c.clip(); c.fillStyle = '#EDEDED'; c.fillRect(cx, by, cw * share, barH); c.restore();
  const ny = by + barH + namesH / 2 + 1;
  c.font = `800 ${base * 0.78}px "DM Sans", sans-serif`; c.fillStyle = '#C9CFCD'; c.textBaseline = 'middle';
  c.textAlign = 'left'; c.fillText(n.white, cx + 2, ny, cw * 0.48);
  c.textAlign = 'right'; c.fillText(n.black, cx + cw - 2, ny, cw * 0.48);
  c.restore();
}
