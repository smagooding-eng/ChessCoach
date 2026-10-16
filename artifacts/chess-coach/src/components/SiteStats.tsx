import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Trophy } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { TournamentSummary } from '@/components/play/Tournaments';

// Real site-wide totals (the server only sends ones of 1,000 or more) and a
// "happening now" line from real tournaments. Both render nothing when
// there's nothing worth showing.

interface Metric { key: string; label: string; value: number }
let statsCache: Metric[] | null = null;

export function useSiteStats(): Metric[] {
  const [m, setM] = useState<Metric[]>(statsCache ?? []);
  useEffect(() => {
    if (statsCache) return;
    apiFetch('/api/public/stats').then((r) => (r.ok ? r.json() : null)).then((d) => {
      statsCache = Array.isArray(d?.metrics) ? d.metrics : [];
      setM(statsCache!);
    }).catch(() => {});
  }, []);
  return m;
}

const fmt = (n: number) => n >= 100_000 ? `${Math.floor(n / 1000).toLocaleString()}k+` : n.toLocaleString();

/** e.g. "38,214 games analyzed · 12,402 puzzles solved" */
export function SiteStatsLine({ className, style, max = 3 }: { className?: string; style?: React.CSSProperties; max?: number }) {
  const metrics = useSiteStats().slice(0, max);
  if (!metrics.length) return null;
  return (
    <p className={className} style={style}>
      {metrics.map((m, i) => (
        <span key={m.key}>{i > 0 && <span className="mx-1.5 opacity-50">·</span>}<b style={{ color: '#F5F7F6' }}>{fmt(m.value)}</b> {m.label}</span>
      ))}
    </p>
  );
}

function when(t: TournamentSummary): string {
  const d = new Date(t.startsAt);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `today ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

/** One line: a live tournament to join, else the next one, else the latest winner. */
export function HappeningNow({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [line, setLine] = useState<{ text: React.ReactNode; href: string; live: boolean } | null>(null);
  useEffect(() => {
    apiFetch('/api/tournaments').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      const running: TournamentSummary[] = d.running ?? [];
      const upcoming: TournamentSummary[] = (d.upcoming ?? []).filter((t: TournamentSummary) => t.visibility !== 'link');
      const recent: TournamentSummary[] = (d.recent ?? []).filter((t: TournamentSummary) => t.winner);
      const live = running.find((t) => t.format === 'arena') ?? running[0];
      if (live) { setLine({ live: true, href: `/tournaments/${live.id}`, text: <><b>{live.name}</b> is live now · join in</> }); return; }
      const next = [...upcoming].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
      if (next) { setLine({ live: false, href: `/tournaments/${next.id}`, text: <>Next tournament: <b>{next.name}</b>, {when(next)}</> }); return; }
      const won = recent[0];
      if (won) setLine({ live: false, href: `/tournaments/${won.id}`, text: <><b>{won.winner}</b> won {won.name}</> });
    }).catch(() => {});
  }, []);
  if (!line) return null;
  return (
    <Link href={line.href} className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] ${className ?? ''}`}
      style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(245,247,246,.9)', ...style }}>
      {line.live
        ? <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: '#FF5058' }} /><span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: '#FF5058' }} /></span>
        : <Trophy size={13} className="shrink-0" style={{ color: '#E8B447' }} />}
      <span className="truncate">{line.text}</span>
    </Link>
  );
}
