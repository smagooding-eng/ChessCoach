import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Crosshair, ChevronRight, Swords, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useDashboardRedesignFlag } from '@/hooks/use-app-config';
import { RD } from '@/lib/redesignTheme';
import { Chess } from 'chess.js';
import { FenThumb } from '@/components/FenThumb';
import { RedesignHeader } from '@/components/RedesignHeader';

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
  // Present in the list response (full rows); used for the thumbnail position
  startingFen?: string;
  trapLineSan?: string[];
  criticalMoveIndex?: number;
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
// Each row's thumbnail is the trap's real position: its starting FEN with the
// trap line played up to (not including) the critical mistake.
function trapFen(t: TrapSummary): string {
  const start = t.startingFen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  try {
    const c = new Chess(start);
    const upTo = Math.max(0, Math.min(t.criticalMoveIndex ?? 0, (t.trapLineSan ?? []).length));
    for (let i = 0; i < upTo; i++) c.move((t.trapLineSan ?? [])[i]);
    return c.fen();
  } catch {
    return start;
  }
}

const CHIP: Record<string, { bg: string; fg: string; bd: string }> = {
  beginner: { bg: 'rgba(40,120,50,.45)', fg: '#7BE05A', bd: 'rgba(95,213,51,.35)' },
  intermediate: { bg: 'rgba(150,110,20,.45)', fg: '#F2C14E', bd: 'rgba(232,180,71,.35)' },
  advanced: { bg: 'rgba(150,35,45,.5)', fg: '#FF7A80', bd: 'rgba(255,80,88,.35)' },
};

function TrapsRedesign({ traps, loading }: { traps: TrapSummary[]; loading: boolean }) {
  const [tab, setTab] = useState<'all' | 'category' | 'level'>('all');

  const groupBy = (key: (t: TrapSummary) => string) =>
    traps.reduce<Record<string, TrapSummary[]>>((acc, t) => { (acc[key(t)] ??= []).push(t); return acc; }, {});

  const row = (trap: TrapSummary) => {
    const chip = CHIP[trap.difficulty] ?? { bg: 'rgba(255,255,255,.1)', fg: RD.muted, bd: RD.border };
    return (
      <Link key={trap.id} href={`/traps/${trap.id}`} className="flex items-center gap-3 transition-opacity active:opacity-80">
        <FenThumb fen={trapFen(trap)} size={58} />
        <span className="flex min-w-0 flex-1 items-center gap-2 rounded-[16px] py-3 pl-4 pr-3" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[16px] font-extrabold">{trap.name}</b>
            <span className="block truncate text-[13px]" style={{ color: RD.muted }}>{trap.summary}</span>
          </span>
          <span className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-[12px] font-extrabold capitalize" style={{ background: chip.bg, color: chip.fg, border: `1px solid ${chip.bd}` }}>{trap.difficulty}</span>
          <ChevronRight size={16} className="shrink-0" style={{ color: RD.muted }} />
        </span>
      </Link>
    );
  };

  const grouped = tab === 'category' ? groupBy((t) => t.category) : tab === 'level' ? groupBy((t) => t.difficulty[0].toUpperCase() + t.difficulty.slice(1)) : null;

  return (
    <div className="-m-4 min-h-screen px-3 md:-m-6 md:px-6 md:pt-6 md:pb-12 pb-[calc(7.5rem+env(safe-area-inset-bottom))]" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto w-full max-w-[640px]">
        <RedesignHeader title="Chess Traps" icon={<Crosshair size={24} />} />

        <div className="grid grid-cols-3 gap-1 rounded-[16px] p-1" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
          {([['all', 'All'], ['category', 'By Category'], ['level', 'By Level']] as const).map(([id, label]) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)} className="rounded-[12px] py-2.5 text-[13.5px] font-bold transition-colors"
                style={active ? { background: 'rgba(139,234,69,.10)', color: RD.text, boxShadow: `inset 0 0 0 1.5px ${RD.green}` } : { background: 'transparent', color: RD.muted }}>
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid gap-2.5">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: RD.green }} /></div>
          ) : traps.length === 0 ? (
            <div className="rounded-[20px] p-8 text-center text-[13px]" style={{ background: RD.card, border: `1px solid ${RD.border}`, color: RD.muted }}>No traps added yet.</div>
          ) : grouped ? (
            (Object.entries(grouped) as [string, TrapSummary[]][]).map(([name, list]) => (
              <div key={name} className="grid gap-2.5">
                <p className="mt-2 px-1 text-[11.5px] font-extrabold uppercase tracking-[.14em]" style={{ color: RD.muted }}>{name}</p>
                {list.map(row)}
              </div>
            ))
          ) : traps.map(row)}
        </div>
      </div>
    </div>
  );
}

export default function TrapsPage() {
  const { enabled: redesign } = useDashboardRedesignFlag();
  const { traps, loading } = useTraps();
  return redesign ? <TrapsRedesign traps={traps} loading={loading} /> : <TrapsClassic traps={traps} loading={loading} />;
}
