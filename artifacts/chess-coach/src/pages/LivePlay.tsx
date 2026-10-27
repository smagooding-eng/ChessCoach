import React, { useEffect, useRef, useState } from 'react';
import { announceChallengeSent } from '@/lib/challengeSent';
import { useLivePlay, type LiveMode } from '@/hooks/use-live-play';
import { useLiveRatings } from '@/hooks/use-live-ratings';
import { LiveGame } from '@/pages/LiveGame';
import { Link } from 'wouter';
import { Loader2, Swords, Zap, Clock, X, Trophy, Sparkles, Award, History, ChevronRight, Users, CalendarDays, Bot } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { ShareLink } from '@/components/play/ShareLink';
import { NotifyPrompt } from '@/components/play/NotifyPrompt';
import { TournamentsCard } from '@/components/play/Tournaments';
import { DailyGames } from '@/pages/DailyGames';
import { useSocialUnread } from '@/lib/social';
import { useChallengeInbox, ChallengeRequestsCard, ChallengeInvitesCard, SentRequestsCard, OpenLinksCard, createOpenLink } from '@/components/play/OpenChallenges';

const TC_OPTIONS = [
  { id: 'blitz_5_0',  label: '5 min',  sub: 'Blitz', icon: Zap },
  { id: 'blitz_5_3',  label: '5 | 3',  sub: 'Blitz', icon: Zap },
  { id: 'rapid_10_0', label: '10 min', sub: 'Rapid', icon: Clock },
  { id: 'rapid_15_0', label: '15 min', sub: 'Rapid', icon: Clock },
];

type Hosted = { code: string; url: string; label: string };

type OnlineTab = 'live' | 'daily';
const readTab = (): OnlineTab | null => {
  try { const t = new URLSearchParams(window.location.search).get('tab'); return t === 'daily' || t === 'live' ? t : null; } catch { return null; }
};

/** Play Online: live games and daily games in one place (tabs). /daily opens the Daily tab. */
export function LivePlay({ initialTab }: { initialTab?: OnlineTab } = {}) {
  const [tab, setTabState] = useState<OnlineTab>(() => readTab() ?? initialTab ?? 'live');
  const setTab = (t: OnlineTab) => {
    setTabState(t);
    try { const u = new URL(window.location.href); u.searchParams.set('tab', t); window.history.replaceState(null, '', u.pathname + u.search); } catch { /* ignore */ }
  };
  const live = useLivePlay();
  const { data: ratingsData, refetch } = useLiveRatings();
  const [mode, setMode] = useState<LiveMode>('casual');
  const [friendTc, setFriendTc] = useState('blitz_5_0');
  const [friendColor, setFriendColor] = useState<'random' | 'white' | 'black'>('random');
  const [hosted, setHosted] = useState<Hosted | null>(null);
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(Date.now());
  const inbox = useChallengeInbox();
  const social = useSocialUnread();
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [friendOpen, setFriendOpen] = useState(false);

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

  // Keep the game on screen through a reconnect (status can briefly read
  // connecting/disconnected/idle while the socket comes back).
  if (live.game && (live.status === 'in_game' || live.status === 'finished' || live.game.status === 'active')) {
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
      announceChallengeSent();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not create the link');
    } finally { setCreating(false); }
  };
  const makeOpenLink = async () => {
    setCreatingOpen(true);
    try { await createOpenLink('live', friendTc, mode, friendColor); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not create the link'); }
    finally { setCreatingOpen(false); }
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
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: '#81B64C', color: '#FFFFFF' }}><Bot size={22} /></span>
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
          <ChallengeRequestsCard requests={inbox.requests} onAcceptLive={(code) => live.approveRequest(code)} onChanged={() => { void inbox.reload(); }} />
          <ChallengeInvitesCard invites={inbox.invites} onChanged={() => { void inbox.reload(); }} />
          <SentRequestsCard sent={inbox.sent} onChanged={() => { void inbox.reload(); }} />

          {/* Live | Daily */}
          <div className="grid grid-cols-2 gap-1 rounded-[14px] p-1" style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${PT.border}` }}>
            {([['live', 'Live', Zap, '5 to 15 minutes'], ['daily', 'Daily', CalendarDays, '1, 3 or 7 days a move']] as const).map(([id, label, Icon, sub]) => {
              const on = tab === id;
              return (
                <button key={id} onClick={() => setTab(id)} aria-pressed={on}
                  className="flex items-center justify-center gap-2 rounded-[10px] px-3 py-2.5 text-left transition-colors"
                  style={on ? { background: PT.greenSoft, boxShadow: `inset 0 0 0 1.5px ${PT.green}` } : undefined}>
                  <Icon size={18} style={{ color: on ? PT.green : PT.muted }} />
                  <span className="min-w-0">
                    <b className="block text-[14px] font-extrabold" style={{ color: on ? PT.text : PT.muted }}>{label}</b>
                    <span className="block truncate text-[11px]" style={{ color: PT.muted }}>{sub}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {tab === 'daily' ? <DailyGames embedded /> : <>
          {/* Quick play: pick a clock, get matched. */}
          <section className="p-4" style={cardStyle}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-extrabold" style={{ color: PT.text }}>Quick play</h2>
              <div className="inline-flex rounded-[10px] p-0.5" style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${PT.border}` }}>
                {(['casual', 'ranked'] as LiveMode[]).map(m => (
                  <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                    className="inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-extrabold capitalize"
                    style={mode === m ? greenBtn : { color: PT.muted }}>
                    {m === 'casual' ? <Sparkles className="w-3 h-3" /> : <Award className="w-3 h-3" />}{m}
                  </button>
                ))}
              </div>
            </div>
            <p className="mb-3 text-[12px]" style={{ color: PT.muted }}>
              {mode === 'casual' ? 'Casual: no rating change.' : 'Ranked: your rating for that clock goes up or down.'} Tap a clock to find an opponent.
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {TC_OPTIONS.map(opt => {
                const r = ratingsData?.ratings[opt.id];
                return (
                  <button key={opt.id}
                    disabled={live.status === 'connecting' || live.status === 'disconnected'}
                    onClick={() => live.enterQueue(opt.id, mode)}
                    className="flex items-center gap-3 rounded-[14px] p-3 text-left transition-transform active:scale-[0.98] disabled:opacity-50"
                    style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${PT.border}` }}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px]" style={{ background: '#81B64C', color: '#FFFFFF' }}>
                      <opt.icon className="w-5 h-5" />
                    </span>
                    <span className="min-w-0">
                      <b className="block text-[17px] font-black leading-tight" style={{ color: PT.text }}>{opt.label}</b>
                      <span className="block text-[11.5px]" style={{ color: PT.muted }}>
                        {opt.sub} · {r && r.gamesPlayed > 0 ? `${r.rating}${r.isProvisional ? '?' : ''}` : 'unrated'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Play a friend: closed until you want it. */}
          <section className="overflow-hidden" style={cardStyle}>
            <button onClick={() => setFriendOpen(o => !o)} aria-expanded={friendOpen} className="flex w-full items-center gap-3 p-4 text-left">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px]" style={{ background: '#81B64C', color: '#FFFFFF' }}><Users size={19} /></span>
              <span className="min-w-0 flex-1">
                <b className="block text-[15px] font-extrabold" style={{ color: PT.text }}>Play a friend</b>
                <span className="block text-[12px]" style={{ color: PT.muted }}>Send a link; the game starts when they accept</span>
              </span>
              <ChevronRight size={18} style={{ color: PT.muted, transform: friendOpen ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} />
            </button>
            {friendOpen && (
              <div className="space-y-3 px-4 pb-4" style={{ borderTop: `1px solid ${PT.border}` }}>
                <div className="pt-3">
                  <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>Clock</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TC_OPTIONS.map(o => (
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
                <p className="text-[11.5px]" style={{ color: PT.muted }}>
                  {mode === 'ranked' ? 'Ranked' : 'Casual'} game. <b style={{ color: PT.text }}>Open link:</b> post it anywhere; anyone can challenge you and you choose who to play.
                </p>
              </div>
            )}
          </section>
          <OpenLinksCard links={inbox.links} kind="live" onChanged={() => { void inbox.reload(); }} />

          <TournamentsCard />
          </>}
        </>
      )}

      {live.error && (
        <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'rgba(220,67,67,0.25)', color: PT.text, border: '1px solid rgba(220,67,67,0.5)' }}>
          {live.error}
        </div>
      )}
      {live.status === 'connecting' && <p className="text-xs" style={{ color: PT.muted }}>Connecting…</p>}
      {live.status === 'disconnected' && <p className="text-xs" style={{ color: '#ea9733' }}>Reconnecting…</p>}

      {/* Your ratings, one compact row */}
      <section className="flex items-center gap-3 overflow-x-auto px-4 py-3" style={cardStyle}>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>
          <Trophy className="w-3.5 h-3.5" style={{ color: PT.gold }} /> Ratings
        </span>
        {[...TC_OPTIONS.map(o => ({ id: o.id, label: o.label })), { id: 'daily', label: 'Daily' }].map(opt => {
          const r = opt.id === 'daily' ? dailyR : ratingsData?.ratings[opt.id];
          return (
            <span key={opt.id} className="shrink-0 rounded-[10px] px-2.5 py-1.5 text-center" style={{ background: 'rgba(0,0,0,0.2)' }} title={`${r?.gamesPlayed ?? 0} games`}>
              <span className="block text-[10px] font-bold" style={{ color: PT.muted }}>{opt.label}</span>
              <b className="block text-[14px] font-black leading-tight" style={{ color: PT.text }}>{r && r.gamesPlayed > 0 ? `${r.rating}${r.isProvisional ? '?' : ''}` : '—'}</b>
            </span>
          );
        })}
      </section>
    </div>
  );
}
