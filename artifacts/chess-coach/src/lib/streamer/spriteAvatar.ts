// A character drawn from artwork (a character sheet): one picture per head turn (front,
// three-quarter, profile) and per expression (smile, laugh, surprised, serious, focused,
// wink). Face tracking picks which one shows, with a quick cross-fade; talking bounces it.
// The pictures are lined up to the same head position and size (public/avatars/studio/...).

export interface SpriteFace {
  yaw: number;        // -1..1, screen terms (+ = nose toward the right of the screen)
  mouth: number;      // 0..1 open
  smile: number;      // 0..1
  blinkL: number; blinkR: number; // 0..1 closed
  browDown: number;   // 0..1 frown
  voice: number;      // 0..1 how loud you're talking (bounce)
}

export const SHANN_SPRITES = {
  base: 'avatars/studio/shann',
  names: ['front', 'q_left', 'q_right', 'p_left', 'p_right', 'smile', 'laugh', 'serious', 'surprised', 'focused', 'wink'] as const,
};
type SpriteName = typeof SHANN_SPRITES.names[number];

export class SpriteAvatar {
  private imgs = new Map<SpriteName, HTMLImageElement>();
  private cur: SpriteName = 'front';
  private prev: SpriteName = 'front';
  private changedAt = 0;
  private hold = 0;            // a new expression stays a moment, so it doesn't flicker
  private turn: 'front' | 'q' | 'p' = 'front';
  private bounce = 0;
  private cand: SpriteName = 'front'; private candSince = 0; // a change has to last a moment
  private sm: { x: number; y: number; s: number; roll: number } | null = null; // smoothed placement
  private jaw = 0;              // 0..1 how open the mouth is (talking)

  /** Loads every picture; null if any is missing. */
  static async load(base = SHANN_SPRITES.base): Promise<SpriteAvatar | null> {
    const a = new SpriteAvatar();
    const root = `${import.meta.env.BASE_URL}${base}/`;
    try {
      await Promise.all(SHANN_SPRITES.names.map((n) => new Promise<void>((res, rej) => {
        const im = new Image(); im.decoding = 'async'; im.onload = () => res(); im.onerror = () => rej(new Error(n)); im.src = `${root}${n}.webp`; a.imgs.set(n, im);
      })));
      return a;
    } catch { return null; }
  }

  private pick(f: SpriteFace): SpriteName {
    // head turn, with a little hysteresis between front / three-quarter / profile
    const y = Math.abs(f.yaw);
    if (this.turn === 'front' && y > 0.34) this.turn = 'q';
    else if (this.turn === 'q' && y < 0.22) this.turn = 'front';
    else if (this.turn === 'q' && y > 0.75) this.turn = 'p';
    else if (this.turn === 'p' && y < 0.6) this.turn = 'q';
    const side = f.yaw > 0 ? 'right' : 'left';
    if (this.turn !== 'front') return `${this.turn}_${side}` as SpriteName;
    // facing the camera: the expression
    // Expressions need a clear face: talking moves the jaw instead (see draw).
    const wink = Math.abs(f.blinkL - f.blinkR) > 0.55 && Math.max(f.blinkL, f.blinkR) > 0.7;
    if (wink) return 'wink';
    if (f.smile > 0.62) return f.mouth > 0.45 ? 'laugh' : 'smile';
    if (f.mouth > 0.75 && f.voice < 0.15) return 'surprised'; // mouth wide open and not talking
    if (f.browDown > 0.62) return 'focused';
    if (f.browDown > 0.45) return 'serious';
    return 'front';
  }

  /** Draws the character centred at (cx, cy); S is the picture's width on the canvas. */
  draw(c: CanvasRenderingContext2D, f: SpriteFace, cx: number, cy: number, S: number, roll: number, t: number) {
    // which picture: a new one has to be wanted for a moment before it shows
    const want = this.pick(f);
    if (want !== this.cand) { this.cand = want; this.candSince = t; }
    const settle = want.startsWith('q_') || want.startsWith('p_') || want === 'front' ? 160 : 220;
    if (want !== this.cur && t - this.candSince >= settle && t >= this.hold) { this.prev = this.cur; this.cur = want; this.changedAt = t; this.hold = t + 450; }
    // calmer placement: follow the head slowly, tilt only half as much
    if (!this.sm) this.sm = { x: cx, y: cy, s: S, roll };
    const m = this.sm;
    m.x += (cx - m.x) * 0.12; m.y += (cy - m.y) * 0.12; m.s += (S - m.s) * 0.08; m.roll += (roll * 0.5 - m.roll) * 0.1;
    // talking opens the mouth: your voice, or your own mouth when the camera sees it
    const open = Math.min(1, Math.max(f.voice * 1.5, (f.mouth - 0.12) * 1.6));
    this.jaw += (open - this.jaw) * (open > this.jaw ? 0.55 : 0.3);
    this.bounce += (Math.min(1, f.voice * 1.2) - this.bounce) * 0.2;
    const k = Math.min(1, (t - this.changedAt) / 160); // cross-fade
    const W2 = m.s, H = W2 * 1.25, px = W2 / 512;   // pictures are 512 x 640
    const dy = -this.bounce * W2 * 0.012;
    c.save();
    c.translate(m.x, m.y + dy); c.rotate(m.roll);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    const ox = -W2 / 2, oy = -H * 0.44;
    const draw = (n: SpriteName, a: number) => {
      const im = this.imgs.get(n); if (!im || a <= 0) return;
      c.globalAlpha = a;
      if (n === 'front' && this.jaw > 0.04) this.drawTalking(c, im, ox, oy, W2, H, px);
      else c.drawImage(im, ox, oy, W2, H);
    };
    if (k < 1) draw(this.prev, 1);
    draw(this.cur, k);
    c.restore();
  }

  /** The front picture with the jaw dropped: the mouth opens and the chin and beard move down. */
  private drawTalking(c: CanvasRenderingContext2D, im: HTMLImageElement, ox: number, oy: number, W: number, H: number, px: number) {
    const d = this.jaw * 24 * px;               // up to 24 picture-pixels
    const P = (x: number, y: number) => [ox + x * px, oy + y * px] as const;
    c.drawImage(im, ox, oy, W, H);
    // the open mouth behind the lips
    const [mx, my] = P(255, 316);
    c.save();
    c.beginPath(); c.ellipse(mx, my + d / 2, 44 * px * (0.8 + this.jaw * 0.2), d / 2 + 2 * px, 0, 0, Math.PI * 2);
    c.fillStyle = '#240C0D'; c.fill(); c.clip();
    c.fillStyle = 'rgba(238,230,216,.95)'; c.fillRect(mx - 28 * px, my - 2 * px, 56 * px, Math.min(d * 0.3, 6 * px) + 2 * px); // top teeth
    c.fillStyle = '#7A2E35'; c.beginPath(); c.ellipse(mx, my + d + 2 * px, 24 * px, d * 0.3 + px, 0, 0, Math.PI * 2); c.fill(); // tongue
    c.restore();
    // the lower lip, chin and beard, moved down
    c.save();
    c.beginPath();
    const pts: [number, number][] = [[198, 317], [255, 319], [312, 317], [352, 330], [378, 372], [372, 440], [340, 505], [255, 520], [170, 505], [140, 440], [134, 372], [158, 330]];
    pts.forEach(([x, y], i) => { const [X, Y] = P(x, y); if (i) c.lineTo(X, Y + d); else c.moveTo(X, Y + d); }); // the jaw in its new place
    c.closePath(); c.clip();
    c.drawImage(im, ox, oy + d, W, H);
    c.restore();
  }
}
