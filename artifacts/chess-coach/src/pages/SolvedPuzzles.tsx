import { useState, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Loader2, Archive as ArchiveIcon, Clock } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { ChessBoard } from '@/components/ChessBoard';

const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const CHESSCOM_GREEN = '#81b64c';

interface SolvedPuzzle {
  id: number;
  fen: string;
  moves: string;
  rating: number;
  themes: string[];
  solvedAt: string;
  timeMs: number | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(ms: number | null): string {
  if (!ms) return '';
  const secs = Math.round(ms / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export default function SolvedPuzzlesPage() {
  const [puzzles, setPuzzles] = useState<SolvedPuzzle[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/puzzles/solved');
      if (res.ok) {
        const data = await res.json();
        setPuzzles(data.puzzles ?? []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <Link href="/puzzles" className="inline-flex items-center gap-1.5 text-sm" style={{ color: TEXT_MUTED }}>
        <ArrowLeft className="w-4 h-4" /> Back to Puzzles
      </Link>

      <div>
        <h1 className="text-2xl font-black" style={{ color: TEXT_LIGHT }}>Solved Puzzles</h1>
        <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>Your archive of puzzles you've cracked</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: TEXT_MUTED }} />
        </div>
      ) : puzzles.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(129,182,76,0.1)' }}>
            <ArchiveIcon className="w-6 h-6" style={{ color: CHESSCOM_GREEN }} />
          </div>
          <p className="text-sm font-bold mb-1" style={{ color: TEXT_LIGHT }}>No solved puzzles yet</p>
          <p className="text-xs mb-4" style={{ color: TEXT_MUTED }}>Solve a puzzle and it'll show up here automatically</p>
          <Link href="/puzzles" className="inline-block px-4 py-2 rounded-xl text-sm font-bold" style={{ background: CHESSCOM_GREEN, color: '#000' }}>
            Solve a Puzzle
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {puzzles.map((p) => (
            <div key={p.id} className="rounded-xl p-3 flex items-center gap-3" style={{ background: '#302e2b', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden pointer-events-none">
                <ChessBoard fen={p.fen} practiceMode={false} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>
                  Rating {p.rating}
                </p>
                <p className="text-xs truncate" style={{ color: TEXT_MUTED }}>
                  {p.themes.slice(0, 3).join(', ') || 'Puzzle'}
                </p>
                <div className="flex items-center gap-2 mt-0.5 text-[11px]" style={{ color: TEXT_MUTED }}>
                  <span>{formatDate(p.solvedAt)}</span>
                  {p.timeMs && (
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="w-3 h-3" /> {formatTime(p.timeMs)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
