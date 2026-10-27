import { useState } from 'react';
import { Loader2, Swords, Check, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { announceChallengeSent } from '@/lib/challengeSent';

export interface SeekInfo { seekerId: string; name: string; tc: string; mode: 'casual' | 'ranked' }

/** Read ?seek=…&n=…&tc=…&mode=… (from a "looking for a game" alert) and clear it from the address bar. */
export function takeSeekParams(): SeekInfo | null {
  try {
    const p = new URLSearchParams(window.location.search);
    const seekerId = p.get('seek');
    if (!seekerId) return null;
    const info: SeekInfo = { seekerId, name: p.get('n') || 'That player', tc: p.get('tc') || '', mode: p.get('mode') === 'ranked' ? 'ranked' : 'casual' };
    for (const k of ['seek', 'n', 'tc', 'mode']) p.delete(k);
    const q = p.toString();
    window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : ''));
    return info;
  } catch { return null; }
}

/** "Joining <name>'s game…" while we try to grab the seek. */
export function SeekJoiningCard({ seek }: { seek: SeekInfo }) {
  return (
    <div className="flex items-center gap-3 p-4" style={cardStyle}>
      <Loader2 className="h-6 w-6 shrink-0 animate-spin" style={{ color: PT.green }} />
      <p className="text-[14.5px] font-extrabold" style={{ color: PT.text }}>Joining {seek.name}'s game…</p>
    </div>
  );
}

/** Someone else got there first: offer to challenge that player directly. */
export function SeekGoneCard({ seek, kind, onClose }: { seek: SeekInfo; kind: 'live' | 'daily'; onClose: () => void }) {
  const [state, setState] = useState<'ask' | 'sending' | 'sent'>('ask');
  const [err, setErr] = useState('');
  const send = async () => {
    setState('sending'); setErr('');
    try {
      const r = await apiFetch('/api/challenges/direct', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, timeControl: seek.tc, mode: seek.mode, targetUserId: seek.seekerId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not send the challenge');
      setState('sent');
      announceChallengeSent(seek.name);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send the challenge'); setState('ask'); }
  };
  return (
    <div className="p-4" style={{ ...cardStyle, border: '1px solid rgba(129,182,76,.45)' }}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: '#81B64C', color: '#FFFFFF' }}>
          {state === 'sent' ? <Check size={22} /> : <Swords size={22} />}
        </span>
        <div className="min-w-0 flex-1">
          {state === 'sent' ? (
            <>
              <p className="text-[14.5px] font-extrabold" style={{ color: PT.text }}>Challenge sent to {seek.name}</p>
              <p className="text-[12.5px]" style={{ color: PT.muted }}>
                {kind === 'live' ? "We'll bring you straight to the game when they accept." : "You'll get a notification when they accept."}
              </p>
            </>
          ) : (
            <>
              <p className="text-[14.5px] font-extrabold" style={{ color: PT.text }}>{seek.name} already found a game. Challenge them?</p>
              <p className="text-[12.5px]" style={{ color: PT.muted }}>Someone accepted first. Send {seek.name} a challenge and play them next.</p>
              {err && <p className="mt-1 text-[12px]" style={{ color: '#F0605D' }}>{err}</p>}
              <div className="mt-3 flex gap-2">
                <button onClick={send} disabled={state === 'sending' || !seek.tc} className="flex-1 rounded-xl px-3 py-2.5 text-[13px] font-extrabold disabled:opacity-60" style={greenBtn}>
                  {state === 'sending' ? 'Sending…' : `Challenge ${seek.name}`}
                </button>
                <button onClick={onClose} className="flex-1 rounded-xl px-3 py-2.5 text-[13px] font-bold" style={ghostBtn}>Not now</button>
              </div>
            </>
          )}
        </div>
        <button onClick={onClose} aria-label="Close" className="shrink-0 p-1" style={{ color: PT.muted }}><X size={16} /></button>
      </div>
    </div>
  );
}
