import React, { useState } from 'react';
import { Swords, X, Sparkles, Award } from 'lucide-react';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { LIVE_TCS, socialApi, type Presence } from '@/lib/social';

const DOT: Record<Presence, string> = { playing: '#E8B447', online: '#81B64C', offline: 'transparent' };
export const PRESENCE_LABEL: Record<Presence, string> = { playing: 'Playing a game', online: 'Online', offline: 'Offline' };

/** Round avatar with an online / in-game dot. */
export function FriendAvatar({ src, name, status, size = 44 }: { src: string; name: string; status?: Presence; size?: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <img src={src} alt="" className="h-full w-full rounded-full object-cover" style={{ background: PT.cardLight }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`; }} />
      {status && status !== 'offline' && (
        <span className="absolute bottom-0 right-0 rounded-full" aria-label={PRESENCE_LABEL[status]}
          style={{ width: Math.round(size * 0.3), height: Math.round(size * 0.3), background: DOT[status], border: `2px solid ${PT.cardSolid}` }} />
      )}
    </span>
  );
}

const DAILY_TCS = [{ id: 'corr_1d', label: '1 day' }, { id: 'corr_3d', label: '3 days' }, { id: 'corr_7d', label: '7 days' }];

/** Challenge one player: live or daily, a clock, casual or ranked. */
export function ChallengeFriendSheet({ friend, onClose, onSent }: {
  friend: { userId: string; name: string };
  onClose: () => void;
  onSent?: () => void;
}) {
  const [kind, setKind] = useState<'live' | 'daily'>('live');
  const [tc, setTc] = useState('blitz_5_0');
  const [mode, setMode] = useState<'casual' | 'ranked'>('casual');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    setBusy(true); setErr(null);
    try { await socialApi.challenge(friend.userId, tc, mode, kind); onSent?.(); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not send'); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center md:items-center" style={{ background: 'rgba(0,0,0,.55)' }} onClick={onClose}>
      <div className="w-full max-w-[420px] space-y-3 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" style={{ ...cardStyle, background: PT.cardSolid }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Swords size={18} style={{ color: PT.green }} />
          <h3 className="flex-1 text-[16px] font-black" style={{ color: PT.text }}>Challenge {friend.name}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1" style={{ color: PT.muted }}><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 rounded-xl p-1" style={{ background: 'rgba(0,0,0,.25)' }}>
          {([['live', 'Live game'], ['daily', 'Daily game']] as const).map(([k, t]) => (
            <button key={k} onClick={() => { setKind(k); setTc(k === 'live' ? 'blitz_5_0' : 'corr_1d'); }} className="rounded-lg py-2 text-[13px] font-extrabold" style={kind === k ? greenBtn : { color: PT.muted }}>{t}</button>
          ))}
        </div>
        <div className={`grid gap-1.5 ${kind === 'live' ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {(kind === 'live' ? LIVE_TCS : DAILY_TCS).map((o) => (
            <button key={o.id} onClick={() => setTc(o.id)} className="rounded-lg py-2 text-[13px] font-bold" style={tc === o.id ? greenBtn : ghostBtn}>{o.label}{kind === 'daily' ? <span className="block text-[10.5px] font-semibold opacity-75">a move</span> : null}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(['casual', 'ranked'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-bold capitalize" style={mode === m ? greenBtn : ghostBtn}>
              {m === 'casual' ? <Sparkles size={14} /> : <Award size={14} />} {m}
            </button>
          ))}
        </div>
        <p className="text-[12px]" style={{ color: PT.muted }}>{friend.name} gets a "you've been challenged" notification, and it shows on their home screen. {kind === 'live' ? "When they accept, we'll notify you and the game starts on Live play." : "When they accept, the game starts right away and we'll notify you."} You'll see it under <b>Sent challenges</b> until they answer.</p>
        {err && <p className="text-[12.5px] font-bold" style={{ color: PT.red }}>{err}</p>}
        <button onClick={send} disabled={busy} className="w-full rounded-xl py-3 text-[14px] font-extrabold disabled:opacity-60" style={greenBtn}>
          {busy ? 'Sending…' : 'Send challenge'}
        </button>
      </div>
    </div>
  );
}
