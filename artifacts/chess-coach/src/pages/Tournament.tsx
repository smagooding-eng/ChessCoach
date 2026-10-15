import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, Trophy, Users, Clock, Loader2, Play, Pause, Swords, Medal, Award, Sparkles, Crown, CalendarDays, Check } from 'lucide-react';
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
interface TGame { gameId: string; kind: string; white: string; black: string; result: string | null; termination: string | null; startedAt: string; mine: boolean }
interface Side { name: string | null; seed: number | null; isMe: boolean }
interface BMatch { id: number; round: number; slot: number; roundLabel: string; a: Side | null; b: Side | null; status: string; winner: 'a' | 'b' | null; note: string | null; gamesPlayed: number }
interface MyMatch { id: number; roundLabel: string; opponent: string | null; status: string; deadline: string | null; gameId: string | null; replay: boolean }
interface Detail {
  tournament: TournamentSummary; serverNow: number; standings: Standing[]; games: TGame[];
  bracket: BMatch[]; myMatch: MyMatch | null; knockedOut: boolean; myDailyGame: string | null;
}

const MEDAL = ['#E8B447', '#C9D1D6', '#C98A4B'];

function rulesText(t: TournamentSummary): string {
  if (t.format === 'bracket') {
    return `Knockout bracket, seeded by rating. One game per match; a draw is replayed with colours reversed, and if that's drawn too the higher seed goes through. ${
      t.kind === 'live' ? 'When your match is ready you have 10 minutes to open this page or it\'s a forfeit.' : 'Each game starts automatically and we notify you when it\'s your move.'
    } It ends when the final is played.`;
  }
  return t.kind === 'live'
    ? "Arena: you're paired with the next free player as soon as each game ends. Win 2 points, draw 1, loss 0. Most points when the clock runs out wins."
    : "Daily arena: whenever you don't have a game going, you're paired with another free player automatically. Win 2 points, draw 1, loss 0. Most points at the end wins.";
}

// A tournament: arena standings or a knockout bracket, plus what you need to
// do next. Live games are played right here.
export function Tournament() {
  const { id } = useParams<{ id: string }>();
  const live = useLivePlay();
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [needsPro, setNeedsPro] = useState(false);
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
  const isLive = t?.kind === 'live';
  const open = t?.status === 'scheduled' || t?.status === 'running';
  // Live bracket: being on this page while your match is ready is enough.
  const bracketReady = !!t && t.format === 'bracket' && isLive && data?.myMatch?.status === 'ready';
  useEffect(() => { if (bracketReady) setPlaying(true); }, [bracketReady]);

  // Live tournaments: ask for a pairing whenever you're playing, connected, on
  // this screen and not already in a game. Switching away pauses you, so you're
  // never paired while you're not looking.
  const { connected, game, tournamentReady, tournamentPause, tournamentOver } = live;
  const joined = !!t?.joined;
  useEffect(() => {
    if (!id || !open || !isLive || !joined || !connected || game) return;
    if (playing && visible) tournamentReady(id);
    else tournamentPause(id);
  }, [id, open, isLive, joined, playing, visible, connected, game, tournamentReady, tournamentPause]);

  useEffect(() => {
    if (tournamentOver && tournamentOver === id) { setPlaying(false); void load(); }
  }, [tournamentOver, id, load]);

  const join = async () => {
    setBusy(true); setErr(null); setNeedsPro(false);
    try {
      const r = await apiFetch(`/api/tournaments/${id}/join`, { method: 'POST', credentials: 'include' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setNeedsPro(!!d.needsPro); throw new Error(d.error || 'Could not join'); }
      if (t?.format === 'arena' && t.kind === 'live' && t.status === 'running') setPlaying(true);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not join'); }
    finally { setBusy(false); }
  };
  const withdraw = async () => {
    const msg = t?.format === 'bracket' && t.status === 'running'
      ? 'Leave the tournament? Your current opponent goes through.'
      : 'Leave this tournament? Any points so far stay on the board.';
    if (!confirm(msg)) return;
    setPlaying(false);
    await apiFetch(`/api/tournaments/${id}/withdraw`, { method: 'POST', credentials: 'include' }).catch(() => {});
    void load();
  };

  // In a live game: the board takes over; "Next pairing" brings you back here.
  if (live.game && (live.status === 'in_game' || live.status === 'finished' || live.game.status === 'active')) {
    return <LiveGame live={live} onLeave={() => { live.reset(); void load(); }} />;
  }

  if (!data || !t) {
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

  const serverNow = now + offset;
  const me = data.standings.find((s) => s.isMe);
  const startsIn = new Date(t.startsAt).getTime() - serverNow;
  const endsIn = t.endsAt ? new Date(t.endsAt).getTime() - serverNow : 0;
  const waiting = live.tournamentWaiting?.id === id;
  const finished = t.status === 'finished';
  const isBracket = t.format === 'bracket';
  const currentRound = isBracket ? data.bracket.filter((m) => m.status !== 'done').reduce((r, m) => Math.min(r, m.round), 99) : 0;
  const currentRoundLabel = data.bracket.find((m) => m.round === currentRound)?.roundLabel;
  const startLabel = new Date(t.startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  // Third summary tile.
  const clockTile = t.status === 'scheduled'
    ? { value: startsIn > 3 * 86400_000 ? new Date(t.startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : fmtCountdown(startsIn), label: 'until start' }
    : finished
      ? { value: t.winner ?? 'Over', label: t.winner ? 'champion' : (t.endsAt ? new Date(t.endsAt).toLocaleDateString() : '') }
      : isBracket
        ? { value: currentRoundLabel ?? 'Final', label: 'now playing' }
        : { value: fmtCountdown(endsIn), label: 'left' };

  const myMatch = data.myMatch;
  const deadlineIn = myMatch?.deadline ? new Date(myMatch.deadline).getTime() - serverNow : 0;

  const action = (() => {
    if (finished) return null;
    if (!t.joined) {
      if (isBracket && t.status === 'running') {
        return <p className="rounded-xl p-3 text-center text-[13px]" style={{ background: 'rgba(0,0,0,.2)', color: PT.muted }}>Registration closed when the bracket started. Follow along below.</p>;
      }
      const full = !!t.maxPlayers && t.players >= t.maxPlayers;
      return (
        <div className="space-y-2">
          <button onClick={join} disabled={busy || full} className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-extrabold disabled:opacity-60" style={greenBtn}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Swords size={18} />} {full ? 'Tournament full' : 'Join tournament'}
          </button>
          {needsPro && (
            <p className="text-center text-[12.5px]" style={{ color: PT.muted }}>
              Pro members can join. <Link href="/pricing" className="font-bold underline" style={{ color: PT.green }}>See ChessScout Pro</Link>
            </p>
          )}
        </div>
      );
    }
    const leave = <button onClick={withdraw} className="w-full rounded-xl py-2 text-[12.5px] font-bold" style={ghostBtn}>Leave tournament</button>;

    if (isBracket) {
      if (t.status === 'scheduled') {
        return (
          <div className="space-y-2">
            <p className="flex items-center justify-center gap-2 rounded-xl p-3 text-center text-[13.5px] font-bold" style={{ background: PT.greenSoft, color: PT.text, border: `1px solid ${PT.greenLine}` }}>
              <Check size={16} style={{ color: PT.green }} /> You're registered. The bracket is drawn {startLabel}.
            </p>
            {leave}
          </div>
        );
      }
      if (data.knockedOut) return <p className="rounded-xl p-3 text-center text-[13.5px]" style={{ background: 'rgba(0,0,0,.2)', color: PT.muted }}>You're out of this one. Thanks for playing; follow the rest of the bracket below.</p>;
      if (!myMatch) return null;
      return (
        <div className="space-y-3 rounded-xl p-4 text-center" style={{ background: PT.greenSoft, border: `1px solid ${PT.greenLine}` }}>
          <p className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: PT.green }}>{myMatch.roundLabel}{myMatch.replay ? ' · replay' : ''}</p>
          {myMatch.status === 'waiting' || !myMatch.opponent ? (
            <p className="text-[15px] font-black" style={{ color: PT.text }}>You're through. Waiting to see who you play next.</p>
          ) : myMatch.status === 'ready' && isLive ? (
            <>
              <p className="text-[15px] font-black" style={{ color: PT.text }}>You vs {myMatch.opponent}</p>
              <div className="flex items-center justify-center gap-2 text-[13px]" style={{ color: PT.muted }}>
                <Loader2 size={14} className="animate-spin" style={{ color: PT.green }} />
                {!connected ? 'Connecting…' : waiting ? `Waiting for ${myMatch.opponent}. The game starts the moment they're here.` : 'Getting you ready…'}
              </div>
              {deadlineIn > 0 && <p className="text-[12px]" style={{ color: PT.muted }}>No-show forfeit in <b className="tabular-nums" style={{ color: PT.text }}>{fmtCountdown(deadlineIn)}</b>. Keep this screen open.</p>}
            </>
          ) : myMatch.status === 'playing' && !isLive && myMatch.gameId ? (
            <>
              <p className="text-[15px] font-black" style={{ color: PT.text }}>You vs {myMatch.opponent}</p>
              <Link href={`/daily/${myMatch.gameId}`} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-extrabold" style={greenBtn}>
                <CalendarDays size={16} /> Open your game
              </Link>
            </>
          ) : (
            <p className="text-[15px] font-black" style={{ color: PT.text }}>You vs {myMatch.opponent}</p>
          )}
        </div>
      );
    }

    if (!isLive) {
      return (
        <div className="space-y-2">
          <div className="space-y-2 rounded-xl p-4 text-center" style={{ background: PT.greenSoft, border: `1px solid ${PT.greenLine}` }}>
            <p className="text-[14.5px] font-black" style={{ color: PT.text }}>
              {t.status === 'scheduled' ? `You're in. Pairings start ${startLabel}.` : data.myDailyGame ? 'Your game is in progress.' : "You're in the queue for your next game."}
            </p>
            {data.myDailyGame ? (
              <Link href={`/daily/${data.myDailyGame}`} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-extrabold" style={greenBtn}>
                <CalendarDays size={16} /> Open your game
              </Link>
            ) : <p className="text-[12px]" style={{ color: PT.muted }}>We'll notify you as soon as you're paired.</p>}
          </div>
          {leave}
        </div>
      );
    }

    // Live arena
    return !playing ? (
      <div className="space-y-2">
        <button onClick={() => setPlaying(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-extrabold" style={greenBtn}>
          <Play size={18} /> {t.status === 'running' ? 'Play' : "I'm ready"}
        </button>
        {leave}
      </div>
    ) : (
      <div className="space-y-3 rounded-xl p-4 text-center" style={{ background: PT.greenSoft, border: `1px solid ${PT.greenLine}` }}>
        <Loader2 className="mx-auto animate-spin" style={{ color: PT.green }} />
        <p className="text-[15px] font-black" style={{ color: PT.text }}>
          {!connected ? 'Connecting…' : t.status === 'scheduled' ? "You're in. Pairings start when the clock hits zero." : waiting ? 'Finding your next opponent…' : 'Getting ready…'}
        </p>
        <p className="text-[12px]" style={{ color: PT.muted }}>Keep this screen open. Leaving it pauses you so you're never paired while away.</p>
        <button onClick={() => setPlaying(false)} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold" style={ghostBtn}>
          <Pause size={14} /> Pause
        </button>
      </div>
    );
  })();

  return (
    <div className="mx-auto max-w-[760px] space-y-4 p-4 pb-24 md:p-0">
      <div className="flex items-center gap-3">
        <Link href="/live" className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: PT.muted, background: 'rgba(255,255,255,.05)' }} aria-label="Back to Live play"><ArrowLeft size={18} /></Link>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: t.status === 'running' ? PT.gold : PT.muted }}>
            <span>{t.status === 'running' ? 'On now' : t.status === 'scheduled' ? 'Upcoming' : 'Finished'} · {isBracket ? 'Knockout' : 'Arena'} · {isLive ? 'Live' : 'Daily'}</span>
            {t.eligibility === 'pro' && <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: PT.greenSoft, color: PT.green, border: `1px solid ${PT.greenLine}` }}>Pro only</span>}
          </p>
          <h1 className="truncate text-2xl font-black md:text-3xl" style={{ color: PT.text, letterSpacing: '-0.02em' }}>{t.name}</h1>
        </div>
      </div>

      {/* Summary + action */}
      <div className="space-y-4 p-5" style={cardStyle}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl p-2.5" style={{ background: 'rgba(0,0,0,.2)' }}>
            {isLive ? <Clock size={15} className="mx-auto" style={{ color: PT.green }} /> : <CalendarDays size={15} className="mx-auto" style={{ color: PT.green }} />}
            <p className="mt-1 text-[15px] font-black" style={{ color: PT.text }}>{t.timeControlLabel.replace(' per move', '')}</p>
            <p className="text-[11px]" style={{ color: PT.muted }}>{isLive ? '' : 'per move · '}{t.mode === 'ranked' ? 'Ranked' : 'Casual'}</p>
          </div>
          <div className="rounded-xl p-2.5" style={{ background: 'rgba(0,0,0,.2)' }}>
            <Users size={15} className="mx-auto" style={{ color: PT.green }} />
            <p className="mt-1 text-[15px] font-black" style={{ color: PT.text }}>{t.players}{t.maxPlayers ? <span className="text-[12px] font-bold" style={{ color: PT.muted }}> / {t.maxPlayers}</span> : null}</p>
            <p className="text-[11px]" style={{ color: PT.muted }}>players</p>
          </div>
          <div className="rounded-xl p-2.5" style={{ background: 'rgba(0,0,0,.2)' }}>
            {finished ? <Crown size={15} className="mx-auto" style={{ color: PT.gold }} /> : <Trophy size={15} className="mx-auto" style={{ color: PT.gold }} />}
            <p className="mt-1 truncate text-[15px] font-black tabular-nums" style={{ color: PT.text }}>{clockTile.value}</p>
            <p className="text-[11px]" style={{ color: PT.muted }}>{clockTile.label}</p>
          </div>
        </div>
        {t.description && <p className="whitespace-pre-wrap text-[13.5px]" style={{ color: PT.muted }}>{t.description}</p>}
        <p className="text-[12px]" style={{ color: PT.muted }}>
          {t.status === 'scheduled' && <><b style={{ color: PT.text }}>Starts {startLabel}.</b> </>}
          {rulesText(t)}
        </p>

        {err && <p className="text-[12.5px] font-bold" style={{ color: PT.red }}>{err}</p>}
        {action}
        {me && !isBracket && (
          <p className="text-center text-[13px]" style={{ color: PT.text }}>
            You: <b>#{me.rank}</b> · <b>{me.score}</b> pts · {me.wins}W {me.draws}D {me.losses}L
          </p>
        )}
      </div>

      {isBracket && data.bracket.length > 0 ? (
        <BracketView matches={data.bracket} />
      ) : isBracket ? (
        <PlayerList standings={data.standings} title={t.status === 'scheduled' ? 'Registered' : 'Players'} />
      ) : (
        <>
          {finished && data.standings.length > 0 && <Podium standings={data.standings} />}
          <StandingsList standings={data.standings} finished={finished} />
        </>
      )}

      {/* Recent games */}
      {data.games.length > 0 && (
        <div className="overflow-hidden" style={cardStyle}>
          <p className="px-4 pt-3 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: PT.muted }}>Latest games</p>
          {data.games.map((g) => {
            const row = (
              <>
                <span className="min-w-0 flex-1 truncate" style={{ fontWeight: g.result === 'white' ? 800 : 500 }}>{g.white}</span>
                <span className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-black tabular-nums" style={{ background: 'rgba(0,0,0,.25)', color: g.result ? PT.text : PT.gold }}>
                  {g.result === 'white' ? '1–0' : g.result === 'black' ? '0–1' : g.result === 'draw' ? '½–½' : g.kind === 'daily' ? 'playing' : 'live'}
                </span>
                <span className="min-w-0 flex-1 truncate text-right" style={{ fontWeight: g.result === 'black' ? 800 : 500 }}>{g.black}</span>
              </>
            );
            const style = { borderTop: `1px solid ${PT.border}`, color: PT.text, background: g.mine ? 'rgba(255,255,255,.03)' : undefined };
            return g.mine && g.kind === 'daily'
              ? <Link key={g.gameId} href={`/daily/${g.gameId}`} className="flex items-center gap-2 px-4 py-2 text-[13px]" style={style}>{row}</Link>
              : <div key={g.gameId} className="flex items-center gap-2 px-4 py-2 text-[13px]" style={style}>{row}</div>;
          })}
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[11.5px]" style={{ color: PT.muted }}>
        {t.mode === 'ranked' ? <Award size={12} /> : <Sparkles size={12} />}
        {t.mode === 'ranked' ? 'Ranked: games update your ChessScout rating.' : 'Casual: games don\'t change your rating.'}
      </p>
    </div>
  );
}

function Podium({ standings }: { standings: Standing[] }) {
  return (
    <div className="grid grid-cols-3 items-end gap-2">
      {[1, 0, 2].map((i) => {
        const s = standings[i];
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
  );
}

function StandingsList({ standings, finished }: { standings: Standing[]; finished: boolean }) {
  return (
    <div className="overflow-hidden" style={cardStyle}>
      <p className="px-4 pt-3 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: PT.muted }}>Standings</p>
      {standings.length === 0 ? (
        <p className="p-4 text-[13px]" style={{ color: PT.muted }}>No one has joined yet. Be the first.</p>
      ) : (
        <div className="pb-1">
          {standings.map((s) => (
            <div key={s.userId} className="flex items-center gap-3 px-4 py-2.5" style={{ background: s.isMe ? PT.greenSoft : undefined, borderTop: `1px solid ${PT.border}` }}>
              <span className="w-6 text-center text-[13px] font-black tabular-nums" style={{ color: s.rank <= 3 ? MEDAL[s.rank - 1] : PT.muted }}>{s.rank}</span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14px] font-extrabold" style={{ color: PT.text }}>{s.username}{s.isMe ? ' (you)' : ''}</b>
                {!finished && (
                  <span className="text-[11.5px]" style={{ color: s.state === 'playing' ? PT.gold : s.state === 'waiting' ? PT.green : PT.muted }}>
                    {s.withdrawn ? 'Left' : s.state === 'playing' ? `Playing ${s.playingAgainst ?? ''}` : s.state === 'waiting' ? 'Waiting for a pairing' : 'Not playing right now'}
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
  );
}

function PlayerList({ standings, title }: { standings: Standing[]; title: string }) {
  return (
    <div className="overflow-hidden" style={cardStyle}>
      <p className="px-4 pt-3 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: PT.muted }}>{title} · {standings.length}</p>
      {standings.length === 0 ? (
        <p className="p-4 text-[13px]" style={{ color: PT.muted }}>No one has signed up yet. Be the first.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 p-4">
          {standings.map((s) => (
            <span key={s.userId} className="rounded-lg px-2.5 py-1 text-[12.5px] font-bold" style={{ background: s.isMe ? PT.greenSoft : 'rgba(0,0,0,.25)', color: PT.text }}>{s.username}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Knockout bracket: one column per round, scrolls sideways on phones. */
function BracketView({ matches }: { matches: BMatch[] }) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const first = matches.filter((m) => m.round === rounds[0]).length;
  const height = Math.max(first, 1) * 92;
  const side = (m: BMatch, which: 'a' | 'b') => {
    const s = m[which];
    const won = m.winner === which;
    const lost = m.winner && m.winner !== which;
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: s?.isMe ? PT.greenSoft : undefined }}>
        <span className="w-5 shrink-0 text-right text-[10.5px] font-bold tabular-nums" style={{ color: PT.muted }}>{s?.seed ?? ''}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: s ? (lost ? PT.muted : PT.text) : PT.muted, fontWeight: won ? 800 : 600, textDecoration: lost ? 'line-through' : undefined }}>
          {s ? s.name : m.round === rounds[0] && m.status === 'done' ? 'Bye' : 'TBD'}
        </span>
        {won && <Check size={13} style={{ color: PT.green }} />}
      </div>
    );
  };
  return (
    <div className="overflow-hidden" style={cardStyle}>
      <p className="px-4 pt-3 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: PT.muted }}>Bracket</p>
      <div className="overflow-x-auto px-4 pb-4 pt-2">
        <div className="flex gap-4" style={{ minWidth: rounds.length * 190 }}>
          {rounds.map((r) => {
            const ms = matches.filter((m) => m.round === r);
            return (
              <div key={r} className="flex w-[180px] shrink-0 flex-col">
                <p className="mb-2 text-center text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: PT.green }}>{ms[0]?.roundLabel}</p>
                <div className="flex flex-col justify-around" style={{ height }}>
                  {ms.map((m) => (
                    <div key={m.id} className="overflow-hidden rounded-xl" style={{ background: 'rgba(0,0,0,.25)', border: `1px solid ${m.status === 'playing' || m.status === 'ready' ? PT.greenLine : PT.border}` }}>
                      {side(m, 'a')}
                      <div style={{ borderTop: `1px solid ${PT.border}` }} />
                      {side(m, 'b')}
                      {(m.status === 'playing' || m.status === 'ready' || m.note) && (
                        <p className="truncate px-2.5 py-1 text-[10.5px] font-bold" style={{ background: 'rgba(0,0,0,.2)', color: m.status === 'done' ? PT.muted : PT.gold }}>
                          {m.status === 'playing' ? (m.gamesPlayed > 1 ? 'Replay in progress' : 'In progress') : m.status === 'ready' ? 'Starting soon' : m.note === 'bye' ? 'Bye' : m.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
