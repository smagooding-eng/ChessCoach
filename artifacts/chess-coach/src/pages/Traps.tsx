import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Crosshair, ChevronRight, Swords, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const BG = '#141413';
const CARD = '#1c1b19';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const ACCENT = '#e0a03a'; // amber -- distinct from the app's green, signals "different, in-progress area"

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

export default function TrapsPage() {
  const [traps, setTraps] = useState<TrapSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/traps', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setTraps(d?.traps ?? []))
      .finally(() => setLoading(false));
  }, []);

  const grouped = traps.reduce<Record<string, TrapSummary[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: `${ACCENT}25`, color: ACCENT }}>
            Admin preview
          </span>
        </div>
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
                {categoryTraps.map((trap) => (
                  <Link key={trap.id} href={`/admin/traps/${trap.id}`}>
                    <div
                      className="rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-transform hover:scale-[1.01]"
                      style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div className="rounded-xl p-2.5 shrink-0" style={{ background: trap.trapSide === 'white' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)' }}>
                        <Swords className="w-4 h-4" style={{ color: TEXT }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{trap.name}</p>
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
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
