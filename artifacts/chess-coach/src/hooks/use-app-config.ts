import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

// Reads the GLOBAL dashboard-redesign flag from the server -- this is
// the same value for every user, not a per-account preference (that's
// what SettingsContext.tsx is for). Used by App.tsx's DashboardRouter /
// GamesRouter / AnalysisRouter to decide which version of each page to
// render, for everyone, not just the current browser.
// Last value the server reported, cached locally so the very first paint
// already uses the right version of the app. Without this every page
// loads as the OLD design for the moment it takes the flag request to
// come back, then visibly swaps -- a flash of the wrong dashboard/theme
// on every load. It's only a first-paint hint: the server value always
// wins as soon as it arrives.
const FLAG_CACHE_KEY = 'cs_dashboard_redesign';
function readCachedFlag(): boolean {
  try { return localStorage.getItem(FLAG_CACHE_KEY) === '1'; } catch { return false; }
}

export function useDashboardRedesignFlag() {
  const [enabled, setEnabled] = useState<boolean>(readCachedFlag);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    return apiFetch('/api/app-config/dashboard-redesign')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        // A failed/unreadable response keeps whatever we already had
        // rather than flipping everyone back to the old design.
        if (!d) return;
        const v = !!d.enabled;
        setEnabled(v);
        try { localStorage.setItem(FLAG_CACHE_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
      })
      .catch(() => { /* keep cached value */ })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { enabled, loading, refetch };
}

// Admin-only setter -- the backend route itself enforces isAdmin
// regardless of what calls it, this just wraps the request.
export async function setDashboardRedesignEnabled(enabled: boolean): Promise<{ enabled: boolean } | null> {
  const res = await apiFetch('/api/admin/app-config/dashboard-redesign', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Photo vs AI artwork ─────────────────────────────────────────────────────
// Second GLOBAL flag (admin toggle "AI vs non-AI images"). When on, every
// decorative image in the app -- home hero + tiles, opening thumbnails, course
// art, landing hero, setup background -- is swapped for the real-photograph
// version that lives under public/photo/ at the same relative path.
//
// Many components need this at once, so the flag lives in a tiny shared store
// (one request per page load, not one per component) with the same
// localStorage first-paint cache as the redesign flag.
const PHOTO_CACHE_KEY = 'cs_photo_images';
let photoOn: boolean = (() => { try { return localStorage.getItem(PHOTO_CACHE_KEY) === '1'; } catch { return false; } })();
let photoFetched = false;
const photoListeners = new Set<() => void>();
function setPhotoOn(v: boolean) {
  photoOn = v;
  try { localStorage.setItem(PHOTO_CACHE_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
  photoListeners.forEach((l) => l());
}
function fetchPhotoFlag() {
  photoFetched = true;
  apiFetch('/api/app-config/photo-images')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d && typeof d.enabled === 'boolean' && d.enabled !== photoOn) setPhotoOn(d.enabled); })
    .catch(() => { /* keep cached value */ });
}

export function usePhotoImagesFlag(): boolean {
  const [on, setOn] = useState(photoOn);
  useEffect(() => {
    const l = () => setOn(photoOn);
    photoListeners.add(l);
    if (!photoFetched) fetchPhotoFlag();
    l();
    return () => { photoListeners.delete(l); };
  }, []);
  return on;
}

// Decorative image paths that have a photo twin under public/photo/.
const PHOTO_SWAP = /(chessscout\/|assets\/openings\/|assets\/courses\/|images\/hero-bg\.)/;
export function toPhotoPath(url: string): string {
  const i = url.search(PHOTO_SWAP);
  if (i < 0) return url;
  return url.slice(0, i) + 'photo/' + url.slice(i).replace(/\.(png|jpe?g|webp)$/i, '.webp');
}

/** `const img = useSiteImg(); <img src={img(url)} />` -- returns the photo
 *  twin when the admin photo toggle is on, otherwise the url unchanged. */
export function useSiteImg(): (url: string) => string {
  const on = usePhotoImagesFlag();
  return useCallback((url: string) => (on ? toPhotoPath(url) : url), [on]);
}

export async function setPhotoImagesEnabled(enabled: boolean): Promise<{ enabled: boolean } | null> {
  const res = await apiFetch('/api/admin/app-config/photo-images', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) return null;
  const d = await res.json();
  if (d && typeof d.enabled === 'boolean') setPhotoOn(d.enabled);
  return d;
}
