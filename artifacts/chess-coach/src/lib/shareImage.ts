// Share cards drawn straight onto a canvas (1080×1350, the 4:5 size Instagram,
// Facebook, Reddit and X all show in full). No html2canvas: the board uses the
// app's own piece images, so nothing comes out blank. Every card ends with
// chessscout.net, so each share is an invitation.
import { Chess } from 'chess.js';

export interface ShareBoard {
  fen: string;
  /** Squares of the last move, highlighted. */
  lastMove?: { from: string; to: string } | null;
  /** Label on the moved piece's square, e.g. "!!" for a brilliant move. */
  badge?: { square: string; text: string; color: string } | null;
  flipped?: boolean;
}
export interface ShareStat { value: string; label: string; color?: string }
export interface ShareSpec {
  /** Small line above the headline, e.g. "GAME REVIEW". */
  kicker: string;
  headline: string;
  sub?: string;
  board?: ShareBoard;
  stats?: ShareStat[];
  /** Bottom call to action, before the link. */
  cta?: string;
}

const W = 1080, H = 1350;
const BG = '#0B1112', GREEN = '#81B64C', TEXT = '#F5F7F6', MUTED = '#8E9996', LIGHT = '#EEEED2', DARK = '#769656';
const FONT = 'Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shrinks the font until the text fits the width (one line). */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 900): number {
  let s = size;
  for (; s > 24; s -= 2) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  return s;
}

async function drawBoard(ctx: CanvasRenderingContext2D, b: ShareBoard, x: number, y: number, size: number) {
  const sq = size / 8;
  let board: ({ type: string; color: string } | null)[][] = [];
  try { board = new Chess(b.fen).board(); } catch { board = Array.from({ length: 8 }, () => Array(8).fill(null)); }
  const files = 'abcdefgh';
  const at = (square: string) => {
    const f = files.indexOf(square[0]), r = 8 - Number(square[1]);
    return b.flipped ? { col: 7 - f, row: 7 - r } : { col: f, row: r };
  };
  ctx.save();
  roundRect(ctx, x, y, size, size, 18);
  ctx.clip();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    ctx.fillStyle = (r + c) % 2 === 0 ? LIGHT : DARK;
    ctx.fillRect(x + c * sq, y + r * sq, sq, sq);
  }
  if (b.lastMove) for (const s of [b.lastMove.from, b.lastMove.to]) {
    const p = at(s);
    ctx.fillStyle = 'rgba(255, 214, 0, 0.42)';
    ctx.fillRect(x + p.col * sq, y + p.row * sq, sq, sq);
  }
  const imgs = await Promise.all(board.flat().map((p) => (p ? loadImage(`/pieces/cburnett/${p.color}${p.type.toUpperCase()}.svg`) : Promise.resolve(null))));
  board.flat().forEach((p, i) => {
    if (!p) return;
    const r0 = Math.floor(i / 8), c0 = i % 8;
    const r = b.flipped ? 7 - r0 : r0, c = b.flipped ? 7 - c0 : c0;
    const im = imgs[i];
    if (im) ctx.drawImage(im, x + c * sq + sq * 0.04, y + r * sq + sq * 0.04, sq * 0.92, sq * 0.92);
  });
  ctx.restore();
  if (b.badge) {
    const p = at(b.badge.square);
    const cx = x + (p.col + 1) * sq - sq * 0.08, cy = y + p.row * sq + sq * 0.08, rad = sq * 0.26;
    ctx.beginPath(); ctx.arc(cx, cy, rad + 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fillStyle = b.badge.color; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(rad * 1.05)}px ${FONT}`;
    ctx.fillText(b.badge.text, cx, cy + 2);
  }
}

export async function renderShareImage(spec: ShareSpec): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  try { await document.fonts?.ready; } catch { /* draw anyway */ }
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background: dark with a soft green glow at the top.
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -120, 40, W / 2, -120, 900);
  glow.addColorStop(0, 'rgba(129,182,76,0.35)'); glow.addColorStop(1, 'rgba(129,182,76,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // Brand row.
  const logo = await loadImage('/icons/icon-192.png');
  let y = 70;
  if (logo) { ctx.save(); roundRect(ctx, 70, y, 72, 72, 16); ctx.clip(); ctx.drawImage(logo, 70, y, 72, 72); ctx.restore(); }
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = `900 40px ${FONT}`;
  ctx.fillStyle = TEXT; ctx.fillText('Chess', 162, y + 37);
  const w1 = ctx.measureText('Chess').width;
  ctx.fillStyle = GREEN; ctx.fillText('Scout', 162 + w1, y + 37);
  const w2 = ctx.measureText('Scout').width;
  ctx.fillStyle = TEXT; ctx.fillText('.net', 162 + w1 + w2, y + 37);

  // Kicker + headline + sub (lower down when there is no board, so the card stays balanced).
  y = spec.board ? 210 : 400;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `800 30px ${FONT}`; ctx.fillStyle = GREEN;
  ctx.fillText(spec.kicker.toUpperCase().split('').join(' '), W / 2, y);
  y += 90;
  const hs = fitText(ctx, spec.headline, W - 140, 84);
  ctx.font = `900 ${hs}px ${FONT}`; ctx.fillStyle = TEXT;
  ctx.fillText(spec.headline, W / 2, y);
  if (spec.sub) {
    y += 60;
    const ss = fitText(ctx, spec.sub, W - 160, 38, 700);
    ctx.font = `700 ${ss}px ${FONT}`; ctx.fillStyle = MUTED;
    ctx.fillText(spec.sub, W / 2, y);
  }

  // Board, or a big stat panel when there is no board.
  const statsY = H - 330;
  if (spec.board) {
    const top = y + 50;
    const size = Math.min(W - 220, statsY - 40 - top);
    await drawBoard(ctx, spec.board, (W - size) / 2, top, size);
  }

  // Stats row.
  const stats = (spec.stats ?? []).slice(0, 3);
  if (stats.length) {
    const gap = 24, boxW = (W - 140 - gap * (stats.length - 1)) / stats.length, boxH = spec.board ? 150 : 300;
    const by = spec.board ? statsY : (y + 110);
    stats.forEach((s, i) => {
      const bx = 70 + i * (boxW + gap);
      roundRect(ctx, bx, by, boxW, boxH, 24);
      ctx.fillStyle = '#141D1F'; ctx.fill();
      ctx.strokeStyle = '#243033'; ctx.lineWidth = 2; ctx.stroke();
      ctx.textAlign = 'center';
      const vs = fitText(ctx, s.value, boxW - 30, spec.board ? 64 : 96);
      ctx.font = `900 ${vs}px ${FONT}`; ctx.fillStyle = s.color ?? TEXT;
      ctx.fillText(s.value, bx + boxW / 2, by + boxH / 2 + (spec.board ? 6 : 10));
      ctx.font = `700 26px ${FONT}`; ctx.fillStyle = MUTED;
      ctx.fillText(s.label, bx + boxW / 2, by + boxH - 24);
    });
  }

  // Footer call to action.
  ctx.textAlign = 'center';
  ctx.font = `800 34px ${FONT}`; ctx.fillStyle = TEXT;
  ctx.fillText(spec.cta ?? 'Free game reviews, puzzles and more', W / 2, H - 112);
  ctx.font = `900 40px ${FONT}`; ctx.fillStyle = GREEN;
  ctx.fillText('chessscout.net', W / 2, H - 60);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/** The square a SAN move lands on, played from a position (for the badge). */
export function landingSquare(fenBefore: string, san: string): { from: string; to: string } | null {
  try { const c = new Chess(fenBefore); const m = c.move(san); return { from: m.from, to: m.to }; } catch { return null; }
}
