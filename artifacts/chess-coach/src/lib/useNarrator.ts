import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

// Lesson narration (Read aloud / AUTO).
//
// Why it felt slow: each step's whole text was sent in one request and nothing
// played until all of it had been voiced. Now the text is split into short
// sentence-sized chunks; the first chunk is small so audio starts quickly, and the
// rest are fetched while the earlier ones play. Audio is cached per chunk for the
// session, and the NEXT step can be warmed in the background, so moving on is
// usually instant.
//
// Why it didn't follow the learner: a delayed read for an old step could still
// fire after they'd moved on. Every speak() now gets a generation number; anything
// belonging to an older generation is dropped, so the voice always moves to
// whatever page is on screen.

const VOICE = 'nova';
const cache = new Map<string, Promise<string>>(); // chunk text -> object URL
const CACHE_LIMIT = 60;

function remember(key: string, p: Promise<string>) {
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.get(oldest)?.then((u) => URL.revokeObjectURL(u)).catch(() => {});
    cache.delete(oldest);
  }
}

function fetchChunk(text: string): Promise<string> {
  const hit = cache.get(text);
  if (hit) return hit;
  const p = apiFetch('/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: VOICE }),
  }).then(async (res) => {
    if (!res.ok) throw new Error('TTS failed');
    return URL.createObjectURL(await res.blob());
  });
  remember(text, p);
  return p;
}

/** Split into chunks: a short first one (fast start), then ~2-3 sentences each. */
export function chunkForSpeech(plain: string): string[] {
  const sentences = plain.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+["')\]]*|\S[^.!?]*$/g) ?? [];
  const out: string[] = [];
  let cur = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    const limit = out.length === 0 ? 140 : 380;
    if (cur && (cur + ' ' + s).length > limit) { out.push(cur); cur = s; }
    else cur = cur ? `${cur} ${s}` : s;
    if (out.length === 0 && cur.length >= 60) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}

export function useNarrator(toPlain: (t: string) => string) {
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const genRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    genRef.current += 1;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (audioRef.current) { audioRef.current.onended = null; audioRef.current.pause(); audioRef.current = null; }
    setSpeaking(false);
    setLoading(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    stop();
    const gen = genRef.current;
    const chunks = chunkForSpeech(toPlain(text));
    if (!chunks.length) return;
    setLoading(true);
    // Kick off the first two immediately; later ones are requested one ahead.
    chunks.slice(0, 2).forEach((c) => { fetchChunk(c).catch(() => {}); });
    for (let i = 0; i < chunks.length; i++) {
      if (gen !== genRef.current) return;
      if (chunks[i + 1]) fetchChunk(chunks[i + 1]).catch(() => {});
      let url: string;
      try { url = await fetchChunk(chunks[i]); } catch { if (gen === genRef.current) { setLoading(false); setSpeaking(false); } return; }
      if (gen !== genRef.current) return;
      const audio = new Audio(url);
      audioRef.current = audio;
      const finished = new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
      });
      try {
        await audio.play();
        if (gen !== genRef.current) { audio.pause(); return; }
        setLoading(false);
        setSpeaking(true);
      } catch {
        if (gen === genRef.current) { setLoading(false); setSpeaking(false); }
        return;
      }
      await finished;
    }
    if (gen === genRef.current) { setSpeaking(false); setLoading(false); audioRef.current = null; }
  }, [stop, toPlain]);

  /** Speak after a short settle delay; cancelled by any later speak()/stop(). */
  const speakSoon = useCallback((text: string | (() => string), delay = 80) => {
    stop();
    const gen = genRef.current;
    timerRef.current = setTimeout(() => {
      if (gen === genRef.current) speak(typeof text === 'function' ? text() : text);
    }, delay);
  }, [stop, speak]);

  /** Warm the cache for text the learner is likely to hear next. */
  const prefetch = useCallback((text: string | null | undefined) => {
    if (!text) return;
    const first = chunkForSpeech(toPlain(text))[0];
    if (first) fetchChunk(first).catch(() => {});
  }, [toPlain]);

  useEffect(() => () => stop(), [stop]);

  return { speaking, loading, speak, speakSoon, stop, prefetch };
}
