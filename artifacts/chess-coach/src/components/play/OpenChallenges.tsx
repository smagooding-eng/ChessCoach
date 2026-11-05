import React, { useCallback, useEffect, useState } from 'react';
import { announceChallengeSent } from '@/lib/challengeSent';
import { useLocation } from 'wouter';
import { Link2, Check, X, Inbox, Swords, CalendarDays, ChevronRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { ShareLink } from '@/components/play/ShareLink';

// Open challenge links: one link you can post anywhere. Anyone who opens it
// sends you a challenge request; you accept the ones you want to play.

export interface ChallengeRow {
  code: string;
  kind: 'live' | 'daily';
  timeControl: string;
  timeControlLabel: string | null;
  mode: 'casual' | 'ranked';
  color: 'random' | 'white' | 'black';
  status: string;
  creatorUsername: string;
  open: boolean;
  isRequest: boolean;
  requesterUsername: string | null;
  /** Sent challenges: who it's for. */
  targetUsername?: string | null;
  gameId?: string | number | null;
}

const CHANGED = 'cs:challenges-changed';
export const challengeUrl = (code: string) => `${window.location.origin}/challenge/${code}`;

export async function createOpenLink(kind: 'live' | 'daily', timeControl: string, mode: 'casual' | 'ranked', color: 'random' | 'white' | 'black'): Promise<ChallengeRow> {
  const r = await apiFetch('/api/challenges', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, timeControl, mode, color, open: true }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Could not create the link');
  window.dispatchEvent(new Event(CHANGED));
  announceChallengeSent();
  return d.challenge as ChallengeRow;
}

/** Your open links + challenge requests waiting for your answer. Live-updates. */
export function useChallengeInbox() {
  const [links, setLinks] = useState<ChallengeRow[]>([]);
  const [requests, setRequests] = useState<ChallengeRow[]>([]);
  const [invites, setInvites] = useState<ChallengeRow[]>([]);
  const [sent, setSent] = useState<ChallengeRow[]>([]);
  const [outgoing, setOutgoing] = useState<ChallengeRow[]>([]);
  const reload = useCallback(async () => {
    const [m, q, inv, snt, out] = await Promise.all([
      apiFetch('/api/challenges/mine').then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch('/api/challenges/requests').then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch('/api/challenges/invites').then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch('/api/challenges/sent').then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch('/api/challenges/outgoing').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    if (out) setOutgoing((out.outgoing ?? []) as ChallengeRow[]);
    if (snt) setSent((snt.sent ?? []) as ChallengeRow[]);
    if (m) setLinks(((m.challenges ?? []) as ChallengeRow[]).filter(c => c.open));
    if (q) setRequests((q.requests ?? []) as ChallengeRow[]);
    if (inv) setInvites((inv.invites ?? []) as ChallengeRow[]);
  }, []);
  useEffect(() => {
    void reload();
    const on = () => { void reload(); };
    window.addEventListener(CHANGED, on);
    window.addEventListener('cs:notification', on);
    const t = setInterval(reload, 30_000);
    return () => { window.removeEventListener(CHANGED, on); window.removeEventListener('cs:notification', on); clearInterval(t); };
  }, [reload]);
  return { links, requests, invites, sent, outgoing, reload };
}

const describe = (c: ChallengeRow) =>
  `${c.kind === 'live' ? c.timeControlLabel : `${c.timeControlLabel} per move`} · ${c.mode === 'ranked' ? 'Ranked' : 'Casual'}`;

/** Incoming requests with Accept / Decline. */
export function ChallengeRequestsCard({ requests, kind, onAcceptLive, onChanged }: {
  requests: ChallengeRow[];
  kind?: 'live' | 'daily';
  /** Live requests start over the live connection. */
  onAcceptLive?: (code: string) => void;
  onChanged: () => void;
}) {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const list = kind ? requests.filter(r => r.kind === kind) : requests;
  if (list.length === 0) return null;

  const accept = async (r: ChallengeRow) => {
    setError('');
    if (r.kind === 'live') {
      if (onAcceptLive) onAcceptLive(r.code); else navigate(`/live?approve=${r.code}`);
      return;
    }
    setBusy(r.code);
    try {
      const res = await apiFetch(`/api/challenges/${r.code}/approve`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not accept');
      navigate(`/daily/${d.gameId}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not accept'); onChanged(); }
    finally { setBusy(null); }
  };
  const decline = async (r: ChallengeRow) => {
    setBusy(r.code);
    await apiFetch(`/api/challenges/${r.code}/decline`, { method: 'POST' }).catch(() => {});
    setBusy(null);
    onChanged();
  };

  return (
    <section className="overflow-hidden" style={{ ...cardStyle, border: `1px solid ${PT.greenLine}` }}>
      <h2 className="flex items-center gap-2 px-4 pb-2 pt-3.5 text-[15px] font-extrabold" style={{ color: PT.text }}>
        <Inbox size={17} style={{ color: PT.green }} /> Challenge requests
        <span className="rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: PT.green, color: PT.onGreen }}>{list.length}</span>
      </h2>
      {list.map(r => (
        <div key={r.code} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${PT.border}` }}>
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[14px] font-extrabold" style={{ color: PT.text }}>{r.requesterUsername ?? 'Someone'}</b>
            <span className="block text-[12px]" style={{ color: PT.muted }}>{r.kind === 'live' ? 'Live' : 'Daily'} · {describe(r)}</span>
          </span>
          <button onClick={() => decline(r)} disabled={busy === r.code} aria-label="Decline" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl disabled:opacity-50" style={ghostBtn}><X size={17} /></button>
          <button onClick={() => accept(r)} disabled={busy === r.code} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[13px] font-extrabold disabled:opacity-50" style={greenBtn}>
            <Check size={16} /> Accept
          </button>
        </div>
      ))}
      {error && <p className="px-4 pb-3 text-[12.5px]" style={{ color: PT.red }}>{error}</p>}
    </section>
  );
}

/** Your open links (for one kind) with Share and Turn off. */
export function OpenLinksCard({ links, kind, onChanged }: { links: ChallengeRow[]; kind: 'live' | 'daily'; onChanged: () => void }) {
  const list = links.filter(l => l.kind === kind);
  if (list.length === 0) return null;
  const turnOff = async (code: string) => {
    await apiFetch(`/api/challenges/${code}/cancel`, { method: 'POST' }).catch(() => {});
    onChanged();
  };
  return (
    <section className="space-y-3 p-4" style={cardStyle}>
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold" style={{ color: PT.text }}>
        <Link2 size={17} style={{ color: PT.green }} /> Your open challenge link{list.length > 1 ? 's' : ''}
      </h2>
      <p className="-mt-1 text-[12.5px]" style={{ color: PT.muted }}>
        Post it anywhere. Anyone who opens it can send you a challenge; you choose who to play. {kind === 'live' ? 'Live games start when you accept and you\'re both on Live play.' : 'Daily games start as soon as you accept.'}
      </p>
      {list.map(l => (
        <div key={l.code} className="space-y-2 rounded-xl p-3" style={{ background: 'rgba(0,0,0,.2)' }}>
          <p className="text-[12.5px] font-bold" style={{ color: PT.text }}>{describe(l)} · {l.color === 'random' ? 'random colour' : `you play ${l.color}`}</p>
          <ShareLink url={challengeUrl(l.code)} text={`Challenge me on ChessScout (${describe(l)})`} />
          <button onClick={() => turnOff(l.code)} className="w-full rounded-xl py-2 text-[12.5px] font-bold" style={ghostBtn}>Turn off this link</button>
        </div>
      ))}
    </section>
  );
}

/** Challenges you opened but haven't answered: tap to open, ✕ to dismiss. */
export function ChallengeInvitesCard({ invites, onChanged }: { invites: ChallengeRow[]; onChanged: () => void }) {
  const [, navigate] = useLocation();
  if (invites.length === 0) return null;
  const dismiss = async (code: string) => {
    await apiFetch(`/api/challenges/${code}/dismiss`, { method: 'POST' }).catch(() => {});
    onChanged();
  };
  return (
    <section className="overflow-hidden" style={{ ...cardStyle, border: `1px solid ${PT.greenLine}` }}>
      <h2 className="flex items-center gap-2 px-4 pb-2 pt-3.5 text-[15px] font-extrabold" style={{ color: PT.text }}>
        <Swords size={17} style={{ color: PT.green }} /> You've been challenged
      </h2>
      {invites.map(c => (
        <div key={c.code} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${PT.border}` }}>
          <button onClick={() => navigate(`/challenge/${c.code}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: '#81B64C', color: '#FFFFFF' }}>
              {c.kind === 'live' ? <Swords size={18} /> : <CalendarDays size={18} />}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[14px] font-extrabold" style={{ color: PT.text }}>{c.creatorUsername}</b>
              <span className="block text-[12px]" style={{ color: PT.muted }}>{c.kind === 'live' ? 'Live' : 'Daily'} · {describe(c)}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-[12.5px] font-extrabold" style={greenBtn}>
              {c.open ? 'Challenge' : 'Play'} <ChevronRight size={14} />
            </span>
          </button>
          <button onClick={() => dismiss(c.code)} aria-label="Dismiss" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={ghostBtn}><X size={15} /></button>
        </div>
      ))}
    </section>
  );
}

/** Requests you've sent that are waiting for an answer. */
export function SentRequestsCard({ sent, onChanged }: { sent: ChallengeRow[]; onChanged: () => void }) {
  const [, navigate] = useLocation();
  if (sent.length === 0) return null;
  const withdraw = async (code: string) => {
    await apiFetch(`/api/challenges/${code}/withdraw`, { method: 'POST' }).catch(() => {});
    onChanged();
  };
  return (
    <section className="overflow-hidden" style={cardStyle}>
      <h2 className="px-4 pb-2 pt-3.5 text-[13px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>Waiting for an answer</h2>
      {sent.map(c => (
        <div key={c.code} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${PT.border}` }}>
          <button onClick={() => navigate(c.kind === 'live' ? `/live?challenge=${c.code}` : `/challenge/${c.code}`)} className="min-w-0 flex-1 text-left">
            <b className="block truncate text-[14px] font-extrabold" style={{ color: PT.text }}>You challenged {c.creatorUsername}</b>
            <span className="block text-[12px]" style={{ color: c.status === 'approved' ? PT.green : PT.muted }}>
              {c.status === 'approved' ? 'Accepted! Tap to play' : `${c.kind === 'live' ? 'Live' : 'Daily'} · ${describe(c)}`}
            </span>
          </button>
          <button onClick={() => withdraw(c.code)} className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold" style={ghostBtn}>Withdraw</button>
        </div>
      ))}
    </section>
  );
}

/** Challenges you sent straight to a player: waiting, accepted (tap to play) or declined; Cancel while waiting. */
export function OutgoingChallengesCard({ outgoing, kind, onChanged }: { outgoing: ChallengeRow[]; kind?: 'live' | 'daily'; onChanged: () => void }) {
  const [, navigate] = useLocation();
  const list = kind ? outgoing.filter((c) => c.kind === kind) : outgoing;
  if (list.length === 0) return null;
  const cancel = async (code: string) => { await apiFetch(`/api/challenges/${code}/cancel`, { method: 'POST' }).catch(() => {}); onChanged(); };
  return (
    <section className="overflow-hidden" style={cardStyle}>
      <h2 className="flex items-center gap-2 px-4 pb-2 pt-3.5 text-[15px] font-extrabold" style={{ color: PT.text }}><Swords size={17} style={{ color: PT.green }} /> Sent challenges</h2>
      {list.map((c) => {
        const done = c.status === 'accepted' || c.status === 'started';
        const go = () => { if (c.kind === 'daily' && c.gameId) navigate(`/daily/${c.gameId}`); else if (c.kind === 'live') navigate('/live'); };
        return (
          <div key={c.code} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${PT.border}` }}>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[14px] font-extrabold" style={{ color: PT.text }}>{c.targetUsername ?? 'Your challenge'}</b>
              <span className="block text-[12px]" style={{ color: done ? PT.green : c.status === 'declined' ? PT.red : PT.muted }}>
                {done ? 'Accepted!' : c.status === 'declined' ? 'Declined' : c.status === 'expired' ? 'Expired' : 'Waiting for them to answer'} · {c.kind === 'live' ? 'Live' : 'Daily'} · {describe(c)}
              </span>
            </span>
            {done ? <button onClick={go} className="shrink-0 rounded-xl px-3.5 py-2.5 text-[13px] font-extrabold" style={greenBtn}>Play</button>
              : c.status === 'open' ? <button onClick={() => cancel(c.code)} className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold" style={ghostBtn}>Cancel</button> : null}
          </div>
        );
      })}
    </section>
  );
}

/** Every challenge in one compact list: to answer (requests to your links, challenges to
 *  you) and sent by you (your challenges and requests). Optionally one kind only. */
export function ChallengesPanel({ inbox, kind, onAcceptLive }: { inbox: ReturnType<typeof useChallengeInbox>; kind?: 'live' | 'daily'; onAcceptLive?: (code: string) => void }) {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const k = <T extends ChallengeRow>(l: T[]) => (kind ? l.filter((c) => c.kind === kind) : l);
  const requests = k(inbox.requests), invites = k(inbox.invites), sent = k(inbox.sent), outgoing = k(inbox.outgoing);
  if (!requests.length && !invites.length && !sent.length && !outgoing.length) return null;
  const done = () => { void inbox.reload(); };
  const post = async (code: string, action: string) => { setBusy(code); await apiFetch(`/api/challenges/${code}/${action}`, { method: 'POST' }).catch(() => {}); setBusy(null); done(); };
  const accept = async (r: ChallengeRow) => {
    setError('');
    if (r.kind === 'live') { if (onAcceptLive) onAcceptLive(r.code); else navigate(`/live?approve=${r.code}`); return; }
    setBusy(r.code);
    try {
      const res = await apiFetch(`/api/challenges/${r.code}/approve`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not accept');
      navigate(`/daily/${d.gameId}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not accept'); done(); } finally { setBusy(null); }
  };
  const row = (key: string, name: string, sub: string, subColor: string, actions: React.ReactNode, onOpen?: () => void) => (
    <div key={key} className="flex items-center gap-2.5 px-3.5 py-2.5" style={{ borderTop: `1px solid ${PT.border}` }}>
      <button onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left">
        <b className="block truncate text-[13.5px] font-extrabold" style={{ color: PT.text }}>{name}</b>
        <span className="block truncate text-[11.5px]" style={{ color: subColor }}>{sub}</span>
      </button>
      {actions}
    </div>
  );
  const small = 'shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-extrabold disabled:opacity-50';
  const toAnswer = requests.length + invites.length;
  return (
    <section className="overflow-hidden" style={{ ...cardStyle, border: `1px solid ${toAnswer ? PT.greenLine : PT.border}` }}>
      <h2 className="flex items-center gap-2 px-3.5 py-2.5 text-[14px] font-extrabold" style={{ color: PT.text }}>
        <Swords size={15} style={{ color: PT.green }} /> Challenges
        {toAnswer > 0 && <span className="rounded-full px-1.5 py-0.5 text-[10.5px] font-black" style={{ background: PT.green, color: PT.onGreen }}>{toAnswer} for you</span>}
      </h2>
      {requests.map((r) => row(r.code, r.requesterUsername ?? 'Someone', `Wants to play · ${r.kind === 'live' ? 'Live' : 'Daily'} · ${describe(r)}`, PT.muted, <>
        <button onClick={() => void post(r.code, 'decline')} disabled={busy === r.code} aria-label="Decline" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg disabled:opacity-50" style={ghostBtn}><X size={15} /></button>
        <button onClick={() => void accept(r)} disabled={busy === r.code} className={small} style={greenBtn}>Accept</button>
      </>))}
      {invites.map((c) => row(c.code, c.creatorUsername, `Challenged you · ${c.kind === 'live' ? 'Live' : 'Daily'} · ${describe(c)}`, PT.muted, <>
        <button onClick={() => void post(c.code, 'dismiss')} aria-label="Dismiss" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={ghostBtn}><X size={15} /></button>
        <button onClick={() => navigate(`/challenge/${c.code}`)} className={small} style={greenBtn}>{c.open ? 'Challenge' : 'Play'}</button>
      </>, () => navigate(`/challenge/${c.code}`)))}
      {outgoing.map((c) => {
        const ok = c.status === 'accepted' || c.status === 'started';
        const go = () => { if (c.kind === 'daily' && c.gameId) navigate(`/daily/${c.gameId}`); else if (c.kind === 'live') navigate('/live'); };
        return row(c.code, `You → ${c.targetUsername ?? 'them'}`, `${ok ? 'Accepted!' : c.status === 'declined' ? 'Declined' : c.status === 'expired' ? 'Expired' : 'Waiting for an answer'} · ${c.kind === 'live' ? 'Live' : 'Daily'} · ${describe(c)}`,
          ok ? PT.green : c.status === 'declined' ? PT.red : PT.muted,
          ok ? <button onClick={go} className={small} style={greenBtn}>Play</button> : c.status === 'open' ? <button onClick={() => void post(c.code, 'cancel')} className={small} style={ghostBtn}>Cancel</button> : null);
      })}
      {sent.map((c) => row(c.code, `You → ${c.creatorUsername}`, c.status === 'approved' ? 'Accepted! Tap to play' : `Waiting for an answer · ${c.kind === 'live' ? 'Live' : 'Daily'} · ${describe(c)}`,
        c.status === 'approved' ? PT.green : PT.muted,
        <button onClick={() => void post(c.code, 'withdraw')} className={small} style={ghostBtn}>Withdraw</button>,
        () => navigate(c.kind === 'live' ? `/live?challenge=${c.code}` : `/challenge/${c.code}`)))}
      {error && <p className="px-3.5 pb-2.5 text-[12px]" style={{ color: PT.red }}>{error}</p>}
    </section>
  );
}

/** Home / Play screens: requests to answer, challenges waiting for you, and
 *  requests you've sent. */
export function ChallengeInbox({ className = '' }: { className?: string }) {
  const inbox = useChallengeInbox();
  return <div className={`empty:hidden ${className}`}><ChallengesPanel inbox={inbox} /></div>;
}
