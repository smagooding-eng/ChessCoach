// chessscout.net/review: one free AI review of a game (the Instagram bio link).
// 1. Your Chess.com or Lichess username  2. Sign up free (the username comes along)
// 3. Pick one of your recent games  4. The AI coach reviews it (opens on the game).
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Loader2, Sparkles, Check, ChevronRight } from 'lucide-react';
import { RD } from '@/lib/redesignTheme';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { rememberReturnTo } from '@/components/QuickSignup';

export const FREE_REVIEW_KEY = 'cs_free_review';
/** A game picked before signing up (the Instagram page): reviewed as soon as the list loads. */
export const FREE_REVIEW_REF_KEY = 'cs_free_review_ref';
type Platform = 'chesscom' | 'lichess';
type Pending = { platform: Platform; username: string };
type Recent = { ref: string; white: string; black: string; whiteRating: number; blackRating: number; result: string; opening: string | null; playedAt: string; timeControl: string };

export function readFreeReview(): Pending | null {
  try { const v = JSON.parse(localStorage.getItem(FREE_REVIEW_KEY) ?? 'null'); return v && (v.platform === 'chesscom' || v.platform === 'lichess') && typeof v.username === 'string' ? v : null; } catch { return null; }
}
const save = (p: Pending) => { try { localStorage.setItem(FREE_REVIEW_KEY, JSON.stringify(p)); } catch { /* ignore */ } };

const card: React.CSSProperties = { background: RD.cardSolid, border: `1px solid ${RD.border}` };

export default function FreeReview() {
  const { authUser, isAuthenticated, isAuthLoading } = useUser();
  const [, navigate] = useLocation();
  const linked: Pending | null = authUser?.chesscomUsername ? { platform: 'chesscom', username: authUser.chesscomUsername }
    : authUser?.lichessUsername ? { platform: 'lichess', username: authUser.lichessUsername } : null;
  const [platform, setPlatform] = useState<Platform>(() => readFreeReview()?.platform ?? 'chesscom');
  const [username, setUsername] = useState(() => readFreeReview()?.username ?? '');
  const [who, setWho] = useState<Pending | null>(null); // the account we're picking games from (signed in)
  const [games, setGames] = useState<Recent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ used: boolean; gameId: number | null; pro: boolean } | null>(null);

  // Signed in: use the username they gave here (or the one on their account).
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return;
    const p = readFreeReview() ?? linked;
    if (p) { setWho(p); setPlatform(p.platform); setUsername(p.username); }
    void apiFetch('/api/free-review/status', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setStatus(d)).catch(() => {});
  }, [isAuthLoading, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!who) return;
    setGames(null); setErr(null);
    void apiFetch(`/api/free-review/recent?platform=${who.platform}&username=${encodeURIComponent(who.username)}`, { credentials: 'include' })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error ?? 'Couldn’t load your games.'); setGames(d.games ?? []); })
      .catch((e: unknown) => setErr(e instanceof Error && !/fetch|network|load failed/i.test(e.message) ? e.message : 'Couldn’t reach ChessScout. Check your connection and try again.'));
  }, [who]);

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(u)) { setErr(`Enter your ${platform === 'lichess' ? 'Lichess' : 'Chess.com'} username.`); return; }
    setErr(null); save({ platform, username: u });
    if (isAuthenticated) { setWho({ platform, username: u }); return; }
    rememberReturnTo('/review');
    navigate('/setup?signup=1&ref=free-review');
  };

  const review = async (g: Recent) => {
    if (!who) return;
    setBusy(g.ref); setErr(null);
    try {
      const r = await apiFetch('/api/free-review', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: who.platform, username: who.username, ref: g.ref }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409 && d.gameId) { setStatus({ used: true, gameId: d.gameId, pro: false }); throw new Error(d.error); }
      if (!r.ok || !d.gameId) throw new Error(d.error ?? 'Couldn’t start the review. Try again.');
      try { localStorage.removeItem(FREE_REVIEW_KEY); } catch { /* ignore */ }
      navigate(`/games/${d.gameId}`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Couldn’t start the review.'); } finally { setBusy(null); }
  };

  // A game picked before signing up (the Instagram page): start its review straight away.
  useEffect(() => {
    if (!games?.length || busy || (status?.used && !status.pro)) return;
    let ref: string | null = null;
    try { ref = JSON.parse(localStorage.getItem(FREE_REVIEW_REF_KEY) || 'null'); localStorage.removeItem(FREE_REVIEW_REF_KEY); } catch { /* ignore */ }
    const g = ref ? games.find((x) => x.ref === ref) : undefined;
    if (g) void review(g);
  }, [games, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = who?.username.toLowerCase();
  const resultOf = (g: Recent) => (g.result === 'win' ? { t: 'Won', c: RD.green } : g.result === 'loss' ? { t: 'Lost', c: RD.red } : { t: 'Draw', c: RD.muted });

  return (
    <div className="min-h-screen px-4 pb-16 pt-8" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="" className="h-8 w-8" />
          <span className="text-[17px] font-black">Chess<span style={{ color: RD.green }}>Scout</span></span>
        </div>
        <h1 className="text-[30px] font-black leading-tight">Get a free coach review of one of your games</h1>
        <p className="mt-2 text-[15px] leading-relaxed" style={{ color: RD.muted }}>
          Your coach goes through the game move by move: your accuracy, the moves that cost you, what you should have played, and what to work on.
        </p>

        {status?.used && !status.pro && (
          <div className="mt-6 rounded-2xl p-4" style={card}>
            <p className="text-[15px] font-extrabold">You've used your free coach review</p>
            <p className="mt-1 text-[13.5px]" style={{ color: RD.muted }}>It's saved in your games. Pro reviews every game you play.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {status.gameId && <button onClick={() => navigate(`/games/${status.gameId}`)} className="rounded-xl px-4 py-2.5 text-[13.5px] font-extrabold" style={{ background: RD.green, color: '#06110A' }}>Open my review</button>}
              <button onClick={() => navigate('/pricing')} className="rounded-xl px-4 py-2.5 text-[13.5px] font-extrabold" style={{ background: RD.cardLight, border: `1px solid ${RD.border}` }}>See Pro</button>
            </div>
          </div>
        )}

        {!who && !(status?.used && !status.pro) && (
          <form onSubmit={start} className="mt-6 rounded-2xl p-4" style={card}>
            <p className="mb-2 text-[13px] font-bold" style={{ color: RD.muted }}>Where do you play?</p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {([['chesscom', 'Chess.com'], ['lichess', 'Lichess']] as const).map(([p, l]) => (
                <button key={p} type="button" onClick={() => setPlatform(p)} className="rounded-xl py-2.5 text-[14px] font-extrabold"
                  style={{ background: platform === p ? RD.green : RD.cardLight, color: platform === p ? '#06110A' : RD.text, border: `1px solid ${platform === p ? RD.green : RD.border}` }}>{l}</button>
              ))}
            </div>
            <label className="block text-[13px] font-bold" style={{ color: RD.muted }}>Your {platform === 'lichess' ? 'Lichess' : 'Chess.com'} username
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="e.g. MagnusCarlsen"
                className="mt-1.5 w-full rounded-xl px-3.5 py-3 text-[16px] font-bold outline-none" style={{ background: RD.cardLight, color: RD.text, border: `1px solid ${RD.border}` }} />
            </label>
            {err && <p role="alert" className="mt-2 text-[13px] font-bold" style={{ color: '#FF7A80' }}>{err}</p>}
            <button type="submit" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-black" style={{ background: RD.green, color: '#06110A' }}>
              <Sparkles className="h-4 w-4" /> {isAuthenticated ? 'Show my games' : 'Continue — sign up free'}
            </button>
            {!isAuthenticated && <p className="mt-2 text-center text-[12px]" style={{ color: RD.muted }}>Free account, no card. Your username links your games.</p>}
            <ul className="mt-4 space-y-1.5 text-[13.5px]">
              {['Accuracy and game rating', 'Your key mistakes and the better moves', 'What you did well and what to work on'].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0" style={{ color: RD.green }} strokeWidth={3} />{t}</li>
              ))}
            </ul>
          </form>
        )}

        {who && !(status?.used && !status.pro) && (
          <div className="mt-6 rounded-2xl p-4" style={card}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[15px] font-extrabold">Pick a game to review</p>
              <button onClick={() => { setWho(null); setGames(null); }} className="text-[12.5px] font-bold underline" style={{ color: RD.muted }}>Change username</button>
            </div>
            <p className="-mt-2 mb-3 text-[12.5px]" style={{ color: RD.muted }}>{who.username} on {who.platform === 'lichess' ? 'Lichess' : 'Chess.com'}</p>
            {err && <p role="alert" className="mb-2 text-[13px] font-bold" style={{ color: '#FF7A80' }}>{err}</p>}
            {!games && !err && <p className="flex items-center gap-2 py-6 text-[13.5px]" style={{ color: RD.muted }}><Loader2 className="h-4 w-4 animate-spin" />Loading your recent games…</p>}
            {games && games.length === 0 && <p className="py-4 text-[13.5px]" style={{ color: RD.muted }}>No recent games found for this username.</p>}
            {games && games.length > 0 && (
              <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${RD.border}` }}>
                {games.map((g, i) => {
                  const white = g.white.toLowerCase() === me;
                  const opp = white ? g.black : g.white, oppR = white ? g.blackRating : g.whiteRating;
                  const r = resultOf(g);
                  return (
                    <button key={g.ref} onClick={() => void review(g)} disabled={!!busy} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.03] disabled:opacity-60"
                      style={{ borderTop: i ? `1px solid ${RD.border}` : undefined }}>
                      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: white ? '#EDE6D6' : '#262A2B', border: '1px solid rgba(255,255,255,.3)' }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-extrabold">vs {opp}{oppR ? <span className="font-bold" style={{ color: RD.muted }}> ({oppR})</span> : null}</span>
                        <span className="block truncate text-[12px]" style={{ color: RD.muted }}>{g.opening ?? 'Game'} · {new Date(g.playedAt).toLocaleDateString()}</span>
                      </span>
                      <span className="text-[12.5px] font-black" style={{ color: r.c }}>{r.t}</span>
                      {busy === g.ref ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" style={{ color: RD.muted }} />}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-[12px]" style={{ color: RD.muted }}>The review takes about a minute. It opens on the game and is saved in your games.</p>
          </div>
        )}
      </div>
    </div>
  );
}
