// Play on Lichess: a real Lichess game on ChessScout's board. Live Play sends
// people here when nobody's on ChessScout (/lichess?seek=10+0&rated=0), or they
// can open it themselves. Finished games are saved into their ChessScout games
// for review. See lib/lichessBoard.ts for how it talks to Lichess.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Chess } from 'chess.js';
import { Loader2, X, Flag, Handshake, RotateCcw, Sparkles, ExternalLink, Zap } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { GameOverOverlay, OverlayButton } from '@/components/GameOverOverlay';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { playMoveSound } from '@/context/SettingsContext';
import {
  lichessAuth, connectLichess, disconnectLichess, seek as lichessSeek, streamEvents, streamGame, playMove, resign, abort, draw, claimVictory,
  nowPlaying, exportPgn, isOver, LICHESS_STATUS_TEXT, type LichessGameFull, type LichessState, type LichessPlayer,
} from '@/lib/lichessBoard';

const CLOCKS = [
  { m: 10, i: 0, label: '10 min' }, { m: 10, i: 5, label: '10 | 5' }, { m: 15, i: 10, label: '15 | 10' }, { m: 30, i: 0, label: '30 min' },
];
const fmt = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); const m = Math.floor(s / 60); return s < 20 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };
const nameOf = (p?: LichessPlayer) => (p?.aiLevel ? `Stockfish level ${p.aiLevel}` : p?.name ?? 'Opponent');

function fromUci(initialFen: string, moves: string) {
  const c = initialFen && initialFen !== 'startpos' ? new Chess(initialFen) : new Chess();
  let last: { from: string; to: string } | null = null;
  for (const u of moves.split(' ').filter(Boolean)) {
    try { const mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); last = { from: mv.from, to: mv.to }; } catch { break; }
  }
  return { chess: c, last };
}

export function LichessPlay() {
  const [, navigate] = useLocation();
  const { authUser, refreshAuth } = useUser();
  const [auth, setAuth] = useState(lichessAuth);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const fromLive = params.get('from') === 'live';
  const [rated, setRated] = useState(params.get('rated') === '1');
  const [clock, setClock] = useState(() => { const s = params.get('seek'); const m = s?.match(/^(\d+)\+(\d+)$/); return m ? { m: +m[1], i: +m[2] } : { m: 10, i: 0 }; });
  const [phase, setPhase] = useState<'idle' | 'seeking' | 'playing' | 'over'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [full, setFull] = useState<LichessGameFull | null>(null);
  const [st, setSt] = useState<LichessState | null>(null);
  const [stAt, setStAt] = useState(0);
  const [gone, setGone] = useState<{ gone: boolean; claimWinInSeconds?: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed' | 'notyours'>('idle');
  const [savedId, setSavedId] = useState<number | null>(null);
  const seekAbort = useRef<AbortController | null>(null);
  const autoStarted = useRef(false);

  // The account's events: a game starting (from a seek or a challenge) or finishing.
  useEffect(() => {
    if (!auth) return;
    const ac = new AbortController();
    void streamEvents((e) => {
      if (e.type === 'gameStart') { seekAbort.current?.abort(); seekAbort.current = null; setGameId(e.game.gameId); setPhase('playing'); setError(null); }
    }, ac.signal).catch(() => {});
    // A game already going (came back to the page): pick it up.
    void nowPlaying().then((g) => { if (g[0]) { setGameId(g[0].gameId); setPhase('playing'); } });
    return () => ac.abort();
  }, [auth]);

  const startSeek = useCallback(async (c = clock, r = rated) => {
    if (!lichessAuth()) { setAuth(null); return; }
    setError(null); setPhase('seeking'); setFull(null); setSt(null); setGameId(null); setSaving('idle'); setSavedId(null);
    const ac = new AbortController(); seekAbort.current = ac;
    try {
      const code = await lichessSeek({ minutes: c.m, increment: c.i, rated: r }, ac.signal);
      if (ac.signal.aborted) return;
      if (code === 429) setError('Lichess asked us to slow down. Try again in a minute.');
      else if (code === 401) { setAuth(null); setError('Your Lichess connection expired. Connect again.'); }
      else if (code >= 400) setError("Lichess couldn't start that search. Try another clock.");
      // On success the gameStart event moves us on; if it never comes, go back to the picker.
      setTimeout(() => setPhase((p) => (p === 'seeking' ? 'idle' : p)), 4000);
    } catch { if (!ac.signal.aborted) { setError("Couldn't reach Lichess. Check your connection."); setPhase('idle'); } }
  }, [clock, rated]);
  const cancelSeek = () => { seekAbort.current?.abort(); seekAbort.current = null; setPhase('idle'); };

  // Sent from Live Play: start looking straight away.
  useEffect(() => {
    if (!auth || autoStarted.current || !params.get('seek')) return;
    autoStarted.current = true;
    const t = setTimeout(() => { void nowPlaying().then((g) => { if (!g.length) void startSeek(); }); }, 300);
    return () => clearTimeout(t);
  }, [auth]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { seekAbort.current?.abort(); }, []);

  // The game itself.
  useEffect(() => {
    if (!gameId) return;
    const ac = new AbortController();
    let lastMoves = '';
    void streamGame(gameId, (x) => {
      if (x.type === 'gameFull') { setFull(x); setSt(x.state); setStAt(Date.now()); lastMoves = x.state.moves; if (isOver(x.state.status)) setPhase('over'); }
      else if (x.type === 'gameState') {
        if (x.moves !== lastMoves && x.moves.length > lastMoves.length) playMoveSound('move');
        lastMoves = x.moves;
        setSt(x); setStAt(Date.now());
        if (isOver(x.status)) setPhase('over');
      } else if (x.type === 'opponentGone') setGone(x.gone ? x : null);
    }, ac.signal).catch(() => {});
    return () => ac.abort();
  }, [gameId]);

  const me = auth?.username.toLowerCase() ?? '';
  const myColor: 'w' | 'b' = full && full.black.id === me ? 'b' : 'w';
  const pos = useMemo(() => (full && st ? fromUci(full.initialFen, st.moves) : null), [full, st]);
  const plies = st ? st.moves.split(' ').filter(Boolean).length : 0;
  const myTurn = !!pos && phase === 'playing' && pos.chess.turn() === myColor && st?.status === 'started';
  const [pending, setPending] = useState<{ fen: string; last: { from: string; to: string } } | null>(null);
  useEffect(() => { setPending(null); }, [st?.moves]);

  // Clocks tick locally between updates (from the second move on, as on Lichess).
  useEffect(() => { if (phase !== 'playing') return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [phase]);
  const running = phase === 'playing' && plies >= 2 && st?.status === 'started';
  const turn = pos?.chess.turn();
  const timeOf = (c: 'w' | 'b') => { if (!st) return 0; const base = c === 'w' ? st.wtime : st.btime; return running && turn === c ? base - (now - stAt) : base; };

  const onMove = async (san: string) => {
    if (!myTurn || !pos || !gameId) return;
    const c = new Chess(pos.chess.fen());
    let mv; try { mv = c.move(san); } catch { return; }
    const uci = `${mv.from}${mv.to}${mv.promotion ?? ''}`;
    setPending({ fen: c.fen(), last: { from: mv.from, to: mv.to } });
    playMoveSound(mv.captured ? 'capture' : 'move');
    const r = await playMove(gameId, uci);
    if (!r.ok) { setPending(null); setError(r.error || "Lichess didn't accept that move."); }
  };

  const oppOffersDraw = st && (myColor === 'w' ? st.bdraw : st.wdraw);
  const iOfferDraw = st && (myColor === 'w' ? st.wdraw : st.bdraw);
  const won = st?.winner ? (st.winner === 'white') === (myColor === 'w') : null;
  const outcome: 'win' | 'loss' | 'draw' = st?.winner ? (won ? 'win' : 'loss') : 'draw';

  // Finished: save it into their ChessScout games for review.
  const saveGame = useCallback(async () => {
    if (!gameId || !auth) return;
    setSaving('saving');
    try {
      // Their Lichess name is how the import knows which side is theirs.
      if (!authUser?.lichessUsername) {
        await apiFetch('/api/auth/update-profile', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lichessUsername: auth.username }) }).catch(() => {});
        await refreshAuth();
      }
      let pgn: string | null = null;
      for (let k = 0; k < 3 && !pgn; k++) { pgn = await exportPgn(gameId); if (!pgn) await new Promise((r) => setTimeout(r, 1500)); }
      if (!pgn) throw new Error('no pgn');
      const r = await apiFetch('/api/games/import-pgn', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pgn }) });
      const d = await r.json().catch(() => null) as { ids?: number[]; notYours?: number } | null;
      if (!r.ok) throw new Error('import');
      if (d?.notYours) { setSaving('notyours'); return; }
      setSavedId(d?.ids?.[0] ?? null); setSaving('saved');
    } catch { setSaving('failed'); }
  }, [gameId, auth, authUser?.lichessUsername, refreshAuth]);
  useEffect(() => { if (phase === 'over' && saving === 'idle' && plies >= 4 && st?.status !== 'aborted') void saveGame(); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = myColor === 'w' ? 'b' : 'w';
  const player = (c: 'w' | 'b') => (c === 'w' ? full?.white : full?.black);
  const clockChip = (c: 'w' | 'b') => (
    <span className="rounded-lg px-2.5 py-1 font-black tabular-nums" style={{ background: running && turn === c ? '#F2F2F2' : 'rgba(255,255,255,.08)', color: running && turn === c ? '#141414' : PT.text, fontSize: 'clamp(15px,4vw,19px)' }}>{fmt(timeOf(c))}</span>
  );
  const row = (c: 'w' | 'b') => { const p = player(c); return (
    <div className="flex items-center justify-between gap-2 px-1">
      <p className="truncate text-[14px] font-bold" style={{ color: PT.text }}>{p?.title && <span className="mr-1 rounded bg-[#CA3431] px-1 text-[11px] text-white">{p.title}</span>}{nameOf(p)}{p?.rating ? <span className="ml-1.5 font-semibold" style={{ color: PT.muted }}>{p.rating}{p.provisional ? '?' : ''}</span> : null}</p>
      {full?.clock && clockChip(c)}
    </div>
  ); };

  // ── Not connected ──
  if (!auth) {
    return (
      <div className="mx-auto max-w-[560px] space-y-4 p-4 pb-24">
        <div className="space-y-3 p-6 text-center" style={cardStyle}>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: '#81B64C', color: '#fff' }}><Zap size={26} /></span>
          <p className="text-[20px] font-black" style={{ color: PT.text }}>{fromLive ? 'Nobody free on ChessScout right now' : 'Play on Lichess'}</p>
          <p className="text-[13.5px]" style={{ color: PT.muted }}>Connect your Lichess account and we'll find you a real opponent from Lichess's players in seconds, right here on ChessScout. Games count on your Lichess rating and get reviewed here afterwards.</p>
          <button onClick={() => void connectLichess(`/lichess${window.location.search}`)} className="w-full rounded-xl py-3.5 text-[15px] font-extrabold" style={greenBtn}>Connect Lichess</button>
          <p className="text-[11.5px]" style={{ color: PT.muted }}>You'll sign in on lichess.org and come straight back. ChessScout can only play games for you; it can't change your account. Free Lichess account? <a href="https://lichess.org/signup" target="_blank" rel="noreferrer" className="font-bold underline" style={{ color: PT.green }}>Make one</a>.</p>
        </div>
        <div className="flex justify-center gap-2">
          <Link href="/live" className="rounded-xl px-4 py-2.5 text-[13px] font-bold" style={ghostBtn}>Back to Live Play</Link>
          <Link href="/practice" className="rounded-xl px-4 py-2.5 text-[13px] font-bold" style={ghostBtn}>Play a bot</Link>
        </div>
      </div>
    );
  }

  // ── In a game (or just finished) ──
  if ((phase === 'playing' || phase === 'over') && full && st && pos) {
    const resultText = st.winner ? `${won ? 'You won' : 'You lost'} ${LICHESS_STATUS_TEXT[st.status] ?? ''}` : LICHESS_STATUS_TEXT[st.status] ?? 'Draw';
    return (
      <div className="mx-auto max-w-[620px] space-y-2.5 p-3 pb-24">
        <div className="flex items-center justify-between text-[12px] font-bold" style={{ color: PT.muted }}>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#81B64C]" />Lichess · {full.clock ? `${full.clock.initial / 60000}+${full.clock.increment / 1000}` : full.speed} · {full.rated ? 'Rated' : 'Casual'}</span>
          <a href={`https://lichess.org/${full.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">On lichess.org <ExternalLink size={12} /></a>
        </div>
        {row(top)}
        <ChessBoard fen={pending?.fen ?? pos.chess.fen()} flipped={myColor === 'b'} lastMove={pending?.last ?? pos.last}
          practiceMode={myTurn && !pending} expectedMoveSan={null} onMovePlayed={(san) => void onMove(san)} reserveConfirmSpace
          boardOverlay={phase === 'over' ? (
            <GameOverOverlay gameKey={full.id} outcome={outcome} yourColor={myColor === 'w' ? 'white' : 'black'} subtitle={LICHESS_STATUS_TEXT[st.status]}
              actions={<>
                {saving === 'saved' && <OverlayButton primary onClick={() => navigate(savedId ? `/games/${savedId}` : '/games')}><Sparkles size={15} /> Review this game</OverlayButton>}
                <OverlayButton onClick={() => void startSeek()}><RotateCcw size={15} /> New game</OverlayButton>
              </>} />
          ) : undefined} />
        {row(myColor)}
        {gone?.gone && phase === 'playing' && (
          <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-[13px] font-bold" style={{ background: 'rgba(232,180,71,.14)', border: '1px solid rgba(232,180,71,.5)', color: PT.text }}>
            <span>Your opponent left.{gone.claimWinInSeconds ? ` You can claim the win in ${gone.claimWinInSeconds}s.` : ''}</span>
            {!gone.claimWinInSeconds && <button onClick={() => void claimVictory(full.id)} className="rounded-lg px-3 py-1.5" style={greenBtn}>Claim win</button>}
          </div>
        )}
        {oppOffersDraw && phase === 'playing' && (
          <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-[13px] font-bold" style={{ ...cardStyle, color: PT.text }}>
            <span>{nameOf(player(top))} offers a draw</span>
            <span className="flex gap-2"><button onClick={() => void draw(full.id, true)} className="rounded-lg px-3 py-1.5" style={greenBtn}>Accept</button><button onClick={() => void draw(full.id, false)} className="rounded-lg px-3 py-1.5" style={ghostBtn}>Decline</button></span>
          </div>
        )}
        {phase === 'playing' ? (
          <div className="flex justify-center gap-2">
            {plies < 2 ? (
              <button onClick={() => void abort(full.id)} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold" style={ghostBtn}><X size={15} /> Abort</button>
            ) : (<>
              <button onClick={() => void draw(full.id, true)} disabled={!!iOfferDraw} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold disabled:opacity-50" style={ghostBtn}><Handshake size={15} /> {iOfferDraw ? 'Draw offered' : 'Offer draw'}</button>
              <button onClick={() => void resign(full.id)} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold" style={ghostBtn}><Flag size={15} /> Resign</button>
            </>)}
          </div>
        ) : (
          <div className="space-y-2 p-4 text-center" style={cardStyle}>
            <p className="text-[15px] font-black" style={{ color: PT.text }}>{resultText}</p>
            {saving === 'saving' && <p className="text-[12.5px]" style={{ color: PT.muted }}><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Saving it to your games…</p>}
            {saving === 'saved' && <button onClick={() => navigate(savedId ? `/games/${savedId}` : '/games')} className="w-full rounded-xl py-3 text-[14px] font-extrabold" style={greenBtn}>Review this game</button>}
            {saving === 'notyours' && <p className="text-[12.5px]" style={{ color: PT.muted }}>This Lichess account ({auth.username}) isn't the one linked to your ChessScout account, so the game wasn't added. Change your Lichess username in Settings to save these games.</p>}
            {saving === 'failed' && <button onClick={() => void saveGame()} className="w-full rounded-xl py-2.5 text-[13px] font-bold" style={ghostBtn}>Couldn't save it to your games. Try again</button>}
            <button onClick={() => void startSeek()} className="w-full rounded-xl py-3 text-[14px] font-extrabold" style={saving === 'saved' ? ghostBtn : greenBtn}>New game</button>
          </div>
        )}
        {error && <p className="text-center text-[13px]" style={{ color: PT.red }}>{error}</p>}
      </div>
    );
  }

  // ── Picking a clock / looking for an opponent ──
  return (
    <div className="mx-auto max-w-[560px] space-y-4 p-4 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ color: PT.text }}>Play on Lichess</h1>
          <p className="text-[13px]" style={{ color: PT.muted }}>Connected as <span className="font-bold" style={{ color: PT.text }}>{auth.username}</span></p>
        </div>
        <button onClick={() => { void disconnectLichess(); setAuth(null); }} className="rounded-xl px-3 py-2 text-[12px] font-bold" style={ghostBtn}>Disconnect</button>
      </div>
      {phase === 'seeking' ? (
        <div className="space-y-4 p-6 text-center" style={cardStyle}>
          <Loader2 className="mx-auto h-10 w-10 animate-spin" style={{ color: PT.green }} />
          <div>
            <p className="text-lg font-black" style={{ color: PT.text }}>{fromLive ? 'Nobody on ChessScout, so finding you a Lichess opponent…' : 'Finding you an opponent on Lichess…'}</p>
            <p className="mt-1 text-sm" style={{ color: PT.muted }}>{clock.m} min{clock.i ? ` | ${clock.i}` : ''} · {rated ? 'Rated' : 'Casual'}</p>
          </div>
          <button onClick={cancelSeek} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold" style={ghostBtn}><X className="h-4 w-4" /> Cancel</button>
        </div>
      ) : (
        <div className="space-y-3 p-5" style={cardStyle}>
          <div className="grid grid-cols-2 gap-2">
            {CLOCKS.map((c) => (
              <button key={c.label} onClick={() => { setClock(c); void startSeek(c, rated); }} className="rounded-xl py-3 text-[15px] font-extrabold" style={clock.m === c.m && clock.i === c.i ? greenBtn : ghostBtn}>{c.label}</button>
            ))}
          </div>
          <div className="flex justify-center gap-2">
            {([[false, 'Casual'], [true, 'Rated']] as const).map(([v, t]) => (
              <button key={t} onClick={() => setRated(v)} className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold" style={rated === v ? greenBtn : ghostBtn}>{t}</button>
            ))}
          </div>
          <p className="text-center text-[11.5px]" style={{ color: PT.muted }}>Lichess only lets apps play 10 minutes and longer. Rated games count on your Lichess rating.</p>
        </div>
      )}
      {error && <p className="text-center text-[13px]" style={{ color: PT.red }}>{error}</p>}
      <div className="flex justify-center"><Link href="/live" className="rounded-xl px-4 py-2.5 text-[13px] font-bold" style={ghostBtn}>Back to Live Play</Link></div>
    </div>
  );
}

export function LichessCallback() {
  const [, navigate] = useLocation();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void import('@/lib/lichessBoard').then(({ finishLichessConnect }) => finishLichessConnect(window.location.search)).then((r) => {
      if (r.ok) navigate(r.returnTo, { replace: true } as never); else setErr(r.error);
    });
  }, [navigate]);
  return (
    <div className="mx-auto max-w-[480px] p-6 text-center">
      {err ? (<>
        <p className="text-[16px] font-black" style={{ color: PT.text }}>{err}</p>
        <button onClick={() => void connectLichess()} className="mt-4 rounded-xl px-5 py-3 text-[14px] font-extrabold" style={greenBtn}>Connect Lichess</button>
      </>) : <Loader2 className="mx-auto h-8 w-8 animate-spin" style={{ color: PT.green }} />}
    </div>
  );
}

export default LichessPlay;
