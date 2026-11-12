// Streamer voice changer: everything runs in the browser with the Web Audio API.
// mic -> preset chain -> (recording stream + optional output device)
// The output device lets a streamer send the changed voice to a virtual cable
// (VB-Cable on Windows, BlackHole on Mac) and pick that as their mic in
// Discord / OBS / YouTube, so only the changed voice ever leaves the computer.

export type VoicePreset = 'off' | 'deep' | 'high' | 'robot' | 'monster' | 'alien' | 'radio' | 'cave' | 'custom';

export const VOICE_PRESETS: { id: VoicePreset; label: string; emoji: string }[] = [
  { id: 'off', label: 'My voice', emoji: '🎙️' },
  { id: 'deep', label: 'Deep', emoji: '🐻' },
  { id: 'high', label: 'High', emoji: '🐿️' },
  { id: 'robot', label: 'Robot', emoji: '🤖' },
  { id: 'monster', label: 'Monster', emoji: '👹' },
  { id: 'alien', label: 'Alien', emoji: '👽' },
  { id: 'radio', label: 'Radio', emoji: '📻' },
  { id: 'cave', label: 'Cave echo', emoji: '🕳️' },
  { id: 'custom', label: 'Custom pitch', emoji: '🎚️' },
];

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
  preset: VoicePreset = 'off';
  pitch = 0;

  get running() { return !!this.mic; }
  /** The changed voice, for recording. */
  get stream(): MediaStream | null { return this.dest ? this.dest.stream : null; }

  async start(micId?: string) {
    this.stop();
    const ctx = this.ctx ?? new AudioContext();
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
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

  setPreset(p: VoicePreset, pitch = this.pitch) { this.preset = p; this.pitch = pitch; if (this.running) this.build(); }

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
    const keep = <T extends AudioNode>(n: T) => { this.chain.push(n); return n; };
    const shifter = (m: number) => {
      const s = new PitchShifter(ctx); s.set(m); this.stoppers.push(() => s.stop());
      keep(s.input); keep(s.output); return s;
    };
    const ring = (hz: number, depth: number) => {
      // signal * (1-depth + depth*sin)
      const g = keep(ctx.createGain()); g.gain.value = 1 - depth;
      const osc = ctx.createOscillator(); osc.frequency.value = hz;
      const og = keep(ctx.createGain()); og.gain.value = depth;
      osc.connect(og); og.connect(g.gain); osc.start();
      this.stoppers.push(() => { try { osc.stop(); } catch { /* ignore */ } osc.disconnect(); });
      return g;
    };
    const filter = (type: BiquadFilterType, f: number, q = 0.7, gain = 0) => {
      const b = keep(ctx.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b;
    };
    const series = (nodes: AudioNode[]) => { let prev: AudioNode = inG; for (const n of nodes) { prev.connect(n); prev = n; } prev.connect(out); };

    switch (this.preset) {
      case 'off': inG.connect(out); break;
      case 'deep': { const s = shifter(-0.45); series([s.input]); s.output.connect(filter('lowshelf', 250, 0.7, 6)).connect(out); break; }
      case 'high': { const s = shifter(0.6); series([s.input]); s.output.connect(out); break; }
      case 'robot': { const s = shifter(-0.12); const r = ring(55, 0.9); inG.connect(s.input); s.output.connect(r); r.connect(filter('highpass', 180)).connect(out); break; }
      case 'monster': { const s = shifter(-0.8); const d = keep(distortion(ctx, 18)); inG.connect(s.input); s.output.connect(d); d.connect(filter('lowpass', 2400)).connect(out); break; }
      case 'alien': { const s = shifter(0.35); const r = ring(28, 0.6); inG.connect(s.input); s.output.connect(r); r.connect(out); break; }
      case 'radio': { const d = keep(distortion(ctx, 6)); series([filter('highpass', 500), filter('lowpass', 3000), d]); break; }
      case 'cave': {
        const s = shifter(-0.2); inG.connect(s.input); s.output.connect(out);
        const dl = keep(ctx.createDelay(1)); dl.delayTime.value = 0.19;
        const fb = keep(ctx.createGain()); fb.gain.value = 0.42;
        const wet = keep(ctx.createGain()); wet.gain.value = 0.5;
        s.output.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(out);
        break;
      }
      case 'custom': { const s = shifter(Math.max(-1, Math.min(1, this.pitch))); inG.connect(s.input); s.output.connect(out); break; }
    }
  }
}
