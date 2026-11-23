// Your progress, in one place: today's Daily Scout, the streak (with rest days earned by closing
// cases), the Skill Map (now vs when you started), badges, and the ways to train.
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { useStreak } from '@/lib/activity';
import { AppIcon } from '@/components/AppIcon';
import { RedesignHeader } from '@/components/RedesignHeader';
import { setPageMeta } from '@/lib/pageMeta';

const PANEL = 'var(--rd-card-solid, #182123)';
const PANEL2 = 'var(--rd-card-light, #212B2D)';
const MUTED = '#8F9997';
const GREEN = '#81B64C';
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export type Daily = { day: string; number: number; puzzleId: number; rating: number; stats: { played: number; solvedPct: number | null }; mine: { solved: boolean; ms: number } | null };
export function useDailyScout() {
  const [d, setD] = useState<Daily | null>(null);
  useEffect(() => { apiFetch(`/api/daily-scout?day=${localDay()}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => {}); }, []);
  return d;
}

type Skills = { openings: number | null; middlegame: number | null; endgames: number | null; tactics: number; precision: number; blunderFree: number | null; games: number };
const AXES: [keyof Skills, string][] = [['openings', 'Openings'], ['middlegame', 'Middlegame'], ['endgames', 'Endgames'], ['tactics', 'Tactics'], ['precision', 'Precision'], ['blunderFree', 'Blunder-free']];

function Radar({ now, start }: { now: Skills; start: Skills | null }) {
  const R = 92, C = 120, n = AXES.length;
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; const r = (Math.max(0, Math.min(100, v)) / 100) * R; return [C + Math.cos(a) * r, C + Math.sin(a) * r]; };
  const poly = (s: Skills) => AXES.map(([k], i) => pt(i, (s[k] as number | null) ?? 0).join(',')).join(' ');
  return (
    <svg viewBox="0 0 240 240" className="mx-auto block w-full max-w-[300px]" role="img" aria-label="Skill map">
      {[25, 50, 75, 100].map((g) => <polygon key={g} points={AXES.map((_, i) => pt(i, g).join(',')).join(' ')} fill="none" stroke="rgba(255,255,255,.08)" />)}
      {AXES.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="rgba(255,255,255,.08)" />; })}
      {start && <polygon points={poly(start)} fill="none" stroke="#8F9997" strokeDasharray="4 3" strokeWidth="1.5" />}
      <polygon points={poly(now)} fill="rgba(129,182,76,.35)" stroke={GREEN} strokeWidth="2" />
      {AXES.map(([k, l], i) => {
        const [x, y] = pt(i, 122); const v = now[k] as number | null;
        return <text key={k} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="10.5" fontWeight="800" fill="#DDE3E1">{l}<tspan x={x} dy="12" fontSize="10" fill={MUTED}>{v == null ? '—' : v}</tspan></text>;
      })}
    </svg>
  );
}

type Badge = { id: string; name: string; desc: string; icon: string; progress: number; need: number; earned: boolean };

export default function ProgressPage() {
  const { authUser } = useUser();
  const daily = useDailyScout();
  const streak = useStreak(!!authUser);
  const [skills, setSkills] = useState<{ now: Skills | null; start: Skills | null; games?: number } | null>(null);
  const [badges, setBadges] = useState<Badge[] | null>(null);
  useEffect(() => { setPageMeta('Your progress — ChessScout.net', 'Daily Scout, streak, skill map and badges.', '/progress'); }, []);
  useEffect(() => {
    if (!authUser) return;
    apiFetch('/api/me/skill-map', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { now: null, start: null })).then(setSkills).catch(() => setSkills({ now: null, start: null }));
    apiFetch('/api/me/badges', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { badges: [] })).then((d) => setBadges(d.badges ?? [])).catch(() => setBadges([]));
  }, [authUser]);

  const card = { background: PANEL };
  return (
    <div className="mx-auto w-full max-w-[680px] space-y-4 px-4 pb-28 pt-3" style={{ color: '#F5F7F6' }}>
      <RedesignHeader dense title="Progress" backHref="/" />

      {/* Daily Scout */}
      <div className="flex items-center gap-3 rounded-[14px] p-3.5" style={card}>
        <AppIcon name="opponents" size={40} />
        <div className="min-w-0 flex-1">
          <b className="block text-[16px] font-black">Daily Scout{daily ? ` #${daily.number}` : ''}</b>
          <span className="text-[12.5px]" style={{ color: MUTED }}>
            {daily?.mine ? (daily.mine.solved ? 'Solved today. Come back tomorrow.' : 'Missed today. New one tomorrow.') : 'One puzzle for everyone today, from a real member game.'}
            {daily?.stats.played ? ` ${daily.stats.solvedPct ?? 0}% of ${daily.stats.played} solved it.` : ''}
          </span>
        </div>
        {daily && !daily.mine && <Link href={`/puzzles?daily=${daily.number}&id=${daily.puzzleId}`} className="rounded-[12px] px-4 py-2 text-[14px] font-extrabold text-white" style={{ background: GREEN }}>Play</Link>}
      </div>

      {/* streak with rest days */}
      {streak && (
        <div className="rounded-[14px] p-3.5" style={card}>
          <div className="flex items-center gap-3">
            <AppIcon name="streak" size={34} style={{ filter: streak.doneToday ? undefined : 'grayscale(1) opacity(.6)' }} />
            <div className="min-w-0 flex-1">
              <b className="block text-[16px] font-black">{streak.streak} day{streak.streak === 1 ? '' : 's'} in a row</b>
              <span className="text-[12.5px]" style={{ color: MUTED }}>Best {streak.best} · {streak.doneToday ? 'done for today' : 'play, solve or review today to keep it'}</span>
            </div>
            <div className="text-right">
              <b className="block text-[18px] font-black">{streak.restDays ?? 0}</b>
              <span className="text-[11px]" style={{ color: MUTED }}>rest days</span>
            </div>
          </div>
          <p className="mt-2 text-[12px]" style={{ color: MUTED }}>Every 3 cases you close earns a rest day: miss a day and it keeps your streak alive.{streak.restUsed ? ` ${streak.restUsed} used in this streak.` : ''}</p>
        </div>
      )}

      {/* Skill Map */}
      <div className="rounded-[14px] p-3.5" style={card}>
        <div className="flex items-baseline justify-between"><b className="text-[16px] font-black">Skill Map</b><span className="text-[11.5px]" style={{ color: MUTED }}>from your reviewed games</span></div>
        {!skills ? <div className="grid place-items-center py-10"><Loader2 className="animate-spin" style={{ color: MUTED }} /></div>
          : !skills.now ? <p className="py-6 text-center text-[13px]" style={{ color: MUTED }}>Get 3 games reviewed and your map appears here.</p>
          : <>
            <Radar now={skills.now} start={skills.start} />
            <div className="mt-1 flex items-center justify-center gap-4 text-[11.5px]" style={{ color: MUTED }}>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: GREEN }} />Your latest games</span>
              {skills.start && <span className="inline-flex items-center gap-1.5"><span className="h-0 w-3 border-t-2 border-dashed" style={{ borderColor: MUTED }} />When you started</span>}
            </div>
          </>}
      </div>

      {/* Badges */}
      <div className="rounded-[14px] p-3.5" style={card}>
        <b className="mb-2 block text-[16px] font-black">Badges</b>
        {!badges ? <div className="grid place-items-center py-8"><Loader2 className="animate-spin" style={{ color: MUTED }} /></div> : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {badges.map((b) => (
              <div key={b.id} className="flex flex-col items-center rounded-[12px] px-1.5 py-2.5 text-center" style={{ background: PANEL2, opacity: b.earned ? 1 : 0.55 }} title={b.desc}>
                <AppIcon name={b.icon} size={30} style={{ filter: b.earned ? undefined : 'grayscale(1)' }} />
                <b className="mt-1 text-[11.5px] leading-tight">{b.name}</b>
                <span className="mt-0.5 text-[10.5px]" style={{ color: MUTED }}>{b.earned ? 'Earned' : `${b.progress}/${b.need}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ways to train */}
      <div className="grid grid-cols-2 gap-2">
        {[
          ['/report-card', 'analysis', 'Report card', 'Your week'],
          ['/field-notes', 'articles', 'Field Notes', 'Patterns you learned'],
          ['/sprint', 'rush', 'Scout Sprint', '3 minutes, beat your best'],
          ['/bot-challenge', 'bots', 'Bot of the month', 'Scout it, then beat it'],
          ['/legends', 'guess', 'Scout a Legend', 'Guess the master’s move'],
          ['/coordinates', 'coords', 'Spot the square', 'Coordinate drill'],
        ].map(([href, icon, t, d]) => (
          <Link key={href} href={href} className="flex items-center gap-2.5 rounded-[12px] p-3 active:scale-[.98]" style={card}>
            <AppIcon name={icon} size={30} />
            <span className="min-w-0"><b className="block text-[13.5px]">{t}</b><span className="block truncate text-[11.5px]" style={{ color: MUTED }}>{d}</span></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
