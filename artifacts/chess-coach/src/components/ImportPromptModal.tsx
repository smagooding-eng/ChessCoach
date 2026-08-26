import { useEffect, useState } from 'react';
import { CloudDownload, X } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useMyGames } from '@/hooks/use-games';
import { invalidateEloCache } from '@/hooks/use-elo-progress';
import { apiFetch } from '@/lib/api';
import { trackImportJob } from '@/components/ImportStatusWatcher';

const STORAGE_KEY_PREFIX = 'importPromptDismissed_v2:';
const CHESSCOM_GREEN = '#81b64c';
const BG_CARD = '#302e2b';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const BORDER = 'rgba(255,255,255,0.08)';

export function ImportPromptModal() {
  const { authUser, username } = useUser();
  const { data: gamesData, isLoading: gamesLoading } = useMyGames(1);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chesscom = authUser?.chesscomUsername ?? null;
  const lichess = authUser?.lichessUsername ?? null;
  const hasGames = (gamesData?.games?.length ?? 0) > 0;
  const storageKey = authUser?.id ? `${STORAGE_KEY_PREFIX}${authUser.id}` : null;

  useEffect(() => {
    if (!authUser || !storageKey) return;
    if (gamesLoading) return;
    if (hasGames) return;
    if (!chesscom && !lichess) return;
    if (localStorage.getItem(storageKey) === '1') return;
    setOpen(true);
  }, [authUser, gamesLoading, hasGames, chesscom, lichess, storageKey]);

  const dismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, '1');
    setOpen(false);
  };

  const runImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const platforms: Array<{ platform: 'chesscom' | 'lichess'; user: string }> = [];
      if (chesscom) platforms.push({ platform: 'chesscom', user: chesscom });
      if (lichess) platforms.push({ platform: 'lichess', user: lichess });

      for (const { platform, user } of platforms) {
        const r = await apiFetch('/api/games/import-bg', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: user, months: 240, platform }),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.error || `${platform} import failed (${r.status})`);
        }
        const { jobId } = await r.json();
        trackImportJob(jobId, platform, user);
      }
      invalidateEloCache();
      if (storageKey) localStorage.setItem(storageKey, '1');
      setStatusText('Importing in the background — keep exploring, we\'ll let you know when it\'s done.');
      setTimeout(() => setOpen(false), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  const accounts = [chesscom && `Chess.com (${chesscom})`, lichess && `Lichess (${lichess})`]
    .filter(Boolean)
    .join(' and ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !importing) dismiss(); }}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-5"
        style={{ background: BG_CARD, border: `1px solid ${BORDER}`, boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        <div className="flex items-start gap-3">
          <div className="rounded-xl p-2.5" style={{ background: 'rgba(129,182,76,0.15)', color: CHESSCOM_GREEN }}>
            <CloudDownload size={22} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-black" style={{ color: TEXT_LIGHT }}>Import all your games?</h2>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>
              We'll pull every game from {accounts || 'your linked account'} so we can analyze your style and
              pinpoint weaknesses. This can take a minute or two for large histories.
            </p>
          </div>
          {!importing && (
            <button onClick={dismiss} className="rounded-md p-1 hover:bg-white/5" style={{ color: TEXT_MUTED }}>
              <X size={16} />
            </button>
          )}
        </div>

        {statusText && (
          <div className="rounded-lg px-3 py-2 text-xs font-bold"
            style={{ background: 'rgba(129,182,76,0.1)', color: CHESSCOM_GREEN, border: '1px solid rgba(129,182,76,0.25)' }}>
            {statusText}
          </div>
        )}

        {error && (
          <div className="rounded-lg px-3 py-2 text-xs"
            style={{ background: 'rgba(220,67,67,0.35)', color: '#ffffff', border: '1px solid rgba(220,67,67,0.6)' }}>
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={runImport}
            disabled={importing}
            className="flex-1 py-2.5 rounded-xl font-black text-sm disabled:opacity-60"
            style={{ background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)`, color: 'white' }}
          >
            {importing ? 'Importing…' : 'Import all games'}
          </button>
          <button
            onClick={dismiss}
            disabled={importing}
            className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-50"
            style={{ color: TEXT_MUTED, border: `1px solid ${BORDER}` }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
