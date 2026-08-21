import { useState, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Trash2, Swords, Loader2, Archive as ArchiveIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { ChessBoard } from '@/components/ChessBoard';

const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const CHESSCOM_GREEN = '#81b64c';

interface SavedPosition {
  id: number;
  fen: string;
  label: string | null;
  createdAt: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ScanArchivePage() {
  const [positions, setPositions] = useState<SavedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/scanned-positions');
      if (res.ok) {
        const data = await res.json();
        setPositions(data.positions ?? []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/scanned-positions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPositions((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {}
    setDeletingId(null);
  };

  const playFrom = (fen: string) => {
    const turnChar = fen.split(' ')[1] || 'w';
    const color = turnChar === 'b' ? 'b' : 'w';
    window.location.href = `/practice?fen=${encodeURIComponent(fen)}&rating=1200&color=${color}`;
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <Link href="/scan-position" className="inline-flex items-center gap-1.5 text-sm" style={{ color: TEXT_MUTED }}>
        <ArrowLeft className="w-4 h-4" /> Back to Scan
      </Link>

      <div>
        <h1 className="text-2xl font-black" style={{ color: TEXT_LIGHT }}>Saved Positions</h1>
        <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>Positions you've scanned and saved for later</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: TEXT_MUTED }} />
        </div>
      ) : positions.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(129,182,76,0.1)' }}>
            <ArchiveIcon className="w-6 h-6" style={{ color: CHESSCOM_GREEN }} />
          </div>
          <p className="text-sm font-bold mb-1" style={{ color: TEXT_LIGHT }}>No saved positions yet</p>
          <p className="text-xs mb-4" style={{ color: TEXT_MUTED }}>
            Scan a position and tap "Save to Archive" to keep it here
          </p>
          <Link href="/scan-position" className="inline-block px-4 py-2 rounded-xl text-sm font-bold" style={{ background: CHESSCOM_GREEN, color: '#000' }}>
            Scan a Position
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {positions.map((p) => (
            <div key={p.id} className="rounded-xl p-3 flex items-center gap-3" style={{ background: '#302e2b', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden pointer-events-none">
                <ChessBoard fen={p.fen} practiceMode={false} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: TEXT_LIGHT }}>
                  {p.label || `Scanned position`}
                </p>
                <p className="text-xs" style={{ color: TEXT_MUTED }}>{formatDate(p.createdAt)}</p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  onClick={() => playFrom(p.fen)}
                  className="p-2 rounded-lg transition-colors"
                  style={{ background: 'rgba(129,182,76,0.12)', color: CHESSCOM_GREEN }}
                  title="Play from this position"
                >
                  <Swords className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  disabled={deletingId === p.id}
                  className="p-2 rounded-lg transition-colors disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.05)', color: TEXT_MUTED }}
                  title="Delete"
                >
                  {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
