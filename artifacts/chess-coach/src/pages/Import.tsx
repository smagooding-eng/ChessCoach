import React, { useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { useImportChessGames } from '@/hooks/use-games';
import { motion } from 'framer-motion';
import { CloudDownload, CheckCircle2, AlertCircle, RefreshCw, ArrowRight, Edit3, Check, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';

export function Import() {
  const { username, isLoaded, login, authUser } = useUser();
  const [months, setMonths] = useState(3);
  const { importGames, isImporting, error } = useImportChessGames();
  const [result, setResult] = useState<{ imported: number; updated?: number; total: number } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const [isSyncing, setIsSyncing] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(username ?? '');
  const [saving, setSaving] = useState(false);

  const handleImport = async (e: React.FormEvent, forceUpdate = false) => {
    e.preventDefault();
    if (!username) {
      setLocation('/setup');
      return;
    }
    setApiError(null);
    if (forceUpdate) setIsSyncing(true);
    try {
      if (forceUpdate) {
        const r = await apiFetch('/api/games/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username, months, forceUpdate: true }),
        });
        if (!r.ok) throw new Error('Sync failed');
        const data = await r.json();
        setResult(data);
      } else {
        const res = await importGames(username, months);
        setResult(res);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to import games. Please try again.';
      setApiError(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setApiError(null);
  };

  const handleStartEdit = () => {
    setEditValue(username ?? '');
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditValue(username ?? '');
    setEditing(false);
  };

  const handleSaveUsername = async () => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    if (trimmed === username) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      login(trimmed);
      if (authUser) {
        await apiFetch('/api/auth/update-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ chesscomUsername: trimmed }),
        });
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto mt-4 md:mt-10 px-4 md:px-0">
      <div className="glass-card rounded-3xl p-8 md:p-10 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CloudDownload className="w-8 h-8 text-primary" />
        </div>

        <h1 className="text-3xl font-display font-bold mb-4">Import Chess.com Games</h1>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Fetch your recent games from chess.com to power the AI analysis. The more games you
          import, the better the insights.
        </p>

        {result ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mb-8"
          >
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-emerald-50 mb-2">Import Complete!</h2>

            {result.imported === 0 && result.total === 0 ? (
              <div className="space-y-2 mb-6">
                <p className="text-amber-300 font-medium">No games found in the last {months} month{months !== 1 ? 's' : ''}.</p>
                <p className="text-emerald-200/70 text-sm">
                  Try increasing the time range, or check that <strong>{username}</strong> is your correct chess.com username.
                </p>
              </div>
            ) : result.imported === 0 && !result.updated ? (
              <div className="space-y-2 mb-6">
                <p className="text-emerald-200/80">All {result.total} games are already imported — you&apos;re up to date!</p>
                <p className="text-emerald-200/50 text-sm">
                  Having issues with Chess960 or missing moves?{' '}
                  <button
                    onClick={(e) => handleImport(e, true)}
                    disabled={isSyncing}
                    className="text-amber-400 hover:text-amber-300 underline underline-offset-2"
                  >
                    {isSyncing ? 'Re-syncing...' : 'Re-sync games from chess.com'}
                  </button>
                </p>
              </div>
            ) : (
              <div className="space-y-1 mb-6">
                {result.imported > 0 && (
                  <p className="text-emerald-200/80">
                    Imported <strong>{result.imported}</strong> new game{result.imported !== 1 ? 's' : ''}
                  </p>
                )}
                {(result.updated ?? 0) > 0 && (
                  <p className="text-amber-300/80">
                    Updated <strong>{result.updated}</strong> existing game{result.updated !== 1 ? 's' : ''} with latest data
                  </p>
                )}
                <p className="text-emerald-200/60 text-sm">{result.total} total in your library</p>
              </div>
            )}

            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={handleReset}
                className="px-5 py-2.5 rounded-xl bg-secondary text-foreground font-semibold hover:bg-secondary/80 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Import More
              </button>
              <Link
                href="/games"
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:-translate-y-0.5 flex items-center gap-2"
              >
                View Games <ArrowRight className="w-4 h-4" />
              </Link>
              {result.total > 0 && (
                <Link
                  href="/analysis"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold shadow-lg hover:bg-emerald-500 transition-all hover:-translate-y-0.5"
                >
                  Analyze Now
                </Link>
              )}
            </div>
          </motion.div>
        ) : (
          <form
            onSubmit={handleImport}
            className="space-y-6 max-w-sm mx-auto text-left relative z-10"
          >
            <div>
              <label className="block text-sm font-medium text-foreground mb-2 ml-1">
                Chess.com Username
              </label>
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); handleSaveUsername(); }
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    placeholder="Your chess.com username"
                    className="flex-1 px-4 py-3 rounded-xl bg-secondary/80 border-2 border-primary text-foreground focus:outline-none focus:ring-4 focus:ring-primary/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleSaveUsername}
                    disabled={saving || !editValue.trim()}
                    className="p-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Check className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="p-3 rounded-xl bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <input
                      type="text"
                      value={username || ''}
                      disabled
                      className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border text-muted-foreground cursor-not-allowed"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-1 flex items-center gap-1">
                    Connected account ·{' '}
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      Change
                    </button>
                  </p>
                </>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2 ml-1">
                <span className="flex justify-between items-center">
                  <span>History to fetch</span>
                  <span className="text-primary font-bold">
                    {months} {months === 1 ? 'month' : 'months'}
                  </span>
                </span>
              </label>
              <input
                type="range"
                min="1"
                max="12"
                value={months}
                onChange={(e) => setMonths(parseInt(e.target.value))}
                className="w-full accent-primary h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2 px-1">
                <span>1 month</span>
                <span>12 months</span>
              </div>
            </div>

            {(error || apiError) && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-sm flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">Import failed</p>
                  <p className="text-destructive/80 break-words">
                    {apiError || (error?.message) || 'Failed to import games. Check that your username is correct and try again.'}
                  </p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isImporting || !username}
              className="w-full flex justify-center items-center gap-2 px-6 py-4 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none hover:-translate-y-0.5 active:translate-y-0"
            >
              {isImporting ? (
                <>
                  <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Fetching Games...
                </>
              ) : (
                <>
                  <CloudDownload className="w-5 h-5" /> Import Games
                </>
              )}
            </button>

            {!username && isLoaded && (
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/setup" className="text-primary hover:underline font-medium">
                  Set up your account
                </Link>{' '}
                first to import games.
              </p>
            )}
          </form>
        )}
      </div>
    </motion.div>
  );
}
