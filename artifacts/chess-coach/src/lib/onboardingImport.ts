import { apiFetch } from '@/lib/api';
import { trackBackgroundJob } from '@/components/BackgroundJobsWatcher';
import { trackImportJob } from '@/components/ImportStatusWatcher';

/**
 * New-account setup: import the player's recent games, then queue a full
 * review. Resolves as soon as the import job has been created (so a bad
 * username can be reported straight away); the polling + review then keep
 * running in the background even if the screen that started it goes away.
 */
export async function startOnboardingImport(
  username: string,
  platform: 'chesscom' | 'lichess',
  cb: { onReady?: () => void; onError?: (message: string) => void } = {},
): Promise<void> {
  const importRes = await apiFetch('/api/games/import-bg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, platform, months: 3 }),
  });
  if (!importRes.ok) {
    const errBody = await importRes.json().catch(() => null) as { error?: string; message?: string } | null;
    throw new Error(errBody?.message || errBody?.error || `Import failed (${importRes.status})`);
  }
  const { jobId } = await importRes.json() as { jobId: string };
  // The app-wide "your games are ready" popup follows this job on any page.
  trackImportJob(jobId, platform, username);

  void (async () => {
    try {
      let status = 'pending';
      while (status === 'pending') {
        await new Promise((r) => setTimeout(r, 3000));
        const res = await apiFetch(`/api/games/import-status/${jobId}`, { credentials: 'include' });
        if (!res.ok) continue; // transient -- keep polling
        const data = await res.json() as { status: string; error?: string | null };
        status = data.status;
        if (status === 'error') throw new Error(data.error || 'Import failed');
      }
      const reviewRes = await apiFetch('/api/games/review-all', { method: 'POST', credentials: 'include' });
      if (!reviewRes.ok) {
        const errBody = await reviewRes.json().catch(() => null) as { error?: string } | null;
        throw new Error(errBody?.error || `Review failed (${reviewRes.status})`);
      }
      const reviewData = await reviewRes.json().catch(() => null) as { jobId?: string } | null;
      if (reviewData?.jobId) trackBackgroundJob('gamesReview', reviewData.jobId);
      cb.onReady?.();
    } catch (err) {
      cb.onError?.(err instanceof Error ? err.message : 'Something went wrong importing your games.');
    }
  })();
}
