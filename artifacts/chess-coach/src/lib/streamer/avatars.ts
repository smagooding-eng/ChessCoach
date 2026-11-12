// Streamer avatars, drawn on a canvas and driven by the face tracker (or by the
// voice when there is no camera). All original artwork made from shapes.

export type AvatarId =
  | 'knight' | 'robot' | 'cat' | 'alien' | 'panda' | 'ghost' | 'mystery' | 'smiley' | 'fox'
  | 'alex' | 'sam' | 'jordan' | 'riley';

export const AVATARS: { id: AvatarId; label: string; emoji: string; group: 'cartoon' | 'person' }[] = [
  { id: 'knight', label: 'Scout Knight', emoji: '🛡️', group: 'cartoon' },
  { id: 'robot', label: 'Robot', emoji: '🤖', group: 'cartoon' },
  { id: 'cat', label: 'Cat', emoji: '🐱', group: 'cartoon' },
  { id: 'fox', label: 'Fox', emoji: '🦊', group: 'cartoon' },
  { id: 'panda', label: 'Panda', emoji: '🐼', group: 'cartoon' },
  { id: 'alien', label: 'Alien', emoji: '👽', group: 'cartoon' },
  { id: 'ghost', label: 'Ghost', emoji: '👻', group: 'cartoon' },
  { id: 'mystery', label: 'Hooded', emoji: '🥷', group: 'cartoon' },
  { id: 'smiley', label: 'Smiley', emoji: '😀', group: 'cartoon' },
  { id: 'alex', label: 'Alex', emoji: '🧑', group: 'person' },
  { id: 'sam', label: 'Sam', emoji: '👩🏾', group: 'person' },
  { id: 'jordan', label: 'Jordan', emoji: '🧑🏽‍🦰', group: 'person' },
  { id: 'riley', label: 'Riley', emoji: '🧔', group: 'person' },
];

export interface AvatarPose {
  x: number; y: number; size: number; roll: number; yaw: number; pitch: number;
  mouth: number; blinkL: number; blinkR: number; smile: number; t: number;
}

type C = CanvasRenderingContext2D;
const INK = '#141414';

function ell(c: C, x: number, y: number, rx: number, ry: number, fill: string, stroke: string | null = INK, lw = 0) {
  c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  c.fillStyle = fill; c.fill();
  if (stroke && lw > 0) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
}
function rrect(c: C, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** Cartoon eye: white, iris, pupil, highlight; closes with blink. */
function eye(c: C, x: number, y: number, r: number, blink: number, iris: string, look: number, lw: number) {
  const open = Math.max(0.08, 1 - blink * 1.1);
  if (open < 0.2) { c.beginPath(); c.moveTo(x - r, y); c.quadraticCurveTo(x, y + r * 0.5, x + r, y); c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); return; }
  ell(c, x, y, r, r * 1.1 * open, '#fff', INK, lw);
  c.save(); c.beginPath(); c.ellipse(x, y, r, r * 1.1 * open, 0, 0, Math.PI * 2); c.clip();
  ell(c, x + look * r * 0.35, y + r * 0.1, r * 0.62, r * 0.68, iris);
  ell(c, x + look * r * 0.35, y + r * 0.1, r * 0.32, r * 0.36, INK);
  ell(c, x + look * r * 0.35 - r * 0.2, y - r * 0.15, r * 0.14, r * 0.14, '#fff');
  c.restore();
}

/** Mouth: a smile line when closed, an open mouth with tongue when talking. */
function mouth(c: C, x: number, y: number, w: number, open: number, smile: number, lw: number, inside = '#5a1a1a') {
  const o = Math.min(1, open);
  if (o < 0.08) {
    c.beginPath(); c.moveTo(x - w / 2, y); c.quadraticCurveTo(x, y + w * (0.18 + smile * 0.35), x + w / 2, y);
    c.lineWidth = lw; c.lineCap = 'round'; c.strokeStyle = INK; c.stroke(); return;
  }
  const h = w * (0.15 + o * 0.75);
  c.beginPath(); c.moveTo(x - w / 2, y); c.quadraticCurveTo(x, y - h * 0.15 + smile * w * 0.1, x + w / 2, y);
  c.quadraticCurveTo(x, y + h * 1.5, x - w / 2, y); c.closePath();
  c.fillStyle = inside; c.fill();
  c.save(); c.clip(); ell(c, x, y + h * 0.95, w * 0.28, h * 0.45, '#e2656f'); c.restore();
  c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
}

function shoulders(c: C, R: number, shirt: string, lw: number) {
  c.beginPath(); c.moveTo(-R * 1.9, R * 2.9); c.quadraticCurveTo(-R * 1.7, R * 1.25, -R * 0.35, R * 1.12);
  c.lineTo(R * 0.35, R * 1.12); c.quadraticCurveTo(R * 1.7, R * 1.25, R * 1.9, R * 2.9); c.closePath();
  c.fillStyle = shirt; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
}

export function drawAvatar(c: C, id: AvatarId, p: AvatarPose) {
  const R = p.size * 0.62;          // head radius
  const lw = Math.max(2, R * 0.045);
  const fx = p.yaw * R * 0.22;       // features follow head turn
  const fy = p.pitch * R * 0.12;
  const look = p.yaw * 0.8;
  c.save();
  c.translate(p.x, p.y);
  c.rotate(p.roll);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const eyes = (ex: number, ey: number, er: number, iris: string) => {
    eye(c, -ex + fx, ey + fy, er, p.blinkL, iris, look, lw);
    eye(c, ex + fx, ey + fy, er, p.blinkR, iris, look, lw);
  };
  switch (id) {
    case 'knight': {
      shoulders(c, R, '#3a4048', lw);
      // plume
      c.save(); c.rotate(Math.sin(p.t * 2) * 0.05);
      c.beginPath(); c.moveTo(-R * 0.15, -R * 0.95); c.quadraticCurveTo(R * 0.2, -R * 1.9, R * 1.05, -R * 1.45);
      c.quadraticCurveTo(R * 0.55, -R * 1.25, R * 0.25, -R * 0.9); c.closePath(); c.fillStyle = '#81B64C'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
      c.restore();
      const g = c.createLinearGradient(-R, 0, R, 0); g.addColorStop(0, '#6d7682'); g.addColorStop(0.45, '#e9edf2'); g.addColorStop(1, '#5c646f');
      rrect(c, -R * 0.95, -R * 1.05, R * 1.9, R * 2.15, R * 0.75); c.fillStyle = g; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
      // visor slit with glowing eyes
      rrect(c, -R * 0.75 + fx, -R * 0.2 + fy, R * 1.5, R * 0.32, R * 0.12); c.fillStyle = '#0b0f10'; c.fill(); c.stroke();
      const glow = 1 - Math.max(p.blinkL, p.blinkR) * 0.8;
      c.shadowColor = '#81B64C'; c.shadowBlur = R * 0.3 * glow;
      ell(c, -R * 0.33 + fx, -R * 0.04 + fy, R * 0.15, R * 0.07 * glow + 0.5, `rgba(129,182,76,${0.35 + glow * 0.65})`);
      ell(c, R * 0.33 + fx, -R * 0.04 + fy, R * 0.15, R * 0.07 * glow + 0.5, `rgba(129,182,76,${0.35 + glow * 0.65})`);
      c.shadowBlur = 0;
      // breathing vents light up when talking
      for (let i = -2; i <= 2; i++) {
        c.beginPath(); c.moveTo(i * R * 0.17 + fx, R * 0.42 + fy); c.lineTo(i * R * 0.17 + fx, R * 0.72 + fy);
        c.lineWidth = lw * 1.4; c.strokeStyle = p.mouth > 0.1 ? `rgba(232,180,71,${0.4 + p.mouth * 0.6})` : '#2b3036'; c.stroke();
      }
      break;
    }
    case 'robot': {
      shoulders(c, R, '#4b5563', lw);
      c.beginPath(); c.moveTo(0, -R * 1.05); c.lineTo(0, -R * 1.45); c.lineWidth = lw * 1.4; c.strokeStyle = INK; c.stroke();
      ell(c, 0, -R * 1.5, R * 0.13, R * 0.13, Math.sin(p.t * 5) > 0 ? '#ff5058' : '#7a1f27', INK, lw);
      rrect(c, -R, -R * 1.05, R * 2, R * 2.05, R * 0.25); c.fillStyle = '#aab3bf'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
      ell(c, -R * 1.05, 0, R * 0.12, R * 0.3, '#7d8794', INK, lw); ell(c, R * 1.05, 0, R * 0.12, R * 0.3, '#7d8794', INK, lw);
      const eh = Math.max(0.05, 1 - Math.max(p.blinkL, p.blinkR)) * R * 0.28;
      c.shadowColor = '#5ad7ff'; c.shadowBlur = R * 0.25;
      rrect(c, -R * 0.62 + fx, -R * 0.35 + fy - eh / 2, R * 0.42, eh, R * 0.06); c.fillStyle = '#5ad7ff'; c.fill();
      rrect(c, R * 0.2 + fx, -R * 0.35 + fy - eh / 2, R * 0.42, eh, R * 0.06); c.fill();
      c.shadowBlur = 0;
      rrect(c, -R * 0.55 + fx, R * 0.3 + fy, R * 1.1, R * 0.38, R * 0.08); c.fillStyle = '#1d232b'; c.fill(); c.stroke();
      for (let i = 0; i < 7; i++) {
        const bh = R * 0.3 * (0.15 + p.mouth * (0.5 + 0.5 * Math.abs(Math.sin(p.t * 18 + i))));
        c.fillStyle = '#81B64C'; c.fillRect(-R * 0.48 + i * R * 0.145 + fx, R * 0.49 + fy - bh / 2, R * 0.09, bh);
      }
      break;
    }
    case 'cat': case 'fox': {
      const fox = id === 'fox';
      const fur = fox ? '#e8762b' : '#f2a33a', inner = fox ? '#fff3e6' : '#f6b5c0';
      shoulders(c, R, fox ? '#2f5fa8' : '#81B64C', lw);
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(s * R * 0.25, -R * 0.85); c.lineTo(s * R * (fox ? 0.95 : 0.85), -R * (fox ? 1.55 : 1.35)); c.lineTo(s * R * 0.95, -R * 0.35); c.closePath();
        c.fillStyle = fur; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
        c.beginPath(); c.moveTo(s * R * 0.4, -R * 0.75); c.lineTo(s * R * (fox ? 0.85 : 0.78), -R * (fox ? 1.3 : 1.15)); c.lineTo(s * R * 0.82, -R * 0.5); c.closePath(); c.fillStyle = inner; c.fill();
      }
      ell(c, 0, 0, R, R * 0.92, fur, INK, lw);
      if (fox) { c.beginPath(); c.moveTo(-R, R * 0.05); c.quadraticCurveTo(-R * 0.2, R * 0.1, 0 + fx, R * 0.92); c.quadraticCurveTo(R * 0.2, R * 0.1, R, R * 0.05); c.quadraticCurveTo(R * 0.6, R * 0.9, 0, R * 0.92); c.quadraticCurveTo(-R * 0.6, R * 0.9, -R, R * 0.05); c.fillStyle = '#fff3e6'; c.fill(); }
      else ell(c, fx, R * 0.42 + fy, R * 0.55, R * 0.38, '#fff3e6');
      eyes(R * 0.38, -R * 0.12, R * 0.2, fox ? '#7a4a12' : '#59b34a');
      c.beginPath(); c.moveTo(-R * 0.09 + fx, R * 0.18 + fy); c.lineTo(R * 0.09 + fx, R * 0.18 + fy); c.lineTo(fx, R * 0.29 + fy); c.closePath(); c.fillStyle = fox ? INK : '#e86a85'; c.fill();
      mouth(c, fx, R * 0.4 + fy, R * 0.42, p.mouth, p.smile, lw);
      c.lineWidth = lw * 0.7; c.strokeStyle = INK;
      for (const s of [-1, 1]) for (const k of [-1, 0, 1]) { c.beginPath(); c.moveTo(s * R * 0.32 + fx, R * 0.28 + fy + k * R * 0.07); c.lineTo(s * R * 1.05 + fx, R * 0.22 + fy + k * R * 0.14); c.stroke(); }
      break;
    }
    case 'panda': {
      shoulders(c, R, '#1b1b1b', lw);
      ell(c, -R * 0.72, -R * 0.75, R * 0.3, R * 0.3, '#1b1b1b'); ell(c, R * 0.72, -R * 0.75, R * 0.3, R * 0.3, '#1b1b1b');
      ell(c, 0, 0, R, R * 0.9, '#f7f7f2', INK, lw);
      c.save(); c.translate(fx, fy);
      for (const s of [-1, 1]) { c.save(); c.translate(s * R * 0.38, -R * 0.08); c.rotate(s * -0.5); ell(c, 0, 0, R * 0.26, R * 0.34, '#1b1b1b'); c.restore(); }
      c.restore();
      eye(c, -R * 0.38 + fx, -R * 0.1 + fy, R * 0.12, p.blinkL, '#2a2a2a', look, lw * 0.6);
      eye(c, R * 0.38 + fx, -R * 0.1 + fy, R * 0.12, p.blinkR, '#2a2a2a', look, lw * 0.6);
      ell(c, fx, R * 0.2 + fy, R * 0.13, R * 0.08, '#1b1b1b');
      mouth(c, fx, R * 0.4 + fy, R * 0.36, p.mouth, p.smile, lw);
      break;
    }
    case 'alien': {
      shoulders(c, R, '#4c2a85', lw);
      c.beginPath(); c.moveTo(0, -R * 1.25); c.bezierCurveTo(R * 1.35, -R * 1.2, R * 0.9, R * 0.75, 0, R * 1.0); c.bezierCurveTo(-R * 0.9, R * 0.75, -R * 1.35, -R * 1.2, 0, -R * 1.25);
      c.fillStyle = '#8fdc6a'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
      for (const s of [-1, 1]) {
        const bl = s < 0 ? p.blinkL : p.blinkR, open = Math.max(0.08, 1 - bl * 1.1);
        c.save(); c.translate(s * R * 0.4 + fx, -R * 0.12 + fy); c.rotate(s * 0.45);
        ell(c, 0, 0, R * 0.36, R * 0.2 * open, '#0b0b0b');
        if (open > 0.4) ell(c, -R * 0.1, -R * 0.05, R * 0.07, R * 0.05, '#fff');
        c.restore();
      }
      mouth(c, fx, R * 0.55 + fy, R * 0.24, p.mouth, p.smile, lw, '#2a0f2a');
      break;
    }
    case 'ghost': {
      const bob = Math.sin(p.t * 2) * R * 0.05;
      c.translate(0, bob);
      c.beginPath(); c.moveTo(-R, R * 1.4); c.lineTo(-R, -R * 0.1); c.arc(0, -R * 0.1, R, Math.PI, 0); c.lineTo(R, R * 1.4);
      for (let i = 0; i < 4; i++) { const x1 = R - (i + 0.5) * R * 0.5, x2 = R - (i + 1) * R * 0.5; c.quadraticCurveTo(x1, R * (1.4 + (i % 2 ? -0.18 : 0.18) * Math.sin(p.t * 3 + i)), x2, R * 1.4); }
      c.closePath(); c.fillStyle = '#f4f6fb'; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
      for (const s of [-1, 1]) { const bl = s < 0 ? p.blinkL : p.blinkR; ell(c, s * R * 0.35 + fx, -R * 0.15 + fy, R * 0.16, R * 0.24 * Math.max(0.1, 1 - bl), '#141414'); }
      ell(c, fx, R * 0.45 + fy, R * 0.16, R * (0.06 + p.mouth * 0.24), '#141414');
      ell(c, -R * 0.62 + fx, R * 0.2 + fy, R * 0.14, R * 0.07, 'rgba(255,120,140,.35)'); ell(c, R * 0.62 + fx, R * 0.2 + fy, R * 0.14, R * 0.07, 'rgba(255,120,140,.35)');
      break;
    }
    case 'mystery': {
      c.beginPath(); c.moveTo(-R * 2.1, R * 3); c.quadraticCurveTo(-R * 1.8, R * 0.9, -R * 1.05, R * 0.2); c.quadraticCurveTo(-R * 1.25, -R * 1.5, 0, -R * 1.6);
      c.quadraticCurveTo(R * 1.25, -R * 1.5, R * 1.05, R * 0.2); c.quadraticCurveTo(R * 1.8, R * 0.9, R * 2.1, R * 3); c.closePath();
      const g = c.createLinearGradient(0, -R * 1.6, 0, R * 3); g.addColorStop(0, '#26302f'); g.addColorStop(1, '#0b1012'); c.fillStyle = g; c.fill(); c.lineWidth = lw; c.strokeStyle = '#000'; c.stroke();
      ell(c, 0, R * 0.05, R * 0.82, R * 0.98, '#030405');
      const glow = 1 - Math.max(p.blinkL, p.blinkR) * 0.85;
      c.shadowColor = '#81B64C'; c.shadowBlur = R * 0.4;
      for (const s of [-1, 1]) { c.save(); c.translate(s * R * 0.3 + fx, -R * 0.08 + fy); c.rotate(s * 0.2); ell(c, 0, 0, R * 0.16, R * 0.06 * glow + 0.6, '#b8f07a'); c.restore(); }
      c.shadowBlur = 0;
      if (p.mouth > 0.1) ell(c, fx, R * 0.45 + fy, R * 0.12, R * 0.04 + p.mouth * R * 0.08, 'rgba(129,182,76,.45)');
      break;
    }
    case 'smiley': {
      shoulders(c, R, '#E8B447', lw);
      ell(c, 0, 0, R, R, '#ffd23f', INK, lw);
      for (const s of [-1, 1]) { const bl = s < 0 ? p.blinkL : p.blinkR; ell(c, s * R * 0.33 + fx, -R * 0.22 + fy, R * 0.11, R * 0.2 * Math.max(0.1, 1 - bl), INK); }
      mouth(c, fx, R * 0.3 + fy, R * 0.9, p.mouth * 0.9, 0.6 + p.smile * 0.4, lw * 1.3);
      break;
    }
    default: {
      // Illustrated people
      const L = {
        alex: { skin: '#f1c7a3', hair: '#4a2c1a', shirt: '#81B64C', style: 'short', glasses: false, beard: false },
        sam: { skin: '#8d5a3b', hair: '#141414', shirt: '#2f5fa8', style: 'long', glasses: false, beard: false },
        jordan: { skin: '#c68a63', hair: '#b5472a', shirt: '#E8B447', style: 'curly', glasses: true, beard: false },
        riley: { skin: '#e0a986', hair: '#2b2b2b', shirt: '#6b3fa0', style: 'short', glasses: false, beard: true },
      }[id as 'alex' | 'sam' | 'jordan' | 'riley'];
      if (L.style === 'long') { rrect(c, -R * 1.1, -R * 0.95, R * 2.2, R * 2.5, R * 0.9); c.fillStyle = L.hair; c.fill(); }
      shoulders(c, R, L.shirt, lw);
      c.fillStyle = L.skin; c.fillRect(-R * 0.3, R * 0.6, R * 0.6, R * 0.6); // neck
      ell(c, -R * 0.92, R * 0.05, R * 0.16, R * 0.22, L.skin, INK, lw); ell(c, R * 0.92, R * 0.05, R * 0.16, R * 0.22, L.skin, INK, lw);
      ell(c, 0, 0, R * 0.9, R * 1.02, L.skin, INK, lw);
      if (L.beard) {
        c.beginPath(); c.moveTo(-R * 0.86, R * 0.05); c.quadraticCurveTo(-R * 0.75, R * 1.1, 0, R * 1.05); c.quadraticCurveTo(R * 0.75, R * 1.1, R * 0.86, R * 0.05);
        c.quadraticCurveTo(R * 0.5, R * 0.55, 0, R * 0.42); c.quadraticCurveTo(-R * 0.5, R * 0.55, -R * 0.86, R * 0.05); c.fillStyle = L.hair; c.fill();
      }
      // hair on top
      c.fillStyle = L.hair;
      if (L.style === 'curly') {
        for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; ell(c, Math.cos(a) * R * 0.85, -R * 0.35 + Math.sin(a) * R * 0.8, R * 0.3, R * 0.3, L.hair); }
      } else {
        c.beginPath(); c.moveTo(-R * 0.92, -R * 0.05); c.quadraticCurveTo(-R * 1.0, -R * 1.15, 0, -R * 1.12); c.quadraticCurveTo(R * 1.0, -R * 1.15, R * 0.92, -R * 0.05);
        c.quadraticCurveTo(R * 0.7, -R * 0.65, R * 0.1 + fx, -R * 0.62); c.quadraticCurveTo(-R * 0.6, -R * 0.55, -R * 0.92, -R * 0.05); c.fill();
      }
      // brows
      c.lineWidth = lw * 1.3; c.strokeStyle = L.hair === '#141414' ? '#141414' : L.hair;
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * R * 0.52 + fx, -R * 0.32 + fy); c.quadraticCurveTo(s * R * 0.35 + fx, -R * 0.42 + fy, s * R * 0.16 + fx, -R * 0.33 + fy); c.stroke(); }
      eyes(R * 0.34, -R * 0.12, R * 0.15, '#4a3326');
      if (L.glasses) {
        c.lineWidth = lw; c.strokeStyle = INK;
        for (const s of [-1, 1]) { rrect(c, s * R * 0.34 + fx - R * 0.24, -R * 0.3 + fy, R * 0.48, R * 0.36, R * 0.1); c.stroke(); }
        c.beginPath(); c.moveTo(-R * 0.1 + fx, -R * 0.14 + fy); c.lineTo(R * 0.1 + fx, -R * 0.14 + fy); c.stroke();
      }
      c.beginPath(); c.moveTo(fx * 1.3, R * 0.02 + fy); c.quadraticCurveTo(R * 0.1 + fx * 1.3, R * 0.22 + fy, fx * 1.3 - R * 0.04, R * 0.25 + fy);
      c.lineWidth = lw * 0.8; c.strokeStyle = 'rgba(0,0,0,.45)'; c.stroke();
      ell(c, -R * 0.55 + fx, R * 0.25 + fy, R * 0.14, R * 0.08, 'rgba(230,110,110,.25)'); ell(c, R * 0.55 + fx, R * 0.25 + fy, R * 0.14, R * 0.08, 'rgba(230,110,110,.25)');
      mouth(c, fx, R * 0.48 + fy, R * 0.42, p.mouth, p.smile, lw);
    }
  }
  c.restore();
}
