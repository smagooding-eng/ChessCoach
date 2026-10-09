import React, { useEffect, useRef, useState } from 'react';
import { useLivePlay, type LiveMode } from '@/hooks/use-live-play';
import { useLiveRatings } from '@/hooks/use-live-ratings';
import { LiveGame } from '@/pages/LiveGame';
import { Link } from 'wouter';
import { Loader2, Swords, Zap, Clock, X, Trophy, Sparkles, Award, History, ChevronRight, Users, CalendarDays, Bot } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { ShareLink } from '@/components/play/ShareLink';
import { NotifyPrompt } from '@/components/play/NotifyPrompt';

const TC_OPTIONS = [
  { id: 'blitz_5_0',  label: '5 min',  sub: 'Blitz', icon: Zap },
  { id: 'blitz_5_3',  label: '5 | 3',  sub: 'Blitz', icon: Zap },
  { id: 'rapid_10_0', label: '10 min', sub: 'Rapid', icon: Clock },
  { id: 'rapid_15_0', label: '15 min', sub: 'Rapid', icon: Clock },
];

type Hosted = { code: string; url: string; label: string };

export function LivePlay() {
  const live = useLivePlay();
  const { data: ratingsData, refetch } = useLiveRatings();
  const [mode, setMode] = useState<LiveMode>('casual');
  const [friendTc, setFriendTc] = useState('blitz_5_0');
  const [friendColor, setFriendColor] = useState<'random' | 'white' | 'black'>('random');
  const [hosted, setHosted] = useState<Hosted | null>(null);
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { if (live.status === 'finished') void refetch(); }, [live.status, refetch]);
  useEffect(() => { if (live.status === 'in_game') setHosted(null); }, [live.status]);
  useEffect(() => {
    if (live.status !== 'queued') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live.status]);

  // /live?challenge=CODE -- coming from a friend's challenge link.
  const acceptedRef = useRef(false);
  useEffect(() => {
    if (acceptedRef.current) return;
    const code = new URLSearchParams(window.location.search).get('challenge');
    if (code) {
      acceptedRef.current = true;
      live.acceptChallenge(code);
      // so a refresh after the game doesn't try to accept it again
      try { window.history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ }
    }
  }, [live]);

  if (live.status === 'in_game' || (live.status === 'finished' && live.game)) {
    return <LiveGame live={live} onLeave={() => live.reset()} />;
  }

  const createChallenge = async () => {
    setCreating(true);
    try {
      const r = await apiFetch('/api/challenges', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'live', timeControl: friendTc, mode, color: friendColor }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not create the link');
      setHosted({ code: d.challenge.code, url: `${window.location.origin}/challenge/${d.challenge.code}`, label: d.challenge.timeControlLabel });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not create the link');
    } finally { setCreating(false); }
  };
  const cancelHosted = async () => {
    if (hosted) await apiFetch(`/api/challenges/${hosted.code}/cancel`, { method: 'POST', credentials: 'include' }).catch(() => {});
    setHosted(null);
  };

  const waitedMs = live.queuedAt ? now - live.queuedAt : 0;
  const showBotOffer = live.status === 'queued' && waitedMs >= live.botOfferMs;
  const queuedLabel = TC_OPTIONS.find(t => t.id === live.queuedTc)?.label;
  const dailyR = ratingsData?.ratings?.daily;

  return (
    <div className="mx-auto max-w-[760px] space-y-4 p-4 md:p-0 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black" style={{ color: PT.text, letterSpacing: '-0.02em' }}>Play Live</h1>
          <p className="text-sm" style={{ color: PT.muted }}>Real opponents in your rating range, or challenge a friend with a link.</p>
        </div>
        <Link href="/live/history" className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider"
          style={{ background: PT.greenSoft, color: PT.green, border: `1px solid ${PT.greenLine}` }}>
          <History className="w-3.5 h-3.5" /> History
        </Link>
      </div>

      {live.status === 'queued' ? (
        <div className="space-y-3">
          <div className="p-6 text-center space-y-4" style={cardStyle}>
            <Loader2 className="w-10 h-10 mx-auto animate-spin" style={{ color: PT.green }} />
            <div>
              <p className="text-lg font-black" style={{ color: PT.text }}>Searching for an opponent…</p>
              <p className="text-sm mt-1" style={{ color: PT.muted }}>
                {queuedLabel} · {live.queuedMode === 'ranked' ? 'Ranked' : 'Casual'} · {Math.floor(waitedMs / 1000)}s
              </p>
            </div>
            <button onClick={live.cancel} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm" style={ghostBtn}>
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
          {showBotOffer && live.queuedTc && (
            <div className="flex items-center gap-3 p-4" style={cardStyle}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: PT.greenSoft, color: PT.green }}><Bot size={22} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-extrabold" style={{ color: PT.text }}>No one's free in your range right now</p>
                <p className="text-[12.5px]" style={{ color: PT.muted }}>Play a ChessScout bot at your level instead. It's labeled as a bot and the game is casual (no rating change). Or keep searching.</p>
              </div>
              <button onClick={() => live.playBot(live.queuedTc!)} className="shrink-0 rounded-xl px-3.5 py-2.5 text-[13px] font-extrabold" style={greenBtn}>Play bot</button>
            </div>
          )}
        </div>
      ) : live.status === 'challenge_waiting' ? (
        <div className="p-6 text-center space-y-4" style={cardStyle}>
          <Loader2 className="w-10 h-10 mx-auto animate-spin" style={{ color: PT.green }} />
          <div>
            <p className="text-lg font-black" style={{ color: PT.text }}>Waiting for {live.waitingFor}…</p>
            <p className="text-sm mt-1" style={{ color: PT.muted }}>You accepted their challenge. We've sent them a notification; the game starts as soon as they open ChessScout. Keep this screen open.</p>
          </div>
          <button onClick={live.cancel} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm" style={ghostBtn}>
            <X className="w-4 h-4" /> Cancel
          </button>
        </div>
      ) : hosted ? (
        <div className="space-y-3">
          <div className="p-5 space-y-4" style={cardStyle}>
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin shrink-0" style={{ color: PT.green }} />
              <div>
                <p className="text-[16px] font-black" style={{ color: PT.text }}>Waiting for your friend</p>
                <p className="text-[12.5px]" style={{ color: PT.muted }}>{hosted.label} · {mode === 'ranked' ? 'Ranked' : 'Casual'} · the game starts when they open the link and accept.</p>
              </div>
            </div>
            <ShareLink url={hosted.url} text={`Play me on ChessScout (${hosted.label})`} />
            <button onClick={cancelHosted} className="w-full rounded-xl py-2.5 text-[13px] font-bold" style={ghostBtn}>Cancel challenge</button>
          </div>
          <NotifyPrompt reason="Turn on notifications so we can tell you when your friend accepts, even if you leave this screen." />
        </div>
      ) : (
        <>
          <div className="inline-flex rounded-xl p-1" style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${PT.border}` }}>
            {(['casual', 'ranked'] as LiveMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-[0.14em] inline-flex items-center gap-1.5"
                style={{ background: mode === m ? PT.green : 'transparent', color: mode === m ? PT.onGreen : PT.muted }}>
                {m === 'casual' ? <Sparkles className="w-3.5 h-3.5" /> : <Award className="w-3.5 h-3.5" />}
                {m}
              </button>
            ))}
          </div>
          <p className="text-xs -mt-2" style={{ color: PT.muted }}>
            {mode === 'casual' ? 'Casual games do not change your rating.' : 'Ranked games update your rating for that time control.'}
          </p>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {TC_OPTIONS.map(opt => {
              const r = ratingsData?.ratings[opt.id];
              return (
                <button key={opt.id}
                  disabled={live.status === 'connecting' || live.status === 'disconnected'}
                  onClick={() => live.enterQueue(opt.id, mode)}
                  className="text-left p-4 transition-transform active:scale-[0.98] disabled:opacity-50" style={cardStyle}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <opt.icon className="w-4 h-4" style={{ color: PT.green }} />
                    <span className="text-[10.5px] font-black uppercase tracking-[0.16em]" style={{ color: PT.green }}>{opt.sub}</span>
                  </div>
                  <div className="text-2xl font-black" style={{ color: PT.text }}>{opt.label}</div>
                  <div className="mt-1 text-[11.5px]" style={{ color: PT.muted }}>
                    {r && r.gamesPlayed > 0 ? `Rating ${r.rating}${r.isProvisional ? '?' : ''}` : 'Unrated'}
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-black" style={greenBtn}>
                    <Swords className="w-3.5 h-3.5" /> Play
                  </div>
                </button>
              );
            })}
          </div>

          {/* Challenge a friend */}
          <div className="p-4 space-y-3" style={cardStyle}>
            <div className="flex items-center gap-2">
              <Users className="w-4.5 h-4.5" style={{ color: PT.green }} size={18} />
              <h2 className="text-[15px] font-extrabold" style={{ color: PT.text }}>Challenge a friend</h2>
            </div>
            <p className="text-[12.5px] -mt-1" style={{ color: PT.muted }}>Get a link to send. When they open it and accept, the game starts ({mode}).</p>
            <div className="flex flex-wrap gap-1.5">
              {TC_OPTIONS.map(o => (
                <button key={o.id} onClick={() => setFriendTc(o.id)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold"
                  style={friendTc === o.id ? greenBtn : ghostBtn}>{o.label}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['random', 'white', 'black'] as const).map(c => (
                <button key={c} onClick={() => setFriendColor(c)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold capitalize"
                  style={friendColor === c ? greenBtn : ghostBtn}>{c === 'random' ? 'Random colour' : `I play ${c}`}</button>
              ))}
            </div>
            <button onClick={createChallenge} disabled={creating} className="w-full rounded-xl py-3 text-[14px] font-extrabold disabled:opacity-60" style={greenBtn}>
              {creating ? 'Creating…' : 'Create challenge link'}
            </button>
          </div>

          <Link href="/daily" className="flex items-center gap-3 p-4" style={cardStyle}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: PT.greenSoft, color: PT.green }}><CalendarDays size={22} /></span>
            <span className="min-w-0 flex-1">
              <b className="block text-[15px] font-extrabold" style={{ color: PT.text }}>Daily games</b>
              <span className="block text-[12.5px]" style={{ color: PT.muted }}>1, 3 or 7 days per move. Play at your own pace, we notify you when it's your turn.</span>
            </span>
            <ChevronRight size={18} style={{ color: PT.muted }} />
          </Link>
        </>
      )}

      {live.error && (
        <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'rgba(220,67,67,0.25)', color: PT.text, border: '1px solid rgba(220,67,67,0.5)' }}>
          {live.error}
        </div>
      )}
      {live.status === 'connecting' && <p className="text-xs" style={{ color: PT.muted }}>Connecting…</p>}
      {live.status === 'disconnected' && <p className="text-xs" style={{ color: '#ea9733' }}>Reconnecting…</p>}

      <div className="p-4" style={cardStyle}>
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4" style={{ color: PT.green }} />
          <h2 className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: PT.text }}>Your ChessScout ratings</h2>
        </div>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
          {[...TC_OPTIONS.map(o => ({ id: o.id, label: o.label })), { id: 'daily', label: 'Daily' }].map(opt => {
            const r = opt.id === 'daily' ? dailyR : ratingsData?.ratings[opt.id];
            return (
              <div key={opt.id} className="text-center p-2.5 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: PT.muted }}>{opt.label}</div>
                <div className="text-xl font-black mt-0.5" style={{ color: PT.text }}>
                  {r && r.gamesPlayed > 0 ? `${r.rating}${r.isProvisional ? '?' : ''}` : '—'}
                </div>
                <div className="text-[10px]" style={{ color: PT.muted }}>{r?.gamesPlayed ?? 0} games</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
