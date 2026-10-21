import React, { useCallback, useEffect, useState } from 'react';
import { Swords, RefreshCw, Loader2, Check, X, Radio } from 'lucide-react';
import { apiFetch } from '@/lib/api';

// Admin: who's on ChessScout.net right now, and a Challenge button that
// sends them a game invite. It appears on their dashboard under "You've
// been challenged", in their notifications, and as a push if they allow it.

interface OnlineUser {
  id: string; label: string; email: string | null; scoutUsername: string | null; chesscomUsername: string | null; lichessUsername: string | null;
  status: string; path: string | null; lastSeenAt: string | null; onLivePlay: boolean; inLiveGame: boolean;
}
interface Tc { id: string; label: string }

const DAILY: Tc[] = [{ id: 'corr_1d', label: '1 day per move' }, { id: 'corr_3d', label: '3 days per move' }, { id: 'corr_7d', label: '7 days per move' }];
const FALLBACK_LIVE: Tc[] = [{ id: 'blitz_5_0', label: '5 min' }];

/** Inline form: pick the game, send the challenge. Usable anywhere in Admin. */
export function ChallengeUserButton({ userId, name, liveTcs }: { userId: string; name: string; liveTcs?: Tc[] }) {
  const [open, setOpen] = useState(false);
  const [tcs, setTcs] = useState<Tc[]>(liveTcs ?? []);
  const [kind, setKind] = useState<'live' | 'daily'>('live');
  const [tc, setTc] = useState('');
  const [mode, setMode] = useState<'casual' | 'ranked'>('casual');
  const [color, setColor] = useState<'random' | 'white' | 'black'>('random');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || tcs.length) return;
    apiFetch('/api/live/time-controls').then((r) => (r.ok ? r.json() : null)).then((d) => {
      const list = (d?.timeControls ?? d?.controls ?? d) as Tc[] | undefined;
      setTcs(Array.isArray(list) && list.length ? list : FALLBACK_LIVE);
    }).catch(() => setTcs(FALLBACK_LIVE));
  }, [open, tcs.length]);
  useEffect(() => { if (liveTcs?.length) setTcs(liveTcs); }, [liveTcs]);
  const options = kind === 'live' ? tcs : DAILY;
  useEffect(() => { if (!options.some((o) => o.id === tc)) setTc(options[0]?.id ?? ''); }, [kind, options, tc]);

  const send = async () => {
    setBusy(true); setError(null);
    try {
      const r = await apiFetch('/api/admin/challenge-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ userId, kind, timeControl: tc, mode, color, note }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not send');
      setSent(d.url ?? null); setOpen(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-primary">
        <Check size={12} /> Challenge sent · <a href={sent} className="underline">open it</a>
      </span>
    );
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10.5px] font-bold text-white">
        <Swords size={12} /> Challenge
      </button>
    );
  }
  const sel = 'rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px]';
  return (
    <div className="mt-2 w-full space-y-2 rounded-lg border border-white/10 bg-black/20 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold">Challenge {name}</span>
        <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground"><X size={13} /></button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <select className={sel} value={kind} onChange={(e) => setKind(e.target.value as 'live' | 'daily')}>
          <option value="live">Live</option><option value="daily">Daily</option>
        </select>
        <select className={sel} value={tc} onChange={(e) => setTc(e.target.value)}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select className={sel} value={mode} onChange={(e) => setMode(e.target.value as 'casual' | 'ranked')}>
          <option value="casual">Casual</option><option value="ranked">Ranked</option>
        </select>
        <select className={sel} value={color} onChange={(e) => setColor(e.target.value as 'random' | 'white' | 'black')}>
          <option value="random">Random color</option><option value="white">I play White</option><option value="black">I play Black</option>
        </select>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="Optional note (shown in their notification)"
        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] outline-none" />
      {kind === 'live' && <p className="text-[10px] text-muted-foreground">Live: when they accept, you're notified and the game starts as soon as you're on Live play.</p>}
      {error && <p className="text-[10.5px] font-bold text-red-400">{error}</p>}
      <button disabled={busy || !tc} onClick={send} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Swords size={12} />} Send challenge
      </button>
    </div>
  );
}

export function OnlineNowPanel({ labelForPath }: { labelForPath: (p: string) => string }) {
  const [data, setData] = useState<{ users: OnlineUser[]; recentMinutes: number; liveTimeControls?: Tc[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    apiFetch('/api/admin/online-now', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setData(d); }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20_000); return () => clearInterval(t); }, [load]);
  const ago = (iso: string | null) => {
    if (!iso) return '';
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return s < 60 ? 'just now' : `${Math.round(s / 60)} min ago`;
  };
  return (
    <div className="rounded-2xl border border-border/40 bg-card/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold"><Radio className="h-4 w-4 text-primary" /> Online now {data ? `(${data.users.length})` : ''}</h2>
        <button onClick={load} className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground"><RefreshCw size={12} /> Refresh</button>
      </div>
      <p className="mb-3 text-[10.5px] text-muted-foreground">Members with the app open, or who used it in the last {data?.recentMinutes ?? 10} minutes. Updates every 20 seconds. Your own accounts are left out.</p>
      {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
      {!loading && data && data.users.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">No one else is on right now.</p>}
      <div className="space-y-2">
        {data?.users.map((u) => (
          <div key={u.id} className="rounded-lg border border-white/5 bg-white/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-xs font-bold">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${u.status === 'online' ? 'bg-primary' : u.status.startsWith('app') ? 'bg-yellow-400' : 'bg-white/30'}`} />
                  {u.label}
                </p>
                {u.email && <p className="truncate text-[10.5px] text-muted-foreground select-all">{u.email}</p>}
                <p className="text-[10px] text-muted-foreground">
                  {u.status}{u.path ? ` · on ${labelForPath(u.path)}` : ''}{u.lastSeenAt ? ` · ${ago(u.lastSeenAt)}` : ''}
                  {u.inLiveGame ? ' · playing a live game' : u.onLivePlay ? ' · on Live play' : ''}
                </p>
              </div>
              {!u.inLiveGame && <ChallengeUserButton userId={u.id} name={u.label} liveTcs={data.liveTimeControls} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
