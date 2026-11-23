// Everyone sees the board & play set-up once, with their own choices marked "Yours": it slides
// up from the bottom when they open a game menu (before a game, never during one), not on
// top of the Pro offer.
import { claimPopup, popupClosed } from '@/lib/popupGate';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { BoardSetupCard, markSetupSeen, setupSeen } from '@/components/BoardSetupCard';
import { PROMO_OPEN_KEY } from '@/components/TrialPromo';
import { STUDIO_FRAME } from '@/lib/studioFrame';
import { SETUP_MOMENT } from '@/lib/setupMoment';

export function BoardSetupPrompt() {
  const { authUser } = useUser();
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // Wait for a game menu to come up (see useBoardSetupMoment), then give them a beat to look
  // at it before sliding the set-up in. Leaving the menu or starting a game cancels it.
  useEffect(() => {
    if (!authUser || STUDIO_FRAME || window.self !== window.top) return undefined;
    const onMoment = (e: Event) => {
      window.clearTimeout(timer.current);
      if (!(e as CustomEvent<boolean>).detail || open || setupSeen(authUser.id)) return;
      timer.current = window.setTimeout(() => {
        try { if (Date.now() - Number(localStorage.getItem(PROMO_OPEN_KEY) || 0) < 3 * 60_000) return; } catch { /* ignore */ }
        if (document.visibilityState !== 'visible' || setupSeen(authUser.id)) return;
        if (!claimPopup('board_setup', authUser as never)) return;
        setOpen(true);
      }, 1500);
    };
    window.addEventListener(SETUP_MOMENT, onMoment);
    return () => { window.removeEventListener(SETUP_MOMENT, onMoment); window.clearTimeout(timer.current); };
  }, [authUser, open]);
  if (!open || !authUser) return null;
  const done = () => { markSetupSeen(authUser.id); popupClosed('board_setup'); setOpen(false); };
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center" style={{ background: 'rgba(3,6,7,.7)', backdropFilter: 'blur(4px)' }}
      role="dialog" aria-label="Your board and play set-up" onClick={(e) => { if (e.target === e.currentTarget) done(); }}>
      <style>{'@keyframes cssheet{from{transform:translateY(100%)}to{transform:none}}'}</style>
      <div className="relative w-full max-w-md overflow-y-auto rounded-t-[24px] pb-[env(safe-area-inset-bottom)]"
        style={{ maxHeight: '90vh', animation: 'cssheet .32s cubic-bezier(.2,.8,.2,1)' }}>
        <div className="sticky top-0 z-10 flex justify-center pt-2" aria-hidden="true"><span className="h-1 w-10 rounded-full" style={{ background: 'rgba(255,255,255,.18)' }} /></div>
        <button onClick={done} aria-label="Close" className="absolute right-3 top-4 z-10 grid h-8 w-8 place-items-center rounded-full" style={{ background: 'rgba(255,255,255,.06)', color: '#87918E' }}><X size={16} /></button>
        <BoardSetupCard mode="returning" onDone={done} kicker="Before you play" />
      </div>
    </div>
  );
}
