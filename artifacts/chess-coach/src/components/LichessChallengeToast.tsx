// Challenges from Lichess (people and bots) while ChessScout is open, for anyone
// who has connected Lichess. Accept plays it on ChessScout's board (bullet goes to
// lichess.org, which keeps those to its own site); Decline tells Lichess no.
// Lichess also replays challenges still waiting when the stream opens, so ones sent
// while the app was closed show up next time it's opened, if they haven't expired.
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Swords, X, Loader2, Bot } from 'lucide-react';
import { lichessAuth, onLichessEvent, acceptChallenge, declineChallenge, playsHere, type LichessChallenge } from '@/lib/lichessBoard';

const G = '#81B64C';

function clockText(c: LichessChallenge): string {
  const tc = c.timeControl;
  if (!tc || tc.type === 'unlimited') return 'No clock';
  if (tc.type === 'correspondence') return `Daily · ${tc.daysPerTurn} day${tc.daysPerTurn === 1 ? '' : 's'} a move`;
  return tc.show ?? `${Math.round(tc.limit / 60)}+${tc.increment}`;
}

export function LichessChallengeToast() {
  const [, navigate] = useLocation();
  const [me, setMe] = useState(() => lichessAuth()?.username?.toLowerCase() ?? '');
  const [list, setList] = useState<LichessChallenge[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Connecting or disconnecting Lichess (in this tab or another) switches this on or off.
  useEffect(() => {
    const check = () => setMe(lichessAuth()?.username?.toLowerCase() ?? '');
    window.addEventListener('focus', check); window.addEventListener('storage', check);
    const t = setInterval(check, 30_000);
    return () => { window.removeEventListener('focus', check); window.removeEventListener('storage', check); clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!me) { setList([]); return; }
    return onLichessEvent((e) => {
      if (e.type === 'challenge') {
        const c = e.challenge;
        const incoming = c.direction ? c.direction === 'in' : c.challenger?.id !== me;
        if (!incoming || !c.id) return;
        setList((l) => (l.some((x) => x.id === c.id) ? l : [...l, c].slice(-3)));
      } else if (e.type === 'challengeCanceled' || e.type === 'challengeDeclined') {
        setList((l) => l.filter((x) => x.id !== e.challenge?.id));
      } else if (e.type === 'gameStart') {
        setList((l) => l.filter((x) => x.id !== e.game.gameId));
      }
    });
  }, [me]);

  const drop = (id: string) => setList((l) => l.filter((x) => x.id !== id));
  const accept = async (c: LichessChallenge) => {
    setBusy(c.id); setErr(null);
    const standard = !c.variant?.key || c.variant.key === 'standard' || c.variant.key === 'fromPosition';
    if (!standard) { window.open(`https://lichess.org/${c.id}`, '_blank', 'noopener'); drop(c.id); setBusy(null); return; }
    const r = await acceptChallenge(c.id).catch(() => null);
    setBusy(null);
    if (!r || !r.ok) { setErr(r?.status === 404 ? 'That challenge has expired or was cancelled.' : "Lichess didn't take that. Try on lichess.org."); if (r?.status === 404) setTimeout(() => drop(c.id), 2500); return; }
    drop(c.id);
    // On Lichess the game gets the challenge's id.
    if (playsHere(c.speed)) navigate(`/lichess?game=${c.id}${c.speed === 'correspondence' ? '&from=list' : ''}`);
    else window.open(`https://lichess.org/${c.id}`, '_blank', 'noopener');
  };
  const decline = async (c: LichessChallenge) => { drop(c.id); setErr(null); await declineChallenge(c.id).catch(() => null); };

  const c = list[list.length - 1];
  if (!c) return null;
  const who = `${c.challenger?.title ? `${c.challenger.title} ` : ''}${c.challenger?.name ?? 'Someone'}`;
  const isBot = c.challenger?.title === 'BOT';
  return (
    <div className="fixed left-3 right-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:left-auto md:right-5 md:bottom-5 z-50 md:max-w-sm rounded-[20px] p-4 shadow-2xl"
      style={{ background: '#0D1516', border: '1px solid rgba(129,182,76,.45)', boxShadow: '0 18px 50px rgba(0,0,0,0.6)' }}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px]" style={{ background: G, color: '#fff' }}>{isBot ? <Bot size={20} /> : <Swords size={20} />}</div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black" style={{ color: '#F5F7F6' }}>{who} challenged you on Lichess</h3>
          <p className="mt-0.5 text-xs" style={{ color: '#87918E' }}>
            {c.challenger?.rating ? `${c.challenger.rating}${c.challenger.provisional ? '?' : ''} · ` : ''}{clockText(c)} · {c.rated ? 'Rated' : 'Casual'}
            {c.variant?.key && c.variant.key !== 'standard' ? ` · ${c.variant.name}` : ''}{list.length > 1 ? ` · ${list.length - 1} more waiting` : ''}
          </p>
          {err && <p className="mt-1 text-xs font-bold" style={{ color: '#E8A33C' }}>{err}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={() => void accept(c)} disabled={busy === c.id}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-extrabold" style={{ background: G, color: '#fff' }}>
              {busy === c.id && <Loader2 size={13} className="animate-spin" />}Accept
            </button>
            <button onClick={() => void decline(c)} className="flex-1 rounded-[10px] px-3 py-2 text-xs font-bold"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#F5F7F6', border: '1px solid rgba(255,255,255,.08)' }}>Decline</button>
          </div>
        </div>
        <button onClick={() => drop(c.id)} aria-label="Hide" className="shrink-0 rounded-md p-1" style={{ color: '#87918E' }}><X size={14} /></button>
      </div>
    </div>
  );
}
