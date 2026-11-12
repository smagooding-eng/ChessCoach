// Live streams on chessscout.net (admin-only while in development).
// The streamer's browser sends the stage video + changed voice straight to each viewer
// (WebRTC). The API only passes the connection details between them.

import { apiFetch } from '@/lib/api';

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

function iceDone(pc: RTCPeerConnection, ms = 3500): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const t = window.setTimeout(resolve, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { window.clearTimeout(t); resolve(); } });
  });
}

async function post<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const r = await apiFetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export class LiveHost {
  id: string | null = null;
  watching = 0;
  onChange: ((watching: number) => void) | null = null;
  private pcs = new Map<string, RTCPeerConnection>();
  private timer = 0;
  private stream: MediaStream | null = null;
  private busy = false;

  get live() { return !!this.id; }

  async start(stream: MediaStream, host: string, title: string) {
    this.stop();
    this.stream = stream;
    const { id } = await post<{ id: string }>('/api/admin/live-streams', { host, title });
    this.id = id;
    this.timer = window.setInterval(() => { void this.beat(); }, 2000);
    void this.beat();
  }

  /** Swap the stream (e.g. the mic was turned on after going live) for new viewers and current ones. */
  setStream(stream: MediaStream) {
    this.stream = stream;
    for (const pc of this.pcs.values()) {
      for (const tr of stream.getTracks()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === tr.kind);
        if (sender) void sender.replaceTrack(tr).catch(() => undefined);
      }
    }
  }

  private async beat() {
    if (!this.id || this.busy) return;
    this.busy = true;
    try {
      const r = await post<{ pending: { id: string; offer: string }[]; watching: number }>(`/api/admin/live-streams/${this.id}/beat`, {});
      for (const v of r.pending) if (!this.pcs.has(v.id)) await this.answer(v.id, v.offer);
      const connected = [...this.pcs.values()].filter((pc) => pc.connectionState === 'connected').length;
      this.watching = Math.max(connected, 0);
      this.onChange?.(this.watching);
    } catch { /* try again next beat */ } finally { this.busy = false; }
  }

  private async answer(viewerId: string, offer: string) {
    if (!this.stream || !this.id) return;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.pcs.set(viewerId, pc);
    pc.addEventListener('connectionstatechange', () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        window.setTimeout(() => { if (pc.connectionState !== 'connected') { pc.close(); this.pcs.delete(viewerId); } }, pc.connectionState === 'disconnected' ? 8000 : 0);
      }
    });
    for (const tr of this.stream.getTracks()) pc.addTrack(tr, this.stream);
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: offer });
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      await iceDone(pc);
      for (const s of pc.getSenders()) {
        if (s.track?.kind !== 'video') continue;
        const p = s.getParameters();
        if (!p.encodings || !p.encodings.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = 2_500_000;
        void s.setParameters(p).catch(() => undefined);
      }
      await post(`/api/admin/live-streams/${this.id}/answer`, { viewerId, answer: pc.localDescription?.sdp ?? '' });
    } catch { pc.close(); this.pcs.delete(viewerId); }
  }

  stop() {
    window.clearInterval(this.timer);
    for (const pc of this.pcs.values()) pc.close();
    this.pcs.clear();
    if (this.id) void post(`/api/admin/live-streams/${this.id}`, undefined, 'DELETE').catch(() => undefined);
    this.id = null; this.watching = 0; this.stream = null;
    this.onChange?.(0);
  }
}

export interface LiveListing { id: string; title: string; host: string; startedAt: number; viewers: number }

export async function listLive(): Promise<LiveListing[]> {
  const r = await post<{ streams: LiveListing[] }>('/api/admin/live-streams', undefined, 'GET');
  return r.streams;
}

/** Connect a <video> to a live stream. Returns a function that disconnects. */
export async function watchLive(id: string, video: HTMLVideoElement, onState: (s: 'connecting' | 'live' | 'ended' | 'failed') => void): Promise<() => void> {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  let stopped = false;
  const ms = new MediaStream();
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.addEventListener('track', (e) => { ms.addTrack(e.track); video.srcObject = ms; void video.play().catch(() => undefined); });
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'connected') onState('live');
    if (pc.connectionState === 'failed') onState('failed');
  });
  onState('connecting');
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await iceDone(pc);
  const { viewerId } = await post<{ viewerId: string }>(`/api/admin/live-streams/${id}/join`, { offer: pc.localDescription?.sdp ?? '' });
  let answered = false;
  const poll = window.setInterval(async () => {
    if (stopped) return;
    try {
      const r = await post<{ answer: string | null; ended: boolean }>(`/api/admin/live-streams/${id}/viewers/${viewerId}`, undefined, 'GET');
      if (r.ended) { onState('ended'); window.clearInterval(poll); pc.close(); return; }
      if (r.answer && !answered) { answered = true; await pc.setRemoteDescription({ type: 'answer', sdp: r.answer }); }
    } catch { /* keep trying */ }
  }, answered ? 5000 : 1000);
  return () => { stopped = true; window.clearInterval(poll); pc.close(); };
}
