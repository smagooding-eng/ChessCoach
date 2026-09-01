import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle2, X } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';
import { invalidateEloCache } from '@/hooks/use-elo-progress';
import { useQueryClient } from '@tanstack/react-query';
import { PickGameToReviewModal } from '@/components/PickGameToReviewModal';

const STORAGE_KEY_PREFIX = 'pendingImportJobs:';
const POLL_INTERVAL_MS = 4000;

const CHESSCOM_GREEN = '#81b64c';
const BG_CARD = '#302e2b';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const BORDER = 'rgba(255,255,255,0.08)';

type Job = { jobId: string; platform: 'chesscom' | 'lichess'; user: string; addedAt: number };

function readJobs(userId: string | null | undefined): Job[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Job[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJobs(userId: string, jobs: Job[], skipEventIfUnchanged?: Job[]) {
  // Only dispatch 'import-jobs-changed' if the job list actually changed.
  // Previously this fired on every single write -- including routine
  // "still pending, nothing new" writes at the end of every tick -- which
  // meant every tick's own writeJobs call re-triggered another tick via
  // the event listener below, with no re-entrancy guard. That let
  // multiple overlapping tick() calls independently detect the same
  // completed import and each call setBannerVisible(true), so a banner
  // the user had just dismissed could pop back up moments later from an
  // in-flight overlapping call finishing late.
  if (skipEventIfUnchanged) {
    const before = skipEventIfUnchanged.map(j => j.jobId).sort().join(',');
    const after = jobs.map(j => j.jobId).sort().join(',');
    if (before === after) {
      if (jobs.length === 0) localStorage.removeItem(STORAGE_KEY_PREFIX + userId);
      else localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(jobs));
      return;
    }
  }
  if (jobs.length === 0) localStorage.removeItem(STORAGE_KEY_PREFIX + userId);
  else localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(jobs));
  window.dispatchEvent(new CustomEvent('import-jobs-changed'));
}

export function trackImportJob(jobId: string, platform: 'chesscom' | 'lichess', user: string) {
  // We don't know the userId here cheaply; store under a global key keyed by 'current'
  // Instead, append to a session list and let the watcher (which knows userId) migrate it
  try {
    const raw = sessionStorage.getItem('newImportJobs') || '[]';
    const arr = JSON.parse(raw) as Job[];
    arr.push({ jobId, platform, user, addedAt: Date.now() });
    sessionStorage.setItem('newImportJobs', JSON.stringify(arr));
    window.dispatchEvent(new CustomEvent('import-jobs-changed'));
  } catch { /* ignore */ }
}

export function ImportStatusWatcher() {
  const { authUser } = useUser();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [completed, setCompleted] = useState<Job[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [showPickModal, setShowPickModal] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [pendingBannerDismissed, setPendingBannerDismissed] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Polling loop
  useEffect(() => {
    if (!authUser?.id) return;
    const userId = authUser.id;

    const migrateSessionJobs = () => {
      try {
        const raw = sessionStorage.getItem('newImportJobs');
        if (!raw) return;
        const incoming = JSON.parse(raw) as Job[];
        if (!Array.isArray(incoming) || incoming.length === 0) return;
        const existing = readJobs(userId);
        const ids = new Set(existing.map(j => j.jobId));
        const merged = [...existing, ...incoming.filter(j => !ids.has(j.jobId))];
        writeJobs(userId, merged);
        sessionStorage.removeItem('newImportJobs');
      } catch { /* ignore */ }
    };

    const isTickingRef = { current: false };

    const tick = async () => {
      if (isTickingRef.current) return;
      isTickingRef.current = true;
      try {
        migrateSessionJobs();
        const jobs = readJobs(userId);
        if (jobs.length === 0) { setPendingCount(0); return; }

        const stillPending: Job[] = [];
        const newlyDone: Job[] = [];

        for (const job of jobs) {
          try {
            const r = await apiFetch(`/api/games/import-status/${job.jobId}`, { credentials: 'include' });
            if (!r.ok) {
              // 404 etc — drop it after 30 min
              if (Date.now() - job.addedAt < 30 * 60 * 1000) stillPending.push(job);
              continue;
            }
            const data = await r.json() as { status: string };
            if (data.status === 'pending') {
              stillPending.push(job);
            } else if (data.status === 'done') {
              newlyDone.push(job);
            } else {
              // error — drop it silently (the user can retry from Import page)
            }
          } catch {
            stillPending.push(job);
          }
        }

        writeJobs(userId, stillPending, jobs);
        setPendingCount(stillPending.length);

        if (newlyDone.length > 0) {
          invalidateEloCache();
          queryClient.invalidateQueries({ queryKey: ['/api/games'] });
          queryClient.invalidateQueries({ queryKey: ['/api/analysis/summary'] });
          setCompleted(prev => [...prev, ...newlyDone]);
          setBannerVisible(true);
        }
      } finally {
        isTickingRef.current = false;
      }
    };

    // Run once immediately, then on interval
    tick();
    pollRef.current = window.setInterval(tick, POLL_INTERVAL_MS);

    const onChange = () => { tick(); };
    window.addEventListener('import-jobs-changed', onChange);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      window.removeEventListener('import-jobs-changed', onChange);
    };
  }, [authUser?.id, queryClient]);

  const dismissBanner = () => {
    setBannerVisible(false);
    setCompleted([]);
  };

  const dismissPendingBanner = () => {
    setPendingBannerDismissed(true);
  };

  const goToGames = () => {
    setBannerVisible(false);
    navigate('/games');
    setShowPickModal(true);
  };

  const goToAnalysis = () => {
    setBannerVisible(false);
    navigate('/analysis');
  };

  if (!authUser) return null;

  const platformsDone = Array.from(new Set(completed.map(c => c.platform)));
  const labels = platformsDone.map(p => p === 'chesscom' ? 'Chess.com' : 'Lichess').join(' and ');

  return (
    <>
      {pendingCount > 0 && !bannerVisible && !pendingBannerDismissed && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl p-4 shadow-2xl"
          style={{ background: BG_CARD, border: `1px solid ${BORDER}`, boxShadow: '0 18px 50px rgba(0,0,0,0.55)' }}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl p-2 shrink-0" style={{ background: 'rgba(129,182,76,0.15)', color: CHESSCOM_GREEN }}>
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${CHESSCOM_GREEN} transparent ${CHESSCOM_GREEN} ${CHESSCOM_GREEN}` }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-black" style={{ color: TEXT_LIGHT }}>
                We're importing your games...
              </h3>
              <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                This usually takes a minute or two. We'll let you know the moment they're ready to review.
              </p>
            </div>
            <button onClick={dismissPendingBanner} className="rounded-md p-1 hover:bg-white/5 shrink-0" style={{ color: TEXT_MUTED }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      {bannerVisible && completed.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl p-4 shadow-2xl"
          style={{ background: BG_CARD, border: `1px solid ${BORDER}`, boxShadow: '0 18px 50px rgba(0,0,0,0.55)' }}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl p-2" style={{ background: 'rgba(129,182,76,0.15)', color: CHESSCOM_GREEN }}>
              <CheckCircle2 size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-black" style={{ color: TEXT_LIGHT }}>
                Your {labels} games are ready!
              </h3>
              <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                See what the engine found, or jump into a single game first.
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={goToAnalysis}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-black"
                  style={{ background: CHESSCOM_GREEN, color: 'white' }}>
                  Run Analysis
                </button>
                <button onClick={goToGames}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ background: 'rgba(255,255,255,0.08)', color: TEXT_LIGHT }}>
                  Browse Games
                </button>
              </div>
              <button onClick={dismissBanner}
                className="w-full mt-2 px-3 py-1 rounded-lg text-[11px] font-bold"
                style={{ color: TEXT_MUTED }}>
                Later
              </button>
            </div>
            <button onClick={dismissBanner} className="rounded-md p-1 hover:bg-white/5" style={{ color: TEXT_MUTED }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      {showPickModal && (
        <PickGameToReviewModal onClose={() => setShowPickModal(false)} />
      )}
    </>
  );
}
