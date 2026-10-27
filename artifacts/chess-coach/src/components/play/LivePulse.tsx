import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ChevronRight, Trophy } from 'lucide-react';
import { apiFetch } from '@/lib/api';

// Real "who's around" for live play: people with the app open, searching or
// playing right now (you aren't counted), and the next Live Hour. Never
// padded: with nobody else on, it points to the Live Hour instead.

interface Pulse {
  online: number; searching: number; playing: number;
  liveHour: { id: string; name: string; startsAt: string; endsAt: string | null; status: string } | null;
}

let cache: { at: number; data: Pulse } | null = null;

export function useLivePulse(): Pulse | null {
  const [data, setData] = useState<Pulse | null>(cache?.data ?? null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await apiFetch('/api/live/online', { credentials: 'include' });
        if (!r.ok) return;
        const d = (await r.json()) as Pulse;
        cache = { at: Date.now(), data: d };
        if (alive) setData(d);
      } catch { /* keep the last value */ }
    };
    if (!cache || Date.now() - cache.at > 15_000) void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return data;
}

function liveHourText(lh: NonNullable<Pulse['liveHour']>): { text: string; on: boolean } {
  const start = new Date(lh.startsAt).getTime();
  const now = Date.now();
  if (lh.status === 'running' || start <= now) return { text: 'Live Hour is on now: join the arena', on: true };
  const mins = Math.round((start - now) / 60_000);
  if (mins <= 60) return { text: `Live Hour starts in ${Math.max(1, mins)} min`, on: false };
  const t = new Date(start);
  const sameDay = t.toDateString() === new Date().toDateString();
  const time = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return { text: `Live Hour ${sameDay ? 'tonight' : 'tomorrow'} at ${time}`, on: false };
}

const dot = (color: string, pulse = false) => (
  <span className="relative inline-flex h-2 w-2 shrink-0">
    {pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: color }} />}
    <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
  </span>
);

/** One line: "● 3 players online · 1 looking for a game", then the Live Hour. */
export function LivePulse({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const p = useLivePulse();
  if (!p) return null;
  const lh = p.liveHour ? liveHourText(p.liveHour) : null;
  const people = p.online > 0
    ? `${p.online} ${p.online === 1 ? 'player' : 'players'} online${p.searching > 0 ? ` · ${p.searching} looking for a game` : p.playing > 0 ? ` · ${p.playing} playing` : ''}`
    : null;
  if (!people && !lh) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className}`}>
      {people && (
        <span className="inline-flex items-center gap-2 text-[12.5px] font-bold" style={{ color: '#D7DDDA' }}>
          {dot('#81B64C', true)}{people}
        </span>
      )}
      {lh && p.liveHour && (!compact || !people || lh.on) && (
        <Link href={`/tournaments/${p.liveHour.id}`} className="inline-flex items-center gap-1.5 text-[12.5px] font-extrabold" style={{ color: lh.on ? '#81B64C' : '#E8B447' }}>
          <Trophy size={13} />{lh.text}<ChevronRight size={13} />
        </Link>
      )}
    </div>
  );
}
