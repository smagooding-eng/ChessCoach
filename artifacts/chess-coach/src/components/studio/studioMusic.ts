// Content Studio background music, synthesized live with Web Audio — original
// loops (no licensed tracks, nothing to get muted on TikTok / Reels). Four
// styles, each a drum pattern, a bass line and a chord pad over a four-bar
// progression. Accents (an impact on the key move, a riser under the
// countdown, a chime for brilliant moves) land on top, and the music ducks
// under the coach voice. Everything also feeds `stream`, so a recording can
// carry the music and voice even when the browser doesn't share tab audio.

export type MusicStyle = 'off' | 'lofi' | 'hype' | 'suspense' | 'epic';

interface Style {
  label: string; bpm: number; swing: number;
  kick: number[]; snare: number[]; hat: number[]; hatVol: number;
  bass: number[]; // 16th steps where the bass plays (root of the bar's chord)
  chords: number[][]; // 4 bars, MIDI notes
  wave: OscillatorType; lowpass: number;
}

const STYLES: Record<Exclude<MusicStyle, 'off'>, Style> = {
  lofi: {
    label: 'Lo-fi', bpm: 84, swing: 0.12,
    kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatVol: 0.05,
    bass: [0, 7, 10], chords: [[57, 60, 64, 67], [50, 57, 60, 65], [55, 59, 62, 65], [48, 55, 60, 64]],
    wave: 'triangle', lowpass: 2200,
  },
  hype: {
    label: 'Hype', bpm: 128, swing: 0,
    kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], hatVol: 0.09,
    bass: [0, 2, 4, 6, 8, 10, 12, 14], chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    wave: 'sawtooth', lowpass: 5200,
  },
  suspense: {
    label: 'Suspense', bpm: 96, swing: 0,
    kick: [0, 8], snare: [], hat: [0, 4, 8, 12], hatVol: 0.07,
    bass: [0, 2, 4, 6, 8, 10, 12, 14], chords: [[45, 52, 57, 60], [45, 52, 57, 60], [46, 53, 58, 61], [44, 51, 56, 59]],
    wave: 'sine', lowpass: 1600,
  },
  epic: {
    label: 'Epic', bpm: 110, swing: 0,
    kick: [0, 3, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatVol: 0.04,
    bass: [0, 3, 8, 10], chords: [[50, 57, 62, 65], [46, 53, 58, 62], [41, 48, 53, 57], [48, 55, 60, 64]],
    wave: 'sawtooth', lowpass: 3200,
  },
};

export const MUSIC_STYLES: { id: MusicStyle; label: string; bpm: number }[] = [
  { id: 'off', label: 'No music', bpm: 0 },
  ...(Object.keys(STYLES) as Exclude<MusicStyle, 'off'>[]).map((id) => ({ id, label: STYLES[id].label, bpm: STYLES[id].bpm })),
];
export const bpmOf = (s: MusicStyle): number => (s === 'off' ? 0 : STYLES[s].bpm);

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class StudioMusic {
  ctx: AudioContext | null = null;
  private master!: GainNode;      // music bus (ducked under the voice)
  private fx!: GainNode;          // accents (not ducked)
  private voiceBus!: GainNode;
  private dest!: MediaStreamAudioDestinationNode;
  private noise!: AudioBuffer;
  private style: Style | null = null;
  private step = 0;
  private nextAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private volume = 0.5;
  private ducks = 0;

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    this.dest = ctx.createMediaStreamDestination();
    const out = ctx.createGain(); out.gain.value = 1;
    out.connect(ctx.destination); out.connect(this.dest);
    this.master = ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(out);
    this.fx = ctx.createGain(); this.fx.gain.value = Math.min(1, this.volume * 1.4); this.fx.connect(out);
    this.voiceBus = ctx.createGain(); this.voiceBus.gain.value = 1; this.voiceBus.connect(out);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    return ctx;
  }

  /** The mixed music + voice, for a recording. */
  get stream(): MediaStream { this.ensure(); return this.dest.stream; }

  setVolume(v: number) {
    this.volume = v;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.ducks > 0 ? v * 0.3 : v, this.ctx.currentTime, 0.05);
    this.fx.gain.setTargetAtTime(Math.min(1, v * 1.4), this.ctx.currentTime, 0.05);
  }

  /** Starts the loop on a downbeat right now. */
  start(style: MusicStyle) {
    this.stop();
    if (style === 'off') return;
    const ctx = this.ensure();
    void ctx.resume();
    this.style = STYLES[style];
    this.step = 0;
    this.nextAt = ctx.currentTime + 0.05;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(this.volume, ctx.currentTime);
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.ctx && this.style) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0, t, 0.08);
    }
    this.style = null;
  }

  get playing() { return !!this.timer; }

  /** Plays a voice clip through the mix (so it's in the recording) and ducks the music under it. */
  playVoice(url: string): HTMLAudioElement {
    const ctx = this.ensure();
    void ctx.resume();
    const a = new Audio(url);
    try { ctx.createMediaElementSource(a).connect(this.voiceBus); } catch { /* plays directly */ }
    this.ducks++;
    this.master.gain.setTargetAtTime(this.volume * 0.3, ctx.currentTime, 0.06);
    const done = () => {
      this.ducks = Math.max(0, this.ducks - 1);
      if (!this.ducks && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.25);
      a.removeEventListener('ended', done); a.removeEventListener('pause', done);
    };
    a.addEventListener('ended', done); a.addEventListener('pause', done);
    void a.play().catch(done);
    return a;
  }

  /** A one-off accent on top of the music. */
  accent(kind: 'impact' | 'riser' | 'chime' | 'whoosh' | 'tick') {
    const ctx = this.ensure();
    void ctx.resume();
    const t = ctx.currentTime + 0.01;
    if (kind === 'impact') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.1);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
      o.connect(g).connect(this.fx); o.start(t); o.stop(t + 1.35);
      this.noiseHit(t, 0.35, 0.5, 'lowpass', 900);
    } else if (kind === 'riser') {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(6000, t + 2.8);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 2.7); g.gain.linearRampToValueAtTime(0, t + 2.95);
      s.connect(f).connect(g).connect(this.fx); s.start(t); s.stop(t + 3);
    } else if (kind === 'chime') {
      [76, 81, 88].forEach((n, k) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = hz(n);
        const at = t + k * 0.09;
        g.gain.setValueAtTime(0.001, at); g.gain.exponentialRampToValueAtTime(0.28, at + 0.02); g.gain.exponentialRampToValueAtTime(0.001, at + 1.4);
        o.connect(g).connect(this.fx); o.start(at); o.stop(at + 1.5);
      });
    } else if (kind === 'whoosh') {
      const s = ctx.createBufferSource(); s.buffer = this.noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.45);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.12); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      s.connect(f).connect(g).connect(this.fx); s.start(t); s.stop(t + 0.55);
    } else {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 1800;
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g).connect(this.fx); o.start(t); o.stop(t + 0.06);
    }
  }

  private noiseHit(t: number, len: number, vol: number, type: BiquadFilterType, freq: number, dest: AudioNode = this.fx) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  }

  private schedule() {
    const ctx = this.ctx, st = this.style;
    if (!ctx || !st) return;
    const sixteenth = 60 / st.bpm / 4;
    while (this.nextAt < ctx.currentTime + 0.12) {
      const s = this.step % 16, bar = Math.floor(this.step / 16) % 4;
      const t = this.nextAt + (s % 2 === 1 ? st.swing * sixteenth : 0);
      const chord = st.chords[bar];
      if (st.kick.includes(s)) this.kick(t);
      if (st.snare.includes(s)) this.noiseHit(t, 0.18, 0.32, 'bandpass', 1800, this.master);
      if (st.hat.includes(s)) this.noiseHit(t, 0.04, st.hatVol * 4, 'highpass', 7000, this.master);
      if (st.bass.includes(s)) this.tone(t, hz(chord[0] - 12), sixteenth * (st.bass.length > 4 ? 1.6 : 3.5), 0.22, st.wave === 'sine' ? 'sine' : 'triangle', 900);
      if (s === 0) for (const n of chord) this.tone(t, hz(n), sixteenth * 15.5, 0.05, st.wave, st.lowpass, 0.25);
      this.step++;
      this.nextAt += sixteenth;
    }
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.75, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.34);
  }

  private tone(t: number, freq: number, len: number, vol: number, type: OscillatorType, cutoff: number, attack = 0.01) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.setValueAtTime(vol, t + Math.max(attack, len * 0.7)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + len + 0.05);
  }

  dispose() {
    this.stop();
    const c = this.ctx; this.ctx = null;
    if (c) setTimeout(() => void c.close().catch(() => {}), 400);
  }
}
