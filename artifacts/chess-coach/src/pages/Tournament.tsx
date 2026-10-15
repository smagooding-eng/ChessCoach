import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, Trophy, Users, Clock, Loader2, Play, Pause, Swords, Medal, Award, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLivePlay } from '@/hooks/use-live-play';
import { LiveGame } from '@/pages/LiveGame';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { fmtCountdown, type TournamentSummary } from '@/components/play/Tournaments';

interface Standing {
  rank: number; userId: string; username: string;
  score: number; games: number; wins: number; draws: number; losses: number;
  withdrawn: boolean; state: 'playing' | 'waiting' | 'away'; playingAgainst: string | null; isMe: boolean;
}
interface TGame { gameId: string; white: string; black: string; result: string | null; termination: string | null; startedAt: string; mine: boolean }
interface Detail { tournament: TournamentSummary; serverNow: number; standings: Standing[]; games: TGame[] }

const MEDAL = ['#E8B447', '#C9D1D6', '#C98A4B'];

// Arena tournament: standings, and a Play button that keeps pairing you with
// the next free player until you pause or it ends.
export function Tournament() {
  const { id } = useParams<{ id: string }>();
  const live = useLivePlay();
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [visible, setVisible] = useState(document.visibilityState === 'visible');

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/tournaments/${id}`, { credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Tournament not found');
      setData(d);
      setOffset(d.serverNow - Date.now());
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load'); }
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    const onVis = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); clearInterval(c); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const t = data?.tournament;
  const open = t?.status === 'scheduled' || t?.status === 'running';

  // Ask for a pairing whenever you're playing, connected, on this screen and
  // not already in a game. Switching away pauses you, so you never get paired
  // while you're not looking (and lose on abandonment).
  const { connected, game, tournamentReady, tournamentPause, tournamentOver } = live;
  useEffect(() => {
    if (!id || !open || !connected || game) return;
    if (playing && visible) tournamentReady(id);
    else tournamentPause(id);
  }, [id, open, playing, visible, connected, game, tournamentReady, tournamentPause]);

  useEffect(() => {
    if (tournamentOver && tournamentOver === id) { setPlaying(false); void load(); }
  }, [tournamentOver, id, load]);

  const join = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/tournaments/${id}/join`, { method: 'POST', credentials: 'include' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not join');
      setPlaying(true);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not join'); }
    finally { setBusy(false); }
  };
  const withdraw = async () => {
    if (!confirm('Leave this tournament? Your points so far stay on the board.')) return;
    setPlaying(false);
    await apiFetch(`/api/tournaments/${id}/withdraw`, { method: 'POST', credentials: 'include' }).catch(() => {});
    void load();
  };

  // In a game: the board takes over; "Next pairing" brings you back here.
  if (live.game && (live.status === 'in_game' || live.status === 'finished' || live.game.status === 'active')) {
    return <LiveGame live={live} onLeave={() => { live.reset(); void load(); }} />;
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[760px] p-6 text-center">
        {err ? (
          <div className="space-y-3">
            <p className="text-[15px] font-bold" style={{ color: PT.text }}>{err}</p>
            <Link href="/live" className="inline-block rounded-xl px-4 py-2 text-[13px] font-bold" style={ghostBtn}>Back to Live play</Link>
          </div>
        ) : <Loader2 className="mx-auto animate-spin" style={{ color: PT.green }} />}
      </div>
    );
  }

  const tt = data.tournament;
  const serverNow = now + offset;
  const me = data.standings.find((s) => s.isMe);
  const joined = tt.joined;
  const startsIn = new Date(tt.startsAt).getTime() - serverNow;
  const endsIn = new Date(tt.endsAt).getTime() - serverNow;
  const waiting = live.tournamentWaiting?.id === id;
  const finished = tt.status === 'finished';

  return (
    <div className="mx-auto max-w-[760px] space-y-4 p-4 pb-24 md:p-0">
      <div className="flex items-center gap-3">
        <Link href="/live" className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: PT.muted, background: 'rgba(255,255,255,.05)' }} aria-label="Back to Live play"><ArrowLeft size={18} /></Link>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: tt.status === 'running' ? PT.gold : PT.muted }}>
            {tt.status === 'running' ? 'Live now · Arena' : tt.status === 'scheduled' ? 'Upcoming · Arena' : 'Finished · Arena'}
          </p>
          <h1 className="truncate text-2xl font-black md:text-3xl" style={{ color: PT.text, letterSpacing: '-0.02em' }}>{tt.name}</h1>
        </div>
      </div>

      {/* Summary + action */}
      <div className="space-y-4 p-5" style={cardStyle}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl p-2.5" style={{ background: 'rgba(0,0,0,.2)' }}>
            <Clock size={15} className="mx-auto" style={{ color: PT.green }} />
            <p className="mt-1 text-[15px] font-black" style={{ color: PT.text }}>{tt.timeControlLabel}</p>
            <p className="text-[11px]" style={{ color: PT.muted }}>{tt.mode === 'ranked' ? 'Ranked' : 'Casual'}</p>
          </div>
          <div className="rounded-xl p-2.5" style={{ background: 'rgba(0,0,0,.2)' }}>
            <Users size={15} className="mx-auto" style={{ color: PT.green }} />
            <p className="mt-1 text-[15px] font-black" style={{ color: PT.text }}>{tt.players}</p>
            <p className="text-[11px]" style={{ color: PT.muted }}>players</p>
          </div>
          <div className="rounded-xl p-2.5" style={{ background: 'rgba(0,0,0,.2)' }}>
            <Trophy size={15} className="mx-auto" style={{ color: PT.gold }} />
            <p className="mt-1 text-[15px] font-black tabular-nums" style={{ color: PT.text }}>
              {tt.status === 'scheduled' ? fmtCountdown(startsIn) : tt.status === 'running' ? fmtCountdown(endsIn) : 'Over'}
            </p>
            <p className="text-[11px]" style={{ color: PT.muted }}>{tt.status === 'scheduled' ? 'until start' : tt.status === 'running' ? 'left' : new Date(tt.endsAt).toLocaleDateString()}</p>
          </div>
        </div>
        {tt.description && <p className="text-[13.5px] whitespace-pre-wrap" style={{ color: PT.muted }}>{tt.description}</p>}
        <p className="text-[12px]" style={{ color: PT.muted }}>
          Arena: you're paired with the next free player as soon as each game ends. Win 2 points, draw 1, loss 0. Most points when the clock runs out wins.
        </p>

        {err && <p className="text-[12.5px] font-bold" style={{ color: PT.red }}>{err}</p>}

        {!finished && (
          !joined ? (
            <button onClick={join} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-extrabold disabled:opacity-60" style={greenBtn}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Swords size={18} />} Join tournament
            </button>
          ) : !playing ? (
            <div className="space-y-2">
              <button onClick={() => setPlaying(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-extrabold" style={greenBtn}>
                <Play size={18} /> {tt.status === 'running' ? 'Play' : "I'm ready"}
              </button>
              <button onClick={withdraw} className="w-full rounded-xl py-2 text-[12.5px] font-bold" style={ghostBtn}>Leave tournament</button>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl p-4 text-center" style={{ background: PT.greenSoft, border: `1px solid ${PT.greenLine}` }}>
              <Loader2 className="mx-auto animate-spin" style={{ color: PT.green }} />
              <p className="text-[15px] font-black" style={{ color: PT.text }}>
                {!connected ? 'Connecting…' : tt.status === 'scheduled' ? 'You\'re in. Pairings start when the clock hits zero.' : waiting ? 'Finding your next opponent…' : 'Getting ready…'}
              </p>
              <p className="text-[12px]" style={{ color: PT.muted }}>Keep this screen open. Leaving it pauses you so you're never paired while away.</p>
              <button onClick={() => setPlaying(false)} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold" style={ghostBtn}>
                <Pause size={14} /> Pause
              </button>
            </div>
          )
        )}
        {me && (
          <p className="text-center text-[13px]" style={{ color: PT.text }}>
            You: <b>#{me.rank}</b> · <b>{me.score}</b> pts · {me.wins}W {me.draws}D {me.losses}L
          </p>
        )}
      </div>

      {/* Podium when it's over */}
      {finished && data.standings.length > 0 && (
        <div className="grid grid-cols-3 items-end gap-2">
          {[1, 0, 2].map((i) => {
            const s = data.standings[i];
            if (!s) return <div key={i} />;
            return (
              <div key={s.userId} className="p-3 text-center" style={{ ...cardStyle, paddingTop: i === 0 ? 22 : 12 }}>
                <Medal size={i === 0 ? 30 : 24} className="mx-auto" style={{ color: MEDAL[i] }} />
                <p className="mt-1 truncate text-[14px] font-black" style={{ color: PT.text }}>{s.username}</p>
                <p className="text-[12px]" style={{ color: PT.muted }}>{s.score} pts</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Standings */}
      <div className="overflow-hidden" style={cardStyle}>
        <p className="px-4 pt-3 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: PT.muted }}>Standings</p>
        {data.standings.length === 0 ? (
          <p className="p-4 text-[13px]" style={{ color: PT.muted }}>No one has joined yet. Be the first.</p>
        ) : (
          <div className="pb-1">
            {data.standings.map((s) => (
              <div key={s.userId} className="flex items-center gap-3 px-4 py-2.5" style={{ background: s.isMe ? PT.greenSoft : undefined, borderTop: `1px solid ${PT.border}` }}>
                <span className="w-6 text-center text-[13px] font-black tabular-nums" style={{ color: s.rank <= 3 ? MEDAL[s.rank - 1] : PT.muted }}>{s.rank}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14px] font-extrabold" style={{ color: PT.text }}>{s.username}{s.isMe ? ' (you)' : ''}</b>
                  {!finished && (
                    <span className="text-[11.5px]" style={{ color: s.state === 'playing' ? PT.gold : s.state === 'waiting' ? PT.green : PT.muted }}>
                      {s.withdrawn ? 'Left' : s.state === 'playing' ? `Playing ${s.playingAgainst ?? ''}` : s.state === 'waiting' ? 'Waiting for a pairing' : 'Paused'}
                    </span>
                  )}
                </span>
                <span className="text-[12px] tabular-nums" style={{ color: PT.muted }}>{s.wins}/{s.draws}/{s.losses}</span>
                <span className="w-10 text-right text-[16px] font-black tabular-nums" style={{ color: PT.text }}>{s.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent games */}
      {data.games.length > 0 && (
        <div className="overflow-hidden" style={cardStyle}>
          <p className="px-4 pt-3 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: PT.muted }}>Latest games</p>
          {data.games.map((g) => (
            <div key={g.gameId} className="flex items-center gap-2 px-4 py-2 text-[13px]" style={{ borderTop: `1px solid ${PT.border}`, color: PT.text, background: g.mine ? 'rgba(255,255,255,.03)' : undefined }}>
              <span className="min-w-0 flex-1 truncate" style={{ fontWeight: g.result === 'white' ? 800 : 500 }}>{g.white}</span>
              <span className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-black tabular-nums" style={{ background: 'rgba(0,0,0,.25)', color: g.result ? PT.text : PT.gold }}>
                {g.result === 'white' ? '1–0' : g.result === 'black' ? '0–1' : g.result === 'draw' ? '½–½' : 'live'}
              </span>
              <span className="min-w-0 flex-1 truncate text-right" style={{ fontWeight: g.result === 'black' ? 800 : 500 }}>{g.black}</span>
            </div>
          ))}
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[11.5px]" style={{ color: PT.muted }}>
        {tt.mode === 'ranked' ? <Award size={12} /> : <Sparkles size={12} />}
        {tt.mode === 'ranked' ? 'Ranked: games update your ChessScout rating.' : 'Casual: games don\'t change your rating.'}
      </p>
    </div>
  );
}
