import React, { useEffect, useState } from 'react';
import { useLivePlay, type LiveMode } from '@/hooks/use-live-play';
import { useLiveRatings } from '@/hooks/use-live-ratings';
import { LiveGame } from '@/pages/LiveGame';
import { Loader2, Swords, Zap, Clock, X, Trophy, Sparkles, Award } from 'lucide-react';

const CHESSCOM_GREEN = '#81b64c';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';

const TC_OPTIONS = [
  { id: 'blitz_5_0',  label: '5 min',  sub: 'Blitz', icon: Zap },
  { id: 'blitz_5_3',  label: '5 | 3',  sub: 'Blitz', icon: Zap },
  { id: 'rapid_10_0', label: '10 min', sub: 'Rapid', icon: Clock },
];

export function LivePlay() {
  const live = useLivePlay();
  const { data: ratingsData, refetch } = useLiveRatings();
  const [mode, setMode] = useState<LiveMode>('casual');

  useEffect(() => {
    if (live.status === 'finished') void refetch();
  }, [live.status, refetch]);

  if (live.status === 'in_game' || (live.status === 'finished' && live.game)) {
    return <LiveGame live={live} onLeave={() => live.reset()} />;
  }

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      <div>
        <h1 className="text-2xl md:text-3xl font-black" style={{ color: TEXT_LIGHT, letterSpacing: '-0.02em' }}>Play Live</h1>
        <p className="text-sm" style={{ color: TEXT_MUTED }}>Get matched against players in your range. Average wait under 30 seconds.</p>
      </div>

      {live.status === 'queued' ? (
        <div className="rounded-2xl p-6 md:p-10 text-center space-y-5"
          style={{ background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)', border: '1px solid rgba(129,182,76,0.3)' }}>
          <Loader2 className="w-10 h-10 mx-auto animate-spin" style={{ color: CHESSCOM_GREEN }} />
          <div>
            <p className="text-lg font-black" style={{ color: TEXT_LIGHT }}>Searching for an opponent…</p>
            <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>
              {TC_OPTIONS.find(t => t.id === live.queuedTc)?.label} · {live.queuedMode === 'ranked' ? 'Ranked' : 'Casual'} · we usually find one within 30s
            </p>
          </div>
          <button onClick={live.cancel}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm"
            style={{ background: 'rgba(220,67,67,0.15)', color: '#dc4343', border: '1px solid rgba(220,67,67,0.3)' }}>
            <X className="w-4 h-4" /> Cancel
          </button>
        </div>
      ) : (
        <>
          {/* Mode toggle */}
          <div className="inline-flex rounded-xl p-1" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {(['casual','ranked'] as LiveMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-[0.14em] inline-flex items-center gap-1.5 transition-colors"
                style={{
                  background: mode === m ? `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)` : 'transparent',
                  color: mode === m ? 'white' : TEXT_MUTED,
                }}>
                {m === 'casual' ? <Sparkles className="w-3.5 h-3.5" /> : <Award className="w-3.5 h-3.5" />}
                {m}
              </button>
            ))}
          </div>
          <p className="text-xs -mt-2" style={{ color: TEXT_MUTED }}>
            {mode === 'casual' ? 'Casual games do not change your ELO.' : 'Ranked games update your Glicko-2 rating.'}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            {TC_OPTIONS.map(opt => {
              const r = ratingsData?.ratings[opt.id];
              return (
                <button
                  key={opt.id}
                  disabled={live.status === 'connecting' || live.status === 'disconnected'}
                  onClick={() => live.enterQueue(opt.id, mode)}
                  className="text-left p-5 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
                    border: '1px solid rgba(129,182,76,0.25)',
                    boxShadow: '0 12px 32px -8px rgba(0,0,0,0.5)',
                  }}>
                  <div className="flex items-center gap-2 mb-3">
                    <opt.icon className="w-5 h-5" style={{ color: CHESSCOM_GREEN }} />
                    <span className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: CHESSCOM_GREEN }}>{opt.sub}</span>
                  </div>
                  <div className="text-3xl font-black" style={{ color: TEXT_LIGHT, letterSpacing: '-0.02em' }}>{opt.label}</div>
                  <div className="mt-3 flex items-baseline gap-2">
                    {r && r.gamesPlayed > 0 ? (
                      <>
                        <span className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: CHESSCOM_GREEN }}>Your ELO</span>
                        <span className="text-lg font-black" style={{ color: TEXT_LIGHT }}>{r.rating}{r.isProvisional ? '?' : ''}</span>
                        <span className="text-[11px]" style={{ color: TEXT_MUTED }}>· {r.gamesPlayed} games</span>
                      </>
                    ) : (
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Unranked — first ranked game sets your ELO</span>
                    )}
                  </div>
                  <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black"
                    style={{ background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)`, color: 'white', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' }}>
                    <Swords className="w-3.5 h-3.5" /> {mode === 'ranked' ? 'Find Ranked' : 'Find Casual'}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {live.error && (
        <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'rgba(220,67,67,0.1)', color: '#dc4343', border: '1px solid rgba(220,67,67,0.3)' }}>
          {live.error}
        </div>
      )}
      {live.status === 'connecting' && (
        <p className="text-xs" style={{ color: TEXT_MUTED }}>Connecting…</p>
      )}
      {live.status === 'disconnected' && (
        <p className="text-xs" style={{ color: '#ea9733' }}>Reconnecting…</p>
      )}

      <div className="rounded-2xl p-4 md:p-5"
        style={{ background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
          <h2 className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: TEXT_LIGHT }}>Your ChessScout Ratings</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {TC_OPTIONS.map(opt => {
            const r = ratingsData?.ratings[opt.id];
            return (
              <div key={opt.id} className="text-center p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: TEXT_MUTED }}>{opt.label}</div>
                <div className="text-2xl font-black mt-1" style={{ color: TEXT_LIGHT }}>
                  {r && r.gamesPlayed > 0 ? `${r.rating}${r.isProvisional ? '?' : ''}` : '—'}
                </div>
                <div className="text-[10px]" style={{ color: TEXT_MUTED }}>{r?.gamesPlayed ?? 0} games</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
