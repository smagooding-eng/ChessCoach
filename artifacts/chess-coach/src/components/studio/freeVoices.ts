import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

// Free voiceover voices (Gemini / Groq keys saved in Admin › AI usage). They have
// small free daily limits; every line made is kept, so replays and re-renders are free.
export interface FreeVoice { id: string; label: string }

let loaded: Promise<FreeVoice[]> | null = null;
export function useFreeVoices(): FreeVoice[] {
  const [list, setList] = useState<FreeVoice[]>([]);
  useEffect(() => {
    if (!loaded) loaded = apiFetch('/api/tts/voices', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => (Array.isArray(d?.free) ? d.free : [])).catch(() => []);
    let live = true;
    void loaded.then((v) => { if (live) setList(v); });
    return () => { live = false; };
  }, []);
  return list;
}
