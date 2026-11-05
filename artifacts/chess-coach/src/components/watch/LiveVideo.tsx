// Video for Watch Live: a player's or an event's YouTube / Twitch stream, played with
// their official embedded player, and a Lichess game followed move by move.
import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { PT } from '@/lib/playTheme';

/** The embeddable player for a YouTube or Twitch link (null when it can't be embedded). */
export function embedSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const parent = typeof window !== 'undefined' ? window.location.hostname : 'chessscout.net';
  if (host === 'twitch.tv') {
    const name = u.pathname.split('/').filter(Boolean)[0];
    if (!name || ['videos', 'directory'].includes(name)) return null;
    return `https://player.twitch.tv/?channel=${encodeURIComponent(name)}&parent=${encodeURIComponent(parent)}&autoplay=true&muted=true`;
  }
  const yt = (id: string) => `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=1&playsinline=1`;
  if (host === 'youtu.be') { const id = u.pathname.slice(1); return id ? yt(id) : null; }
  if (host === 'youtube.com') {
    const v = u.searchParams.get('v'); if (v) return yt(v);
    const p = u.pathname.split('/').filter(Boolean);
    if ((p[0] === 'live' || p[0] === 'embed') && p[1]) return yt(p[1]);
    if (p[0] === 'channel' && p[1]?.startsWith('UC')) return `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(p[1])}&autoplay=1&mute=1&playsinline=1`;
  }
  return null;
}

export function VideoFrame({ url, label }: { url: string | null; label?: string }) {
  const src = embedSrc(url);
  if (!url) return null;
  if (!src) return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-bold" style={{ background: 'rgba(255,255,255,.06)', color: PT.text }}>
      Watch the video{label ? ` on ${label}` : ''} <ExternalLink size={13} />
    </a>
  );
  return (
    <div className="space-y-1">
      <div className="overflow-hidden rounded-xl" style={{ aspectRatio: '16 / 9', background: '#000' }}>
        <iframe src={src} title={label ?? 'Live video'} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      </div>
      <p className="text-[11px]" style={{ color: PT.muted }}>Starts muted: tap the video for sound. The video can run a little behind the board.</p>
    </div>
  );
}

export interface LiveSide { name: string; title: string | null; rating: number | null }
export interface LiveGameState { fen: string; last: { from: string; to: string } | null; white: LiveSide | null; black: LiveSide | null; wc: number | null; bc: number | null; ended: boolean }

/** Follows a Lichess game as it's played (Lichess's public game stream). */
export function useLichessGame(gameId: string | null): LiveGameState | null {
  const [st, setSt] = useState<LiveGameState | null>(null);
  useEffect(() => {
    setSt(null);
    if (!gameId) return;
    const ac = new AbortController();
    const uci = (m?: string) => (m && m.length >= 4 ? { from: m.slice(0, 2), to: m.slice(2, 4) } : null);
    const side = (p?: { user?: { name?: string; title?: string }; rating?: number }) => (p ? { name: p.user?.name ?? 'Anonymous', title: p.user?.title ?? null, rating: p.rating ?? null } : null);
    (async () => {
      try {
        const r = await fetch(`https://lichess.org/api/stream/game/${encodeURIComponent(gameId)}`, { signal: ac.signal });
        if (!r.ok || !r.body) return;
        const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line) continue;
            try {
              const d = JSON.parse(line) as { fen?: string; lm?: string; lastMove?: string; wc?: number; bc?: number; players?: { white?: Parameters<typeof side>[0]; black?: Parameters<typeof side>[0] }; status?: { name?: string } | string };
              if (!d.fen) continue;
              setSt((old) => ({
                fen: (() => { const f = d.fen!.split(' '); return f.length >= 4 ? d.fen! : `${f[0]} ${f[1] === 'b' ? 'b' : 'w'} - - 0 1`; })(), last: uci(d.lm ?? d.lastMove),
                white: d.players ? side(d.players.white) : old?.white ?? null, black: d.players ? side(d.players.black) : old?.black ?? null,
                wc: d.wc ?? old?.wc ?? null, bc: d.bc ?? old?.bc ?? null, ended: false,
              }));
            } catch { /* skip a bad line */ }
          }
        }
        setSt((old) => (old ? { ...old, ended: true } : old));
      } catch { /* closed or offline */ }
    })();
    return () => ac.abort();
  }, [gameId]);
  return st;
}
