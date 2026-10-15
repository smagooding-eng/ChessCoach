import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Search, UserPlus, Check, X, MessageCircle, Swords, Loader2, Users, Clock } from 'lucide-react';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { socialApi, timeAgo, type Friend, type PersonLite, type SearchResult } from '@/lib/social';
import { FriendAvatar, ChallengeFriendSheet, PRESENCE_LABEL } from '@/components/play/Social';

// Friends: find people, answer requests, and jump into a chat or a challenge.
export function Friends() {
  const [, navigate] = useLocation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<PersonLite[]>([]);
  const [sent, setSent] = useState<PersonLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [challenge, setChallenge] = useState<{ userId: string; name: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await socialApi.friends();
      setFriends(d.friends); setIncoming(d.incoming); setSent(d.sent); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load friends'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const on = () => { void load(); };
    window.addEventListener('cs:dm', on);
    window.addEventListener('cs:dm-read', on);
    window.addEventListener('cs:friends-update', on);
    window.addEventListener('cs:notification', on);
    const t = setInterval(on, 30_000); // keep online dots fresh
    return () => {
      window.removeEventListener('cs:dm', on);
      window.removeEventListener('cs:dm-read', on);
      window.removeEventListener('cs:friends-update', on);
      window.removeEventListener('cs:notification', on);
      clearInterval(t);
    };
  }, [load]);

  // Search as you type (debounced).
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setSearching(false); return; }
    setSearching(true);
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try { const d = await socialApi.search(term); if (my === seq.current) setResults(d.results); }
      catch { if (my === seq.current) setResults([]); }
      finally { if (my === seq.current) setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };
  const act = async (fn: () => Promise<unknown>, after?: string) => {
    try { await fn(); if (after) flash(after); await load(); }
    catch (e) { flash(e instanceof Error ? e.message : 'Something went wrong'); }
  };
  const addFromSearch = async (r: SearchResult) => {
    try {
      const d = await socialApi.request(r.userId);
      setResults((rs) => rs?.map((x) => x.userId === r.userId ? { ...x, relation: d.relation === 'friends' ? 'friends' : 'sent' } : x) ?? null);
      flash(d.relation === 'friends' ? `You and ${r.name} are now friends` : `Request sent to ${r.name}`);
      void load();
    } catch (e) { flash(e instanceof Error ? e.message : 'Could not send'); }
  };

  return (
    <div className="mx-auto max-w-[760px] space-y-4 p-4 pb-24 md:p-0">
      <div className="flex items-center gap-3">
        <Link href="/live" className="grid h-9 w-9 place-items-center rounded-full" style={{ color: PT.muted, background: 'rgba(255,255,255,.05)' }} aria-label="Back to Live play"><ArrowLeft size={18} /></Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-black md:text-3xl" style={{ color: PT.text, letterSpacing: '-0.02em' }}>Friends</h1>
          <p className="text-sm" style={{ color: PT.muted }}>Message friends, see who's online, and challenge them to a game.</p>
        </div>
      </div>

      {/* Find people */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,0,0,.25)', border: `1px solid ${PT.border}` }}>
          <Search size={17} style={{ color: PT.muted }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find players by username or name"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" style={{ color: PT.text }} />
          {searching ? <Loader2 size={16} className="animate-spin" style={{ color: PT.muted }} /> : q && (
            <button onClick={() => setQ('')} aria-label="Clear" style={{ color: PT.muted }}><X size={16} /></button>
          )}
        </label>
        {results && (
          <div className="overflow-hidden" style={cardStyle}>
            {results.length === 0 && !searching && <p className="p-4 text-[13px]" style={{ color: PT.muted }}>No players found. Try their Chess.com or Lichess username.</p>}
            {results.map((r, i) => (
              <div key={r.userId} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? `1px solid ${PT.border}` : undefined }}>
                <FriendAvatar src={r.avatar} name={r.name} status={r.status} size={38} />
                <b className="min-w-0 flex-1 truncate text-[14.5px] font-extrabold" style={{ color: PT.text }}>{r.name}</b>
                {r.relation === 'friends' ? (
                  <button onClick={() => navigate(`/messages/${r.userId}`)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold" style={ghostBtn}>Message</button>
                ) : r.relation === 'sent' ? (
                  <span className="text-[12.5px] font-bold" style={{ color: PT.muted }}>Requested</span>
                ) : r.relation === 'incoming' ? (
                  <button onClick={() => act(() => socialApi.accept(r.userId), `You and ${r.name} are now friends`).then(() => setQ(''))} className="rounded-lg px-3 py-1.5 text-[12.5px] font-extrabold" style={greenBtn}>Accept</button>
                ) : (
                  <button onClick={() => addFromSearch(r)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12.5px] font-extrabold" style={greenBtn}><UserPlus size={14} /> Add</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Requests to you */}
      {incoming.length > 0 && (
        <div className="overflow-hidden" style={cardStyle}>
          <p className="px-4 pt-3 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: PT.green }}>Friend requests · {incoming.length}</p>
          {incoming.map((p) => (
            <div key={p.userId} className="flex items-center gap-3 px-4 py-3">
              <FriendAvatar src={p.avatar} name={p.name} status={p.status} size={40} />
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[14.5px] font-extrabold" style={{ color: PT.text }}>{p.name}</b>
                {p.at && <span className="text-[12px]" style={{ color: PT.muted }}>{timeAgo(p.at)} ago</span>}
              </div>
              <button onClick={() => act(() => socialApi.accept(p.userId), `You and ${p.name} are now friends`)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12.5px] font-extrabold" style={greenBtn}><Check size={14} /> Accept</button>
              <button onClick={() => act(() => socialApi.decline(p.userId))} className="rounded-lg p-2" style={ghostBtn} aria-label={`Decline ${p.name}`}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Friends */}
      <div className="overflow-hidden" style={cardStyle}>
        <p className="px-4 pt-3 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: PT.muted }}>
          Your friends{friends.length ? ` · ${friends.length}` : ''}{friends.some((f) => f.status !== 'offline') ? ` · ${friends.filter((f) => f.status !== 'offline').length} online` : ''}
        </p>
        {loading ? (
          <div className="p-6 text-center"><Loader2 className="mx-auto animate-spin" style={{ color: PT.green }} /></div>
        ) : err ? (
          <p className="p-4 text-[13px]" style={{ color: PT.red }}>{err}</p>
        ) : friends.length === 0 ? (
          <div className="space-y-1 p-5 text-center">
            <Users className="mx-auto" size={26} style={{ color: PT.muted }} />
            <p className="text-[14px] font-bold" style={{ color: PT.text }}>No friends yet</p>
            <p className="text-[12.5px]" style={{ color: PT.muted }}>Search above, or tap "Add as a friend" after a live game.</p>
          </div>
        ) : friends.map((f) => (
          <div key={f.userId} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: `1px solid ${PT.border}` }}>
            <button onClick={() => navigate(`/messages/${f.userId}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <FriendAvatar src={f.avatar} name={f.name} status={f.status} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <b className="truncate text-[15px] font-extrabold" style={{ color: PT.text }}>{f.name}</b>
                  {f.unread > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-black" style={{ background: '#FF5058', color: '#fff' }}>{f.unread}</span>}
                </span>
                <span className="block truncate text-[12.5px]" style={{ color: f.unread ? PT.text : PT.muted, fontWeight: f.unread ? 700 : 400 }}>
                  {f.lastMessage
                    ? `${f.lastMessage.mine ? 'You: ' : ''}${f.lastMessage.body} · ${timeAgo(f.lastMessage.at)}`
                    : f.status !== 'offline' ? PRESENCE_LABEL[f.status] : 'Say hi'}
                </span>
              </span>
            </button>
            <button onClick={() => navigate(`/messages/${f.userId}`)} className="grid h-9 w-9 place-items-center rounded-lg" style={ghostBtn} aria-label={`Message ${f.name}`}><MessageCircle size={16} /></button>
            <button onClick={() => setChallenge({ userId: f.userId, name: f.name })} disabled={f.status === 'playing'} className="grid h-9 w-9 place-items-center rounded-lg disabled:opacity-40" style={greenBtn} aria-label={`Challenge ${f.name}`}><Swords size={16} /></button>
          </div>
        ))}
      </div>

      {sent.length > 0 && (
        <div className="overflow-hidden" style={cardStyle}>
          <p className="px-4 pt-3 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: PT.muted }}>Sent requests</p>
          {sent.map((p) => (
            <div key={p.userId} className="flex items-center gap-3 px-4 py-2.5">
              <FriendAvatar src={p.avatar} name={p.name} size={34} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-bold" style={{ color: PT.text }}>{p.name}</span>
              <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: PT.muted }}><Clock size={12} /> Waiting</span>
              <button onClick={() => act(() => socialApi.remove(p.userId), 'Request cancelled')} className="rounded-lg px-2.5 py-1 text-[12px] font-bold" style={ghostBtn}>Cancel</button>
            </div>
          ))}
        </div>
      )}

      {challenge && (
        <ChallengeFriendSheet friend={challenge} onClose={() => setChallenge(null)}
          onSent={() => navigate(`/messages/${challenge.userId}`)} />
      )}
      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-[95] flex justify-center px-4">
          <div className="rounded-xl px-4 py-2.5 text-[13px] font-bold shadow-xl" style={{ background: PT.cardSolid, color: PT.text, border: `1px solid ${PT.greenLine}` }}>{toast}</div>
        </div>
      )}
    </div>
  );
}
