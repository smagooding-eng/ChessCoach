import React, { useEffect, useState } from 'react';
import { Smile, X, VolumeX, Volume2 } from 'lucide-react';
import type { LiveChat as Msg } from '@/hooks/use-live-play';

// Quick messages in a live game: emojis and a few friendly phrases. Nothing is
// typed, so there's nothing to moderate. Must match LIVE_CHAT on the server.
const EMOJIS = ['👋', '👍', '😅', '😮', '🔥', '😂', '🤝', '🙏', '😬', '🤯', '♟️', '💪'];
const PHRASES = ['Good luck!', 'Have fun!', 'Nice move!', 'Oops!', 'Thanks!', 'Good game!', 'Rematch?'];
const MUTE_KEY = 'cs_live_chat_muted';

export function useChatMuted(): [boolean, (v: boolean) => void] {
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } });
  const set = (v: boolean) => { setMuted(v); try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* ignore */ } };
  return [muted, set];
}

/** The latest message from one side, floating over their name for a few seconds. */
export function ChatBubble({ chat, side, muted }: { chat: Msg[]; side: 'w' | 'b'; muted?: boolean }) {
  const last = [...chat].reverse().find((m) => m.from === side) ?? null;
  const [shown, setShown] = useState<Msg | null>(null);
  useEffect(() => {
    if (!last || muted || Date.now() - last.at > 5000) return;
    setShown(last);
    const t = setTimeout(() => setShown((s) => (s?.id === last.id ? null : s)), 4000);
    return () => clearTimeout(t);
  }, [last?.id, muted]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  const emojiOnly = !/[a-z]/i.test(shown.text);
  return (
    <div key={shown.id} className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 animate-[pop_.25s_ease-out] rounded-2xl px-3 py-1.5 font-extrabold shadow-xl"
      style={{ background: '#F5F7F6', color: '#0B1213', fontSize: emojiOnly ? 28 : 15, lineHeight: 1.1 }}>
      {shown.text}
    </div>
  );
}

/** A smiley button that opens a tray of emojis and phrases to send. */
export function ChatTray({ onSend, disabled, muted, setMuted }: { onSend: (t: string) => void; disabled?: boolean; muted: boolean; setMuted: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [cool, setCool] = useState(false);
  const send = (t: string) => {
    if (cool) return;
    onSend(t);
    setOpen(false);
    setCool(true);
    setTimeout(() => setCool(false), 1300);
  };
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-label="Send an emoji"
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold disabled:opacity-40"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F5F7F6' }}>
          {open ? <X className="h-4 w-4" /> : <Smile className="h-4 w-4" />} {open ? 'Close' : 'React'}
        </button>
        <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? "Show opponent's messages" : "Hide opponent's messages"}
          className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(245,247,246,.6)' }}>
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-[min(320px,86vw)] rounded-2xl p-2.5 shadow-2xl" style={{ background: '#16201F', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div className="grid grid-cols-6 gap-1">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => send(e)} className="grid h-10 place-items-center rounded-lg text-[22px] hover:bg-white/10">{e}</button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PHRASES.map((p) => (
              <button key={p} type="button" onClick={() => send(p)} className="rounded-full px-2.5 py-1 text-[12.5px] font-bold hover:bg-white/15" style={{ background: 'rgba(255,255,255,0.08)', color: '#F5F7F6' }}>{p}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
