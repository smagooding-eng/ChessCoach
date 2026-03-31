import React, { useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { useImportChessGames } from '@/hooks/use-games';
import { getApiBase } from '@/lib/api';
import { motion } from 'framer-motion';
import { CloudDownload, CheckCircle2, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';
import { Link, useLocation } from 'wouter';

export function Import() {
  const { username, isLoaded } = useUser();
  const [months, setMonths] = useState(3);
  const { importGames, isImporting, error } = useImportChessGames();
  const [result, setResult] = useState<{ imported: number; total: number } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) {
      setLocation('/setup');
      return;
    }
    setApiError(null);
    try {
      const res = await importGames(username, months);
      setResult(res);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to import games. Please try again.';
      setApiError(msg);
    }
  };

  const handleReset = () => {
    setResult(null);
    setApiError(null);
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
            ) : result.imported === 0 ? (
              <div className="space-y-2 mb-6">
                <p className="text-emerald-200/80">All {result.total} games are already imported — you&apos;re up to date!</p>
              </div>
            ) : (
              <p className="text-emerald-200/80 mb-6">
                Successfully imported <strong>{result.imported}</strong> new game{result.imported !== 1 ? 's' : ''} (
                {result.total} total in your library).
              </p>
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
                <Link href="/setup" className="text-primary hover:underline">
                  Change
                </Link>
              </p>
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
                  <p className="text-destructive/60 text-xs mt-1 break-all">
                    API: {getApiBase() || '(relative)'}
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
