import React, { useState, useRef, useEffect } from 'react';
import { PieceTile } from '@/components/DesignSystem';
import { useDashboardRedesignFlag } from '@/hooks/use-app-config';
import { RD } from '@/lib/redesignTheme';
import { useUser } from '@/hooks/use-user';
import { invalidateEloCache } from '@/hooks/use-elo-progress';
import { motion } from 'framer-motion';
import { CloudDownload, CheckCircle2, AlertCircle, RefreshCw, ArrowRight, Edit3, Check, X, FileUp } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { trackImportJob } from '@/components/ImportStatusWatcher';

type Platform = 'chesscom' | 'lichess';

export function Import() {
  const { username, isLoaded, login, authUser, refreshAuth, isPremium } = useUser();
  const [months, setMonths] = useState(3);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; updated?: number; total: number; platform?: string } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [, setLocation] = useLocation();
  const [isSyncing, setIsSyncing] = useState(false);
  const [platform, setPlatform] = useState<Platform>('chesscom');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { enabled: redesign } = useDashboardRedesignFlag();

  // PGN upload (redesign layout)
  type PgnSummary = { imported: number; duplicates: number; notYours: number; invalid: number; unfinished: number; total: number };
  const [pgnBusy, setPgnBusy] = useState(false);
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [pgnResult, setPgnResult] = useState<PgnSummary | null>(null);
  const [pgnDrag, setPgnDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const currentPlatformUsername = platform === 'chesscom'
    ? username
    : authUser?.lichessUsername ?? null;

  const platformLabel = platform === 'chesscom' ? 'Chess.com' : 'Lichess';

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Uses the background-job import endpoint instead of the old synchronous
  // one, which awaited a single request that looped through every game to
  // import (potentially hundreds for a large history) with no progress
  // shown and a real risk of hitting a request timeout partway through.
  // ImportPromptModal (the Dashboard onboarding prompt) already used this
  // safer pattern — this page, the actual dedicated Import page, didn't.
  const handleImport = async (e: React.FormEvent, forceUpdate = false) => {
    e.preventDefault();
    const importUsername = currentPlatformUsername;
    if (!importUsername) {
      if (platform === 'chesscom') {
        setLocation('/setup');
      }
      return;
    }
    setApiError(null);
    setIsLimitReached(false);
    setIsImporting(true);
    if (forceUpdate) setIsSyncing(true);
    try {
      const r = await apiFetch('/api/games/import-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: importUsername,
          months,
          forceUpdate,
          platform,
          ownerUsername: username || importUsername,
        }),
      });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        setIsLimitReached(errData.error === 'usage_limit');
        throw new Error((errData.error === 'usage_limit' ? errData.message : errData.error) || `Import failed (${r.status})`);
      }
      const { jobId } = await r.json() as { jobId: string };
      trackImportJob(jobId, platform, importUsername);

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await apiFetch(`/api/games/import-status/${jobId}`, { cache: 'no-store' });
          if (!statusRes.ok) return;
          const job = await statusRes.json() as {
            status: string;
            error?: string | null;
            result?: { imported: number; updated?: number; total: number; platform?: string } | null;
          };
          if (job.status === 'done') {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setResult(job.result ?? { imported: 0, total: 0 });
            invalidateEloCache();
            setIsImporting(false);
            setIsSyncing(false);
          } else if (job.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setApiError(job.error || 'Import failed. Please try again.');
            setIsImporting(false);
            setIsSyncing(false);
          }
        } catch {
          // transient network error — keep polling
        }
      }, 2500);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to import games. Please try again.';
      setApiError(msg);
      setIsImporting(false);
      setIsSyncing(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setApiError(null);
    setIsLimitReached(false);
  };

  const handleStartEdit = () => {
    setEditValue(currentPlatformUsername ?? '');
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditValue(currentPlatformUsername ?? '');
    setEditing(false);
  };

  const handleSaveUsername = async () => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    if (trimmed === currentPlatformUsername) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      if (platform === 'chesscom') {
        login(trimmed);
        if (authUser) {
          const res = await apiFetch('/api/auth/update-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ chesscomUsername: trimmed }),
          });
          if (!res.ok) throw new Error('Failed to save username');
          await refreshAuth();
        }
      } else {
        if (authUser) {
          const res = await apiFetch('/api/auth/update-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ lichessUsername: trimmed }),
          });
          if (!res.ok) throw new Error('Failed to save Lichess username');
          await refreshAuth();
        }
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const uploadPgnText = async (text: string) => {
    setPgnError(null);
    setPgnResult(null);
    setPgnBusy(true);
    try {
      const res = await apiFetch('/api/games/import-pgn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pgn: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPgnError(data?.error ?? 'Upload failed. Please try again.');
        return;
      }
      setPgnResult(data as PgnSummary);
      invalidateEloCache();
    } catch {
      setPgnError('Upload failed. Check your connection and try again.');
    } finally {
      setPgnBusy(false);
    }
  };

  const handlePgnFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setPgnError('That file is too large (15 MB max). Split it into smaller parts and upload each.');
      return;
    }
    setPgnError(null);
    let text = '';
    try { text = await file.text(); } catch { setPgnError('Could not read that file.'); return; }
    await uploadPgnText(text);
  };

  if (!isLoaded) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const resultOrForm = result ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-6 bg-emerald-500/20 border border-emerald-500/40 rounded-xl mb-8"
          >
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-emerald-50 mb-2">Import Complete!</h2>

            {result.imported === 0 && result.total === 0 ? (
              <div className="space-y-2 mb-6">
                <p className="text-amber-300 font-medium">No games found in the last {months} month{months !== 1 ? 's' : ''}.</p>
                <p className="text-emerald-200/70 text-sm">
                  Try increasing the time range, or check that <strong>{currentPlatformUsername}</strong> is your correct {platformLabel} username.
                </p>
              </div>
            ) : result.imported === 0 && !result.updated ? (
              <div className="space-y-2 mb-6">
                <p className="text-emerald-200/80">All {result.total} games are already imported — you&apos;re up to date!</p>
                <p className="text-emerald-200/50 text-sm">
                  Having issues with missing moves?{' '}
                  <button
                    onClick={(e) => handleImport(e, true)}
                    disabled={isSyncing}
                    className="text-amber-400 hover:text-amber-300 underline underline-offset-2"
                  >
                    {isSyncing ? 'Re-syncing...' : `Re-sync games from ${platformLabel}`}
                  </button>
                </p>
              </div>
            ) : (
              <div className="space-y-1 mb-6">
                {result.imported > 0 && (
                  <p className="text-emerald-200/80">
                    Imported <strong>{result.imported}</strong> new game{result.imported !== 1 ? 's' : ''} from {platformLabel}
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
                className="px-5 py-2.5 rounded-xl bg-secondary text-foreground font-bold hover:bg-secondary/80 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Import More
              </button>
              <Link
                href="/games"
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:-translate-y-0.5 flex items-center gap-2"
              >
                View Games <ArrowRight className="w-4 h-4" />
              </Link>
              {result.total > 0 && (
                <Link
                  href="/analysis"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold shadow-lg hover:bg-emerald-500 transition-all hover:-translate-y-0.5"
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
                {platformLabel} Username
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
                    placeholder={`Your ${platformLabel} username`}
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
              ) : currentPlatformUsername ? (
                <>
                  <div className="relative">
                    <input
                      type="text"
                      value={currentPlatformUsername || ''}
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
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      placeholder={`Enter your ${platformLabel} username`}
                      className="flex-1 px-4 py-3 rounded-xl bg-secondary/80 border-2 border-border text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all"
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
                  </div>
                  <p className="text-xs text-muted-foreground ml-1">
                    {authUser ? `Set your ${platformLabel} username to import games` : (
                      <>
                        <Link href="/setup" className="text-primary hover:underline font-medium">Sign in</Link> to save your username
                      </>
                    )}
                  </p>
                </div>
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
                className="w-full accent-primary h-2 bg-secondary rounded-xl appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2 px-1">
                <span>1 month</span>
                <span>12 months</span>
              </div>
            </div>

            {/* The isLimitReached branch that used to render here is gone
                -- game import has no usage cap anymore, so the backend
                never sends error: 'usage_limit' for this action, and
                isLimitReached can no longer become true. Left the state
                itself in place rather than touch its setter elsewhere in
                this file for a change that's purely dead-code cleanup. */}
            {apiError && (
              <div className="p-4 bg-destructive/20 border border-destructive/40 text-destructive rounded-xl text-sm flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold mb-1">Import failed</p>
                  <p className="text-destructive/80 break-words">
                    {apiError || 'Failed to import games. Check that your username is correct and try again.'}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button
                type="submit"
                disabled={isImporting || isSyncing || !currentPlatformUsername}
                className="w-full flex justify-center items-center gap-2 px-6 py-4 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none hover:-translate-y-0.5 active:translate-y-0"
              >
                {isImporting || isSyncing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Fetching Games...
                  </>
                ) : (
                  <>
                    <CloudDownload className="w-5 h-5" /> Import from {platformLabel}
                  </>
                )}
              </button>

              {currentPlatformUsername && (
                <button
                  type="button"
                  onClick={(e) => handleImport(e, true)}
                  disabled={isImporting || isSyncing}
                  className="w-full flex justify-center items-center gap-2 px-5 py-3 rounded-xl font-bold bg-secondary/80 text-foreground/80 border border-border/30 hover:bg-secondary hover:text-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSyncing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                      Re-syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" /> Re-sync Existing Games
                    </>
                  )}
                </button>
              )}
            </div>

            {currentPlatformUsername && (
              <p className="text-center text-xs text-muted-foreground/60">
                Re-sync refreshes game data from {platformLabel}, fixing missing moves and other issues.
              </p>
            )}
          </form>
        );

  if (redesign) {
    const sources: { id: Platform; label: string; linked: string | null | undefined; icon: React.ReactNode }[] = [
      { id: 'chesscom', label: 'Chess.com', linked: username, icon: <img src="https://images.chesscomfiles.com/uploads/v1/images_users/tiny_mce/SamCopeland/phpmeXx6V.png" alt="" className="h-5 w-5 rounded-sm" /> },
      { id: 'lichess', label: 'Lichess', linked: authUser?.lichessUsername, icon: <svg viewBox="0 0 50 50" className="w-5 h-5" fill="currentColor"><path d="M11.8 33.5c0-6.9 3.9-9.6 6.4-12.5L23 15.5l-4.6-8.5c-.5-1-1.7-1.6-2.8-1.3l-2.1.7C8 8.3 3.3 13.7 3.3 20.5c0 2.2.5 4.3 1.5 6.2l7 6.8zM38.3 17.6c-1.3-4.3-4.3-7.8-8.3-9.8l-5.1 5.2 4.5 7.8c2.7 2.8 6.8 5.5 6.8 12.7 0 1.2-.2 2.3-.5 3.4l5.9-5c1.5-2.5 2.4-5.5 2.4-8.5 0-2-.3-3.9-1-5.7l-4.7.1z"/><path d="M25 44.1c-4.3 0-8.2-1.7-11-4.5l-2.2 1.4c3.6 4 8.7 6.5 14.4 6.5 5.2 0 10-2.1 13.4-5.6l-2.3-1.5c-3 2.3-6.4 3.7-10.2 3.7h-2.1z"/></svg> },
    ];
    return (
      <div className="-m-4 min-h-screen px-3 pt-3 md:-m-6 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
        <div className="mx-auto grid w-full max-w-[560px] gap-3">
          <div className="px-1 pt-2 text-center">
            <h1 className="text-[26px] font-extrabold tracking-tight">Add your games</h1>
            <p className="mt-1 text-[13.5px]" style={{ color: RD.muted }}>Get a deeper analysis and improve faster.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {sources.map((src) => {
              const active = platform === src.id;
              return (
                <button
                  key={src.id}
                  onClick={() => { setPlatform(src.id); handleReset(); }}
                  className="flex items-center gap-3 rounded-[18px] p-3.5 text-left transition-colors"
                  style={{ background: active ? 'rgba(139,234,69,.07)' : RD.card, border: `1px solid ${active ? RD.green : RD.border}`, boxShadow: active ? '0 0 0 1px rgba(139,234,69,.25)' : undefined }}
                  aria-pressed={active}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px]" style={{ background: 'rgba(255,255,255,.07)', color: RD.text }}>{src.icon}</span>
                  <span className="min-w-0">
                    <b className="block text-[14px] font-bold">{src.label}</b>
                    <span className="block truncate text-[11.5px]" style={{ color: RD.muted }}>{src.linked ? src.linked : 'Import your games'}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <section className="rounded-[20px] p-4" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
            <div className="text-left">{resultOrForm}</div>
          </section>

          <div className="flex items-center gap-3 px-2 text-[12px]" style={{ color: RD.muted }}>
            <span className="h-px flex-1" style={{ background: RD.border }} />or<span className="h-px flex-1" style={{ background: RD.border }} />
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".pgn,text/plain,application/x-chess-pgn"
            className="hidden"
            onChange={(e) => { void handlePgnFile(e.target.files?.[0]); e.target.value = ''; }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setPgnDrag(true); }}
            onDragLeave={() => setPgnDrag(false)}
            onDrop={(e) => { e.preventDefault(); setPgnDrag(false); void handlePgnFile(e.dataTransfer.files?.[0]); }}
            disabled={pgnBusy}
            className="flex flex-col items-center gap-2 rounded-[20px] px-4 py-7 text-center transition-colors disabled:opacity-60"
            style={{ background: pgnDrag ? 'rgba(139,234,69,.06)' : 'transparent', border: `1.5px dashed ${pgnDrag ? RD.green : 'rgba(255,255,255,.18)'}` }}
          >
            {pgnBusy ? (
              <div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: RD.green, borderTopColor: 'transparent' }} />
            ) : (
              <FileUp size={26} style={{ color: RD.text }} />
            )}
            <b className="text-[16px] font-bold">{pgnBusy ? 'Importing games…' : 'Upload PGN File'}</b>
            <span className="text-[12.5px]" style={{ color: RD.muted }}>Drag and drop or choose a file</span>
          </button>

          {pgnError && (
            <div className="flex items-start gap-3 rounded-[14px] p-3.5 text-[13px]" style={{ background: 'rgba(255,80,88,.10)', border: '1px solid rgba(255,80,88,.30)', color: '#FF9DA2' }}>
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="break-words">{pgnError}</p>
            </div>
          )}

          {pgnResult && (
            <div className="rounded-[14px] p-4 text-[13px]" style={{ background: 'rgba(139,234,69,.07)', border: '1px solid rgba(139,234,69,.28)' }}>
              <p className="flex items-center gap-2 text-[14px] font-bold" style={{ color: RD.green }}>
                <CheckCircle2 className="h-4 w-4" />
                {pgnResult.imported > 0 ? `Added ${pgnResult.imported} game${pgnResult.imported === 1 ? '' : 's'} to your library` : 'No new games added'}
              </p>
              <ul className="mt-2 space-y-1" style={{ color: RD.muted }}>
                {pgnResult.duplicates > 0 && <li>{pgnResult.duplicates} already in your library</li>}
                {pgnResult.notYours > 0 && <li>{pgnResult.notYours} skipped — neither player matched your linked Chess.com/Lichess username</li>}
                {pgnResult.unfinished > 0 && <li>{pgnResult.unfinished} skipped — unfinished game (no result)</li>}
                {pgnResult.invalid > 0 && <li>{pgnResult.invalid} couldn&apos;t be read as a valid game</li>}
              </ul>
              {pgnResult.imported > 0 && (
                <Link href="/games" className="mt-3 inline-flex items-center gap-1.5 font-bold" style={{ color: RD.green }}>View Games <ArrowRight className="h-4 w-4" /></Link>
              )}
            </div>
          )}

          <p className="px-2 text-center text-[11.5px]" style={{ color: RD.muted }}>
            Supported: .pgn files, including Chess.com and Lichess exports. Games are matched to your linked username so results are recorded from your side.
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto mt-4 md:mt-10 px-4 md:px-0">
      <div className="glass-card rounded-xl p-8 md:p-10 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <div className="flex justify-center mb-4">
          <PieceTile piece="♟" size={56} />
        </div>

        <h1 className="text-2xl md:text-3xl font-black mb-4" style={{ letterSpacing: '-0.02em' }}>Import Games</h1>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Fetch your recent games to power deep analysis. Import from Chess.com, Lichess, or both.
        </p>

        <div className="flex justify-center gap-2 mb-8">
          <button
            onClick={() => { setPlatform('chesscom'); handleReset(); }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border',
              platform === 'chesscom'
                ? 'bg-primary border-primary/40 text-primary-foreground shadow-sm'
                : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/70'
            )}
          >
            <img src="https://images.chesscomfiles.com/uploads/v1/images_users/tiny_mce/SamCopeland/phpmeXx6V.png" alt="" className="w-4 h-4 rounded-sm" />
            Chess.com
          </button>
          <button
            onClick={() => { setPlatform('lichess'); handleReset(); }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border',
              platform === 'lichess'
                ? 'bg-primary border-primary/40 text-primary-foreground shadow-sm'
                : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/70'
            )}
          >
            <svg viewBox="0 0 50 50" className="w-4 h-4" fill="currentColor"><path d="M11.8 33.5c0-6.9 3.9-9.6 6.4-12.5L23 15.5l-4.6-8.5c-.5-1-1.7-1.6-2.8-1.3l-2.1.7C8 8.3 3.3 13.7 3.3 20.5c0 2.2.5 4.3 1.5 6.2l7 6.8zM38.3 17.6c-1.3-4.3-4.3-7.8-8.3-9.8l-5.1 5.2 4.5 7.8c2.7 2.8 6.8 5.5 6.8 12.7 0 1.2-.2 2.3-.5 3.4l5.9-5c1.5-2.5 2.4-5.5 2.4-8.5 0-2-.3-3.9-1-5.7l-4.7.1z"/><path d="M25 44.1c-4.3 0-8.2-1.7-11-4.5l-2.2 1.4c3.6 4 8.7 6.5 14.4 6.5 5.2 0 10-2.1 13.4-5.6l-2.3-1.5c-3 2.3-6.4 3.7-10.2 3.7h-2.1z"/></svg>
            Lichess
          </button>
        </div>

        {resultOrForm}
      </div>
    </motion.div>
  );
}
