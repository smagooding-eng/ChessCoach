// Streamer voice changer: everything runs in the browser with the Web Audio API.
// mic -> preset chain -> (recording stream + optional output device)
// The output device lets a streamer send the changed voice to a virtual cable
// (VB-Cable on Windows, BlackHole on Mac) and pick that as their mic in
// Discord / OBS / YouTube, so only the changed voice ever leaves the computer.

export type VoicePreset =
  | 'off' | 'deep' | 'high' | 'anonymous' | 'giant' | 'chipmunk' | 'child' | 'elder'
  | 'robot' | 'cyborg' | 'alien' | 'monster' | 'villain' | 'ghost' | 'dragon'
  | 'radio' | 'telephone' | 'walkie' | 'megaphone' | 'underwater' | 'stadium' | 'cave' | 'announcer'
  | 'custom';

export const VOICE_GROUPS: { title: string; ids: VoicePreset[] }[] = [
  { title: 'Hide my voice', ids: ['off', 'anonymous', 'deep', 'high', 'giant', 'chipmunk', 'child', 'elder'] },
  { title: 'Characters', ids: ['robot', 'cyborg', 'alien', 'monster', 'villain', 'ghost', 'dragon', 'announcer'] },
  { title: 'Places & gear', ids: ['radio', 'telephone', 'walkie', 'megaphone', 'underwater', 'stadium', 'cave'] },
  { title: 'Make your own', ids: ['custom'] },
];

export const VOICE_PRESETS: { id: VoicePreset; label: string; emoji: string }[] = [
  { id: 'off', label: 'My voice', emoji: '🎙️' },
  { id: 'anonymous', label: 'Anonymous', emoji: '🕶️' },
  { id: 'deep', label: 'Deep', emoji: '🐻' },
  { id: 'high', label: 'High', emoji: '🎈' },
  { id: 'giant', label: 'Giant', emoji: '🗿' },
  { id: 'chipmunk', label: 'Chipmunk', emoji: '🐿️' },
  { id: 'child', label: 'Kid', emoji: '🧒' },
  { id: 'elder', label: 'Old wizard', emoji: '🧙' },
  { id: 'robot', label: 'Robot', emoji: '🤖' },
  { id: 'cyborg', label: 'Cyborg', emoji: '🦾' },
  { id: 'alien', label: 'Alien', emoji: '👽' },
  { id: 'monster', label: 'Monster', emoji: '👹' },
  { id: 'villain', label: 'Villain', emoji: '😈' },
  { id: 'ghost', label: 'Ghost', emoji: '👻' },
  { id: 'dragon', label: 'Dragon', emoji: '🐲' },
  { id: 'announcer', label: 'Announcer', emoji: '🏟️' },
  { id: 'radio', label: 'Old radio', emoji: '📻' },
  { id: 'telephone', label: 'Phone call', emoji: '☎️' },
  { id: 'walkie', label: 'Walkie-talkie', emoji: '📟' },
  { id: 'megaphone', label: 'Megaphone', emoji: '📣' },
  { id: 'underwater', label: 'Underwater', emoji: '🫧' },
  { id: 'stadium', label: 'Big hall', emoji: '🏛️' },
  { id: 'cave', label: 'Cave echo', emoji: '🕳️' },
  { id: 'custom', label: 'Custom', emoji: '🎚️' },
];

/** Everything a voice is made of. The presets and the Custom sliders all build one of these. */
export interface VoiceRecipe {
  pitch: number;            // -1 .. +1
  low?: number;             // lowpass Hz
  high?: number;            // highpass Hz
  band?: [number, number];  // bandpass centre Hz, Q
  bass?: number;            // low-shelf boost dB
  treble?: number;          // high-shelf boost dB
  drive?: number;           // distortion amount
  ring?: [number, number];  // ring-mod Hz, depth 0..1
  vibrato?: [number, number]; // Hz, depth seconds
  wobble?: number;          // lowpass sweeping Hz (underwater)
  echo?: [number, number, number]; // time s, feedback, mix
  reverb?: [number, number]; // seconds, mix
  gain?: number;
}

export const RECIPES: Record<Exclude<VoicePreset, 'custom'>, VoiceRecipe> = {
  off: { pitch: 0 },
  anonymous: { pitch: -0.55, ring: [32, 0.28], low: 3400, bass: 4, drive: 4 },
  deep: { pitch: -0.45, bass: 6 },
  high: { pitch: 0.55, treble: 2 },
  giant: { pitch: -0.9, bass: 8, reverb: [1.4, 0.22], gain: 1.2 },
  chipmunk: { pitch: 0.95, treble: 3 },
  child: { pitch: 0.42, treble: 5, high: 180 },
  elder: { pitch: -0.12, vibrato: [5.5, 0.0035], high: 160, reverb: [1.2, 0.15] },
  robot: { pitch: -0.12, ring: [55, 0.9], high: 180 },
  cyborg: { pitch: -0.2, ring: [110, 0.5], echo: [0.012, 0.65, 0.5], high: 150 },
  alien: { pitch: 0.35, ring: [28, 0.6], vibrato: [7, 0.002] },
  monster: { pitch: -0.8, drive: 18, low: 2400, bass: 6 },
  villain: { pitch: -0.6, bass: 7, reverb: [2.2, 0.28], drive: 3 },
  ghost: { pitch: 0.15, vibrato: [4, 0.006], reverb: [3, 0.5], high: 250 },
  dragon: { pitch: -0.7, drive: 25, ring: [18, 0.25], reverb: [1.6, 0.2], bass: 5 },
  announcer: { pitch: -0.15, bass: 4, treble: 2, reverb: [2.6, 0.22], echo: [0.32, 0.25, 0.18] },
  radio: { pitch: 0, high: 500, low: 3000, drive: 6 },
  telephone: { pitch: 0, band: [1700, 1.6], drive: 2, gain: 1.6 },
  walkie: { pitch: 0.05, band: [1900, 2.2], drive: 22, gain: 1.3 },
  megaphone: { pitch: 0, high: 700, low: 3800, drive: 26, band: [2000, 0.7], gain: 0.9 },
  underwater: { pitch: -0.1, wobble: 520, vibrato: [1.6, 0.004], reverb: [1.2, 0.3] },
  stadium: { pitch: 0, reverb: [3.5, 0.45], echo: [0.38, 0.28, 0.25] },
  cave: { pitch: -0.2, echo: [0.19, 0.42, 0.5], reverb: [2, 0.2] },
};

/** Custom voice sliders -> recipe */
export interface CustomVoice { pitch: number; robot: number; echo: number; reverb: number; warble: number; grit: number; tone: number }
export const DEFAULT_CUSTOM: CustomVoice = { pitch: -0.3, robot: 0, echo: 0, reverb: 0.2, warble: 0, grit: 0, tone: 0 };
export function customRecipe(v: CustomVoice): VoiceRecipe {
  return {
    pitch: v.pitch,
    ring: v.robot > 0.02 ? [40 + v.robot * 80, Math.min(0.95, v.robot)] : undefined,
    echo: v.echo > 0.02 ? [0.12 + v.echo * 0.25, 0.25 + v.echo * 0.35, v.echo * 0.6] : undefined,
    reverb: v.reverb > 0.02 ? [0.8 + v.reverb * 3, v.reverb * 0.55] : undefined,
    vibrato: v.warble > 0.02 ? [3 + v.warble * 5, 0.001 + v.warble * 0.006] : undefined,
    drive: v.grit > 0.02 ? v.grit * 30 : undefined,
    bass: v.tone < 0 ? -v.tone * 8 : undefined,
    treble: v.tone > 0 ? v.tone * 8 : undefined,
  };
}

// Delay-line pitch shifter (two crossfaded, modulated delay lines). Works with
// plain Web Audio nodes, so no worklet files are needed.
const DELAY = 0.1, FADE = 0.05, BUF = 0.1;
function fadeBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate, l1 = Math.round(BUF * sr), l2 = Math.round((BUF - 2 * FADE) * sr), len = l1 + l2;
  const b = ctx.createBuffer(1, len, sr), p = b.getChannelData(0), fl = FADE * sr, i2 = l1 - fl;
  for (let i = 0; i < l1; i++) p[i] = i < fl ? Math.sqrt(i / fl) : i >= i2 ? Math.sqrt(1 - (i - i2) / fl) : 1;
  return b;
}
function delayBuffer(ctx: BaseAudioContext, up: boolean): AudioBuffer {
  const sr = ctx.sampleRate, l1 = Math.round(BUF * sr), l2 = Math.round((BUF - 2 * FADE) * sr), len = l1 + l2;
  const b = ctx.createBuffer(1, len, sr), p = b.getChannelData(0);
  for (let i = 0; i < l1; i++) p[i] = up ? (l1 - i) / len : i / l1;
  return b;
}
class PitchShifter {
  input: GainNode; output: GainNode;
  private g1: GainNode; private g2: GainNode; private g3: GainNode; private g4: GainNode;
  private m1: GainNode; private m2: GainNode; private sources: AudioBufferSourceNode[] = [];
  constructor(ctx: AudioContext) {
    this.input = ctx.createGain(); this.output = ctx.createGain();
    const down = delayBuffer(ctx, false), up = delayBuffer(ctx, true), fade = fadeBuffer(ctx);
    const src = (b: AudioBuffer) => { const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; this.sources.push(s); return s; };
    const s1 = src(down), s2 = src(down), s3 = src(up), s4 = src(up), f1 = src(fade), f2 = src(fade);
    this.g1 = ctx.createGain(); this.g2 = ctx.createGain(); this.g3 = ctx.createGain(); this.g4 = ctx.createGain();
    this.g3.gain.value = 0; this.g4.gain.value = 0;
    s1.connect(this.g1); s2.connect(this.g2); s3.connect(this.g3); s4.connect(this.g4);
    this.m1 = ctx.createGain(); this.m2 = ctx.createGain();
    this.g1.connect(this.m1); this.g3.connect(this.m1); this.g2.connect(this.m2); this.g4.connect(this.m2);
    const d1 = ctx.createDelay(), d2 = ctx.createDelay();
    this.m1.connect(d1.delayTime); this.m2.connect(d2.delayTime);
    const mix1 = ctx.createGain(), mix2 = ctx.createGain(); mix1.gain.value = 0; mix2.gain.value = 0;
    f1.connect(mix1.gain); f2.connect(mix2.gain);
    this.input.connect(d1); this.input.connect(d2); d1.connect(mix1); d2.connect(mix2); mix1.connect(this.output); mix2.connect(this.output);
    const t = ctx.currentTime + 0.05, t2 = t + BUF - FADE;
    s1.start(t); s2.start(t2); s3.start(t); s4.start(t2); f1.start(t); f2.start(t2);
    this.set(0);
  }
  /** -1 (an octave-ish down) .. +1 (up) */
  set(mult: number) {
    const up = mult > 0;
    this.g1.gain.value = up ? 0 : 1; this.g2.gain.value = up ? 0 : 1;
    this.g3.gain.value = up ? 1 : 0; this.g4.gain.value = up ? 1 : 0;
    const d = 0.5 * DELAY * Math.abs(mult);
    this.m1.gain.value = d; this.m2.gain.value = d;
  }
  stop() { this.sources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } }); }
}

// Smooth pitch shifter that runs on the audio thread: two read heads glide through a
// short delay line at the new speed and cross-fade with Hann windows, so there are no
// clicks between grains (the old one, built from plain nodes, crackled).
const SHIFTER_SRC = `
class CsShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }]; }
  constructor() { super(); this.N = 16384; this.buf = new Float32Array(this.N); this.w = 0; this.G = Math.round(sampleRate * 0.06); this.d = 0; }
  read(pos) { const N = this.N; let p = pos % N; if (p < 0) p += N; const i = Math.floor(p), f = p - i; return this.buf[i] * (1 - f) + this.buf[(i + 1) % N] * f; }
  process(inputs, outputs, params) {
    const out = outputs[0] && outputs[0][0]; if (!out) return true;
    const inp = inputs[0] && inputs[0][0];
    const r = params.ratio[0], G = this.G, half = G / 2, step = 1 - r;
    for (let i = 0; i < out.length; i++) {
      this.buf[this.w] = inp ? inp[i] : 0;
      this.d += step; if (this.d >= G) this.d -= G; else if (this.d < 0) this.d += G;
      const d1 = this.d, d2 = (this.d + half) % G;
      const w1 = Math.sin(Math.PI * d1 / G), w2 = Math.sin(Math.PI * d2 / G);
      out[i] = this.read(this.w - d1 - 1) * w1 * w1 + this.read(this.w - d2 - 1) * w2 * w2;
      this.w = (this.w + 1) % this.N;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('cs-shifter', CsShifter);
`;
const workletReady = new WeakMap<BaseAudioContext, Promise<boolean>>();
function loadShifter(ctx: AudioContext): Promise<boolean> {
  let p = workletReady.get(ctx);
  if (!p) {
    p = (async () => {
      try {
        if (!ctx.audioWorklet) return false;
        const url = URL.createObjectURL(new Blob([SHIFTER_SRC], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        return true;
      } catch { return false; }
    })();
    workletReady.set(ctx, p);
  }
  return p;
}

function distortion(ctx: AudioContext, amount: number): WaveShaperNode {
  const ws = ctx.createWaveShaper(), n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x)); }
  ws.curve = curve; ws.oversample = '4x';
  return ws;
}

export class VoiceChanger {
  ctx: AudioContext | null = null;
  private mic: MediaStream | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private inGain: GainNode | null = null;
  private outGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private chain: AudioNode[] = [];
  private stoppers: (() => void)[] = [];
  private player: HTMLAudioElement | null = null;
  private levelBuf: Uint8Array<ArrayBuffer> | null = null;
  private workletOk = false;
  preset: VoicePreset = 'off';
  pitch = 0;
  custom: CustomVoice = { ...DEFAULT_CUSTOM };

  get running() { return !!this.mic; }
  /** The changed voice, for recording. */
  get stream(): MediaStream | null { return this.dest ? this.dest.stream : null; }

  async start(micId?: string) {
    this.stop();
    // 'playback' asks for bigger audio buffers: a little more delay, but no crackle when
    // the phone is also busy with the camera, face tracking and the board.
    const ctx = this.ctx ?? new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 },
    });
    this.workletOk = await loadShifter(ctx);
    this.src = ctx.createMediaStreamSource(this.mic);
    this.inGain = ctx.createGain(); this.outGain = ctx.createGain();
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512;
    this.levelBuf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    this.dest = ctx.createMediaStreamDestination();
    this.src.connect(this.inGain);
    this.outGain.connect(this.analyser); this.outGain.connect(this.dest);
    this.player = new Audio(); this.player.srcObject = this.dest.stream; this.player.muted = true;
    void this.player.play().catch(() => undefined);
    this.build();
  }

  stop() {
    this.teardownChain();
    try { this.src?.disconnect(); this.outGain?.disconnect(); } catch { /* ignore */ }
    this.mic?.getTracks().forEach((t) => t.stop());
    if (this.player) { this.player.pause(); this.player.srcObject = null; }
    this.mic = null; this.src = null; this.player = null; this.dest = null;
  }

  setPreset(p: VoicePreset, pitch = this.pitch, custom?: CustomVoice) {
    this.preset = p; this.pitch = pitch;
    if (custom) this.custom = { ...custom };
    if (this.running) this.build();
  }

  /** 'none' = only recorded; 'default' = your speakers/headphones; anything else = an output device id (e.g. a virtual cable). */
  async setOutput(target: string) {
    const pl = this.player as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!pl) return;
    pl.muted = target === 'none';
    if (target !== 'none' && pl.setSinkId) {
      try { await pl.setSinkId(target === 'default' ? '' : target); } catch { /* device gone */ }
    }
    void pl.play().catch(() => undefined);
  }

  /** A board sound mixed into the recording / live audio (and what you hear). */
  sfx(kind: 'move' | 'capture') {
    const ctx = this.ctx, d = this.dest;
    if (!ctx || !d) return;
    const t = ctx.currentTime;
    const len = Math.round(ctx.sampleRate * 0.09), buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const n = ctx.createBufferSource(); n.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'capture' ? 900 : 1500; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = kind === 'capture' ? 0.9 : 0.6;
    n.connect(f); f.connect(g); g.connect(d); n.start(t);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(kind === 'capture' ? 180 : 240, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    og.gain.setValueAtTime(0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og); og.connect(d); o.start(t); o.stop(t + 0.12);
  }

  /** 0..1 loudness of the changed voice */
  level(): number {
    if (!this.analyser || !this.levelBuf) return 0;
    this.analyser.getByteTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) { const v = (this.levelBuf[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 4);
  }

  private teardownChain() {
    this.stoppers.forEach((f) => f()); this.stoppers = [];
    this.chain.forEach((n) => { try { n.disconnect(); } catch { /* ignore */ } });
    this.chain = [];
    try { this.inGain?.disconnect(); } catch { /* ignore */ }
  }

  private build() {
    const ctx = this.ctx, inG = this.inGain, out = this.outGain;
    if (!ctx || !inG || !out) return;
    this.teardownChain();
    const r: VoiceRecipe = this.preset === 'custom' ? customRecipe(this.custom) : RECIPES[this.preset];
    const keep = <T extends AudioNode>(n: T) => { this.chain.push(n); return n; };
    const nodes: AudioNode[] = [];
    const filter = (type: BiquadFilterType, f: number, q = 0.7, gain = 0) => {
      const b = keep(ctx.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b;
    };
    if (r.high) nodes.push(filter('highpass', r.high));
    if (Math.abs(r.pitch) > 0.01) {
      const pitch = Math.max(-1, Math.min(1, r.pitch));
      if (this.workletOk) {
        const w = keep(new AudioWorkletNode(ctx, 'cs-shifter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }));
        const ratio = w.parameters.get('ratio'); if (ratio) ratio.value = Math.pow(2, pitch);
        nodes.push(w);
      } else {
        const s = new PitchShifter(ctx); s.set(pitch); this.stoppers.push(() => s.stop());
        keep(s.input); keep(s.output); nodes.push(new SeriesPair(s.input, s.output) as unknown as AudioNode);
      }
    }
    if (r.vibrato) {
      const d = keep(ctx.createDelay(0.1)); d.delayTime.value = 0.01;
      const osc = ctx.createOscillator(); osc.frequency.value = r.vibrato[0];
      const og = keep(ctx.createGain()); og.gain.value = r.vibrato[1];
      osc.connect(og); og.connect(d.delayTime); osc.start();
      this.stoppers.push(() => { try { osc.stop(); } catch { /* ignore */ } osc.disconnect(); });
      nodes.push(d);
    }
    if (r.ring) {
      const g = keep(ctx.createGain()); g.gain.value = 1 - r.ring[1];
      const osc = ctx.createOscillator(); osc.frequency.value = r.ring[0];
      const og = keep(ctx.createGain()); og.gain.value = r.ring[1];
      osc.connect(og); og.connect(g.gain); osc.start();
      this.stoppers.push(() => { try { osc.stop(); } catch { /* ignore */ } osc.disconnect(); });
      nodes.push(g);
    }
    if (r.drive) nodes.push(keep(distortion(ctx, r.drive)));
    if (r.band) nodes.push(filter('bandpass', r.band[0], r.band[1]));
    if (r.low) nodes.push(filter('lowpass', r.low));
    if (r.wobble) {
      const f = filter('lowpass', r.wobble, 4);
      const osc = ctx.createOscillator(); osc.frequency.value = 0.7;
      const og = keep(ctx.createGain()); og.gain.value = r.wobble * 0.45;
      osc.connect(og); og.connect(f.frequency); osc.start();
      this.stoppers.push(() => { try { osc.stop(); } catch { /* ignore */ } osc.disconnect(); });
      nodes.push(f);
    }
    if (r.bass) nodes.push(filter('lowshelf', 220, 0.7, r.bass));
    if (r.treble) nodes.push(filter('highshelf', 3200, 0.7, r.treble));
    // a gentle compressor keeps every voice at an even, streamable level
    const comp = keep(ctx.createDynamicsCompressor());
    comp.threshold.value = -24; comp.knee.value = 18; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.2;
    const makeup = keep(ctx.createGain()); makeup.gain.value = (r.gain ?? 1);
    // last stop: a brick-wall limiter so loud words never clip into static
    const limit = keep(ctx.createDynamicsCompressor());
    limit.threshold.value = -2; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.1;

    // wire the series chain
    let prev: AudioNode = inG;
    for (const n of nodes) {
      if (n instanceof SeriesPair) { prev.connect(n.input); prev = n.output; }
      else { prev.connect(n); prev = n; }
    }
    const dry = prev;
    dry.connect(comp);
    if (r.echo) {
      const dl = keep(ctx.createDelay(1)); dl.delayTime.value = r.echo[0];
      const fb = keep(ctx.createGain()); fb.gain.value = r.echo[1];
      const wet = keep(ctx.createGain()); wet.gain.value = r.echo[2];
      dry.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(comp);
    }
    if (r.reverb) {
      const cv = keep(ctx.createConvolver()); cv.buffer = impulse(ctx, Math.min(1.6, r.reverb[0]));
      const wet = keep(ctx.createGain()); wet.gain.value = r.reverb[1] * 1.6;
      dry.connect(cv); cv.connect(wet); wet.connect(comp);
    }
    comp.connect(makeup); makeup.connect(limit); limit.connect(out);
  }
}

/** A two-ended effect (input + output node) inside the series chain. */
class SeriesPair { constructor(public input: AudioNode, public output: AudioNode) {} }

/** Room sound: decaying stereo noise. */
function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.round(ctx.sampleRate * seconds)), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  return b;
}
