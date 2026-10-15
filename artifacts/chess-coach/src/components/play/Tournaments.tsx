import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Trophy, ChevronRight, Users, Clock } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PT, cardStyle } from '@/lib/playTheme';

export interface TournamentSummary {
  id: string;
  name: string;
  description: string | null;
  timeControl: string;
  timeControlLabel: string;
  mode: 'casual' | 'ranked';
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'running' | 'finished' | 'cancelled';
  players: number;
  joined: boolean;
  winner?: string | null;
}

export function fmtCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function whenLabel(t: TournamentSummary, now = Date.now()): string {
  if (t.status === 'running') return `Ends in ${fmtCountdown(new Date(t.endsAt).getTime() - now)}`;
  if (t.status === 'scheduled') {
    const start = new Date(t.startsAt);
    const ms = start.getTime() - now;
    if (ms < 6 * 3600_000) return `Starts in ${fmtCountdown(ms)}`;
    return `Starts ${start.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  }
  return t.winner ? `Won by ${t.winner}` : 'Finished';
}

/** Running and upcoming tournaments, for the Live play lobby. Hidden when there are none. */
export function TournamentsCard() {
  const [list, setList] = useState<{ running: TournamentSummary[]; upcoming: TournamentSummary[]; recent: TournamentSummary[] } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let alive = true;
    const load = () => apiFetch('/api/tournaments', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setList(d); })
      .catch(() => {});
    void load();
    const t = setInterval(load, 30_000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; clearInterval(t); clearInterval(c); };
  }, []);
  const items = [...(list?.running ?? []), ...(list?.upcoming ?? [])].slice(0, 4);
  if (items.length === 0) return null;
  return (
    <div className="overflow-hidden" style={cardStyle}>
      <div className="flex items-center gap-2 px-4 pt-4">
        <Trophy size={18} style={{ color: PT.gold }} />
        <h2 className="text-[15px] font-extrabold" style={{ color: PT.text }}>Tournaments</h2>
      </div>
      {items.map((t) => (
        <Link key={t.id} href={`/tournaments/${t.id}`} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${PT.border}`, marginTop: 10 }}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: t.status === 'running' ? 'rgba(232,180,71,.15)' : PT.greenSoft, color: t.status === 'running' ? PT.gold : PT.green }}>
            <Trophy size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <b className="truncate text-[14.5px] font-extrabold" style={{ color: PT.text }}>{t.name}</b>
              {t.status === 'running' && <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider" style={{ background: PT.gold, color: '#1a1405' }}>Live</span>}
            </span>
            <span className="flex flex-wrap items-center gap-x-2.5 text-[12px]" style={{ color: PT.muted }}>
              <span className="inline-flex items-center gap-1"><Clock size={11} /> {t.timeControlLabel} · {t.mode === 'ranked' ? 'Ranked' : 'Casual'}</span>
              <span className="inline-flex items-center gap-1"><Users size={11} /> {t.players}</span>
              <span>{whenLabel(t, now)}</span>
            </span>
          </span>
          {t.joined && <span className="shrink-0 text-[11px] font-black uppercase tracking-wider" style={{ color: PT.green }}>Joined</span>}
          <ChevronRight size={18} style={{ color: PT.muted }} />
        </Link>
      ))}
    </div>
  );
}
