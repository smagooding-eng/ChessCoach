// Opponent Scout, the Lichess side: your all-time record against this player on
// Lichess (from Lichess's head-to-head), and their Lichess rating over the last
// year. Only shows when there's something real to show. The same username on
// Lichess may be a different person, so the card says which account it read.
import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { RD } from '@/lib/redesignTheme';

interface H2H { available: boolean; games?: number; a?: { name: string; score: number }; b?: { name: string; score: number } }
interface Series { name: string; points: { month: string; rating: number }[] }

function Spark({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const lo = Math.min(...pts), hi = Math.max(...pts), span = Math.max(1, hi - lo);
  const d = pts.map((v, k) => `${k ? 'L' : 'M'}${(k / (pts.length - 1)) * 100},${30 - ((v - lo) / span) * 26 - 2}`).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  return <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full"><path d={d} fill="none" stroke={up ? RD.green : RD.red} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

export function LichessScoutCard({ opponent }: { opponent: string }) {
  const { authUser } = useUser();
  const me = authUser?.lichessUsername ?? null;
  const [h2h, setH2h] = useState<H2H | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(opponent)) return;
    let live = true;
    if (me && me.toLowerCase() !== opponent.toLowerCase()) {
      apiFetch(`/api/lichess/h2h?a=${encodeURIComponent(me)}&b=${encodeURIComponent(opponent)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live) setH2h(d); }).catch(() => {});
    }
    apiFetch(`/api/lichess/rating-history/${encodeURIComponent(opponent)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d?.series) setSeries(d.series); }).catch(() => {});
    return () => { live = false; };
  }, [opponent, me]);

  const main = [...series].sort((x, y) => y.points.length - x.points.length)[0];
  const hasH2h = h2h?.available && (h2h.games ?? 0) > 0 && h2h.a && h2h.b;
  if (!hasH2h && !main) return null;
  const card = { background: RD.card, border: `1px solid ${RD.border}` } as const;
  const first = main?.points[0]?.rating, last = main?.points[main.points.length - 1]?.rating;
  return (
    <section className="rounded-[22px] p-4" style={card}>
      <h2 className="mb-2 flex items-center gap-2.5 text-[16px] font-extrabold"><span style={{ color: RD.green }}>♞</span>On Lichess <span className="text-[12px] font-semibold" style={{ color: RD.muted }}>({opponent})</span></h2>
      {hasH2h && (
        <div className="mb-3">
          <p className="text-[13px]" style={{ color: RD.muted }}>You ({h2h!.a!.name}) vs {h2h!.b!.name}, all time</p>
          <b className="block text-[28px] font-extrabold leading-tight">{h2h!.a!.score} <span style={{ color: RD.red }}>–</span> {h2h!.b!.score}</b>
          <p className="text-[12px]" style={{ color: RD.muted }}>{h2h!.games} game{h2h!.games === 1 ? '' : 's'} · a draw counts half a point</p>
        </div>
      )}
      {main && first != null && last != null && (
        <div>
          <div className="flex items-baseline justify-between text-[13px]"><span style={{ color: RD.muted }}>{main.name} rating, last 12 months</span><b>{last} <span className="text-[12px]" style={{ color: last >= first ? RD.green : RD.red }}>{last >= first ? '+' : ''}{last - first}</span></b></div>
          <Spark pts={main.points.map((p) => p.rating)} />
        </div>
      )}
    </section>
  );
}
