import { useLocation } from 'wouter';
import { X, ChevronRight, Trophy, Skull, Minus } from 'lucide-react';
import { useMyGames } from '@/hooks/use-games';

const CHESSCOM_GREEN = '#81b64c';
const BG_CARD = '#302e2b';
const BG_ROW = '#262421';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const BORDER = 'rgba(255,255,255,0.08)';

const RESULT_BADGE: Record<string, { color: string; bg: string; icon: typeof Trophy; label: string }> = {
  win:  { color: '#9bd152', bg: 'rgba(129,182,76,0.18)',  icon: Trophy, label: 'Win'  },
  loss: { color: '#dc4343', bg: 'rgba(220,67,67,0.18)',   icon: Skull,  label: 'Loss' },
  draw: { color: '#cfa84a', bg: 'rgba(207,168,74,0.18)',  icon: Minus,  label: 'Draw' },
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function PickGameToReviewModal({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useMyGames(5);
  const [, navigate] = useLocation();
  const games = (data?.games ?? []).slice(0, 5);

  const choose = (id: number) => {
    onClose();
    navigate(`/games/${id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: BG_CARD, border: `1px solid ${BORDER}`, boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black" style={{ color: TEXT_LIGHT }}>Pick a game to review</h2>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>
              Here are your 5 most recent games. Tap one and we'll dive in.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-white/5" style={{ color: TEXT_MUTED }}>
            <X size={16} />
          </button>
        </div>

        {isLoading && (
          <div className="text-center py-8 text-xs" style={{ color: TEXT_MUTED }}>Loading your games…</div>
        )}

        {!isLoading && games.length === 0 && (
          <div className="text-center py-6 text-xs" style={{ color: TEXT_MUTED }}>
            No games found yet. They may still be syncing.
          </div>
        )}

        <div className="space-y-2">
          {games.map((g) => {
            const badge = RESULT_BADGE[g.result] ?? RESULT_BADGE.draw;
            const Icon = badge.icon;
            const opponent = g.username && g.whiteUsername.toLowerCase() === g.username
              ? g.blackUsername : g.whiteUsername;
            return (
              <button
                key={g.id}
                onClick={() => choose(g.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:opacity-90"
                style={{ background: BG_ROW, border: `1px solid ${BORDER}` }}
              >
                <div className="rounded-lg p-1.5 shrink-0" style={{ background: badge.bg, color: badge.color }}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-black truncate" style={{ color: TEXT_LIGHT }}>
                      vs {opponent}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: badge.color }}>
                      {badge.label}
                    </div>
                  </div>
                  <div className="text-[11px] mt-0.5 truncate" style={{ color: TEXT_MUTED }}>
                    {g.opening || 'Unknown opening'} · {formatDate(g.playedAt)}
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: TEXT_MUTED }} />
              </button>
            );
          })}
        </div>

        <button onClick={onClose}
          className="w-full text-xs font-bold uppercase tracking-widest pt-1"
          style={{ color: TEXT_MUTED }}>
          Browse all games instead
        </button>

        <button onClick={() => { onClose(); navigate('/games'); }}
          className="w-full px-3 py-2.5 rounded-xl text-xs font-black"
          style={{ background: CHESSCOM_GREEN, color: 'white' }}>
          See full list
        </button>
      </div>
    </div>
  );
}
