// Everyone sees the board & play set-up once: on their next visit after this shipped,
// with their own choices marked "Yours". Only right after a page change, never onto a
// board they're playing or solving on, and not on top of the Pro offer.
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { X } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { BoardSetupCard, markSetupSeen, setupSeen } from '@/components/BoardSetupCard';
import { PROMO_OPEN_KEY } from '@/components/TrialPromo';
import { STUDIO_FRAME } from '@/lib/studioFrame';

const SKIP = /^\/(setup|login|signup|welcome|subscription|pricing|review|instagram|admin|kids|embed|share|cc|live|lichess|daily|play|puzzles?|bots?|challenge|tournaments?|studio|traps\/)/;

export function BoardSetupPrompt() {
  const { authUser } = useUser();
  const [path] = useLocation();
  const [open, setOpen] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (!authUser || open || setupSeen(authUser.id) || STUDIO_FRAME || window.self !== window.top || SKIP.test(path)) return;
    const t = setTimeout(() => {
      try { if (Date.now() - Number(localStorage.getItem(PROMO_OPEN_KEY) || 0) < 3 * 60_000) return; } catch { /* ignore */ }
      if (document.visibilityState !== 'visible' || setupSeen(authUser.id)) return;
      setOpen(true);
    }, first.current ? 2500 : 700);
    first.current = false;
    return () => clearTimeout(t);
  }, [authUser, path]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open || !authUser) return null;
  const done = () => { markSetupSeen(authUser.id); setOpen(false); };
  return (
    <div className="fixed inset-0 z-[95] overflow-y-auto px-3 py-4" style={{ background: 'rgba(3,6,7,.8)', backdropFilter: 'blur(6px)' }} role="dialog" aria-label="Your board and play set-up">
      <div className="relative mx-auto w-full max-w-md">
        <button onClick={done} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full" style={{ background: 'rgba(255,255,255,.06)', color: '#87918E' }}><X size={16} /></button>
        <BoardSetupCard mode="returning" onDone={done} />
      </div>
    </div>
  );
}
