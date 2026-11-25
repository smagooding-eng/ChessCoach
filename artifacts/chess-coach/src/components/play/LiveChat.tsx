import React, { useEffect, useState } from 'react';
import { Smile, X, VolumeX, Volume2 } from 'lucide-react';
import type { LiveChat as Msg } from '@/hooks/use-live-play';

// Quick messages in a live game: emojis and a few friendly phrases. Nothing is
// typed, so there's nothing to moderate. Must match LIVE_CHAT on the server.
const EMOJIS = ["👋", "👍", "😅", "😮", "🔥", "😂", "🤝", "🙏", "😬", "🤯", "♟️", "💪", "😎", "🤔", "😭", "👀", "💀", "🥲", "😤", "🙌", "❤️", "⏰", "🍀", "🫡"];
const PHRASES = ["Hi!", "Good luck!", "Have fun!", "Nice move!", "Wow!", "Well played!", "Oops!", "My bad", "Sorry, lag", "Thanks!", "Good game!", "Thanks for the game!", "Rematch?", "One more?", "Draw?", "Brb", "ChessScout is a free chess app: game reviews, puzzles and a coach", "I'm playing on chessscout.net, you could too!"];
const MUTE_KEY = 'cs_live_chat_muted';

export function useChatMuted(): [boolean, (v: boolean) => void] {
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } });
  const set = (v: boolean) => { setMuted(v); try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* ignore */ } };
  return [muted, set];
}

/** The latest message from one side, floating over their name for a few seconds. */
export function ChatBubble({ chat, side, muted }: { chat: Msg[]; side: 'w' | 'b'; muted?: boolean }) {
  const last = [...chat].reverse().find((m) => m.from === side && m.at > 0) ?? null;
  const [now, setNow] = useState(() => Date.now());
  const fresh = !!last && !muted && now - last.at < 4000;
  useEffect(() => {
    if (!last || muted) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    const stop = setTimeout(() => clearInterval(t), 4600);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [last?.id, muted]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!fresh || !last) return null;
  const emojiOnly = !/[a-z]/i.test(last.text);
  return (
    <div key={last.id} className="pointer-events-none absolute left-1/2 top-1/2 z-20 max-w-[90%] -translate-x-1/2 -translate-y-1/2 animate-[pop_.25s_ease-out] rounded-2xl px-3 py-1.5 text-center font-extrabold shadow-xl"
      style={{ background: '#F5F7F6', color: '#0B1213', fontSize: emojiOnly ? 28 : 15, lineHeight: 1.1 }}>
      {last.text}
    </div>
  );
}

/** A smiley button that opens a tray of emojis and phrases to send. */
export function ChatTray({ onSend, disabled, muted, setMuted, allowText = false }: { onSend: (t: string) => void; disabled?: boolean; muted: boolean; setMuted: (v: boolean) => void; allowText?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
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
        {allowText && (
          <form className="flex min-w-0 flex-1 gap-1.5" onSubmit={(e) => { e.preventDefault(); const t = draft.trim(); if (!t || disabled) return; send(t.slice(0, 140)); setDraft(''); }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={140} disabled={disabled} placeholder="Type a message…" aria-label="Message"
              className="h-9 min-w-0 flex-1 rounded-xl px-3 text-[13px] outline-none disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F5F7F6' }} />
            <button type="submit" disabled={disabled || !draft.trim()} className="h-9 shrink-0 rounded-xl px-3 text-[13px] font-extrabold text-white disabled:opacity-40" style={{ background: '#81B64C' }}>Send</button>
          </form>
        )}
        <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? "Show opponent's messages" : "Hide opponent's messages"}
          className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(245,247,246,.6)' }}>
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 max-h-[60vh] w-[min(360px,90vw)] overflow-y-auto rounded-2xl p-2.5 shadow-2xl" style={{ background: '#16201F', border: '1px solid rgba(255,255,255,0.12)' }}>
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
