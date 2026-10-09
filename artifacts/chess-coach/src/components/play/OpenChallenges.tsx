import React, { useCallback, useEffect, useState } from 'react';
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
  return d.challenge as ChallengeRow;
}

/** Your open links + challenge requests waiting for your answer. Live-updates. */
export function useChallengeInbox() {
  const [links, setLinks] = useState<ChallengeRow[]>([]);
  const [requests, setRequests] = useState<ChallengeRow[]>([]);
  const [invites, setInvites] = useState<ChallengeRow[]>([]);
  const reload = useCallback(async () => {
    const [m, q, inv] = await Promise.all([
      apiFetch('/api/challenges/mine').then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch('/api/challenges/requests').then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch('/api/challenges/invites').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
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
  return { links, requests, invites, reload };
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
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: PT.greenSoft, color: PT.green }}>
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

/** Home / Play screens: requests to answer + challenges waiting for you. */
export function ChallengeInbox({ className = '' }: { className?: string }) {
  const inbox = useChallengeInbox();
  if (inbox.requests.length === 0 && inbox.invites.length === 0) return null;
  return (
    <div className={`space-y-3 ${className}`}>
      <ChallengeRequestsCard requests={inbox.requests} onChanged={() => { void inbox.reload(); }} />
      <ChallengeInvitesCard invites={inbox.invites} onChanged={() => { void inbox.reload(); }} />
    </div>
  );
}
