import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

// Reads the GLOBAL dashboard-redesign flag from the server -- this is
// the same value for every user, not a per-account preference (that's
// what SettingsContext.tsx is for). Used by App.tsx's DashboardRouter /
// GamesRouter / AnalysisRouter to decide which version of each page to
// render, for everyone, not just the current browser.
export function useDashboardRedesignFlag() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    return apiFetch('/api/app-config/dashboard-redesign')
      .then(r => r.ok ? r.json() : { enabled: false })
      .then(d => setEnabled(!!d.enabled))
      .catch(() => setEnabled(false))
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
