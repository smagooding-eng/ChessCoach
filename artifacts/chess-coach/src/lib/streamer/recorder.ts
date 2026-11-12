// Records the stream stage (video + changed voice) and saves it to chessscout.net while
// recording: every ~5MB is uploaded as it's made, so even long recordings never pile up
// on the phone, and stopping only has to send the last few seconds.
// If saving fails, the video is downloaded to the device instead so nothing is lost.

import { apiFetch } from '@/lib/api';

const PART = 5 * 1024 * 1024; // R2's minimum part size (except the last part)

export function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export type RecStatus = { phase: 'recording' | 'saving' | 'saved' | 'downloaded' | 'error'; uploadedMB: number; message?: string };

export class CloudRecorder {
  private rec: MediaRecorder;
  private id: string | null = null;
  private all: Blob[] = [];
  private pending: Blob[] = [];
  private pendingSize = 0;
  private parts: { n: number; etag: string }[] = [];
  private queue: Promise<void> = Promise.resolve();
  private failed = false;
  private uploaded = 0;
  private started = 0;
  private stopped: Promise<void>;
  readonly mime: string;

  constructor(stream: MediaStream, private title: string, private onStatus: (s: RecStatus) => void) {
    this.mime = pickMime();
    this.rec = new MediaRecorder(stream, this.mime ? { mimeType: this.mime, videoBitsPerSecond: 3_500_000, audioBitsPerSecond: 128_000 } : undefined);
    this.stopped = new Promise((resolve) => { this.rec.addEventListener('stop', () => resolve()); });
    this.rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      this.all.push(e.data); this.pending.push(e.data); this.pendingSize += e.data.size;
      if (this.pendingSize >= PART) this.flush(false);
    };
  }

  async start() {
    try {
      const r = await apiFetch('/api/admin/stream-recordings', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime: this.rec.mimeType || this.mime || 'video/webm', title: this.title }),
      });
      if (r.ok) this.id = ((await r.json()) as { id: string }).id; else this.failed = true;
    } catch { this.failed = true; }
    this.started = Date.now();
    this.rec.start(2000);
    this.onStatus({ phase: 'recording', uploadedMB: 0, message: this.failed ? 'Saving online isn’t available right now: this one will download to your device.' : undefined });
  }

  private flush(last: boolean) {
    if (!this.pending.length || this.failed || !this.id) return;
    const blob = new Blob(this.pending, { type: this.rec.mimeType || this.mime });
    this.pending = []; this.pendingSize = 0;
    const n = this.parts.length + 1 + this.queuedParts++;
    this.queue = this.queue.then(() => this.sendPart(n, blob)).catch(() => { this.failed = true; });
    void last;
  }
  private queuedParts = 0;

  private async sendPart(n: number, blob: Blob) {
    if (this.failed || !this.id) return;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const r = await apiFetch(`/api/admin/stream-recordings/${this.id}/parts/${n}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
        if (r.ok) {
          const { etag } = (await r.json()) as { etag: string };
          this.parts.push({ n, etag }); this.queuedParts--;
          this.uploaded += blob.size;
          this.onStatus({ phase: this.rec.state === 'inactive' ? 'saving' : 'recording', uploadedMB: this.uploaded / 1048576 });
          return;
        }
      } catch { /* retry */ }
      await new Promise((res) => window.setTimeout(res, 1500 * (attempt + 1)));
    }
    throw new Error('part failed');
  }

  get elapsedMs() { return this.started ? Date.now() - this.started : 0; }

  /** Stop and finish saving. Resolves with the recording id when it's saved online. */
  async stop(): Promise<string | null> {
    const durationMs = this.elapsedMs;
    if (this.rec.state !== 'inactive') this.rec.stop();
    await this.stopped;
    this.onStatus({ phase: 'saving', uploadedMB: this.uploaded / 1048576 });
    this.flush(true);
    await this.queue;
    if (!this.failed && this.id && this.parts.length) {
      try {
        const r = await apiFetch(`/api/admin/stream-recordings/${this.id}/complete`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parts: this.parts, durationMs }),
        });
        if (r.ok) { this.all = []; this.onStatus({ phase: 'saved', uploadedMB: this.uploaded / 1048576 }); return this.id; }
      } catch { /* fall through to download */ }
    }
    // couldn't save online: keep it on the device
    if (this.id) void apiFetch(`/api/admin/stream-recordings/${this.id}`, { method: 'DELETE', credentials: 'include' }).catch(() => undefined);
    const type = this.rec.mimeType || this.mime || 'video/webm';
    const blob = new Blob(this.all, { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chessscout-stream-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    this.all = [];
    this.onStatus({ phase: 'downloaded', uploadedMB: 0, message: 'Couldn’t save to chessscout.net, so the video was downloaded to this device.' });
    return null;
  }
}
