import { trackPlay, newPlaySearch } from '@/lib/playFunnel';
import { ScoutIcon } from '@/components/ScoutIcons';
import { useGameBusy } from '@/lib/gameBusy';
import { useBoardSetupMoment } from '@/lib/setupMoment';
import React, { useEffect, useRef, useState } from 'react';
import { announceChallengeSent } from '@/lib/challengeSent';
import { useLivePlay, type LiveMode } from '@/hooks/use-live-play';
import { useLiveRatings } from '@/hooks/use-live-ratings';
import { LiveGame } from '@/pages/LiveGame';
import { Link, useLocation } from 'wouter';
import { lichessAuth, connectLichess, syncLichessAuth, seek as lichessSeek, streamEvents, isDaily, abort as abortLichess, alsoSeekDailyOnLichess, dailyPair, clearDailyPair, cancelDailySeek } from '@/lib/lichessBoard';
import { Loader2, Swords, Zap, Clock, X, History, ChevronRight, Users, CalendarDays, Bot } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { ShareLink } from '@/components/play/ShareLink';
import { NotifyPrompt } from '@/components/play/NotifyPrompt';
import { LivePulse } from '@/components/play/LivePulse';
import { SeekGoneCard, SeekJoiningCard, takeSeekParams, type SeekInfo } from '@/components/play/SeekGoneCard';
import { TournamentsCard } from '@/components/play/Tournaments';
import { DailyGames } from '@/pages/DailyGames';
import { useSocialUnread } from '@/lib/social';
import { useChallengeInbox, ChallengesPanel, OpenLinksCard, createOpenLink } from '@/components/play/OpenChallenges';

const TC_OPTIONS = [
  { id: 'bullet_1_0', label: '1 min', sub: 'Bullet', icon: Zap },
  { id: 'bullet_2_1', label: '2 | 1', sub: 'Bullet', icon: Zap },
  { id: 'blitz_3_0', label: '3 min', sub: 'Blitz', icon: Zap },
  { id: 'blitz_3_2', label: '3 | 2', sub: 'Blitz', icon: Zap },
  { id: 'blitz_5_0', label: '5 min', sub: 'Blitz', icon: Zap },
  { id: 'blitz_5_3', label: '5 | 3', sub: 'Blitz', icon: Zap },
  { id: 'rapid_10_0', label: '10 min', sub: 'Rapid', icon: Clock },
  { id: 'rapid_10_5', label: '10 | 5', sub: 'Rapid', icon: Clock },
  { id: 'rapid_15_0', label: '15 min', sub: 'Rapid', icon: Clock },
  { id: 'rapid_15_10', label: '15 | 10', sub: 'Rapid', icon: Clock },
  { id: 'classical_30_0', label: '30 min', sub: 'Classical', icon: Clock },
  { id: 'classical_30_20', label: '30 | 20', sub: 'Classical', icon: Clock },
];
const DAILY_OPTIONS = [
  { id: 'corr_1d', label: '1 day' }, { id: 'corr_3d', label: '3 days' }, { id: 'corr_7d', label: '7 days' },
];

type Hosted = { code: string; url: string; label: string };

// Nobody on ChessScout: the clocks Lichess lets apps play (10 minutes and up), and
// how long to look here first before handing over to a real Lichess game.
// (Lichess lets outside apps play 10 minutes and up; these match its quick-pairing pools, except 15+0)
const LICHESS_CLOCK: Record<string, string> = { rapid_10_0: '10+0', rapid_10_5: '10+5', rapid_15_0: '15+0', rapid_15_10: '15+10', classical_30_0: '30+0', classical_30_20: '30+20', any: '10+0' };
// With Lichess connected (10 and 15 min only: Lichess doesn't allow outside apps to play blitz) the
// app searches ChessScout and Lichess together from the start; a bot comes only after 90 s.
// Without Lichess, a bot comes after 30 s (45 s when other ChessScout players are on Play).

type OnlineTab = 'live' | 'daily';
const readTab = (): OnlineTab | null => {
  try { const t = new URLSearchParams(window.location.search).get('tab'); return t === 'daily' || t === 'live' ? t : null; } catch { return null; }
};

/** Play Online: live and daily games on one screen (the clocks run from 5 minutes to 7 days a move). */
export function LivePlay({ initialTab }: { initialTab?: OnlineTab } = {}) {
  // Live and daily are one screen now; /daily (and ?tab=daily) scroll to your daily games.
  const tab: OnlineTab = 'live';
  const dailyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if ((readTab() ?? initialTab) === 'daily') setTimeout(() => dailyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 600); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const live = useLivePlay();
  // A new release may load in the lobby or after a game, never during one.
  useGameBusy(!!live.game && (live.game.status === 'active' || live.status === 'in_game'));
  const [, navigate] = useLocation();
  const [lichess, setLichess] = useState(lichessAuth);
  useEffect(() => {
    const f = () => { setLichess(lichessAuth()); void syncLichessAuth().then((a) => { if (a) setLichess(a); }); };
    const v = () => { if (document.visibilityState === 'visible') f(); };
    f();
    window.addEventListener('focus', f); document.addEventListener('visibilitychange', v);
    return () => { window.removeEventListener('focus', f); document.removeEventListener('visibilitychange', v); };
  }, []);
  // Start looking here; with Lichess connected (and a clock it allows) the server holds its bot back.
  const queueFor = (tc: string, m: LiveMode) => live.enterQueue(tc, m, { noAutoBot: !!lichessAuth() && !!LICHESS_CLOCK[tc] });
  // /live?play=CLOCK&mode=casual|ranked (e.g. "New game" after a Lichess game): start searching straight away.
  const autoPlay = useRef<{ tc: string; mode: LiveMode } | null>((() => {
    try {
      const q = new URLSearchParams(window.location.search); const tc = q.get('play');
      return tc && /^(blitz|rapid)_\d+_\d+$|^any$/.test(tc) ? { tc, mode: q.get('mode') === 'ranked' ? 'ranked' : 'casual' } : null;
    } catch { return null; }
  })());
  useEffect(() => {
    if (!autoPlay.current || live.status !== 'idle') return;
    const a = autoPlay.current; autoPlay.current = null;
    try { const u = new URL(window.location.href); u.searchParams.delete('play'); u.searchParams.delete('mode'); window.history.replaceState(null, '', u.pathname + u.search); } catch { /* ignore */ }
    setMode(a.mode); queueFor(a.tc, a.mode);
  }, [live.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: ratingsData, refetch } = useLiveRatings();
  const dailyRating = ratingsData?.ratings?.daily;
  const [mode, setMode] = useState<LiveMode>('casual');
  const [friendTc, setFriendTc] = useState('blitz_5_0');
  const friendDaily = friendTc.startsWith('corr_');
  const [dailyLink, setDailyLink] = useState<string | null>(null);
  // Daily games, started from the same clocks.
  const [dailyBusy, setDailyBusy] = useState(false);
  const [dailyNote, setDailyNote] = useState<string | null>(null);
  // The daily search just started from here, so a mistaken tap is one tap to undo.
  const [dailyStarted, setDailyStarted] = useState<{ tc: string; mode: LiveMode } | null>(null);
  const undoDaily = async () => {
    const d = dailyStarted; if (!d) return;
    setDailyStarted(null); setDailyNote(null);
    const p = dailyPair(); if (p && p.tc === d.tc) { clearDailyPair(); if (p.seekId) void cancelDailySeek(p.seekId); }
    await apiFetch('/api/correspondence/cancel-queue', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeControl: d.tc, mode: d.mode }) }).catch(() => {});
    window.dispatchEvent(new Event('cs:daily-update'));
  };
  const startDaily = async (tc: string) => {
    setDailyBusy(true); setDailyNote(null);
    try {
      const r = await apiFetch('/api/correspondence/create', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeControl: tc, mode }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not start a daily game');
      if (d.status === 'matched' && d.game) { navigate(`/daily/${d.game.id}`); return; }
      // Nobody waiting here: look on Lichess at the same time (whichever is quicker).
      await alsoSeekDailyOnLichess(tc, mode);
      setDailyStarted({ tc, mode });
      setDailyNote(`Looking for an opponent (${DAILY_OPTIONS.find((o) => o.id === tc)?.label} a move). We'll notify you when the game starts.`);
      window.dispatchEvent(new Event('cs:daily-update'));
    } catch (e) { setDailyNote(`!${e instanceof Error ? e.message : 'Could not start a daily game'}`); }
    finally { setDailyBusy(false); }
  };
  const [friendColor, setFriendColor] = useState<'random' | 'white' | 'black'>('random');
  const [hosted, setHosted] = useState<Hosted | null>(null);
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(Date.now());
  const inbox = useChallengeInbox();
  const social = useSocialUnread();
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [friendOpen, setFriendOpen] = useState(false);

  useEffect(() => { if (live.status === 'finished') void refetch(); }, [live.status, refetch]);
  // The live-play path for the admin Lichess report
  const prevStatus = useRef(live.status);
  useEffect(() => {
    const was = prevStatus.current; prevStatus.current = live.status;
    if (live.status === 'queued' && was !== 'queued') { newPlaySearch(); trackPlay('queued'); }
    if (live.status === 'in_game' && was === 'queued') trackPlay('matched_here');
  }, [live.status]);
  useEffect(() => { if (live.status === 'in_game') setHosted(null); }, [live.status]);
  useEffect(() => {
    if (live.status !== 'queued') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live.status]);
  const lichessClock = live.queuedTc ? LICHESS_CLOCK[live.queuedTc] : undefined;
  // Nobody here after a few seconds: search Lichess too, from this same screen (no extra
  // screen in between). The ChessScout search keeps going; whichever finds a game first wins,
  // and a Lichess game opens straight on the board.
  const handedOff = useRef(false);
  const liSearch = useRef<AbortController | null>(null);
  const [liSearching, setLiSearching] = useState(false);
  // Rated on Lichess joins its quick-pairing pool (games in seconds); casual waits in the open
  // lobby, where few people take 10-minute casual games. Each member picks; rated by default.
  const [liRated, setLiRated] = useState<boolean>(() => { try { return localStorage.getItem('cs_lichess_rated') !== '0'; } catch { return true; } });
  const pickLiRated = (v: boolean) => {
    try { localStorage.setItem('cs_lichess_rated', v ? '1' : '0'); } catch { /* */ }
    liSearch.current?.abort(); liSearch.current = null; setLiSearching(false); handedOff.current = false;
    setLiRated(v);
  };
  const statusRef = useRef(live.status); statusRef.current = live.status;
  const stopLichessSearch = () => { liSearch.current?.abort(); liSearch.current = null; setLiSearching(false); };
  const waitedSoFar = live.queuedAt ? now - live.queuedAt : 0;
  useEffect(() => {
    if (live.status !== 'queued') { handedOff.current = false; stopLichessSearch(); return; }
    // Lichess is searched from the start, alongside ChessScout (a ChessScout match cancels it)
    if (handedOff.current || !lichess || !lichessClock) return;
    handedOff.current = true;
    trackPlay('lichess_search');
    const ac = new AbortController(); liSearch.current = ac; setLiSearching(true);
    const [m, inc] = lichessClock.split('+').map(Number);
    // A game starting on Lichess: open it (unless ChessScout found someone in the same instant).
    void streamEvents((e) => {
      if (e.type !== 'gameStart' || isDaily(e.game)) return;
      if (statusRef.current !== 'queued') { void abortLichess(e.game.gameId); return; }
      ac.abort(); live.cancel();
      trackPlay('lichess_game');
      live.noteOnLichess();
      navigate(`/lichess?game=${e.game.gameId}&from=live`);
    }, ac.signal).catch(() => {});
    void lichessSeek({ minutes: m, increment: inc, rated: liRated || live.queuedMode === 'ranked' }, ac.signal)
      .then((code) => { if (!ac.signal.aborted && code >= 400) setLiSearching(false); })
      .catch(() => { if (!ac.signal.aborted) setLiSearching(false); });
  }, [live.status, waitedSoFar, lichess, lichessClock, liRated]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => liSearch.current?.abort(), []);

  // /live?seek=USER -- tapped "<name> is looking for a game".
  const [seek, setSeek] = useState<SeekInfo | null>(null);
  useEffect(() => {
    if (tab !== 'live') return;
    const s = takeSeekParams();
    if (s) { setSeek(s); live.joinSeek(s.seekerId); }
  }, [live.joinSeek, tab]);
  const closeSeek = () => { setSeek(null); live.clearSeekGone(); };

  // /live?challenge=CODE -- coming from a friend's challenge link.
  const acceptedRef = useRef(false);
  useEffect(() => {
    if (acceptedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('challenge');
    const approve = params.get('approve');
    if (approve) {
      // Accepting a request someone sent through your open link.
      acceptedRef.current = true;
      live.approveRequest(approve);
      try { window.history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ }
    } else if (code) {
      acceptedRef.current = true;
      live.acceptChallenge(code);
      // so a refresh after the game doesn't try to accept it again
      try { window.history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ }
    }
  }, [live]);

  // (all hooks stay above the early returns below: a game starting must not change how many run)
  const waitedMs = live.queuedAt ? now - live.queuedAt : 0;
  const showBotOffer = live.status === 'queued' && waitedMs >= live.botOfferMs;
  useEffect(() => { if (showBotOffer) trackPlay('bot_offer_shown'); }, [showBotOffer]);
  const showConnect = live.status === 'queued' && !lichess && !!lichessClock;
  useEffect(() => { if (showConnect) trackPlay('connect_shown'); }, [showConnect]);
  useEffect(() => { if (live.status === 'queued' && waitedMs >= live.handoffMs) trackPlay('nobody_here'); }, [live.status, waitedMs >= live.handoffMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the game on screen through a reconnect (status can briefly read
  // connecting/disconnected/idle while the socket comes back).
  useBoardSetupMoment(live.status === 'idle' && !live.game);
  if (live.game && !live.minimized && (live.status === 'in_game' || live.status === 'finished' || live.game.status === 'active')) {
    return (
      <>
        {live.switchOffer && (
          <div className="fixed inset-x-0 top-0 z-[130] flex justify-center p-3 pt-[max(.75rem,env(safe-area-inset-top))]" role="dialog" aria-label="A real player wants to play you">
            <div className="w-full max-w-md rounded-2xl p-4" style={{ background: '#0D1516', border: '1px solid rgba(129,182,76,.6)', boxShadow: '0 18px 40px -12px rgba(0,0,0,.85)' }}>
              <p className="text-[15px] font-black" style={{ color: '#F5F7F6' }}>{live.switchOffer} wants to play you</p>
              <p className="mt-0.5 text-[12.5px]" style={{ color: '#87918E' }}>A real person wants to play you! Your bot game is saved, position and clocks, so you can finish it later from your active games.</p>
              <div className="mt-3 flex gap-2">
                <button onClick={live.acceptSwitch} className="flex-1 rounded-xl py-2.5 text-[14px] font-extrabold" style={greenBtn}>Save and play {live.switchOffer}</button>
                <button onClick={live.declineSwitch} className="rounded-xl px-4 py-2.5 text-[13.5px] font-bold" style={ghostBtn}>Keep playing</button>
              </div>
            </div>
          </div>
        )}
        <LiveGame live={live} onLeave={() => live.reset()} />
      </>
    );
  }
  // Backed out to the lobby mid-game: the game carries on, one tap returns.
  const g = live.game;
  const resumeCard = live.minimized && g && g.status === 'active' && live.color ? (() => {
    const opp = live.color === 'w' ? g.black : g.white;
    const yours = g.turn === live.color;
    return (
      <button onClick={live.restore} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left"
        style={{ background: 'rgba(229,72,77,0.14)', border: '1px solid rgba(229,72,77,0.55)' }}>
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full" style={{ background: '#E5484D' }} />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[15px] font-extrabold" style={{ color: '#F5F7F6' }}>Game in progress vs {opp.username}</b>
          <span className="block text-[12.5px]" style={{ color: yours ? '#F2B8BA' : 'rgba(245,247,246,.7)' }}>{yours ? 'Your move — your clock is running' : `${g.timeControl.label} · their move`}</span>
        </span>
        <span className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-extrabold" style={{ background: '#F5F7F6', color: '#0B1213' }}>Back to game</span>
      </button>
    );
  })() : null;

  const createChallenge = async () => {
    setCreating(true);
    try {
      const r = await apiFetch('/api/challenges', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: friendDaily ? 'daily' : 'live', timeControl: friendTc, mode, color: friendColor }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not create the link');
      // Daily: just a link to send (the game starts when they accept); live: wait here for them.
      if (friendDaily) { setDailyLink(`${window.location.origin}/challenge/${d.challenge.code}`); announceChallengeSent(); return; }
      setHosted({ code: d.challenge.code, url: `${window.location.origin}/challenge/${d.challenge.code}`, label: d.challenge.timeControlLabel });
      announceChallengeSent();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not create the link');
    } finally { setCreating(false); }
  };
  const makeOpenLink = async () => {
    setCreatingOpen(true);
    try { await createOpenLink(friendDaily ? 'daily' : 'live', friendTc, mode, friendColor); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not create the link'); }
    finally { setCreatingOpen(false); }
  };
  const cancelHosted = async () => {
    if (hosted) await apiFetch(`/api/challenges/${hosted.code}/cancel`, { method: 'POST', credentials: 'include' }).catch(() => {});
    setHosted(null);
  };

  const queuedLabel = live.queuedTc === 'any' ? 'Any clock' : TC_OPTIONS.find(t => t.id === live.queuedTc)?.label;

  return (
    <div className="mx-auto max-w-[760px] space-y-4 p-4 md:p-0 pb-24">
      {resumeCard}
      {!live.game && live.notice && <p className="rounded-xl px-4 py-3 text-[13px] font-semibold" style={{ background: '#121B1D', border: '1px solid rgba(255,255,255,.08)', color: '#F5F7F6' }}>{live.notice}</p>}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-black" style={{ color: PT.text, letterSpacing: '-0.02em' }}>Play Online</h1>
          <p className="text-[13px]" style={{ color: PT.muted }}>Real opponents, live or at your own pace.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/friends" className="relative grid h-10 w-10 place-items-center rounded-full" style={ghostBtn}
            aria-label={social.total ? `Friends, ${social.total} new` : 'Friends'} title="Friends">
            <Users size={18} />
            {social.total > 0 && (
              <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-black" style={{ background: '#FF5058', color: '#fff' }}>
                {social.total > 9 ? '9+' : social.total}
              </span>
            )}
          </Link>
          <Link href="/live/history" className="grid h-10 w-10 place-items-center rounded-full" style={ghostBtn} aria-label="Game history" title="History">
            <History size={18} />
          </Link>
        </div>
      </div>

      {live.status !== 'queued' && (
        <div className="flex gap-2">
          <Link href="/lichess" className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2.5 py-2 text-[12.5px] font-extrabold" style={ghostBtn}>
            <span className="text-[15px] leading-none">♞</span><span className="truncate">{lichess ? `Lichess · ${lichess.username}` : 'Play on Lichess'}</span>
          </Link>
          <Link href="/watch" className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2.5 py-2 text-[12.5px] font-extrabold" style={ghostBtn}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: '#FF5058' }} /><span className="truncate">Watch top events</span>
          </Link>
        </div>
      )}
      {seek && tab === 'live' && (live.seekGone === seek.seekerId
        ? <SeekGoneCard seek={seek} kind="live" reason={live.seekGoneReason} onClose={closeSeek} onPlayNow={() => { closeSeek(); queueFor('any', mode); }} />
        : live.status !== 'queued' && <SeekJoiningCard seek={seek} waiting={live.seekWaiting} />)}

      {live.status === 'queued' ? (
        <div className="space-y-3">
          <div className="p-6 text-center space-y-4" style={cardStyle}>
            <Loader2 className="w-10 h-10 mx-auto animate-spin" style={{ color: PT.green }} />
            <div>
              <p className="text-lg font-black" style={{ color: PT.text }}>Searching for an opponent…</p>
              <p className="text-sm mt-1" style={{ color: PT.muted }}>
                {queuedLabel} · {live.queuedMode === 'ranked' ? 'Ranked' : 'Casual'} · {Math.floor(waitedMs / 1000)}s
              </p>
              <p className="text-[12px] mt-1" style={{ color: PT.muted }}>
                {liSearching ? 'Searching ChessScout and Lichess. Your game opens the moment someone is found.' : lichess && !lichessClock ? "Lichess doesn't allow blitz from other apps, so this searches ChessScout only." : "We've let players with notifications on know you're looking."}
              </p>
              {lichess && lichessClock && live.queuedMode !== 'ranked' && (
                <div className="mx-auto mt-3 inline-grid grid-cols-2 gap-1 rounded-[12px] p-1 text-[12px] font-bold" style={{ background: 'rgba(255,255,255,.06)' }}>
                  <button onClick={() => pickLiRated(true)} className="rounded-[9px] px-3 py-1.5" style={liRated ? { background: PT.green, color: '#fff' } : { color: PT.muted }}>Rated on Lichess · fastest</button>
                  <button onClick={() => pickLiRated(false)} className="rounded-[9px] px-3 py-1.5" style={!liRated ? { background: PT.green, color: '#fff' } : { color: PT.muted }}>Casual · slower</button>
                </div>
              )}
            </div>
            <button onClick={() => { trackPlay('cancelled'); live.cancel(); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm" style={ghostBtn}>
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
          {!lichess && lichessClock && (
            <div className="flex items-center gap-3 p-4" style={cardStyle}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: '#81B64C', color: '#FFFFFF' }}><Zap size={22} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-extrabold" style={{ color: PT.text }}>Get a real opponent in seconds</p>
                <p className="text-[12.5px]" style={{ color: PT.muted }}>Connect Lichess and, whenever nobody's free here, we'll match you with a Lichess player right on this board.</p>
              </div>
              <button onClick={() => { trackPlay('connect_clicked'); live.cancel(); void connectLichess(`/lichess?seek=${encodeURIComponent(lichessClock)}&rated=${live.queuedMode === 'ranked' ? 1 : 0}&from=live`); }} className="shrink-0 rounded-xl px-3.5 py-2.5 text-[13px] font-extrabold" style={greenBtn}>Connect Lichess</button>
            </div>
          )}
          {showBotOffer && live.queuedTc && (
            <div className="flex items-center gap-3 p-4" style={cardStyle}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: '#81B64C', color: '#FFFFFF' }}><Bot size={22} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-extrabold" style={{ color: PT.text }}>No one's free in your range right now</p>
                <p className="text-[12.5px]" style={{ color: PT.muted }}>Play a ChessScout bot at your level instead. It's labeled as a bot and the game is casual (no rating change). Or keep searching.</p>
              </div>
              <button onClick={() => { trackPlay('bot_chosen'); live.playBot(live.queuedTc!); }} className="shrink-0 rounded-xl px-3.5 py-2.5 text-[13px] font-extrabold" style={greenBtn}>Play bot</button>
            </div>
          )}
        </div>
      ) : live.status === 'challenge_waiting' ? (
        <div className="p-6 text-center space-y-4" style={cardStyle}>
          <Loader2 className="w-10 h-10 mx-auto animate-spin" style={{ color: PT.green }} />
          <div>
            <p className="text-lg font-black" style={{ color: PT.text }}>
              {live.waitingKind === 'request' ? `Waiting for ${live.waitingFor} to accept…` : `Waiting for ${live.waitingFor}…`}
            </p>
            <p className="text-sm mt-1" style={{ color: PT.muted }}>
              {live.waitingKind === 'request'
                ? "Your challenge request was sent. The game starts the moment they accept. Keep this screen open."
                : live.waitingKind === 'approving'
                  ? "You accepted their challenge. We've told them; the game starts as soon as they're back on Live play. Keep this screen open."
                  : "You accepted their challenge. We've sent them a notification; the game starts as soon as they open ChessScout. Keep this screen open."}
            </p>
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
          <ChallengesPanel inbox={inbox} onAcceptLive={(code) => live.approveRequest(code)} />

          {/* Casual | Ranked, for every clock below */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px]" style={{ color: PT.muted }}>{mode === 'casual' ? 'Casual: no rating change' : 'Ranked: your rating for that clock moves'}</p>
            <div className="inline-flex shrink-0 rounded-[12px] p-1" style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${PT.border}` }}>
              {(['casual', 'ranked'] as LiveMode[]).map(m => (
                <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                  className="rounded-[9px] px-2.5 py-1.5 text-[12px] font-extrabold capitalize"
                  style={mode === m ? greenBtn : { color: PT.muted }}>{m}</button>
              ))}
            </div>
          </div>

          <>
          {/* Quick play: one tap to play anyone, or pick a clock. */}
          <section className="space-y-2.5 p-3" style={cardStyle}>
            <LivePulse />
            {/* Play anyone: one pool across every clock, so you're matched as fast as possible. */}
            <button
              disabled={false}
              onClick={() => queueFor('any', mode)}
              className="flex w-full items-center gap-2.5 rounded-[12px] px-3.5 py-3 text-left transition-transform active:scale-[0.99] disabled:opacity-50"
              style={{ background: 'linear-gradient(180deg, #8FC25A, #81B64C)', boxShadow: '0 2px 0 #5F8F36', color: '#FFFFFF' }}>
              <Swords className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1">
                <b className="block text-[16px] font-black leading-tight">Play anyone</b>
                <span className="block text-[11.5px] font-semibold opacity-90">Fastest match · any clock, 5 to 15 min · {mode}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0" />
            </button>
            <div className="grid grid-cols-4 gap-1.5">
              {TC_OPTIONS.map(opt => {
                const r = ratingsData?.ratings[opt.id];
                return (
                  <button key={opt.id}
                    disabled={false}
                    onClick={() => queueFor(opt.id, mode)}
                    className="rounded-[10px] px-1 py-2 text-center transition-transform active:scale-[0.97] disabled:opacity-50"
                    style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${PT.border}` }}>
                    <b className="block text-[14.5px] font-black leading-tight" style={{ color: PT.text }}>{opt.label}</b>
                    <span className="block text-[10.5px] font-semibold" style={{ color: PT.muted }}>{r && r.gamesPlayed > 0 ? `${r.rating}${r.isProvisional ? '?' : ''}` : opt.sub}</span>
                  </button>
                );
              })}
            </div>
            {/* Daily: one move a day (or 3, or 7); we notify you when it's your turn. */}
            <p className="pt-1 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>Daily games · days per move</p>
            <div className="grid grid-cols-3 gap-1.5">
              {DAILY_OPTIONS.map(opt => (
                <button key={opt.id} disabled={dailyBusy} onClick={() => void startDaily(opt.id)}
                  className="rounded-[10px] px-1 py-2 text-center transition-transform active:scale-[0.97] disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${PT.border}` }}>
                  <b className="block text-[14.5px] font-black leading-tight" style={{ color: PT.text }}>{opt.label}</b>
                  <span className="block text-[10.5px] font-semibold" style={{ color: PT.muted }}>a move{dailyRating && dailyRating.gamesPlayed > 0 ? ` · ${dailyRating.rating}${dailyRating.isProvisional ? '?' : ''}` : ''}</span>
                </button>
              ))}
            </div>
            {dailyNote && (
              <p className="text-[12px]" style={{ color: dailyNote.startsWith('!') ? PT.red : PT.green }}>
                {dailyNote.replace(/^!/, '')}
                {dailyStarted && !dailyNote.startsWith('!') && <> <button onClick={() => void undoDaily()} className="font-extrabold underline" style={{ color: PT.text }}>Cancel this search</button></>}
              </p>
            )}
          </section>

          {/* Not connected to Lichess: real opponents instead of a bot when nobody's free here. */}
          {!lichess && (
            <section className="flex items-center gap-3 p-3.5" style={cardStyle}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[22px] leading-none" style={{ background: '#262421', color: '#FFFFFF' }} aria-hidden="true">♞</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-extrabold" style={{ color: PT.text }}>Real opponents, any time</p>
                <p className="text-[12px] leading-snug" style={{ color: PT.muted }}>
                  Connect Lichess and, when nobody's free here, you're paired with a real Lichess player on this board (10 and 15 min) instead of a bot.{' '}
                  No account? <a href="https://lichess.org/signup" target="_blank" rel="noopener noreferrer" className="font-bold underline" style={{ color: PT.text }}>Make one free</a>, then connect.
                </p>
              </div>
              <button onClick={() => { trackPlay('connect_clicked'); void connectLichess('/live'); }} className="shrink-0 rounded-xl px-3 py-2.5 text-[12.5px] font-extrabold" style={greenBtn}>Connect</button>
            </section>
          )}

          {/* Play a friend: closed until you want it. */}
          <section className="overflow-hidden" style={cardStyle}>
            <button onClick={() => setFriendOpen(o => !o)} aria-expanded={friendOpen} className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left">
              <ScoutIcon name="friends" size={28} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <b className="block text-[14px] font-extrabold" style={{ color: PT.text }}>Play a friend</b>
                <span className="block truncate text-[11.5px]" style={{ color: PT.muted }}>Send a link, or challenge a friend from Friends</span>
              </span>
              <ChevronRight size={18} style={{ color: PT.muted, transform: friendOpen ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} />
            </button>
            {friendOpen && (
              <div className="space-y-3 px-4 pb-4" style={{ borderTop: `1px solid ${PT.border}` }}>
                <div className="pt-3">
                  <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>Clock</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[...TC_OPTIONS, ...DAILY_OPTIONS.map((d) => ({ ...d, label: `${d.label} a move` }))].map(o => (
                      <button key={o.id} onClick={() => setFriendTc(o.id)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold"
                        style={friendTc === o.id ? greenBtn : ghostBtn}>{o.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>Your colour</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['random', 'white', 'black'] as const).map(c => (
                      <button key={c} onClick={() => setFriendColor(c)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold capitalize"
                        style={friendColor === c ? greenBtn : ghostBtn}>{c === 'random' ? 'Random' : c}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={createChallenge} disabled={creating} className="rounded-xl py-3 text-[13.5px] font-extrabold disabled:opacity-60" style={greenBtn}>
                    {creating ? 'Creating…' : 'Link for one friend'}
                  </button>
                  <button onClick={makeOpenLink} disabled={creatingOpen} className="rounded-xl py-3 text-[13.5px] font-extrabold disabled:opacity-60" style={ghostBtn}>
                    {creatingOpen ? 'Creating…' : 'Open link'}
                  </button>
                </div>
                {dailyLink && friendDaily && (
                  <div className="space-y-2 rounded-xl p-3" style={{ background: 'rgba(0,0,0,.2)' }}>
                    <p className="text-[12.5px]" style={{ color: PT.text }}>Send this link. The daily game starts as soon as your friend accepts; we'll notify you.</p>
                    <ShareLink url={dailyLink} text="Play a daily game with me on ChessScout" />
                  </div>
                )}
                <p className="text-[11.5px]" style={{ color: PT.muted }}>
                  {mode === 'ranked' ? 'Ranked' : 'Casual'} game. <b style={{ color: PT.text }}>Open link:</b> post it anywhere; anyone can challenge you and you choose who to play.
                </p>
              </div>
            )}
          </section>
          <OpenLinksCard links={inbox.links} kind="live" onChanged={() => { void inbox.reload(); }} />
          <OpenLinksCard links={inbox.links} kind="daily" onChanged={() => { void inbox.reload(); }} />
          <PausedBotGames onResume={live.resumePaused} busy={!!live.game} />
          <div ref={dailyRef} className="space-y-3 empty:hidden"><DailyGames embedded listOnly /></div>

          <TournamentsCard />
          </>
        </>
      )}

      {live.error && (
        <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'rgba(220,67,67,0.25)', color: PT.text, border: '1px solid rgba(220,67,67,0.5)' }}>
          {live.error}
        </div>
      )}
      {live.status === 'connecting' && <p className="text-xs" style={{ color: PT.muted }}>Connecting…</p>}
      {live.status === 'disconnected' && <p className="text-xs" style={{ color: '#ea9733' }}>Reconnecting…</p>}

    </div>
  );
}

// Bot games put aside when a real player wanted a game: saved with both clocks, finished here.
type PausedGame = { id: string; opponent: string; opponentRating: number; color: 'w' | 'b'; label: string; moves: number; yourMove: boolean; yourTimeMs: number; theirTimeMs: number };
function PausedBotGames({ onResume, busy }: { onResume: (id: string) => void; busy: boolean }) {
  const [list, setList] = useState<PausedGame[]>([]);
  useEffect(() => {
    if (busy) return;
    let alive = true;
    apiFetch('/api/live/paused', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d?.games) setList(d.games); }).catch(() => {});
    return () => { alive = false; };
  }, [busy]);
  if (!list.length) return null;
  const clock = (ms: number) => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  return (
    <section className="overflow-hidden rounded-[20px]" style={{ background: '#151D1F', border: '1px solid rgba(255,255,255,.07)' }}>
      <p className="px-4 pb-2 pt-3.5 text-[13px] font-extrabold uppercase tracking-wide" style={{ color: '#8F9997' }}>Paused bot games · {list.length}</p>
      {list.map((g) => (
        <div key={g.id} className="flex items-center gap-3 border-t px-4 py-3" style={{ borderColor: 'rgba(255,255,255,.06)' }}>
          <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: g.color === 'w' ? '#F5F7F6' : '#1A1F20', border: '1.5px solid #8F9997' }} />
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[15px] font-extrabold" style={{ color: '#F5F7F6' }}>vs {g.opponent} <span className="text-[12px] font-bold" style={{ color: '#8F9997' }}>(bot)</span></b>
            <span className="block truncate text-[12.5px]" style={{ color: '#8F9997' }}>{g.label} · move {Math.max(1, g.moves)} · {g.yourMove ? 'your move' : 'their move'} · you {clock(g.yourTimeMs)}, them {clock(g.theirTimeMs)}</span>
          </span>
          <button onClick={() => onResume(g.id)} disabled={busy} className="shrink-0 rounded-[11px] px-3.5 py-2 text-[13px] font-extrabold text-white disabled:opacity-40" style={{ background: '#81B64C' }}>Resume</button>
        </div>
      ))}
    </section>
  );
}
