import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { ArrowLeft, Send, Swords, Loader2, UserPlus } from 'lucide-react';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { socialApi, type ChatMessage, type PersonLite } from '@/lib/social';
import { FriendAvatar, ChallengeFriendSheet, PRESENCE_LABEL } from '@/components/play/Social';

type ChallengeInfo = { status: string; label: string | null; expired: boolean };

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// One conversation with a friend, updated live.
export function Messages() {
  const { userId } = useParams<{ userId: string }>();
  const [, navigate] = useLocation();
  const [friend, setFriend] = useState<(PersonLite & { isFriend: boolean }) | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [challenges, setChallenges] = useState<Record<string, ChallengeInfo>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const d = await socialApi.thread(userId);
      setFriend(d.friend);
      setMessages(d.messages);
      setChallenges(d.challenges);
      setHasMore(d.hasMore);
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load messages'); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { setLoading(true); stickToBottom.current = true; void load(); }, [load]);

  // Live: a new message from them (or from you on another device).
  useEffect(() => {
    const onDm = (e: Event) => {
      const d = (e as CustomEvent<{ from: string; to?: string; message: ChatMessage }>).detail;
      if (!d || (d.from !== userId && d.to !== userId)) return;
      if (d.from === userId) { void load(); return; } // refetch also marks it read
      setMessages((ms) => ms.some((m) => m.id === d.message.id) ? ms : [...ms, d.message]);
    };
    window.addEventListener('cs:dm', onDm);
    const t = setInterval(() => { void load(); }, 60_000); // presence + challenge status
    return () => { window.removeEventListener('cs:dm', onDm); clearInterval(t); };
  }, [userId, load]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = async () => {
    if (!userId || messages.length === 0) return;
    const el = listRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    stickToBottom.current = false;
    try {
      const d = await socialApi.thread(userId, messages[0].id);
      setMessages((ms) => [...d.messages, ...ms]);
      setChallenges((c) => ({ ...d.challenges, ...c }));
      setHasMore(d.hasMore);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; });
    } catch { /* ignore */ }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !userId || sending) return;
    setSending(true);
    try {
      const d = await socialApi.send(userId, { body });
      stickToBottom.current = true;
      setMessages((ms) => ms.some((m) => m.id === d.message.id) ? ms : [...ms, d.message]);
      setDraft('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send'); setTimeout(() => setErr(null), 3000); }
    finally { setSending(false); }
  };

  const challengeCard = (m: ChatMessage) => {
    const c = m.challengeCode ? challenges[m.challengeCode] : undefined;
    const open = c && !c.expired && c.status === 'open';
    const waitingForYou = c && !c.expired && c.status === 'accepted';
    const state = !c ? '' : c.status === 'started' ? 'Played' : c.status === 'cancelled' ? 'Cancelled' : c.expired ? 'Expired' : waitingForYou ? (m.mine ? 'They accepted and are waiting' : 'Accepted') : 'Waiting for an answer';
    return (
      <div className="w-[230px] space-y-2 rounded-2xl p-3" style={{ background: m.mine ? 'rgba(129,182,76,.16)' : PT.cardLight, border: `1px solid ${PT.greenLine}` }}>
        <div className="flex items-center gap-2">
          <Swords size={16} style={{ color: PT.green }} />
          <b className="text-[13.5px] font-extrabold" style={{ color: PT.text }}>{m.mine ? 'You sent a challenge' : `${friend?.name ?? 'They'} challenged you`}</b>
        </div>
        <p className="text-[12.5px]" style={{ color: PT.muted }}>{m.body.replace(/^Challenge:\s*/, '')}{state ? ` · ${state}` : ''}</p>
        {!m.mine && open && m.challengeCode && (
          <button onClick={() => navigate(`/challenge/${m.challengeCode}`)} className="w-full rounded-lg py-2 text-[13px] font-extrabold" style={greenBtn}>Accept and play</button>
        )}
        {m.mine && (open || waitingForYou) && (
          <button onClick={() => navigate('/live')} className="w-full rounded-lg py-2 text-[13px] font-extrabold" style={waitingForYou ? greenBtn : ghostBtn}>
            {waitingForYou ? 'Play now' : 'Wait on Live play'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto flex max-w-[760px] flex-col p-4 md:p-0" style={{ height: 'calc(100dvh - 140px)', minHeight: 420 }}>
      {/* Header */}
      <div className="flex items-center gap-3 pb-3">
        <Link href="/friends" className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: PT.muted, background: 'rgba(255,255,255,.05)' }} aria-label="Back to friends"><ArrowLeft size={18} /></Link>
        {friend ? (
          <>
            <FriendAvatar src={friend.avatar} name={friend.name} status={friend.status} size={40} />
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[16px] font-black" style={{ color: PT.text }}>{friend.name}</b>
              <span className="text-[12px]" style={{ color: friend.status === 'offline' ? PT.muted : PT.green }}>{PRESENCE_LABEL[friend.status]}</span>
            </div>
            {friend.isFriend && (
              <button onClick={() => setChallengeOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-extrabold" style={greenBtn}>
                <Swords size={15} /> Challenge
              </button>
            )}
          </>
        ) : <div className="flex-1" />}
      </div>

      {/* Thread */}
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1 py-3" style={{ ...cardStyle, padding: 12 }}>
        {loading ? (
          <div className="grid h-full place-items-center"><Loader2 className="animate-spin" style={{ color: PT.green }} /></div>
        ) : (
          <>
            {hasMore && (
              <button onClick={loadOlder} className="mx-auto mb-2 block rounded-full px-3 py-1 text-[12px] font-bold" style={ghostBtn}>Load earlier messages</button>
            )}
            {messages.length === 0 && friend && (
              <div className="grid h-full place-items-center text-center">
                <div className="space-y-1">
                  <p className="text-[14px] font-bold" style={{ color: PT.text }}>Start the conversation</p>
                  <p className="text-[12.5px]" style={{ color: PT.muted }}>{friend.isFriend ? `Say hi to ${friend.name} or send a challenge.` : 'You can message people once you are friends.'}</p>
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
              const grouped = !!prev && prev.mine === m.mine && !newDay && new Date(m.at).getTime() - new Date(prev.at).getTime() < 5 * 60_000;
              return (
                <React.Fragment key={m.id}>
                  {newDay && <p className="py-2 text-center text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: PT.muted }}>{dayLabel(m.at)}</p>}
                  <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'} ${grouped ? '' : 'pt-1.5'}`}>
                    {m.challengeCode ? challengeCard(m) : (
                      <div className="max-w-[78%] rounded-2xl px-3.5 py-2" title={clock(m.at)}
                        style={m.mine
                          ? { background: PT.green, color: PT.onGreen, borderBottomRightRadius: 6 }
                          : { background: PT.cardLight, color: PT.text, borderBottomLeftRadius: 6 }}>
                        <p className="whitespace-pre-wrap break-words text-[14.5px] leading-snug">{m.body}</p>
                        {!grouped && <p className="mt-0.5 text-right text-[10.5px]" style={{ opacity: 0.65 }}>{clock(m.at)}</p>}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>

      {/* Composer */}
      {err && <p className="pt-2 text-[12.5px] font-bold" style={{ color: PT.red }}>{err}</p>}
      {friend && !friend.isFriend ? (
        <Link href="/friends" className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-extrabold" style={greenBtn}>
          <UserPlus size={16} /> Add {friend.name} as a friend to message
        </Link>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-end gap-2 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 1000))} rows={1}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={friend ? `Message ${friend.name}` : 'Message'}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl px-4 py-2.5 text-[15px] outline-none"
            style={{ background: 'rgba(0,0,0,.25)', border: `1px solid ${PT.border}`, color: PT.text }} />
          <button type="submit" disabled={!draft.trim() || sending} className="grid h-11 w-11 shrink-0 place-items-center rounded-full disabled:opacity-50" style={greenBtn} aria-label="Send">
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
      )}

      {challengeOpen && friend && (
        <ChallengeFriendSheet friend={{ userId: friend.userId, name: friend.name }} onClose={() => setChallengeOpen(false)} onSent={() => { stickToBottom.current = true; void load(); }} />
      )}
    </div>
  );
}
