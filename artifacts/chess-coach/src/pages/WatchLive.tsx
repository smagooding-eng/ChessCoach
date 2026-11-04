// Watch live: the top over-the-board and online events Lichess is broadcasting
// right now, with every game on its own board, updating as the moves come in.
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Loader2, ExternalLink, Radio, ArrowLeft } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { MiniBoard } from '@/components/MiniBoard';
import { apiFetch } from '@/lib/api';
import { MoveBrowserBar } from '@/components/MoveBrowserBar';
import { useMoveBrowser, positionsFromSan } from '@/hooks/use-move-browser';
import { PT, cardStyle, ghostBtn } from '@/lib/playTheme';

interface Bc { id: string; name: string; image: string | null; info: { format?: string; tc?: string; location?: string } | null; round: { id: string; name: string; ongoing: boolean; startsAt: number | null; finished: boolean } | null }
interface Game { white: string | null; black: string | null; whiteElo: string | null; blackElo: string | null; whiteTitle: string | null; blackTitle: string | null; result: string | null; url: string | null; fen: string; last: { from: string; to: string } | null; moves: number; lastSan: string | null; sans?: string[]; startFen?: string | null }

const who = (name: string | null, title: string | null, elo: string | null) => (
  <span className="truncate">{title && <span className="mr-1 rounded bg-[#CA3431] px-1 text-[10px] font-black text-white">{title}</span>}{name ?? '?'}{elo ? <span className="ml-1 font-semibold" style={{ color: PT.muted }}>{elo}</span> : null}</span>
);

export function WatchLive() {
  const [list, setList] = useState<{ active: Bc[]; upcoming: Bc[] } | null>(null);
  const [sel, setSel] = useState<Bc | null>(null);
  const [games, setGames] = useState<Game[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

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

  if (sel) {
    return (
      <div className="mx-auto max-w-[900px] space-y-3 p-4 pb-24">
        <button onClick={() => { if (focus) setOpen(null); else { setSel(null); setGames(null); } }} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold" style={ghostBtn}><ArrowLeft size={15} /> {focus ? 'All games' : 'All events'}</button>
        <div>
          <h1 className="text-xl font-black" style={{ color: PT.text }}>{sel.name}</h1>
          <p className="text-[13px]" style={{ color: PT.muted }}>{roundLabel}{sel.info?.tc ? ` · ${sel.info.tc}` : ''}{sel.info?.location ? ` · ${sel.info.location}` : ''}</p>
        </div>
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
        <p className="text-[13px]" style={{ color: PT.muted }}>Top events happening now, move by move. Broadcast by Lichess.</p>
      </div>
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
