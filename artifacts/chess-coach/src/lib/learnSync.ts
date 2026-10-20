// Keeps Beginner Path + Chess for Kids progress on the server, per account.
//
// When someone signs in, both stores switch to that account's copy (so a
// shared device never mixes accounts), the server copy is merged in (best
// stars win), and from then on every change is saved back a moment later.
// An account set up for a child also carries Kid Mode: signing in to it
// locks this device into Chess for Kids.

import { useEffect } from 'react';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';
import { scopeLearn, mergeLearn, learnSnapshot, onLearnChange } from '@/lib/learn/progress';
import { scopeKids, mergeKids, kidsSnapshot, onKidsChange } from '@/lib/kids/progress';
import { setKidMode } from '@/lib/kids/kidMode';

export function LearnSync() {
  const { authUser, isAuthLoading } = useUser();
  const id = authUser?.id ?? null;

  useEffect(() => {
    if (isAuthLoading) return;
    scopeLearn(id);
    scopeKids(id);
    if (!id) return;

    let alive = true;
    let loaded = false;
    let timer: number | undefined;
    const save = () => {
      if (!loaded) return; // never overwrite the server before we've read it
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        apiFetch('/api/learn/progress', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ beginner: learnSnapshot(), kids: kidsSnapshot() }),
        }).catch(() => { /* offline: the next change tries again */ });
      }, 1200);
    };
    const off1 = onLearnChange(save);
    const off2 = onKidsChange(save);

    apiFetch('/api/learn/progress')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { beginner?: unknown; kids?: unknown; kidMode?: boolean } | null) => {
        if (!alive || !d) return;
        mergeLearn(d.beginner as never);
        mergeKids(d.kids as never);
        if (d.kidMode) setKidMode(true, { sync: false });
        loaded = true;
        save(); // push anything this device had that the server didn't
      })
      .catch(() => { /* offline: stay local */ });

    return () => { alive = false; off1(); off2(); window.clearTimeout(timer); };
  }, [id, isAuthLoading]);

  return null;
}
