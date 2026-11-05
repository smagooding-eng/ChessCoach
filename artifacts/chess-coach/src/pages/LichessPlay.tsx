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
import { MaterialStrip, EvalBar } from '@/components/GameStatusStrip';
import { MoveBrowserBar } from '@/components/MoveBrowserBar';
import { useMoveBrowser, positionsFromSan } from '@/hooks/use-move-browser';
import { ChatBubble, ChatTray, useChatMuted } from '@/components/play/LiveChat';
import { NotifyPrompt } from '@/components/play/NotifyPrompt';
import type { LiveChat } from '@/hooks/use-live-play';
import {
  lichessAuth, connectLichess, disconnectLichess, syncLichessAuth, seek as lichessSeek, streamEvents, streamGame, playMove, resign, abort, draw, claimVictory,
  nowPlaying, isDaily, exportPgn, sendChat, chatHistory, isOver, LICHESS_STATUS_TEXT, type LichessGameFull, type LichessState, type LichessPlayer,
} from '@/lib/lichessBoard';

// ChessScout's team on Lichess.
export const LICHESS_TEAM_URL = 'https://lichess.org/team/chessscoutnet';
function TeamCard() {
  return (
    <a href={LICHESS_TEAM_URL} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-4" style={cardStyle}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[20px]" style={{ background: '#81B64C', color: '#fff' }}>♞</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-extrabold" style={{ color: PT.text }}>Join the ChessScout team on Lichess</span>
        <span className="block text-[12.5px]" style={{ color: PT.muted }}>Team tournaments and team battles with other ChessScout players.</span>
      </span>
      <ExternalLink size={16} style={{ color: PT.muted }} />
    </a>
  );
}

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
  // Sent from Live Play (or any link with ?seek=): straight into the search, no clock picker first.
  // ?game=ID: open that game (a daily game from the Daily tab or a "your move" alert).
  const gameParam = params.get('game');
  const [phase, setPhase] = useState<'idle' | 'seeking' | 'playing' | 'over'>(() => (gameParam ? 'playing' : params.get('seek') && lichessAuth() ? 'seeking' : 'idle'));
  // Not connected on this device yet: check the account's saved connection before offering Connect.
  const [checking, setChecking] = useState(() => !lichessAuth());
  const [error, setError] = useState<string | null>(null);
  const [confirmEl, setConfirmEl] = useState<HTMLDivElement | null>(null);
  const [gameId, setGameId] = useState<string | null>(() => (gameParam && /^[A-Za-z0-9]{8}$/.test(gameParam) ? gameParam : null));
  const [full, setFull] = useState<LichessGameFull | null>(null);
  const [st, setSt] = useState<LichessState | null>(null);
  const [stAt, setStAt] = useState(0);
  const [gone, setGone] = useState<{ gone: boolean; claimWinInSeconds?: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed' | 'notyours'>('idle');
  const [savedId, setSavedId] = useState<number | null>(null);
  const seekAbort = useRef<AbortController | null>(null);
  const autoStarted = useRef(false);
  const connectNote = params.get('lichess');

  // Coming back to the app: the connection is kept on their account, wherever the
  // trip back from Lichess finished.
  useEffect(() => {
    const check = () => {
      void syncLichessAuth().then((a) => { if (a) setAuth((cur) => (cur?.token === a.token ? cur : a)); }).finally(() => setChecking(false));
    };
    check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === 'cs_lichess_token') check(); };
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', onVis); window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('storage', onStorage); };
  }, []);

  // The account's events: a game starting (from a seek or a challenge) or finishing.
  useEffect(() => {
    if (!auth) return;
    const ac = new AbortController();
    void streamEvents((e) => {
      // A daily game starting (someone took a daily seek) doesn't take over this screen.
      if (e.type === 'gameStart' && isDaily(e.game) && e.game.gameId !== gameParam) return;
      if (e.type === 'gameStart') { seekAbort.current?.abort(); seekAbort.current = null; setGameId(e.game.gameId); setPhase('playing'); setError(null); }
    }, ac.signal).catch(() => {});
    // A game already going (came back to the page): pick it up.
    if (!gameParam) void nowPlaying().then((all) => { const g = all.filter((x) => !isDaily(x)); if (g[0]) { seekAbort.current?.abort(); seekAbort.current = null; setGameId(g[0].gameId); setPhase('playing'); } });
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
    // A game already going is picked up by the event stream, so the search starts right away.
    void startSeek();
    return undefined;
  }, [auth]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { seekAbort.current?.abort(); }, []);

  // Chat: what the players say (Lichess's own notices, like "Takeback sent", are left out).
  const [chat, setChat] = useState<LiveChat[]>([]);
  const [chatMuted, setChatMuted] = useChatMuted();
  const promoSent = useRef<string | null>(null);
  const chatId = useRef(0);
  const meRef = useRef('');
  const colorRef = useRef<'w' | 'b'>('w');
  const addChat = (user: string, text: string, at = Date.now()) => {
    if (!user || user.toLowerCase() === 'lichess' || !text.trim()) return;
    const mine = user.toLowerCase() === meRef.current;
    const from: 'w' | 'b' = mine ? colorRef.current : colorRef.current === 'w' ? 'b' : 'w';
    setChat((c) => [...c.slice(-30), { id: ++chatId.current, from, text: text.slice(0, 140), at }]);
  };
  useEffect(() => { setChat([]); }, [gameId]);
  // Played from ChessScout: it goes under the ChessScout tab as well as Lichess, however it gets saved.
  useEffect(() => {
    if (!gameId || phase !== 'playing') return;
    // Opened from a games list: already recorded if it started here (and not, if it started on lichess.org).
    const from = gameId === gameParam ? params.get('from') : null;
    if (from === 'list') return;
    void apiFetch('/api/lichess/board/played', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId, source: from === 'live' ? 'handoff' : 'lichess' }) }).catch(() => {});
  }, [gameId, phase]);

  // The game itself.
  useEffect(() => {
    if (!gameId) return;
    const ac = new AbortController();
    let historyLoaded = false;
    void streamGame(gameId, (x) => {
      if (x.type === 'gameFull') {
        // Who's who, for the chat; and what was said before this page opened.
        colorRef.current = x.black.id === meRef.current ? 'b' : 'w';
        if (!historyLoaded) { historyLoaded = true; void chatHistory(x.id).then((h) => h.forEach((m) => addChat(m.user, m.text, 0))); }
        setFull(x); setSt(x.state); setStAt(Date.now()); if (isOver(x.state.status)) setPhase('over'); }
      else if (x.type === 'gameState') {
        // Move sounds come from the board itself (your sound settings, as in ChessScout games).
        setSt(x); setStAt(Date.now());
        if (isOver(x.status)) { setPhase('over'); playMoveSound('gameEnd'); }
      } else if (x.type === 'opponentGone') setGone(x.gone ? x : null);
      else if (x.type === 'chatLine' && x.room === 'player') addChat(x.username, x.text);
    }, ac.signal).catch(() => {});
    return () => ac.abort();
  }, [gameId]);

  const me = auth?.username.toLowerCase() ?? '';
  meRef.current = me;
  const myColor: 'w' | 'b' = full && full.black.id === me ? 'b' : 'w';
  const pos = useMemo(() => (full && st ? fromUci(full.initialFen, st.moves) : null), [full, st]);
  const plies = st ? st.moves.split(' ').filter(Boolean).length : 0;
  const myTurn = !!pos && phase === 'playing' && pos.chess.turn() === myColor && st?.status === 'started';
  const [pending, setPending] = useState<{ fen: string; last: { from: string; to: string } } | null>(null);
  useEffect(() => { setPending(null); }, [st?.moves]);
  // Step back through the moves (as in ChessScout games), and premoves.
  const sans = useMemo(() => pos?.chess.history() ?? [], [pos]);
  const startFen = full && full.initialFen !== 'startpos' ? full.initialFen : undefined;
  const browser = useMoveBrowser(useMemo(() => positionsFromSan(sans, startFen), [sans, startFen]), gameId ?? undefined);
  const [premove, setPremove] = useState<{ from: string; to: string } | null>(null);
  useEffect(() => { if (phase !== 'playing') setPremove(null); }, [phase]);

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
    const r = await playMove(gameId, uci);
    if (!r.ok) { setPending(null); setError(r.error || "Lichess didn't accept that move."); }
  };

  // A premove plays as soon as it's our turn (if it's still legal).
  useEffect(() => {
    if (!premove || !myTurn || !pos || pending) return;
    const pm = premove; setPremove(null);
    try { const c = new Chess(pos.chess.fen()); const mv = c.move({ from: pm.from, to: pm.to, promotion: 'q' }); if (mv) void onMove(mv.san); } catch { /* no longer legal */ }
  }, [myTurn, st?.moves]); // eslint-disable-line react-hooks/exhaustive-deps

  // New game: back to Play, searching ChessScout and Lichess together at the same clock
  // (the game opens straight on the board, whichever finds someone first).
  const newGame = () => {
    const mins = full?.clock ? Math.round(full.clock.initial / 60000) : 10;
    const tc = mins >= 15 ? 'rapid_15_0' : 'rapid_10_0';
    navigate(`/live?play=${tc}&mode=${full?.rated ? 'ranked' : 'casual'}`);
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
      const r = await apiFetch('/api/games/import-pgn', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pgn, viaChessScout: true }) });
      const d = await r.json().catch(() => null) as { ids?: number[]; notYours?: number } | null;
      if (!r.ok) throw new Error('import');
      if (d?.notYours) { setSaving('notyours'); return; }
      setSavedId(d?.ids?.[0] ?? null); setSaving('saved');
    } catch { setSaving('failed'); }
  }, [gameId, auth, authUser?.lichessUsername, refreshAuth]);
  useEffect(() => { if (phase === 'over' && saving === 'idle' && plies >= 4 && st?.status !== 'aborted') void saveGame(); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = myColor === 'w' ? 'b' : 'w';
  const player = (c: 'w' | 'b') => (c === 'w' ? full?.white : full?.black);
  const clockChip = (c: 'w' | 'b') => { const on = running && turn === c, low = timeOf(c) < 10_000; return (
    <span className="rounded-lg px-2.5 py-1 font-black tabular-nums lg:hidden" style={{ background: on ? (low ? '#E5484D' : '#F2F2F2') : 'rgba(255,255,255,.08)', color: on ? (low ? '#fff' : '#141414') : low ? '#ec6b6b' : PT.text, fontSize: 'clamp(15px,4vw,19px)' }}>{fmt(timeOf(c))}</span>
  ); };
  const row = (c: 'w' | 'b') => { const p = player(c); return (
    <div className="flex items-center justify-between gap-2 px-1">
      <p className="truncate text-[14px] font-bold" style={{ color: PT.text }}>{p?.title && <span className="mr-1 rounded bg-[#CA3431] px-1 text-[11px] text-white">{p.title}</span>}{nameOf(p)}{p?.rating ? <span className="ml-1.5 font-semibold" style={{ color: PT.muted }}>{p.rating}{p.provisional ? '?' : ''}</span> : null}{c === myColor && <span className="ml-1.5 text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: PT.green }}>You</span>}</p>
      {full?.clock && clockChip(c)}
    </div>
  ); };

  if (!auth && checking) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin" style={{ color: PT.green }} /></div>;
  // ── Not connected ──
  if (!auth) {
    return (
      <div className="mx-auto max-w-[560px] space-y-4 p-4 pb-24">
        <div className="space-y-3 p-6 text-center" style={cardStyle}>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: '#81B64C', color: '#fff' }}><Zap size={26} /></span>
          <p className="text-[20px] font-black" style={{ color: PT.text }}>{fromLive ? 'Nobody free on ChessScout right now' : 'Play on Lichess'}</p>
          {connectNote && connectNote !== 'connected' && <p className="rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: 'rgba(232,180,71,0.14)', border: '1px solid rgba(232,180,71,0.5)', color: PT.text }}>{connectNote === 'declined' ? 'You chose not to connect Lichess.' : connectNote === 'expired' ? 'That connection took too long. Tap Connect Lichess again.' : "Lichess didn't finish connecting. Tap Connect Lichess to try again."}</p>}
          <p className="text-[12px]" style={{ color: PT.muted }}>Tip: if Lichess asks you to log in and then shows its home page, come back here and tap Connect Lichess once more. You'll go straight to Authorize.</p>
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
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#81B64C]" />Lichess · {full.clock ? `${full.clock.initial / 60000}+${full.clock.increment / 1000}` : full.daysPerTurn ? `Daily · ${full.daysPerTurn} day${full.daysPerTurn > 1 ? 's' : ''} a move` : full.speed} · {full.rated ? 'Rated' : 'Casual'}</span>
          <a href={`https://lichess.org/${full.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">On lichess.org <ExternalLink size={12} /></a>
        </div>
        {full.speed === 'correspondence' && <Link href="/daily" className="inline-block text-[12.5px] font-bold" style={{ color: PT.muted }}>← Daily games</Link>}
        <div className="relative">{row(top)}<ChatBubble chat={chat} side={top} muted={chatMuted} /></div>
        <MaterialStrip fen={pending?.fen ?? pos.chess.fen()} color={top} className="px-1" />
        <ChessBoard fen={browser.viewing && browser.fen ? browser.fen : pending?.fen ?? pos.chess.fen()} flipped={myColor === 'b'} lastMove={browser.viewing ? browser.lastMove : pending?.last ?? pos.last}
          practiceMode={myTurn && !pending && !browser.viewing} expectedMoveSan={null} onMovePlayed={(san) => void onMove(san)} confirmTarget={confirmEl}
          premoveMode={!myTurn && phase === 'playing' && !browser.viewing} premoveColor={myColor} premove={premove} onPremoveSet={(p) => setPremove(p)}
          sidePanel={full.clock ? {
            clocks: {
              top: { name: nameOf(player(top)), text: fmt(timeOf(top)), active: running && turn === top, low: timeOf(top) < 10_000, moves: Math.floor((plies + (top === 'w' ? 1 : 0)) / 2) },
              bottom: { name: 'You', text: fmt(timeOf(myColor)), active: running && turn === myColor, low: timeOf(myColor) < 10_000, moves: Math.floor((plies + (myColor === 'w' ? 1 : 0)) / 2) },
            },
            status: phase !== 'playing' ? 'Game over' : myTurn ? 'Your move' : 'Opponent to move',
          } : undefined}
          boardOverlay={phase === 'over' ? (
            <GameOverOverlay gameKey={full.id} outcome={outcome} yourColor={myColor === 'w' ? 'white' : 'black'} subtitle={LICHESS_STATUS_TEXT[st.status]}
              actions={<>
                {saving === 'saved' && <OverlayButton primary onClick={() => navigate(savedId ? `/games/${savedId}` : '/games')}><Sparkles size={15} /> Review this game</OverlayButton>}
                {full.speed === 'correspondence'
                  ? <OverlayButton onClick={() => navigate('/daily')}>Daily games</OverlayButton>
                  : <OverlayButton onClick={newGame}><RotateCcw size={15} /> New game</OverlayButton>}
              </>} />
          ) : undefined} />
        {/* Confirm / Cancel floats here, right under the board and well away from the bottom menu. */}
        <div ref={setConfirmEl} className="relative" />
        <MaterialStrip fen={pending?.fen ?? pos.chess.fen()} color={myColor} className="-mt-1 px-1" />
        <div className="relative">{row(myColor)}<ChatBubble chat={chat} side={myColor} /></div>
        <MoveBrowserBar browser={browser} yourTurn={myTurn} />
        {!full.white.aiLevel && !full.black.aiLevel && (
          <div className="space-y-1.5">
            <ChatTray onSend={(t) => {
              // The ChessScout line goes once a game at most (Lichess doesn't like repeated advertising).
              if (/chessscout\.net/i.test(t)) { if (promoSent.current === full.id) return; promoSent.current = full.id; }
              void sendChat(full.id, t);
            }} disabled={phase !== 'playing' && phase !== 'over'} muted={chatMuted} setMuted={setChatMuted} />
            {chat.length > 0 && (
              <div className="max-h-28 space-y-0.5 overflow-y-auto rounded-lg px-2.5 py-1.5 text-[12.5px]" style={{ background: 'rgba(255,255,255,0.04)' }}>
                {chat.filter((m) => !chatMuted || m.from === myColor).slice(-6).map((m) => (
                  <p key={m.id} style={{ color: PT.text }}><span className="font-bold" style={{ color: m.from === myColor ? PT.green : PT.muted }}>{m.from === myColor ? 'You' : nameOf(player(top))}:</span> {m.text}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {premove && !myTurn && phase === 'playing' && (
          <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,140,90,0.35)', color: '#fff', border: '1px solid rgba(255,140,90,0.35)' }}>
            <span>Premove: {premove.from} → {premove.to}</span>
            <button onClick={() => setPremove(null)} className="inline-flex items-center gap-1 font-bold"><X className="h-3 w-3" /> Cancel</button>
          </div>
        )}
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
              <button onClick={() => { if (confirm('Resign this game?')) void resign(full.id); }} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold" style={ghostBtn}><Flag size={15} /> Resign</button>
            </>)}
          </div>
        ) : (
          <div className="space-y-2 p-4 text-center" style={cardStyle}>
            <p className="text-[15px] font-black" style={{ color: PT.text }}>{resultText}</p>
            {/* The engine's view only once the game is over (never during a game). */}
            <EvalBar fen={pos.chess.fen()} />
            {saving === 'saving' && <p className="text-[12.5px]" style={{ color: PT.muted }}><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Saving it to your games…</p>}
            {saving === 'saved' && <button onClick={() => navigate(savedId ? `/games/${savedId}` : '/games')} className="w-full rounded-xl py-3 text-[14px] font-extrabold" style={greenBtn}>Review this game</button>}
            {saving === 'notyours' && <p className="text-[12.5px]" style={{ color: PT.muted }}>This Lichess account ({auth.username}) isn't the one linked to your ChessScout account, so the game wasn't added. Change your Lichess username in Settings to save these games.</p>}
            {saving === 'failed' && <button onClick={() => void saveGame()} className="w-full rounded-xl py-2.5 text-[13px] font-bold" style={ghostBtn}>Couldn't save it to your games. Try again</button>}
            {full.speed === 'correspondence'
              ? <Link href="/daily" className="block w-full rounded-xl py-3 text-[14px] font-extrabold" style={saving === 'saved' ? ghostBtn : greenBtn}>Daily games</Link>
              : <button onClick={newGame} className="w-full rounded-xl py-3 text-[14px] font-extrabold" style={saving === 'saved' ? ghostBtn : greenBtn}>New game</button>}
            <a href={LICHESS_TEAM_URL} target="_blank" rel="noreferrer" className="block pt-1 text-[12.5px] font-bold underline" style={{ color: PT.green }}>♞ Join the ChessScout team on Lichess</a>
            <NotifyPrompt id="aftergame" reason="Play daily games on Lichess? Turn on notifications and we'll tell you when it's your move." />
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
      <TeamCard />
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
