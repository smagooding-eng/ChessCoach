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
