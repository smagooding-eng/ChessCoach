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
    if (this.turn === 'front' && y > 0.24) this.turn = 'q';
    else if (this.turn === 'q' && y < 0.18) this.turn = 'front';
    else if (this.turn === 'q' && y > 0.58) this.turn = 'p';
    else if (this.turn === 'p' && y < 0.5) this.turn = 'q';
    const side = f.yaw > 0 ? 'right' : 'left';
    if (this.turn !== 'front') return `${this.turn}_${side}` as SpriteName;
    // facing the camera: the expression
    const wink = Math.abs(f.blinkL - f.blinkR) > 0.45 && Math.max(f.blinkL, f.blinkR) > 0.6;
    if (wink) return 'wink';
    if (f.mouth > 0.5) return f.smile > 0.3 ? 'laugh' : 'surprised';
    if (f.smile > 0.55) return f.mouth > 0.22 ? 'laugh' : 'smile';
    if (f.browDown > 0.5) return 'focused';
    if (f.browDown > 0.3) return 'serious';
    return 'front';
  }

  /** Draws the character centred at (cx, cy); S is the picture's width on the canvas. */
  draw(c: CanvasRenderingContext2D, f: SpriteFace, cx: number, cy: number, S: number, roll: number, t: number) {
    const want = this.pick(f);
    if (want !== this.cur && t >= this.hold) { this.prev = this.cur; this.cur = want; this.changedAt = t; this.hold = t + (want === 'front' || want.startsWith('q_') || want.startsWith('p_') ? 90 : 260); }
    this.bounce += (Math.min(1, f.voice * 1.6) - this.bounce) * 0.35;
    const k = Math.min(1, (t - this.changedAt) / 120); // cross-fade
    const H = S * 1.25;
    const dy = -this.bounce * S * 0.025 * (0.6 + 0.4 * Math.sin(t / 70));
    c.save();
    c.translate(cx, cy + dy); c.rotate(roll * 0.8);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    const draw = (n: SpriteName, a: number) => { const im = this.imgs.get(n); if (!im || a <= 0) return; c.globalAlpha = a; c.drawImage(im, -S / 2, -H * 0.44, S, H); };
    if (k < 1) draw(this.prev, 1);
    draw(this.cur, k);
    c.restore();
  }
}
