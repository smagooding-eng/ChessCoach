import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Crosshair, ChevronRight, Swords, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useDashboardRedesignFlag } from '@/hooks/use-app-config';
import { RD, DIFFICULTY_BADGE } from '@/lib/redesignTheme';

const BG = '#141413';
const CARD = '#1c1b19';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const ACCENT = '#e0a03a'; // amber -- distinct from the app's green

interface TrapSummary {
  id: number;
  name: string;
  category: string;
  difficulty: string;
  trapSide: string;
  summary: string;
}

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner: '#81b64c',
  intermediate: '#e0a03a',
  advanced: '#e05a5a',
};

function useTraps() {
  const [traps, setTraps] = useState<TrapSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/traps', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setTraps(d?.traps ?? []))
      .finally(() => setLoading(false));
  }, []);

  return { traps, loading };
}

function TrapsClassic({ traps, loading }: { traps: TrapSummary[]; loading: boolean }) {
  const grouped = traps.reduce<Record<string, TrapSummary[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-xl p-2.5" style={{ background: `${ACCENT}18`, color: ACCENT }}>
            <Crosshair className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-black" style={{ letterSpacing: '-0.02em' }}>Chess Traps</h1>
        </div>
        <p className="text-sm mb-8" style={{ color: MUTED }}>
          Learn the classics from both sides — how to set them, and how to spot them coming.
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: ACCENT }} />
          </div>
        ) : traps.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-sm" style={{ color: MUTED }}>No traps added yet.</p>
          </div>
        ) : (
          (Object.entries(grouped) as [string, TrapSummary[]][]).map(([category, categoryTraps]) => (
            <div key={category} className="mb-7">
              <p className="text-xs font-black uppercase tracking-wide mb-3" style={{ color: MUTED }}>{category}</p>
              <div className="space-y-2.5">
                {categoryTraps.map((trap) => {
                  return (
                    <Link key={trap.id} href={`/traps/${trap.id}`}>
                      <div
                        className="rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-transform hover:scale-[1.01]"
                        style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <div className="rounded-xl p-2.5 shrink-0" style={{ background: trap.trapSide === 'white' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)' }}>
                          <Swords className="w-4 h-4" style={{ color: TEXT }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate flex items-center gap-1.5">
                            {trap.name}
                          </p>
                          <p className="text-xs truncate" style={{ color: MUTED }}>{trap.summary}</p>
                        </div>
                        <span
                          className="text-[10px] font-black uppercase px-2 py-1 rounded-full shrink-0"
                          style={{ background: `${DIFFICULTY_COLOR[trap.difficulty] ?? MUTED}20`, color: DIFFICULTY_COLOR[trap.difficulty] ?? MUTED }}
                        >
                          {trap.difficulty}
                        </span>
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Redesign (toggle ON) ────────────────────────────────────────────────
// Mockup structure: title, All / By Category tabs, rows with a tile,
// name + summary, a difficulty chip and a chevron. The list API returns
// no board positions or popularity data, so there are no per-trap board
// thumbnails and no "Popular" tab -- neither would be real.
function TrapsRedesign({ traps, loading }: { traps: TrapSummary[]; loading: boolean }) {
  const [tab, setTab] = useState<'all' | 'category'>('all');

  const grouped = traps.reduce<Record<string, TrapSummary[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  const renderRow = (trap: TrapSummary, i: number) => {
    const chip = DIFFICULTY_BADGE[trap.difficulty] ?? { bg: 'rgba(255,255,255,.10)', fg: RD.muted };
    return (
      <Link
        key={trap.id}
        href={`/traps/${trap.id}`}
        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.03]"
        style={{ borderTop: i ? `1px solid ${RD.border}` : undefined }}
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px]"
          style={{ background: trap.trapSide === 'white' ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.45)', border: `1px solid ${RD.border}` }}
        >
          <Swords size={18} style={{ color: RD.text }} />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[14.5px] font-bold">{trap.name}</b>
          <span className="block truncate text-[12px]" style={{ color: RD.muted }}>{trap.summary}</span>
        </div>
        <span className="shrink-0 rounded-md px-2 py-1 text-[10.5px] font-extrabold capitalize" style={{ background: chip.bg, color: chip.fg }}>
          {trap.difficulty}
        </span>
        <ChevronRight size={15} className="shrink-0" style={{ color: RD.muted }} />
      </Link>
    );
  };

  return (
    <div className="-m-4 min-h-screen px-3 pt-3 md:-m-6 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto grid w-full max-w-[760px] gap-3">
        <div className="px-1">
          <h1 className="text-[24px] font-extrabold tracking-tight">Chess Traps</h1>
          <p className="mt-1 text-[13px]" style={{ color: RD.muted }}>Learn the classics from both sides — how to set them, and how to spot them coming.</p>
        </div>

        <div className="flex items-center gap-1.5 rounded-[14px] p-1" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
          {([['all', 'All'], ['category', 'By Category']] as const).map(([id, label]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex-1 rounded-[10px] py-2 text-[13px] font-bold transition-colors"
                style={active ? { background: 'rgba(139,234,69,.10)', color: RD.green, boxShadow: `inset 0 0 0 1px ${RD.green}` } : { background: 'transparent', color: RD.muted }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: RD.green }} /></div>
        ) : traps.length === 0 ? (
          <div className="rounded-[20px] p-8 text-center text-[13px]" style={{ background: RD.card, border: `1px solid ${RD.border}`, color: RD.muted }}>No traps added yet.</div>
        ) : tab === 'all' ? (
          <section className="overflow-hidden rounded-[20px]" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
            {traps.map(renderRow)}
          </section>
        ) : (
          (Object.entries(grouped) as [string, TrapSummary[]][]).map(([category, list]) => (
            <section key={category} className="overflow-hidden rounded-[20px]" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
              <p className="px-4 pb-1 pt-3.5 text-[11px] font-extrabold uppercase tracking-[.14em]" style={{ color: RD.muted }}>{category}</p>
              {list.map(renderRow)}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

export default function TrapsPage() {
  const { enabled: redesign } = useDashboardRedesignFlag();
  const { traps, loading } = useTraps();
  return redesign ? <TrapsRedesign traps={traps} loading={loading} /> : <TrapsClassic traps={traps} loading={loading} />;
}
