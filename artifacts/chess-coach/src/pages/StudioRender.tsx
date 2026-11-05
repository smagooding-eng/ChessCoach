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
    // The server can be slow to answer (a cold start, or another video being made): try a few times.
    const load = async (): Promise<unknown> => {
      for (let k = 0; ; k++) {
        try {
          const r = await apiFetch(`/api/admin/studio/render/${encodeURIComponent(id)}`, { credentials: 'include' });
          if (r.ok) return r.json();
          if (r.status === 401 || r.status === 403 || r.status === 404) throw Object.assign(new Error(`job ${r.status}`), { final: true });
        } catch (e) { if ((e as { final?: boolean }).final || k >= 5) throw e; }
        await new Promise((res) => setTimeout(res, 4000 * (k + 1)));
      }
    };
    load()
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
