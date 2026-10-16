import { apiFetch } from '@/lib/api';
import { trackImportJob } from '@/components/ImportStatusWatcher';

// Background game imports for linked accounts. Chess.com and Lichess are
// handled the same way and independently, so a player with both linked gets
// both (this used to import Chess.com only, and Lichess only when no
// Chess.com account was set).

/** Start a background import; resolves to the job id, or null on failure. */
export async function startBackgroundImport(platform: 'chesscom' | 'lichess', user: string, months: number, silent = true): Promise<string | null> {
  try {
    const r = await apiFetch('/api/games/import-bg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: user, months, forceUpdate: false, platform, ownerUsername: user }),
    });
    if (!r.ok) return null;
    const { jobId } = await r.json() as { jobId?: string };
    if (jobId) trackImportJob(jobId, platform, user, silent);
    return jobId ?? null;
  } catch {
    return null;
  }
}

/**
 * Home screen: quietly pick up new games (last month) from every linked
 * account, once per visit. Failures are silent; a manual Import still
 * reports its own errors.
 */
export function autoImportLinkedAccounts(accounts: { chesscom?: string | null; lichess?: string | null }): void {
  if (accounts.chesscom) void startBackgroundImport('chesscom', accounts.chesscom, 1);
  if (accounts.lichess) void startBackgroundImport('lichess', accounts.lichess, 1);
}
