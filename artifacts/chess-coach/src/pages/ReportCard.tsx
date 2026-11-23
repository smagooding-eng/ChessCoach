// The week in one card: cases closed, puzzles, days active, games and rating change, and your
// best move of the week from your own games. Shareable as an image. (Sunday evening push.)
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Loader2, Share2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { RedesignHeader } from '@/components/RedesignHeader';
import { AppIcon } from '@/components/AppIcon';

type Report = { weekEnding: string; casesClosed: number; puzzlesSolved: number; daysActive: number; games: number; wins: number; ratingChange: number | null; rating: number | null;
  bestMove: { gameId: number; san: string; moveNumber: number; opponent: string; cls: string } | null };
const MUTED = '#8F9997', GREEN = '#81B64C';
const CLS: Record<string, string> = { brilliant: 'Brilliant', great: 'Great move', best: 'Best move' };

function image(r: Report, name: string): Promise<Blob | null> {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1080;
  const x = c.getContext('2d'); if (!x) return Promise.resolve(null);
  x.fillStyle = '#0E1415'; x.fillRect(0, 0, 1080, 1080);
  x.fillStyle = '#182123'; x.beginPath(); x.roundRect(60, 60, 960, 960, 36); x.fill();
  x.fillStyle = GREEN; x.font = '900 46px system-ui, sans-serif'; x.fillText('ChessScout.net', 110, 150);
  x.fillStyle = '#F5F7F6'; x.font = '900 72px system-ui, sans-serif'; x.fillText(`${name}'s week`, 110, 250);
  x.fillStyle = MUTED; x.font = '600 34px system-ui, sans-serif'; x.fillText(`Week ending ${new Date(r.weekEnding + 'T12:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`, 110, 305);
  const stats: [string, string][] = [[String(r.casesClosed), 'cases closed'], [String(r.puzzlesSolved), 'puzzles solved'], [String(r.daysActive), 'days active'], [r.ratingChange == null ? '—' : `${r.ratingChange > 0 ? '+' : ''}${r.ratingChange}`, 'rating']];
  stats.forEach(([v, l], i) => {
    const bx = 110 + (i % 2) * 440, by = 380 + Math.floor(i / 2) * 230;
    x.fillStyle = '#212B2D'; x.beginPath(); x.roundRect(bx, by, 420, 200, 24); x.fill();
    x.fillStyle = '#F5F7F6'; x.font = '900 96px system-ui, sans-serif'; x.fillText(v, bx + 36, by + 115);
    x.fillStyle = MUTED; x.font = '700 34px system-ui, sans-serif'; x.fillText(l, bx + 36, by + 165);
  });
  if (r.bestMove) {
    x.fillStyle = '#F5F7F6'; x.font = '800 38px system-ui, sans-serif';
    x.fillText(`${CLS[r.bestMove.cls] ?? 'Best move'}: ${r.bestMove.moveNumber}. ${r.bestMove.san} vs ${r.bestMove.opponent}`.slice(0, 52), 110, 900);
  }
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

export default function ReportCardPage() {
  const { authUser } = useUser();
  const [r, setR] = useState<Report | null>(null);
  useEffect(() => { if (authUser) apiFetch('/api/me/report-card', { credentials: 'include' }).then((x) => (x.ok ? x.json() : null)).then(setR).catch(() => {}); }, [authUser]);
  const name = authUser?.scoutUsername ?? authUser?.chesscomUsername ?? authUser?.lichessUsername ?? 'My';
  const share = async () => {
    if (!r) return;
    const b = await image(r, name); if (!b) return;
    const f = new File([b], 'chessscout-week.png', { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], text: 'My week on ChessScout.net' }); return; }
    } catch { return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = f.name; a.click();
  };
  const tile = (v: string, l: string, icon: string) => (
    <div className="rounded-[12px] p-3" style={{ background: 'var(--rd-card-light, #212B2D)' }}>
      <AppIcon name={icon} size={24} />
      <b className="mt-1 block text-[24px] font-black tabular-nums">{v}</b>
      <span className="text-[12px]" style={{ color: MUTED }}>{l}</span>
    </div>
  );
  return (
    <div className="mx-auto w-full max-w-[560px] space-y-3 px-4 pb-28 pt-3" style={{ color: '#F5F7F6' }}>
      <RedesignHeader dense title="Report card" backHref="/progress" />
      {!r ? <div className="grid place-items-center py-16"><Loader2 className="animate-spin" style={{ color: MUTED }} /></div> : (
        <>
          <div className="rounded-[14px] p-4" style={{ background: 'var(--rd-card-solid, #182123)' }}>
            <b className="block text-[18px] font-black">Your week</b>
            <span className="text-[12.5px]" style={{ color: MUTED }}>The 7 days to {new Date(r.weekEnding + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {tile(String(r.casesClosed), 'cases closed', 'lookup')}
              {tile(String(r.puzzlesSolved), 'puzzles solved', 'puzzles')}
              {tile(String(r.daysActive), 'days active', 'streak')}
              {tile(r.ratingChange == null ? '—' : `${r.ratingChange > 0 ? '+' : ''}${r.ratingChange}`, `rating${r.rating ? ` (now ${r.rating})` : ''}`, 'analysis')}
            </div>
            <p className="mt-3 text-[13px]" style={{ color: MUTED }}>{r.games ? `${r.games} game${r.games === 1 ? '' : 's'} played, ${r.wins} won.` : 'No games played this week.'}</p>
            {r.bestMove && (
              <Link href={`/games/${r.bestMove.gameId}`} className="mt-2 flex items-center gap-2.5 rounded-[12px] p-3" style={{ background: 'var(--rd-card-light, #212B2D)' }}>
                <AppIcon name="badge" size={28} />
                <span className="min-w-0 text-[13.5px]"><b>Move of the week: {r.bestMove.moveNumber}. {r.bestMove.san}</b><span className="block truncate" style={{ color: MUTED }}>{CLS[r.bestMove.cls] ?? 'Best move'} vs {r.bestMove.opponent}</span></span>
              </Link>
            )}
          </div>
          <button onClick={share} className="cs-cta"><Share2 size={18} />Share my week</button>
        </>
      )}
    </div>
  );
}
