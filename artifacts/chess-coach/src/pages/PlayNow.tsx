import { startLichessSignIn } from '@/lib/googleSignIn';
// Play right now, no account: a quick game against a beginner-friendly bot, for
// people arriving from an ad, a reel or a shared link who aren't ready to sign up
// yet. The bots here (400–1000) play in the browser, so nothing needs an account.
// After the game (or any time) a free account gets them their game reviewed: the
// game is kept on this device and saved into their account the moment they sign
// up, then they're sent to it.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Chess } from 'chess.js';
import { Mail, RotateCcw, Flag, Sparkles } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { GameOverOverlay, OverlayButton } from '@/components/GameOverOverlay';
import { BOTS, getBotMove, type BotConfig } from '@/lib/chess-bot';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { trackFunnelEvent } from '@/lib/funnelTracking';
import { rememberReturnTo, startGoogleSignup, GoogleMark } from '@/components/QuickSignup';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';

const KEY = 'cs_guest_game';
const GUEST_BOTS = BOTS.filter((b) => b.rating < 1200).slice(0, 3);
type Result = 'playing' | 'win' | 'loss' | 'draw';
interface Saved { key: string; bot: string; color: 'w' | 'b'; pgn: string; result: Result; savedTo?: boolean }

const load = (): Saved | null => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && typeof s.pgn === 'string' ? s : null; } catch { return null; } };
const store = (s: Saved | null) => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* ignore */ } };

function resultOf(c: Chess, me: 'w' | 'b'): Result {
  if (c.isCheckmate()) return c.turn() === me ? 'loss' : 'win';
  if (c.isDraw() || c.isStalemate() || c.isThreefoldRepetition() || c.isInsufficientMaterial()) return 'draw';
  return 'playing';
}

export function PlayNow() {
  const { isAuthenticated, isAuthLoading } = useUser();
  const [, navigate] = useLocation();
  const saved0 = useMemo(load, []);
  const [bot, setBot] = useState<BotConfig>(() => GUEST_BOTS.find((b) => b.name === saved0?.bot) ?? GUEST_BOTS[1] ?? GUEST_BOTS[0]);
  const [color, setColor] = useState<'w' | 'b'>(saved0?.color ?? 'w');
  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(() => { if (saved0?.pgn) { try { chessRef.current.loadPgn(saved0.pgn); } catch { /* fresh */ } } return chessRef.current.fen(); });
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(() => { const h = chessRef.current.history({ verbose: true }); const m = h[h.length - 1]; return m ? { from: m.from, to: m.to } : null; });
  const [result, setResult] = useState<Result>(saved0?.result ?? 'playing');
  const [key, setKey] = useState(saved0?.key ?? String(Date.now()));
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const started = useRef(chessRef.current.history().length > 0);
  const chess = chessRef.current;
  const moves = chess.history().length;
  const myTurn = result === 'playing' && chess.turn() === color && !thinking;

  const persist = useCallback((r: Result) => store({ key, bot: bot.name, color, pgn: chess.pgn(), result: r }), [key, bot.name, color, chess]);

  const finish = useCallback((r: Result) => {
    setResult(r); persist(r);
    if (r !== 'playing') trackFunnelEvent('guest_game_finished');
  }, [persist]);

  // The bot's move.
  useEffect(() => {
    if (result !== 'playing' || chess.turn() === color) return;
    let live = true;
    setThinking(true);
    const t = setTimeout(async () => {
      const san = await getBotMove(chess.fen(), bot).catch(() => null);
      if (!live) return;
      setThinking(false);
      if (!san) return;
      const mv = chess.move(san);
      setFen(chess.fen()); setLastMove({ from: mv.from, to: mv.to });
      const r = resultOf(chess, color); if (r !== 'playing') finish(r); else persist('playing');
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [fen, result, color, bot]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (san: string) => {
    if (!myTurn) return;
    const mv = chess.move(san); if (!mv) return;
    if (!started.current) { started.current = true; trackFunnelEvent('guest_game_started'); }
    setFen(chess.fen()); setLastMove({ from: mv.from, to: mv.to });
    const r = resultOf(chess, color); if (r !== 'playing') finish(r); else persist('playing');
  };

  const newGame = (c: 'w' | 'b' = color, b: BotConfig = bot) => {
    chess.reset(); started.current = false;
    setColor(c); setBot(b); setResult('playing'); setLastMove(null); setFen(chess.fen()); setSaving('idle');
    const k = String(Date.now()); setKey(k); store(null);
  };

  // Signed up (or in) with a finished game here: save it into their account, then open their games.
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return;
    const s = load();
    if (!s || s.result === 'playing' || s.savedTo || saving !== 'idle') return;
    setSaving('saving');
    const b = GUEST_BOTS.find((x) => x.name === s.bot);
    let n = 0; try { const g = new Chess(); g.loadPgn(s.pgn); n = g.history().length; } catch { /* bad game */ }
    apiFetch('/api/bots/result', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot: s.bot, result: s.result, moves: n, gameKey: `guest-${s.key}`, pgn: s.pgn, color: s.color, botRating: b?.rating ?? 0 }),
    }).then((r) => { if (!r.ok) throw new Error(); store({ ...s, savedTo: true }); setSaving('saved'); })
      .catch(() => setSaving('failed'));
  }, [isAuthenticated, isAuthLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const signUp = () => {
    // Come back here after signing up, so the game gets saved.
    rememberReturnTo('/play-now');
    trackFunnelEvent('signup_clicked');
    startGoogleSignup();
  };
  const emailHref = () => { rememberReturnTo('/play-now'); return `${import.meta.env.BASE_URL}setup?signup=email`; };

  const subtitle = chess.isCheckmate() ? 'by checkmate' : chess.isStalemate() ? 'by stalemate' : chess.isThreefoldRepetition() ? 'by repetition' : chess.isInsufficientMaterial() ? 'not enough pieces to mate' : result === 'loss' ? 'You resigned' : undefined;

  return (
    <div className="min-h-screen px-4 pb-10 pt-5" style={{ background: PT.bg }}>
      <div className="mx-auto max-w-[520px] space-y-4">
        <Link href="/" className="flex items-center justify-center gap-2">
          <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="" className="h-8 w-8" />
          <span className="text-[19px] font-extrabold" style={{ color: PT.text }}>Chess<span style={{ color: PT.green }}>Scout</span>.net</span>
        </Link>
        <div className="text-center">
          <p className="text-[22px] font-black leading-tight" style={{ color: PT.text }}>Play a game right now</p>
          <p className="mt-1 text-[13.5px]" style={{ color: PT.muted }}>No account needed. Pick a bot and make your move.</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {GUEST_BOTS.map((b) => (
            <button key={b.name} onClick={() => newGame(color, b)} disabled={moves > 0 && result === 'playing'}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] font-bold disabled:opacity-50"
              style={{ ...(bot.name === b.name ? greenBtn : ghostBtn) }}>
              <img src={b.avatar} alt="" className="h-7 w-7 rounded-full bg-white/10" />
              <span>{b.name}<span className="block text-[11px] font-semibold opacity-75">{b.rating} · {b.personality}</span></span>
            </button>
          ))}
        </div>

        <div className="p-2" style={cardStyle}>
          <div className="mb-1.5 flex items-center justify-between px-1 text-[12.5px] font-bold" style={{ color: PT.muted }}>
            <span className="flex items-center gap-2"><img src={bot.avatar} alt="" className="h-6 w-6 rounded-full bg-white/10" />{bot.name} ({bot.rating})</span>
            <span>{thinking ? 'Thinking…' : result === 'playing' ? (myTurn ? 'Your move' : '') : ''}</span>
          </div>
          <ChessBoard fen={fen} flipped={color === 'b'} practiceMode={myTurn} expectedMoveSan={null}
            onMovePlayed={(san) => onMove(san)} lastMove={lastMove} reserveConfirmSpace
            boardOverlay={result !== 'playing' ? (
              <GameOverOverlay gameKey={key} outcome={result === 'win' ? 'win' : result === 'loss' ? 'loss' : 'draw'} yourColor={color === 'w' ? 'white' : 'black'} subtitle={subtitle}
                actions={!isAuthenticated ? (
                  <OverlayButton primary onClick={signUp}><Sparkles size={15} /> Get this game reviewed free</OverlayButton>
                ) : (
                  <OverlayButton primary onClick={() => newGame(color === 'w' ? 'b' : 'w')}><RotateCcw size={15} /> Play again</OverlayButton>
                )} />
            ) : undefined} />
          <div className="mt-2 flex items-center justify-center gap-2">
            {result === 'playing' ? (
              <button onClick={() => { if (moves >= 2) finish('loss'); else newGame(color === 'w' ? 'b' : 'w'); }} className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-bold" style={ghostBtn}>
                {moves >= 2 ? <><Flag size={14} /> Resign</> : <><RotateCcw size={14} /> Play {color === 'w' ? 'Black' : 'White'} instead</>}
              </button>
            ) : (
              <button onClick={() => newGame(color === 'w' ? 'b' : 'w')} className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-bold" style={ghostBtn}><RotateCcw size={14} /> New game</button>
            )}
          </div>
        </div>

        {/* The free account: always here under the board, never in the way. */}
        {!isAuthenticated && !isAuthLoading && (
          <div className="space-y-2.5 p-5" style={cardStyle}>
            <p className="text-[16px] font-black" style={{ color: PT.text }}>{result === 'playing' ? 'Like it? Keep every game.' : 'See where this game was won or lost'}</p>
            <p className="text-[13px]" style={{ color: PT.muted }}>A free account reviews your games move by move, finds the mistakes you keep making, and lets you play friends live or one move a day. {moves >= 2 ? 'This game is saved to it.' : ''}</p>
            <button type="button" onClick={signUp} className="flex w-full items-center justify-center gap-3 rounded-[14px] py-3.5 text-[15px] font-extrabold" style={{ background: '#FFFFFF', color: '#1F1F1F' }}>
              <GoogleMark /> Continue with Google
            </button>
            <button type="button" onClick={() => { rememberReturnTo('/play-now'); trackFunnelEvent('signup_clicked'); trackFunnelEvent('lichess_oauth_clicked'); startLichessSignIn(); }}
              className="flex w-full items-center justify-center gap-3 rounded-[14px] py-3.5 text-[15px] font-extrabold"
              style={{ background: '#262421', color: '#FFFFFF', border: '1px solid rgba(255,255,255,.14)' }}>
              <span aria-hidden="true" className="text-[1.25em] leading-none">♞</span> Continue with Lichess
            </button>
            <a href={emailHref()} onClick={() => rememberReturnTo('/play-now')} className="flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-[13.5px] font-bold" style={ghostBtn}>
              <Mail size={15} /> Use email instead
            </a>
            <p className="text-center text-[11.5px]" style={{ color: PT.muted }}>Free, no credit card.</p>
          </div>
        )}
        {isAuthenticated && saving === 'saved' && (
          <div className="space-y-2 p-5 text-center" style={cardStyle}>
            <p className="text-[16px] font-black" style={{ color: PT.text }}>Your game is in your account ✓</p>
            <button onClick={() => navigate('/games')} className="w-full rounded-xl py-3 text-[14px] font-extrabold" style={greenBtn}>See your games</button>
          </div>
        )}
        {isAuthenticated && saving === 'failed' && (
          <p className="text-center text-[13px]" style={{ color: PT.muted }}>Couldn't save that game to your account. You can keep playing here or open <Link href="/practice" className="font-bold underline" style={{ color: PT.green }}>all the bots</Link>.</p>
        )}
        {isAuthenticated && saving !== 'saved' && (
          <div className="flex justify-center gap-2">
            <Link href="/practice" className="rounded-xl px-4 py-2.5 text-[13px] font-bold" style={ghostBtn}>All bots</Link>
            <Link href="/live" className="rounded-xl px-4 py-2.5 text-[13px] font-bold" style={ghostBtn}>Play someone live</Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default PlayNow;
