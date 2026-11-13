// "MP4 with sound": asks the server to make the video (see api-server routes/studioRender.ts),
// waits for it, then downloads it or hands it to the phone's share sheet (Instagram, TikTok,
// YouTube, WhatsApp... whatever's installed). Also used for the "your video is ready" link.
import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Share2, Film } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export interface RenderPayload { source: unknown; queue?: unknown[]; title?: string; prefs: unknown }

async function fetchFile(id: string, name: string): Promise<File> {
  const r = await apiFetch(`/api/admin/studio/render/${id}/file`, { credentials: 'include' });
  if (!r.ok) throw new Error("Couldn't get the video");
  return new File([await r.blob()], `${name || 'chessscout-clip'}.mp4`, { type: 'video/mp4' });
}

export function RenderReady({ id, name, shareText, className = '' }: { id: string; name: string; shareText?: string; className?: string }) {
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<File | null>(null);
  const get = async () => (file.current ??= await fetchFile(id, name));
  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator;
  const download = async () => {
    setBusy('download'); setErr(null);
    try { const f = await get(); const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 20_000); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't get the video"); } finally { setBusy(null); }
  };
  const share = async () => {
    setBusy('share'); setErr(null);
    try {
      const f = await get();
      if (!navigator.canShare?.({ files: [f] })) { setErr("This browser can't share video files. Use Download, then post it from your gallery."); return; }
      await navigator.share({ files: [f], text: shareText });
    } catch (e) { if ((e as { name?: string }).name !== 'AbortError') setErr("Couldn't open the share sheet. Use Download instead."); } finally { setBusy(null); }
  };
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button onClick={() => void download()} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white disabled:opacity-60">
        {busy === 'download' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download MP4
      </button>
      {canShare && (
        <button onClick={() => void share()} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black text-white disabled:opacity-60">
          {busy === 'share' ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Post to Instagram, TikTok, YouTube…
        </button>
      )}
      {err && <p className="w-full text-[12px] text-[#F0605D]">{err}</p>}
    </div>
  );
}

/** The latest videos made (14 days), with Download / Post for each finished one. */
export function RecentRenders() {
  const [list, setList] = useState<{ id: string; status: string; error: string | null; fileName: string | null; createdAt: string }[] | null>(null);
  useEffect(() => {
    const load = () => void apiFetch('/api/admin/studio/renders', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setList(d.renders ?? [])).catch(() => {});
    load(); const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  if (!list || !list.length) return null;
  return (
    <div className="mb-4 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
      <p className="mb-2 text-[13px] font-black">🎬 Your videos <span className="font-bold text-white/45">· kept for 14 days</span></p>
      <div className="space-y-2">
        {list.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/20 px-2.5 py-2">
            <span className="min-w-0 text-[12.5px]"><b className="block truncate">{(r.fileName ?? 'video').replace(/^chessscout-/, '').replace(/-/g, ' ')}</b><span className="text-white/50">{new Date(r.createdAt).toLocaleString()}</span></span>
            {r.status === 'done' ? <RenderReady id={r.id} name={r.fileName ?? 'chessscout-clip'} />
              : r.status === 'failed' ? <span className="text-[12px] font-bold text-[#F0605D]">Failed{r.error ? `: ${r.error}` : ''}</span>
              : <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-white/70"><Loader2 size={13} className="animate-spin" />Being made…</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RenderMp4({ payload, name, shareText, onStart }: { payload: () => RenderPayload; name: string; shareText?: string; onStart?: () => void }) {
  const [job, setJob] = useState<{ id: string; status: string; error?: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [starting, setStarting] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'failed') return;
    const t = setInterval(() => {
      tick((x) => x + 1);
      void apiFetch(`/api/admin/studio/render/${job.id}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setJob({ id: job.id, status: d.status, error: d.error }); }).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [job]);
  const start = async () => {
    onStart?.();
    if (starting) return;
    setErr(null); setStarting(true);
    try {
      const r = await apiFetch('/api/admin/studio/render', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload(), fileName: name }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.id) { setErr(d.error || "Couldn't start the video."); return; }
      setJob({ id: d.id, status: 'queued' }); setStartedAt(Date.now());
    } catch { setErr("Couldn't start the video."); } finally { setStarting(false); }
  };
  const mins = startedAt ? Math.floor((Date.now() - startedAt) / 60_000) : 0;
  return (
    <div className="space-y-1.5">
      {!job || job.status === 'failed' ? (
        <button onClick={() => void start()} disabled={starting} className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white disabled:opacity-60">{starting ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />} MP4 with sound</button>
      ) : job.status === 'done' ? (
        <RenderReady id={job.id} name={name} shareText={shareText} />
      ) : (
        <p className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-white/80"><Loader2 size={14} className="animate-spin" />{job.status === 'queued' ? 'Starting the video maker…' : 'Recording your video with its sound…'} {mins > 0 ? `${mins} min` : ''} (usually 2–5 minutes; you'll get a notification)</p>
      )}
      {(err || job?.status === 'failed') && <p className="text-[12px] text-[#F0605D]">{err || job?.error || 'That video failed. Try again.'}</p>}
    </div>
  );
}
