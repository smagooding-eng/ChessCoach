// Co-streaming: the two players of a live game streaming their match together.
// Each studio sends the other its camera panel (camera, blurred face or character) and its
// voice, straight browser to browser (WebRTC). The API only relays the connection messages
// (/api/costream/*, polled about once a second). Each studio then shows both players on its
// own stage and mixes both voices into what it records and broadcasts.

import { apiFetch } from '@/lib/api';

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

function iceDone(pc: RTCPeerConnection, ms = 3500): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const t = window.setTimeout(resolve, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { window.clearTimeout(t); resolve(); } });
  });
}

async function call<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const r = await apiFetch(path, {
    method, credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export interface CoState {
  id: string; gameId: string; status: 'invited' | 'active'; invitedByMe: boolean;
  partner: string; partnerLive: boolean;
}
export type CoLinkState = 'idle' | 'connecting' | 'connected' | 'failed';
type Msg = { type: 'accepted' } | { type: 'offer'; sdp: string } | { type: 'answer'; sdp: string } | { type: 'bye' };

export class CoStreamLink {
  state: CoState | null = null;
  link: CoLinkState = 'idle';
  partnerStream: MediaStream | null = null;
  onChange: (() => void) | null = null;
  private pc: RTCPeerConnection | null = null;
  private timer = 0;
  private polling = false;
  private lastOfferAt = 0;

  /** getLocal: this studio's camera panel + voice, to send to the partner. */
  constructor(private getLocal: () => Promise<MediaStream | null>) {}

  start() {
    if (this.timer) return;
    void this.poll();
    this.timer = window.setInterval(() => { void this.poll(); }, 1000);
  }

  stop() {
    window.clearInterval(this.timer); this.timer = 0;
    this.closePeer();
  }

  async invite(name: string): Promise<string> {
    const r = await call<{ id: string; partner: string }>('/api/costream/invite', { name });
    await this.poll();
    return r.partner;
  }

  async accept(name: string) {
    if (!this.state) return;
    await call(`/api/costream/${this.state.id}/accept`, { name });
    await this.poll();
  }

  /** This studio's camera or mic changed: reconnect so the partner gets the new one. */
  async refresh() {
    if (this.state?.status !== 'active') return;
    if (this.state.invitedByMe) await this.offer();
    else await this.send({ type: 'accepted' }).catch(() => {}); // asks the inviter to offer again
  }

  /** Decline an invite, cancel yours, or end the co-stream. */
  async end() {
    const id = this.state?.id;
    if (!id) return;
    if (this.state?.status === 'active') await this.send({ type: 'bye' }).catch(() => {});
    await call(`/api/costream/${id}/end`).catch(() => {});
    this.state = null;
    this.closePeer();
    this.changed();
  }

  private changed() { this.onChange?.(); }

  private async send(message: Msg) {
    if (!this.state) return;
    await call(`/api/costream/${this.state.id}/signal`, { message });
  }

  private async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const r = await call<{ costream: (CoState & { messages: Msg[] }) | null }>('/api/costream/mine', undefined, 'GET');
      const c = r.costream;
      const before = JSON.stringify([this.state?.id, this.state?.status, this.state?.partner, this.state?.partnerLive]);
      if (!c) {
        if (this.state) { this.state = null; this.closePeer(); this.changed(); }
        return;
      }
      const { messages, ...st } = c;
      this.state = st;
      if (JSON.stringify([st.id, st.status, st.partner, st.partnerLive]) !== before) this.changed();
      for (const m of messages) await this.handle(m);
      // The inviter keeps the connection up: if it dropped, offer again (at most every 8 s)
      if (st.status === 'active' && st.invitedByMe && (!this.pc || this.link === 'failed') && Date.now() - this.lastOfferAt > 8000) {
        await this.offer();
      }
    } catch { /* offline for a moment: next poll */ }
    finally { this.polling = false; }
  }

  private async handle(m: Msg) {
    if (m.type === 'accepted') { await this.offer(); return; }
    if (m.type === 'bye') { this.closePeer(); this.changed(); return; }
    if (m.type === 'offer') {
      // Their offer: a fresh connection, answered with this studio's camera + voice
      this.closePeer();
      const pc = await this.newPeer();
      await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await iceDone(pc);
      await this.send({ type: 'answer', sdp: pc.localDescription?.sdp ?? '' });
      return;
    }
    if (m.type === 'answer' && this.pc && this.pc.signalingState === 'have-local-offer') {
      await this.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }).catch(() => {});
    }
  }

  private async offer() {
    this.lastOfferAt = Date.now();
    this.closePeer();
    const pc = await this.newPeer();
    await pc.setLocalDescription(await pc.createOffer());
    await iceDone(pc);
    await this.send({ type: 'offer', sdp: pc.localDescription?.sdp ?? '' });
  }

  private async newPeer(): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc = pc;
    this.link = 'connecting'; this.changed();
    const local = await this.getLocal();
    if (local) for (const t of local.getTracks()) pc.addTrack(t, local);
    // Receive both even if this side has no camera or mic yet
    if (!local?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'recvonly' });
    if (!local?.getAudioTracks().length) pc.addTransceiver('audio', { direction: 'recvonly' });
    const remote = new MediaStream();
    pc.ontrack = (e) => {
      if (!remote.getTracks().includes(e.track)) remote.addTrack(e.track);
      this.partnerStream = remote;
      this.changed();
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      const s = pc.connectionState;
      this.link = s === 'connected' ? 'connected' : s === 'failed' || s === 'closed' ? 'failed' : s === 'disconnected' ? 'connecting' : this.link;
      this.changed();
    };
    return pc;
  }

  private closePeer() {
    if (this.pc) { try { this.pc.close(); } catch { /* closed */ } }
    this.pc = null;
    this.partnerStream = null;
    this.link = 'idle';
  }
}

/** Mixes this studio's voice and the partner's into one track for recording / broadcasting.
 *  Inputs can change while it runs (the partner joins or leaves mid-stream). */
export class VoiceMixer {
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private sources: { stream: MediaStream; node: MediaStreamAudioSourceNode }[] = [];

  track(): MediaStreamTrack | null {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.dest = this.ctx.createMediaStreamDestination();
    }
    void this.ctx.resume().catch(() => {});
    return this.dest!.stream.getAudioTracks()[0] ?? null;
  }

  setInputs(streams: (MediaStream | null | undefined)[]) {
    if (!this.ctx || !this.dest) return;
    const want = streams.filter((s): s is MediaStream => !!s && s.getAudioTracks().length > 0);
    for (const s of this.sources) if (!want.includes(s.stream)) { try { s.node.disconnect(); } catch { /* gone */ } }
    this.sources = this.sources.filter((s) => want.includes(s.stream));
    for (const stream of want) {
      if (this.sources.some((s) => s.stream === stream)) continue;
      try {
        const node = this.ctx.createMediaStreamSource(stream);
        node.connect(this.dest);
        this.sources.push({ stream, node });
      } catch { /* a stream with no live audio */ }
    }
  }

  close() {
    for (const s of this.sources) { try { s.node.disconnect(); } catch { /* gone */ } }
    this.sources = [];
    void this.ctx?.close().catch(() => {});
    this.ctx = null; this.dest = null;
  }
}
