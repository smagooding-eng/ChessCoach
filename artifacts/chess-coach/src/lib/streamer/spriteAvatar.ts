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
  voice: number;      // 0..1 how loud you're talking
  /** Your mouth's shape from the camera (MediaPipe): pursed/rounded, lower lip tucked, stretched. */
  pucker?: number; funnel?: number; rollLower?: number; stretch?: number;
  /** Where the voice's energy is (low = rounded vowels, high = s/f/th hiss). */
  spec?: { low: number; mid: number; high: number };
}

export const SHANN_SPRITES = {
  base: 'avatars/studio/shann',
  names: ['front', 'q_left', 'q_right', 'p_left', 'p_right', 'smile', 'laugh', 'serious', 'surprised', 'focused', 'wink',
    'v_ah', 'v_eh', 'v_ih', 'v_oh', 'v_oo', 'v_fv', 'v_th', 'v_sz', 'v_l', 'v_r'] as const,
};
type SpriteName = typeof SHANN_SPRITES.names[number];
type Viseme = 'v_ah' | 'v_eh' | 'v_ih' | 'v_oh' | 'v_oo' | 'v_fv' | 'v_th' | 'v_sz' | 'v_l' | 'v_r';

export class SpriteAvatar {
  private imgs = new Map<SpriteName, HTMLImageElement>();
  /** Talking faces at head angles (turn/ah_m30.webp …), loaded in the background. */
  private turnImgs = new Map<string, HTMLImageElement>();
  private cur: SpriteName = 'front';
  private prev: SpriteName = 'front';
  private changedAt = 0;
  private hold = 0;            // a new expression stays a moment, so it doesn't flicker
  private turn: 'front' | 'q' | 'p' = 'front';
  private bounce = 0;
  private cand: SpriteName = 'front'; private candSince = 0; // a change has to last a moment
  private sm: { x: number; y: number; s: number; roll: number } | null = null; // smoothed placement
  private vis: Viseme | null = null; private visPrev: Viseme | null = null; private visAt = 0; // talking mouth shape
  private talkUntil = 0;        // talking stays on briefly between words
  private alt = 0;              // alternates similar shapes so speech looks lively

  /** Loads every picture; null if any is missing. */
  static async load(base = SHANN_SPRITES.base): Promise<SpriteAvatar | null> {
    const a = new SpriteAvatar();
    const root = `${import.meta.env.BASE_URL}${base}/`;
    try {
      await Promise.all(SHANN_SPRITES.names.map((n) => new Promise<void>((res, rej) => {
        const im = new Image(); im.decoding = 'async'; im.onload = () => res(); im.onerror = () => rej(new Error(n)); im.src = `${root}${n}.webp`; a.imgs.set(n, im);
      })));
      // the turned talking faces: not needed to start, so they load afterwards
      const VIS = ['ah', 'eh', 'ih', 'oh', 'oo', 'fv', 'th', 'sz', 'l', 'r'], ANG = ['m90', 'm60', 'm45', 'm30', 'm15', 'p15', 'p30', 'p45', 'p60', 'p90'];
      for (const v of VIS) for (const g of ANG) { const im = new Image(); im.decoding = 'async'; im.onload = () => a.turnImgs.set(`${v}_${g}`, im); im.src = `${root}turn/${v}_${g}.webp`; }
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
    // Expressions need a clear face: talking shows the talking faces instead (see draw).
    const wink = Math.abs(f.blinkL - f.blinkR) > 0.55 && Math.max(f.blinkL, f.blinkR) > 0.7;
    if (wink) return 'wink';
    if (f.smile > 0.62) return f.mouth > 0.45 ? 'laugh' : 'smile';
    if (f.mouth > 0.75 && f.voice < 0.15) return 'surprised'; // mouth wide open and not talking
    if (f.browDown > 0.62) return 'focused';
    if (f.browDown > 0.45) return 'serious';
    return 'front';
  }

  /** Which talking face fits the sound (and your mouth, when the camera sees it). */
  private viseme(f: SpriteFace): Viseme {
    const jaw = f.mouth, pk = Math.max(f.pucker ?? 0, f.funnel ?? 0), roll = f.rollLower ?? 0, smile = Math.max(f.smile, f.stretch ?? 0);
    if (jaw > 0.08 || pk > 0.35 || roll > 0.3) { // the camera sees your mouth
      if (pk > 0.4) return jaw > 0.25 ? 'v_oh' : 'v_oo';
      if (roll > 0.35 && jaw < 0.3) return 'v_fv';
      if (jaw > 0.45) return 'v_ah';
      if (jaw > 0.25) return smile > 0.3 ? 'v_eh' : 'v_l';
      return smile > 0.35 ? 'v_sz' : 'v_ih';
    }
    const sp = f.spec, v = f.voice;
    this.alt = (this.alt + 1) % 6;
    if (sp && sp.high > 0.3) return (['v_sz', 'v_fv', 'v_sz', 'v_th', 'v_sz', 'v_fv'] as Viseme[])[this.alt];
    if (sp && sp.low > 0.62 && v > 0.12) return v > 0.3 ? 'v_oh' : 'v_oo';
    if (v > 0.5) return 'v_ah';
    if (v > 0.32) return this.alt % 2 ? 'v_eh' : 'v_ah';
    if (v > 0.18) return (['v_ih', 'v_l', 'v_eh', 'v_ih', 'v_r', 'v_l'] as Viseme[])[this.alt];
    return this.alt % 2 ? 'v_r' : 'v_ih';
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
    // talking: one of the talking faces, changing with the sound, while you face the camera
    const speaking = f.voice > 0.07 || f.mouth > 0.12;
    if (speaking) this.talkUntil = t + 160;
    const talking = t < this.talkUntil && this.cur !== 'wink';
    if (talking && speaking && t - this.visAt >= 85) { const v = this.viseme(f); if (v !== this.vis) { this.visPrev = this.vis; this.vis = v; this.visAt = t; } }
    if (!talking) { this.vis = null; this.visPrev = null; }
    this.bounce += (Math.min(1, f.voice * 1.2) - this.bounce) * 0.2;
    const k = Math.min(1, (t - this.changedAt) / 160); // cross-fade
    const W2 = m.s, H = W2 * 1.25;   // pictures are 512 x 640
    const dy = -this.bounce * W2 * 0.012;
    c.save();
    c.translate(m.x, m.y + dy); c.rotate(m.roll);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    const ox = -W2 / 2, oy = -H * 0.44;
    const draw = (n: SpriteName | null, a: number) => {
      const im = n && this.imgs.get(n); if (!im || a <= 0) return;
      c.globalAlpha = a; c.drawImage(im, ox, oy, W2, H);
    };
    const turned = this.cur.startsWith('q_') || this.cur.startsWith('p_');
    if (this.vis && turned) {
      // head turned: the talking face drawn at the nearest angle
      const deg = Math.abs(f.yaw) * 90, opts = this.cur.startsWith('p_') ? [60, 90] : [15, 30, 45, 60];
      const ang = opts.reduce((b, x) => (Math.abs(x - deg) < Math.abs(b - deg) ? x : b), opts[0]);
      const key = (v: Viseme | null) => v && `${v.slice(2)}_${f.yaw < 0 ? 'm' : 'p'}${ang}`;
      const now = this.turnImgs.get(key(this.vis)!), before = this.visPrev ? this.turnImgs.get(key(this.visPrev)!) : undefined;
      if (now) {
        const kv = Math.min(1, (t - this.visAt) / 70);
        if (before) { c.globalAlpha = 1; c.drawImage(before, ox, oy, W2, H); } else draw(this.cur, 1);
        c.globalAlpha = kv; c.drawImage(now, ox, oy, W2, H);
      } else draw(this.cur, 1); // still loading
    } else if (this.vis) {
      const kv = Math.min(1, (t - this.visAt) / 70); // quick blend between mouth shapes
      draw(this.visPrev ?? this.cur, 1); draw(this.vis, kv);
    } else {
      if (k < 1) draw(this.prev, 1);
      draw(this.cur, k);
    }
    c.restore();
  }
}
