// The page the video maker opens (GitHub Actions, see scripts/studio-render.mjs): it loads
// the render job, uses the creator's own Studio settings, and plays the clip full screen
// when the recorder says go. Not meant to be opened by hand.
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { StudioPlayer, PREF_KEY, type StudioSource } from '@/components/studio/StudioPlayer';

export function StudioRender() {
  const [job, setJob] = useState<{ source: StudioSource; queue?: StudioSource[]; title?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('job') || '';
    apiFetch(`/api/admin/studio/render/${encodeURIComponent(id)}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`job ${r.status}`))))
      .then((d: { payload: { source: StudioSource; queue?: StudioSource[]; title?: string; prefs?: unknown } }) => {
        // The creator's own settings (voice, music, look...), so the video matches what they saw.
        try { localStorage.setItem(PREF_KEY, JSON.stringify(d.payload.prefs ?? {})); } catch { /* ignore */ }
        setJob({ source: d.payload.source, queue: d.payload.queue, title: d.payload.title });
      })
      .catch((e) => { setErr(String(e?.message ?? e)); (window as unknown as { __studioRender?: unknown }).__studioRender = { error: String(e?.message ?? e) }; });
  }, []);
  if (err) return <p style={{ color: '#fff', padding: 20 }}>{err}</p>;
  if (!job) return null;
  return <StudioPlayer render source={job.source} queue={job.queue} title={job.title} onClose={() => {}} />;
}
export default StudioRender;
