import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle2, X } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

const POLL_INTERVAL_MS = 4000;

const CHESSCOM_GREEN = '#81b64c';
const BG_CARD = '#302e2b';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const BORDER = 'rgba(255,255,255,0.08)';

export type JobType = 'courses' | 'analysis' | 'endgames' | 'opponentScout' | 'opponentCourses';

interface JobConfig {
  storageKey: string;
  statusUrl: (jobId: string) => string;
  invalidateQueries: string[][];
  doneTitle: string;
  doneSubtitle: string;
  ctaLabel: string;
  ctaPath: string;
}

const JOB_CONFIG: Record<JobType, JobConfig> = {
  courses: {
    storageKey: 'pendingJobs:courses:',
    statusUrl: (id) => `/api/courses/generate-status/${id}`,
    invalidateQueries: [['/api/courses']],
    doneTitle: 'Your courses are ready!',
    doneSubtitle: 'New lessons based on your recent games.',
    ctaLabel: 'View courses',
    ctaPath: '/courses',
  },
  analysis: {
    storageKey: 'pendingJobs:analysis:',
    statusUrl: (id) => `/api/analysis/status/${id}`,
    invalidateQueries: [['/api/analysis/summary'], ['/api/analysis/weaknesses']],
    doneTitle: 'Deep analysis complete!',
    doneSubtitle: 'Your weakness breakdown has been updated.',
    ctaLabel: 'View analysis',
    ctaPath: '/analysis',
  },
  endgames: {
    storageKey: 'pendingJobs:endgames:',
    statusUrl: (id) => `/api/courses/endgame/generate-status/${id}`,
    invalidateQueries: [['/api/courses']],
    doneTitle: 'Endgame course ready!',
    doneSubtitle: 'A new endgame course has been generated.',
    ctaLabel: 'View endgames',
    ctaPath: '/endgames',
  },
  opponentScout: {
    storageKey: 'pendingJobs:opponentScout:',
    statusUrl: (id) => `/api/opponents/status/${id}`,
    invalidateQueries: [['/api/opponents']],
    doneTitle: 'Opponent scouting report ready!',
    doneSubtitle: 'Weaknesses have been identified.',
    ctaLabel: 'View report',
    ctaPath: '/opponents',
  },
  opponentCourses: {
    storageKey: 'pendingJobs:opponentCourses:',
    statusUrl: (id) => `/api/opponents/courses-job/${id}`,
    invalidateQueries: [['/api/opponents'], ['/api/courses']],
    doneTitle: 'Exploit courses ready!',
    doneSubtitle: 'Courses to exploit your opponent\'s weaknesses have been generated.',
    ctaLabel: 'View courses',
    ctaPath: '/courses',
  },
};

type Job = { jobId: string; type: JobType; addedAt: number };

function readJobs(userId: string | null | undefined, type: JobType): Job[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(JOB_CONFIG[type].storageKey + userId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Job[];
    if (!Array.isArray(parsed)) return [];
    // Dedupe by jobId — cleans up any duplicate entries that already
    // accumulated in a user's localStorage before this fix, not just new ones.
    const seen = new Set<string>();
    return parsed.filter((job) => {
      if (seen.has(job.jobId)) return false;
      seen.add(job.jobId);
      return true;
    });
  } catch {
    return [];
  }
}

function writeJobs(userId: string, type: JobType, jobs: Job[]) {
  const key = JOB_CONFIG[type].storageKey + userId;
  if (jobs.length === 0) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(jobs));
  window.dispatchEvent(new CustomEvent('bg-jobs-changed'));
}

/**
 * Registers a job to be tracked globally, surviving navigation away from
 * the page that started it. Call this right after starting any background
 * job (course generation, deep analysis, endgame generation, opponent
 * scouting) instead of relying solely on that page's own local polling.
 */
export function trackBackgroundJob(type: JobType, jobId: string) {
  try {
    const raw = sessionStorage.getItem('newBgJobs') || '[]';
    const arr = JSON.parse(raw) as Job[];
    const alreadyQueued = arr.some((j) => j.jobId === jobId && j.type === type);
    if (alreadyQueued) return;
    arr.push({ jobId, type, addedAt: Date.now() });
    sessionStorage.setItem('newBgJobs', JSON.stringify(arr));
    window.dispatchEvent(new CustomEvent('bg-jobs-changed'));
  } catch { /* ignore */ }
}

export function BackgroundJobsWatcher() {
  const { authUser } = useUser();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [completed, setCompleted] = useState<(Job & { config: JobConfig })[]>([]);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!authUser?.id) return;
    const userId = authUser.id;

    const migrateSessionJobs = () => {
      try {
        const raw = sessionStorage.getItem('newBgJobs');
        if (!raw) return;
        const incomingRaw = JSON.parse(raw) as Job[];
        if (!Array.isArray(incomingRaw) || incomingRaw.length === 0) return;
        // Dedupe within the incoming batch itself first — trackBackgroundJob
        // now prevents new duplicates, but this also cleans up any that
        // already piled up in sessionStorage before that fix.
        const seenInBatch = new Set<string>();
        const incoming = incomingRaw.filter((job) => {
          const key = `${job.type}:${job.jobId}`;
          if (seenInBatch.has(key)) return false;
          seenInBatch.add(key);
          return true;
        });
        const byType = new Map<JobType, Job[]>();
        for (const job of incoming) {
          if (!byType.has(job.type)) byType.set(job.type, []);
          byType.get(job.type)!.push(job);
        }
        for (const [type, jobs] of byType) {
          const existing = readJobs(userId, type);
          const ids = new Set(existing.map((j) => j.jobId));
          const merged = [...existing, ...jobs.filter((j) => !ids.has(j.jobId))];
          writeJobs(userId, type, merged);
        }
        sessionStorage.removeItem('newBgJobs');
      } catch { /* ignore */ }
    };

    const tick = async () => {
      migrateSessionJobs();
      const allTypes = Object.keys(JOB_CONFIG) as JobType[];
      const newlyDone: (Job & { config: JobConfig })[] = [];

      for (const type of allTypes) {
        const jobs = readJobs(userId, type);
        if (jobs.length === 0) continue;
        const stillPending: Job[] = [];

        for (const job of jobs) {
          try {
            const r = await apiFetch(JOB_CONFIG[type].statusUrl(job.jobId), { credentials: 'include' });
            if (!r.ok) {
              if (Date.now() - job.addedAt < 30 * 60 * 1000) stillPending.push(job);
              continue;
            }
            const data = await r.json() as { status: string };
            if (data.status === 'pending' || data.status === 'processing') {
              stillPending.push(job);
            } else if (data.status === 'done') {
              newlyDone.push({ ...job, config: JOB_CONFIG[type] });
            }
            // any other status (error) — drop silently, user can retry from the originating page
          } catch {
            stillPending.push(job);
          }
        }
        writeJobs(userId, type, stillPending);
      }

      if (newlyDone.length > 0) {
        for (const job of newlyDone) {
          for (const qk of job.config.invalidateQueries) {
            queryClient.invalidateQueries({ queryKey: qk });
          }
        }
        setCompleted((prev) => {
          const existingIds = new Set(prev.map((j) => j.jobId));
          const trulyNew = newlyDone.filter((j) => !existingIds.has(j.jobId));
          return [...prev, ...trulyNew];
        });
      }
    };

    tick();
    pollRef.current = window.setInterval(tick, POLL_INTERVAL_MS);

    const onChange = () => { tick(); };
    window.addEventListener('bg-jobs-changed', onChange);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      window.removeEventListener('bg-jobs-changed', onChange);
    };
  }, [authUser?.id, queryClient]);

  const dismissOne = (jobId: string) => {
    setCompleted((prev) => prev.filter((j) => j.jobId !== jobId));
  };

  const goTo = (job: Job & { config: JobConfig }) => {
    dismissOne(job.jobId);
    navigate(job.config.ctaPath);
  };

  if (!authUser || completed.length === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-5 right-3 md:right-5 z-50 flex flex-col gap-2 max-w-sm">
      {completed.map((job) => (
        <div key={job.jobId} className="rounded-2xl p-4 shadow-2xl"
          style={{ background: BG_CARD, border: `1px solid ${BORDER}`, boxShadow: '0 18px 50px rgba(0,0,0,0.55)' }}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl p-2" style={{ background: 'rgba(129,182,76,0.15)', color: CHESSCOM_GREEN }}>
              <CheckCircle2 size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-black" style={{ color: TEXT_LIGHT }}>{job.config.doneTitle}</h3>
              <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{job.config.doneSubtitle}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => goTo(job)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-black"
                  style={{ background: CHESSCOM_GREEN, color: 'white' }}>
                  {job.config.ctaLabel}
                </button>
                <button onClick={() => dismissOne(job.jobId)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ color: TEXT_MUTED, border: `1px solid ${BORDER}` }}>
                  Later
                </button>
              </div>
            </div>
            <button onClick={() => dismissOne(job.jobId)} className="rounded-md p-1 hover:bg-white/5" style={{ color: TEXT_MUTED }}>
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
