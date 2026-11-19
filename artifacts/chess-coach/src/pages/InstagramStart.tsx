// chessscout.net/ig (Instagram bio link → /instagram).
// People from a reel want to see it work before they make an account, and they're
// inside Instagram's own browser, where Google sign-in is refused. So:
//   1. username → their real recent games, straight away, no account
//   2. tap a game → sign up (Lichess / email right here; Google opens the phone's
//      browser, carrying the username and game along in the link)
//   3. back signed in → /review starts that game's AI review on its own.
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Loader2, Sparkles, Check, ChevronRight, X, Mail } from 'lucide-react';
import { RD } from '@/lib/redesignTheme';
import { apiFetchLocal } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { trackFunnelEvent } from '@/lib/funnelTracking';
import { rememberReturnTo, GoogleSignupButton, LichessMark, startLichessSignup } from '@/components/QuickSignup';
import { FREE_REVIEW_KEY, FREE_REVIEW_REF_KEY, readFreeReview } from '@/pages/FreeReview';
import { inAppBrowser, appName, isAndroid, openInBrowserUrl } from '@/lib/inAppBrowser';

type Platform = 'chesscom' | 'lichess';
type Recent = { ref: string; white: string; black: string; whiteRating: number; blackRating: number; result: string; opening: string | null; playedAt: string; timeControl: string };

const card: React.CSSProperties = { background: RD.cardSolid, border: `1px solid ${RD.border}` };
const store = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export default function InstagramStart() {
  const { isAuthenticated, isAuthLoading } = useUser();
  const [, navigate] = useLocation();
  const q = useMemo(() => new URLSearchParams(window.location.search), []);
  const [platform, setPlatform] = useState<Platform>(() => (q.get('p') === 'lichess' ? 'lichess' : q.get('p') === 'chesscom' ? 'chesscom' : readFreeReview()?.platform ?? 'chesscom'));
  const [username, setUsername] = useState(() => q.get('u') ?? readFreeReview()?.username ?? '');
  const [shown, setShown] = useState<{ platform: Platform; username: string } | null>(null);
  const [games, setGames] = useState<Recent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Recent | null>(null);
  const iab = inAppBrowser();

  // Already a member (or just came back signed in): the review page takes it from here.
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return;
    const u = q.get('u'), g = q.get('g');
    if (u) store(FREE_REVIEW_KEY, { platform: q.get('p') === 'lichess' ? 'lichess' : 'chesscom', username: u });
    if (g) store(FREE_REVIEW_REF_KEY, g);
    navigate('/review', { replace: true });
  }, [isAuthLoading, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async (p: Platform, u: string) => {
    setLoading(true); setErr(null); setGames(null);
    try {
      // Answered by chessscout.net itself (the Worker), straight from Chess.com / Lichess
      const r = await apiFetchLocal(`/api/preview-games?platform=${p}&username=${encodeURIComponent(u)}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'Couldn’t load your games.');
      setShown({ platform: p, username: u }); setGames(d.games ?? []);
      // Came over from Instagram's browser with a game already chosen: straight to signing up
      const g = q.get('g'); const chosen = g ? (d.games as Recent[] | undefined)?.find((x) => x.ref === g) : undefined;
      if (chosen && !isAuthenticated) pick(chosen);
      store(FREE_REVIEW_KEY, { platform: p, username: u });
      trackFunnelEvent('ig_games_shown');
    } catch (e) { setErr(e instanceof Error && !/fetch|network|load failed/i.test(e.message) ? e.message : 'Couldn’t reach ChessScout. Check your connection and try again.'); } finally { setLoading(false); }
  };

  // Opened from the "continue in Chrome" link: pick up where they were.
  useEffect(() => {
    const u = q.get('u');
    if (u && /^[A-Za-z0-9_-]{2,40}$/.test(u)) void load(q.get('p') === 'lichess' ? 'lichess' : 'chesscom', u);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(u)) { setErr(`Enter your ${platform === 'lichess' ? 'Lichess' : 'Chess.com'} username.`); return; }
    void load(platform, u);
  };

  const pick = (g: Recent) => {
    setPicked(g);
    store(FREE_REVIEW_REF_KEY, g.ref);
    rememberReturnTo('/review');
    trackFunnelEvent('signup_clicked');
  };

  const me = shown?.username.toLowerCase();
  const record = games ? { w: games.filter((g) => g.result === 'win').length, l: games.filter((g) => g.result === 'loss').length, d: games.filter((g) => g.result !== 'win' && g.result !== 'loss').length } : null;
  const resultOf = (g: Recent) => (g.result === 'win' ? { t: 'Won', c: RD.green } : g.result === 'loss' ? { t: 'Lost', c: RD.red } : { t: 'Draw', c: RD.muted });
  const browserPath = shown ? `/instagram?p=${shown.platform}&u=${encodeURIComponent(shown.username)}${picked ? `&g=${encodeURIComponent(picked.ref)}` : ''}` : undefined;

  return (
    <div className="min-h-screen px-4 pb-16 pt-6" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto max-w-lg">
        <div className="mb-5 flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="" className="h-8 w-8" />
          <span className="text-[17px] font-black">Chess<span style={{ color: RD.green }}>Scout</span></span>
        </div>

        <h1 className="text-[30px] font-black leading-[1.1]">Review every game you play. <span style={{ color: RD.green }}>Free.</span></h1>
        <p className="mt-2 text-[15px] leading-relaxed" style={{ color: RD.muted }}>
          Your Chess.com and Lichess games, gone through move by move by an AI coach. Wins, losses and draws, no membership.
        </p>

        {!shown && (
          <form onSubmit={submit} className="mt-5 rounded-2xl p-4" style={card}>
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
            <button type="submit" disabled={loading} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-black disabled:opacity-70" style={{ background: RD.green, color: '#06110A' }}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Show my games
            </button>
            <p className="mt-2 text-center text-[12px]" style={{ color: RD.muted }}>No account needed to look. Nothing is posted anywhere.</p>
          </form>
        )}

        {shown && (
          <div className="mt-5 rounded-2xl p-4" style={card}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-extrabold">Your recent games</p>
              <button onClick={() => { setShown(null); setGames(null); }} className="text-[12.5px] font-bold underline" style={{ color: RD.muted }}>Change</button>
            </div>
            <p className="mb-3 text-[12.5px]" style={{ color: RD.muted }}>
              {shown.username} on {shown.platform === 'lichess' ? 'Lichess' : 'Chess.com'}
              {record && games!.length > 0 && <> · last {games!.length}: <b style={{ color: RD.green }}>{record.w}W</b> <b style={{ color: RD.red }}>{record.l}L</b> <b>{record.d}D</b></>}
            </p>
            {games && games.length === 0 && <p className="py-4 text-[13.5px]" style={{ color: RD.muted }}>No recent games found for this username.</p>}
            {games && games.length > 0 && (
              <>
                <p className="mb-2 text-[13px] font-bold" style={{ color: RD.gold }}>Tap a game to get it reviewed</p>
                <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${RD.border}` }}>
                  {games.map((g, i) => {
                    const white = g.white.toLowerCase() === me;
                    const opp = white ? g.black : g.white, oppR = white ? g.blackRating : g.whiteRating;
                    const r = resultOf(g);
                    return (
                      <button key={g.ref} onClick={() => pick(g)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.03]"
                        style={{ borderTop: i ? `1px solid ${RD.border}` : undefined }}>
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: white ? '#EDE6D6' : '#262A2B', border: '1px solid rgba(255,255,255,.3)' }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-extrabold">vs {opp}{oppR ? <span className="font-bold" style={{ color: RD.muted }}> ({oppR})</span> : null}</span>
                          <span className="block truncate text-[12px]" style={{ color: RD.muted }}>{g.opening ?? 'Game'} · {new Date(g.playedAt).toLocaleDateString()}</span>
                        </span>
                        <span className="text-[12.5px] font-black" style={{ color: r.c }}>{r.t}</span>
                        <ChevronRight className="h-4 w-4" style={{ color: RD.muted }} />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        <ul className="mt-5 space-y-2 text-[14px]">
          {['Your games come in on their own, every time you play', 'Every mistake explained, with the better move', 'Your openings and endgames, win rate by line'].map((t) => (
            <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: RD.green }} strokeWidth={3} />{t}</li>
          ))}
        </ul>

        {iab && isAndroid() && !picked && (
          <a href={openInBrowserUrl(browserPath)} onClick={() => trackFunnelEvent('inapp_open_browser')} className="mt-6 block text-center text-[12.5px] font-bold underline" style={{ color: RD.muted }}>
            Open in Chrome instead of {appName(iab)}
          </a>
        )}
      </div>

      {picked && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4" style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)' }} onClick={() => setPicked(null)} role="dialog" aria-modal="true">
          <div className="relative w-full max-w-sm rounded-t-[22px] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-[22px]" style={{ background: '#0D1516', border: '1px solid rgba(255,255,255,.08)' }} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setPicked(null)} aria-label="Close" className="absolute right-4 top-4 p-1" style={{ color: RD.muted }}><X size={18} /></button>
            <p className="pr-6 text-[19px] font-black leading-tight">Save your games and get this one reviewed</p>
            <p className="mt-1 text-[13px]" style={{ color: RD.muted }}>Free account, no card. The review starts as soon as you're in.</p>
            {shown?.platform === 'lichess' && (
              <button type="button" onClick={startLichessSignup} className="mt-5 flex w-full items-center justify-center gap-3 rounded-[14px] py-3.5 text-[15px] font-extrabold"
                style={{ background: '#262421', color: '#FFFFFF', border: '1px solid rgba(255,255,255,.14)' }}><LichessMark /> Continue with Lichess</button>
            )}
            <GoogleSignupButton className={shown?.platform === 'lichess' ? 'mt-3' : 'mt-5'} path={browserPath} />
            {shown?.platform !== 'lichess' && (
              <button type="button" onClick={startLichessSignup} className="mt-3 flex w-full items-center justify-center gap-3 rounded-[14px] py-3.5 text-[15px] font-extrabold"
                style={{ background: '#262421', color: '#FFFFFF', border: '1px solid rgba(255,255,255,.14)' }}><LichessMark /> Continue with Lichess</button>
            )}
            <a href={`${import.meta.env.BASE_URL}setup?signup=email`} className="mt-3 flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-[13.5px] font-bold"
              style={{ background: 'rgba(255,255,255,.06)', color: RD.text, border: '1px solid rgba(255,255,255,.10)' }}><Mail size={15} /> Use email instead</a>
          </div>
        </div>
      )}
    </div>
  );
}
