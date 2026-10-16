import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Bell, Cpu, GraduationCap, X, Check, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { RD } from '@/lib/redesignTheme';

// "Review all" flow, shared by the Games pages.
//  - Free players choose: review free (Stockfish) or with the Coach (Pro).
//    Coach sends them to upgrade; the server starts the Coach review the
//    moment they're Pro (POST /games/review-after-upgrade), even if they
//    never come back to the app.
//  - Pro players go straight to a Coach review.
//  - Either way, if notifications aren't on yet we offer to turn them on, so
//    the "all reviewed" push reaches them after they close the app. The
//    review itself runs on the server.

const GREEN = '#81B64C';

export function useReviewAll(onStarted: (jobId: string) => void) {
  const { isPremium } = useUser();
  const push = usePushNotifications();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'free' | 'coach' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAskPush = push.permission !== 'unsupported' && push.permission !== 'denied' && !(push.permission === 'granted' && push.isSubscribed);
  const [notify, setNotify] = useState(true);

  const startFree = async () => {
    const res = await apiFetch('/api/games/review-all', { method: 'POST', credentials: 'include' });
    if (!res.ok) throw new Error('Could not start the review');
    const { jobId } = await res.json() as { jobId: string };
    onStarted(jobId);
  };

  const choose = async (kind: 'free' | 'coach') => {
    setBusy(kind); setError(null);
    try {
      // Ask for notifications first: the permission prompt needs this click.
      if (canAskPush && notify) await push.subscribe();
      if (kind === 'free' || isPremium) {
        await startFree();
        setOpen(false);
        return;
      }
      const r = await apiFetch('/api/games/review-after-upgrade', { method: 'POST', credentials: 'include' });
      if (!r.ok) throw new Error('Could not set that up');
      const d = await r.json() as { jobId?: string; started?: boolean };
      setOpen(false);
      if (d.started && d.jobId) { onStarted(d.jobId); return; }
      navigate('/subscription?after=review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  /** Call from the "Review all" button. */
  const start = () => {
    setError(null);
    // Pro and notifications already on: nothing to ask.
    if (isPremium && !canAskPush) { void choose('coach'); return; }
    setOpen(true);
  };

  const dialog = !open ? null : (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center" style={{ background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(6px)' }}
      onClick={() => !busy && setOpen(false)} role="dialog" aria-modal="true" aria-labelledby="review-all-title">
      <div className="w-full max-w-[440px] rounded-[22px] p-5" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}`, color: RD.text }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start gap-3">
          <h2 id="review-all-title" className="flex-1 text-[19px] font-black leading-tight">
            {isPremium ? 'Review all your games' : 'How should we review them?'}
          </h2>
          <button onClick={() => setOpen(false)} disabled={!!busy} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full" style={{ color: RD.muted }}><X size={18} /></button>
        </div>
        <p className="mb-4 text-[13px]" style={{ color: RD.muted }}>
          It runs on our servers, so you can close the app. {canAskPush ? "We'll let you know when they're done." : 'You can leave this screen any time.'}
        </p>

        {isPremium ? (
          <Option icon={<GraduationCap size={18} />} title="Review with your Coach" sub="Every move checked, and every mistake explained in plain English, with what to work on."
            busy={busy === 'coach'} onClick={() => void choose('coach')} primary label="Start review" />
        ) : (
          <div className="space-y-2.5">
            <Option icon={<Cpu size={18} />} title="Review free" sub="Stockfish checks every move: accuracy, mistakes, blunders and the best moves."
              busy={busy === 'free'} onClick={() => void choose('free')} label="Review free" />
            <Option icon={<GraduationCap size={18} />} title="Review with Coach" tag="Pro · $5/mo"
              sub="Everything in free, plus your coach explains each mistake and what to work on. Upgrade, and every game is reviewed with the Coach straight after."
              busy={busy === 'coach'} onClick={() => void choose('coach')} primary label="Upgrade & review" />
          </div>
        )}

        {canAskPush && (
          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-[14px] px-3.5 py-3" style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${RD.border}` }}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px]" style={{ background: GREEN }}><Bell size={16} color="#FFFFFF" /></span>
            <span className="min-w-0 flex-1 text-[13.5px] font-bold">Notify me when they're all reviewed</span>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-5 w-5 accent-[#81B64C]" />
          </label>
        )}
        {error && <p className="mt-3 text-[13px] font-bold" style={{ color: RD.red }}>{error}</p>}
      </div>
    </div>
  );

  return { start, dialog };
}

function Option({ icon, title, sub, tag, label, onClick, busy, primary }: {
  icon: React.ReactNode; title: string; sub: string; tag?: string; label: string; onClick: () => void; busy: boolean; primary?: boolean;
}) {
  return (
    <div className="rounded-[16px] p-3.5" style={{ background: 'rgba(255,255,255,.035)', border: `1px solid ${primary ? 'rgba(129,182,76,.45)' : RD.border}` }}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ background: GREEN, color: '#FFFFFF' }}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <b className="text-[15px] font-extrabold">{title}</b>
            {tag && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wider" style={{ background: 'rgba(255,255,255,.06)', border: `1px solid ${RD.border}` }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />{tag}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: RD.muted }}>{sub}</span>
        </span>
      </div>
      <button onClick={onClick} disabled={busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] py-2.5 text-[14px] font-extrabold disabled:opacity-70"
        style={primary ? { background: GREEN, color: '#FFFFFF' } : { background: 'rgba(255,255,255,.07)', color: RD.text, border: `1px solid ${RD.border}` }}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{label}
      </button>
    </div>
  );
}
