// Watch live: the top over-the-board and online events Lichess is broadcasting
// right now, with every game on its own board, updating as the moves come in.
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Loader2, ExternalLink, Radio, ArrowLeft, Video } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { VideoFrame, useLichessGame } from '@/components/watch/LiveVideo';
import { ChessBoard } from '@/components/ChessBoard';
import { MiniBoard } from '@/components/MiniBoard';
import { apiFetch } from '@/lib/api';
import { MoveBrowserBar } from '@/components/MoveBrowserBar';
import { useMoveBrowser, positionsFromSan } from '@/hooks/use-move-browser';
import { PT, cardStyle, ghostBtn } from '@/lib/playTheme';

interface Bc { id: string; name: string; image: string | null; stream?: string | null; info: { format?: string; tc?: string; location?: string } | null; round: { id: string; name: string; ongoing: boolean; startsAt: number | null; finished: boolean } | null }
interface Game { white: string | null; black: string | null; whiteElo: string | null; blackElo: string | null; whiteTitle: string | null; blackTitle: string | null; result: string | null; url: string | null; fen: string; last: { from: string; to: string } | null; moves: number; lastSan: string | null; sans?: string[]; startFen?: string | null }

interface Streamer { id: string; name: string; title: string | null; service: string | null; status: string | null; lang: string | null; headline: string | null; image: string | null; twitch: string | null; youTube: string | null; gameId: string | null }
const streamUrl = (s: Streamer) => (s.service === 'twitch' ? s.twitch : s.service === 'youTube' ? s.youTube : s.twitch ?? s.youTube);
const clock = (sec: number | null) => (sec == null ? '' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`);

const who = (name: string | null, title: string | null, elo: string | null) => (
  <span className="truncate">{title && <span className="mr-1 rounded bg-[#CA3431] px-1 text-[10px] font-black text-white">{title}</span>}{name ?? '?'}{elo ? <span className="ml-1 font-semibold" style={{ color: PT.muted }}>{elo}</span> : null}</span>
);

export function WatchLive() {
  const [list, setList] = useState<{ active: Bc[]; upcoming: Bc[] } | null>(null);
  const [sel, setSel] = useState<Bc | null>(null);
  const [games, setGames] = useState<Game[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const { authUser } = useUser();
  // Lichess streamers live now (video + the game they're playing), refreshed while you're here.
  const [streamers, setStreamers] = useState<Streamer[] | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => apiFetch('/api/lichess/streamers').then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d) setStreamers(d.streamers ?? []); }).catch(() => {});
    void load(); const t = setInterval(load, 30_000);
    return () => { live = false; clearInterval(t); };
  }, []);
  const streamer = watching ? streamers?.find((x) => x.id === watching) ?? null : null;
  const sgame = useLichessGame(streamer?.gameId ?? null);
  // An event's video link (admins set it from the event page).
  const [streamEdit, setStreamEdit] = useState('');
  const [streamNote, setStreamNote] = useState<string | null>(null);
  useEffect(() => { setStreamEdit(sel?.stream ?? ''); setStreamNote(null); }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveStream = async () => {
    if (!sel) return;
    setStreamNote(null);
    const r = await apiFetch('/api/admin/broadcast-stream', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tourId: sel.id, url: streamEdit.trim() }) }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (!r?.ok) { setStreamNote(d?.error ?? "Couldn't save it"); return; }
    const url = streamEdit.trim() || null;
    setSel({ ...sel, stream: url });
    setList((l) => (l ? { ...l, active: l.active.map((b) => (b.id === sel.id ? { ...b, stream: url } : b)) } : l));
    setStreamNote(url ? 'Saved. Everyone watching this event sees the video.' : 'Video removed.');
  };

  useEffect(() => {
    let live = true;
    apiFetch('/api/lichess/broadcasts').then((r) => (r.ok ? r.json() : null)).then((d) => { if (live) setList(d ?? { active: [], upcoming: [] }); }).catch(() => live && setList({ active: [], upcoming: [] }));
    return () => { live = false; };
  }, []);

  // The selected round's games, refreshed every 20 seconds while it's on.
  useEffect(() => {
    if (!sel?.round) return;
    let live = true;
    const load = () => apiFetch(`/api/lichess/broadcast/${sel.round!.id}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d) setGames(d.games ?? []); }).catch(() => {});
    setGames(null); void load();
    const t = sel.round.ongoing ? setInterval(load, 20_000) : null;
    return () => { live = false; if (t) clearInterval(t); };
  }, [sel]);

  const focus = open != null && games ? games[open] : null;
  // Step back through the open game's moves (it keeps updating while you look back).
  const positions = useMemo(() => (focus?.sans?.length ? positionsFromSan(focus.sans, focus.startFen || undefined) : []), [focus?.sans?.join(' '), focus?.startFen]); // eslint-disable-line react-hooks/exhaustive-deps
  const browser = useMoveBrowser(positions, `${sel?.round?.id ?? ''}-${open ?? ''}`);
  const roundLabel = useMemo(() => (sel?.round ? `${sel.round.name}${sel.round.ongoing ? ' · live' : sel.round.finished ? ' · finished' : ''}` : ''), [sel]);

  if (watching) {
    const s = streamer;
    const flipped = !!(s && sgame?.black && sgame.black.name.toLowerCase() === s.id.toLowerCase());
    const top = flipped ? sgame?.white : sgame?.black, bottom = flipped ? sgame?.black : sgame?.white;
    const topClock = flipped ? sgame?.wc : sgame?.bc, bottomClock = flipped ? sgame?.bc : sgame?.wc;
    return (
      <div className="mx-auto max-w-[900px] space-y-3 p-4 pb-24">
        <button onClick={() => setWatching(null)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold" style={ghostBtn}><ArrowLeft size={15} /> Watch live</button>
        {!s ? <p className="text-[13px]" style={{ color: PT.muted }}>This streamer has gone offline.</p> : (<>
          <div>
            <h1 className="text-xl font-black" style={{ color: PT.text }}>{s.title && <span className="mr-1.5 rounded bg-[#CA3431] px-1.5 text-[13px] text-white">{s.title}</span>}{s.name}</h1>
            {s.status && <p className="truncate text-[13px]" style={{ color: PT.muted }}>{s.status}</p>}
          </div>
          <VideoFrame url={streamUrl(s)} label={s.service === 'youTube' ? 'YouTube' : 'Twitch'} />
          {s.gameId ? (!sgame ? <Loader2 className="mx-auto mt-4 animate-spin" style={{ color: PT.green }} /> : (
            <div className="mx-auto max-w-[560px] space-y-2">
              <p className="flex justify-between gap-2 text-[14px] font-bold" style={{ color: PT.text }}>{top ? who(top.name, top.title, top.rating ? String(top.rating) : null) : <span />}<span className="tabular-nums">{clock(topClock ?? null)}</span></p>
              <ChessBoard fen={sgame.fen} lastMove={sgame.last} flipped={flipped} maxWidthOverride="100%" suppressConfirmMoves />
              <p className="flex justify-between gap-2 text-[14px] font-bold" style={{ color: PT.text }}>{bottom ? who(bottom.name, bottom.title, bottom.rating ? String(bottom.rating) : null) : <span />}<span className="tabular-nums">{clock(bottomClock ?? null)}</span></p>
              {sgame.ended && <p className="text-center text-[12.5px]" style={{ color: PT.muted }}>Game over. Their next game shows here when it starts.</p>}
              <a href={`https://lichess.org/${s.gameId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-bold underline" style={{ color: PT.green }}>Open on Lichess <ExternalLink size={12} /></a>
            </div>
          )) : <p className="text-center text-[13px]" style={{ color: PT.muted }}>Not in a game right now. Their next game shows here when it starts.</p>}
        </>)}
      </div>
    );
  }

  if (sel) {
    return (
      <div className="mx-auto max-w-[900px] space-y-3 p-4 pb-24">
        <button onClick={() => { if (focus) setOpen(null); else { setSel(null); setGames(null); } }} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold" style={ghostBtn}><ArrowLeft size={15} /> {focus ? 'All games' : 'All events'}</button>
        <div>
          <h1 className="text-xl font-black" style={{ color: PT.text }}>{sel.name}</h1>
          <p className="text-[13px]" style={{ color: PT.muted }}>{roundLabel}{sel.info?.tc ? ` · ${sel.info.tc}` : ''}{sel.info?.location ? ` · ${sel.info.location}` : ''}</p>
        </div>
        {sel.stream && <div className="mx-auto max-w-[560px]"><VideoFrame url={sel.stream} label="the event's stream" /></div>}
        {authUser?.isAdmin && !focus && (
          <div className="space-y-1.5 rounded-xl p-3" style={cardStyle}>
            <p className="text-[12px] font-bold" style={{ color: PT.muted }}>Admin: the event's official video (YouTube or Twitch link)</p>
            <div className="flex gap-2">
              <input value={streamEdit} onChange={(e) => setStreamEdit(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className="min-w-0 flex-1 rounded-lg px-3 py-2 text-[13px]" style={{ background: 'rgba(255,255,255,.06)', color: PT.text }} />
              <button onClick={() => void saveStream()} className="shrink-0 rounded-lg px-3 py-2 text-[13px] font-bold" style={{ background: PT.green, color: '#fff' }}>Save</button>
            </div>
            {streamNote && <p className="text-[12px]" style={{ color: PT.muted }}>{streamNote}</p>}
          </div>
        )}
        {!games ? <Loader2 className="mx-auto mt-10 animate-spin" style={{ color: PT.green }} /> : focus ? (
          <div className="mx-auto max-w-[560px] space-y-2">
            <p className="flex justify-between gap-2 text-[14px] font-bold" style={{ color: PT.text }}>{who(focus.black, focus.blackTitle, focus.blackElo)}</p>
            <ChessBoard fen={browser.viewing && browser.fen ? browser.fen : focus.fen} lastMove={browser.viewing ? browser.lastMove : focus.last} maxWidthOverride="100%" suppressConfirmMoves />
            <p className="flex justify-between gap-2 text-[14px] font-bold" style={{ color: PT.text }}>{who(focus.white, focus.whiteTitle, focus.whiteElo)}<span style={{ color: PT.muted }}>{focus.result && focus.result !== '*' ? focus.result : `Move ${Math.ceil(focus.moves / 2)}${focus.lastSan ? ` · ${focus.lastSan}` : ''}`}</span></p>
            {positions.length > 1 && (<>
              <MoveBrowserBar browser={browser} />
              <div className="flex max-h-40 flex-wrap gap-x-1 gap-y-0.5 overflow-y-auto rounded-xl p-2 text-[13px] font-semibold" style={{ background: 'rgba(255,255,255,0.04)' }}>
                {(focus.sans ?? []).map((san, k) => (
                  <button key={k} onClick={() => browser.goTo(k + 1)} className="rounded px-1 py-0.5"
                    style={{ background: browser.index === k + 1 ? '#81B64C' : 'transparent', color: browser.index === k + 1 ? '#fff' : PT.text }}>
                    {k % 2 === 0 && <span style={{ color: PT.muted }}>{k / 2 + 1}.</span>}{san}
                  </button>
                ))}
              </div>
            </>)}
            {focus.url && /^https:\/\/lichess\.org\//.test(focus.url) && <a href={focus.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-bold underline" style={{ color: PT.green }}>Open on Lichess <ExternalLink size={12} /></a>}
          </div>
        ) : games.length === 0 ? <p className="text-center text-[13px]" style={{ color: PT.muted }}>No games in this round yet.</p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {games.map((g, k) => (
              <button key={k} onClick={() => setOpen(k)} className="overflow-hidden rounded-xl text-left" style={cardStyle}>
                <p className="flex px-2 pt-1.5 text-[11.5px] font-bold" style={{ color: PT.text }}>{who(g.black, g.blackTitle, g.blackElo)}</p>
                <div className="p-1.5"><MiniBoard fen={g.fen} size={260} lastMove={g.last} /></div>
                <p className="flex items-center justify-between gap-1 px-2 pb-1.5 text-[11.5px] font-bold" style={{ color: PT.text }}>{who(g.white, g.whiteTitle, g.whiteElo)}<span style={{ color: g.result && g.result !== '*' ? PT.green : PT.muted }}>{g.result && g.result !== '*' ? g.result : 'live'}</span></p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-4 p-4 pb-24">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black" style={{ color: PT.text }}><Radio size={22} style={{ color: '#FF5058' }} />Watch live</h1>
        <p className="text-[13px]" style={{ color: PT.muted }}>Top events and streamers playing now, move by move. Broadcast by Lichess.</p>
      </div>
      {streamers && streamers.length > 0 && (<>
        <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide" style={{ color: PT.muted }}><Video size={14} /> On stream now</p>
        <div className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {streamers.slice(0, 20).map((st) => (
            <button key={st.id} onClick={() => setWatching(st.id)} className="w-[150px] shrink-0 snap-start overflow-hidden rounded-xl text-left" style={cardStyle}>
              <div className="relative grid h-[84px] place-items-center" style={{ background: 'rgba(255,255,255,.05)' }}>
                {st.image ? <img src={st.image} alt="" className="h-full w-full object-cover" /> : <span className="text-3xl">♞</span>}
                <span className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-black text-white" style={{ background: '#FF5058' }}>LIVE</span>
                {st.gameId && <span className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-black text-white" style={{ background: 'rgba(0,0,0,.65)' }}>♟ playing</span>}
              </div>
              <p className="truncate px-2 pt-1.5 text-[12.5px] font-extrabold" style={{ color: PT.text }}>{st.title && <span className="mr-1 rounded bg-[#CA3431] px-1 text-[10px] text-white">{st.title}</span>}{st.name}</p>
              <p className="truncate px-2 pb-2 text-[11px]" style={{ color: PT.muted }}>{st.service === 'youTube' ? 'YouTube' : 'Twitch'}{st.lang ? ` · ${st.lang.toUpperCase()}` : ''}</p>
            </button>
          ))}
        </div>
      </>)}
      {!list ? <Loader2 className="mx-auto mt-10 animate-spin" style={{ color: PT.green }} /> : (<>
        {list.active.length === 0 && <p className="text-[13px]" style={{ color: PT.muted }}>Nothing is being broadcast right now. Check back soon.</p>}
        <div className="space-y-2">
          {list.active.map((b) => (
            <button key={b.id} onClick={() => setSel(b)} className="flex w-full items-center gap-3 p-3 text-left" style={cardStyle}>
              {b.image ? <img src={b.image} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" /> : <span className="grid h-12 w-20 shrink-0 place-items-center rounded-lg text-2xl" style={{ background: 'rgba(255,255,255,.06)' }}>♛</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-extrabold" style={{ color: PT.text }}>{b.name}</span>
                <span className="block truncate text-[12px]" style={{ color: PT.muted }}>{b.round?.name}{b.info?.tc ? ` · ${b.info.tc}` : ''}{b.info?.location ? ` · ${b.info.location}` : ''}</span>
              </span>
              {b.stream && <Video size={16} className="shrink-0" style={{ color: PT.green }} />}
              {b.round?.ongoing && <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-black text-white" style={{ background: '#FF5058' }}>LIVE</span>}
            </button>
          ))}
        </div>
        {list.upcoming.length > 0 && (<>
          <p className="pt-2 text-[12px] font-bold uppercase tracking-wide" style={{ color: PT.muted }}>Coming up</p>
          <div className="space-y-1.5">
            {list.upcoming.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]" style={cardStyle}>
                <span className="truncate font-bold" style={{ color: PT.text }}>{b.name}</span>
                <span className="shrink-0" style={{ color: PT.muted }}>{b.round?.startsAt ? new Date(b.round.startsAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</span>
              </div>
            ))}
          </div>
        </>)}
      </>)}
      <div className="flex justify-center"><Link href="/live" className="rounded-xl px-4 py-2.5 text-[13px] font-bold" style={ghostBtn}>Play instead</Link></div>
    </div>
  );
}

export default WatchLive;
