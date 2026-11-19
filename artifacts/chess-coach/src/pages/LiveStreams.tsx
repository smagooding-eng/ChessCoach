// Watch live streams on chessscout.net (anyone signed in). A co-stream (two players
// streaming their match together) is one card: both players' views, side by side on wider
// screens. Each view already carries both voices, so only one plays sound at a time.
import { BackLink } from '@/lib/navBack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { RD } from '@/lib/redesignTheme';
import { useUser } from '@/hooks/use-user';
import { listLive, watchLive, type LiveListing } from '@/lib/streamer/live';

const BG = '#050A0B', CARD = '#0D1516', CARD_LIGHT = '#121B1D';
type State = 'connecting' | 'live' | 'ended' | 'failed';
type Entry = { key: string; streams: LiveListing[] };

/** One player's view of the stream. */
function StreamView({ s, sound, onSound, onState }: { s: LiveListing; sound: boolean; onSound: () => void; onState: (st: State) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    if (!video.current) return undefined;
    let stop: (() => void) | null = null, cancelled = false;
    void watchLive(s.id, video.current, (st) => { setState(st); onState(st); })
      .then((fn) => { if (cancelled) fn(); else stop = fn; })
      .catch(() => { setState('failed'); onState('failed'); });
    return () => { cancelled = true; stop?.(); };
  }, [s.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="rounded-2xl overflow-hidden relative w-full" style={{ background: '#000' }}>
      <video ref={video} autoPlay playsInline muted={!sound} className="w-full max-h-[78vh] object-contain" />
      <div className="absolute top-2 left-2 flex gap-2 items-center">
        <span className="px-2 py-1 rounded-md text-[11px] font-extrabold" style={{ background: state === 'live' ? RD.red : CARD, color: '#fff' }}>
          {state === 'live' ? '● LIVE' : state === 'connecting' ? 'Connecting…' : state === 'ended' ? 'Stream ended' : state === 'failed' ? 'Couldn’t connect' : ''}
        </span>
        <span className="text-[13px] font-bold drop-shadow">{s.host}{s.title ? ` · ${s.title}` : ''}</span>
      </div>
      {state === 'live' && (
        <button onClick={onSound} className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl font-bold text-sm"
          style={sound ? { background: CARD, color: RD.text } : { background: RD.green, color: '#06110A' }}>
          {sound ? '🔊 Sound on' : '🔈 Tap for sound'}
        </button>
      )}
    </div>
  );
}

export default function LiveStreams() {
  const { authUser, isPremium } = useUser();
  const [list, setList] = useState<LiveListing[] | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [soundId, setSoundId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => { try { const l = await listLive(); if (alive) setList(l); } catch { if (alive) setList([]); } };
    void load();
    const id = window.setInterval(load, 5000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  // Co-streams grouped into one entry
  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const s of list ?? []) {
      const key = s.coId ? `co:${s.coId}` : s.id;
      const e = out.find((x) => x.key === key);
      if (e) e.streams.push(s); else out.push({ key, streams: [s] });
    }
    return out;
  }, [list]);
  // Keep showing what's open while the list refreshes (a stream that ended stays until closed)
  const [shown, setShown] = useState<Entry | null>(null);
  useEffect(() => {
    if (!currentKey) { setShown(null); return; }
    const e = entries.find((x) => x.key === currentKey);
    if (e) setShown((prev) => (prev && prev.key === e.key && prev.streams.map((s) => s.id).join() === e.streams.map((s) => s.id).join() ? prev : e));
  }, [currentKey, entries]);

  const open = (e: Entry) => { setCurrentKey(e.key); setSoundId(null); setFailed(false); };
  const close = () => { setCurrentKey(null); setSoundId(null); setFailed(false); };

  return (
    <div className="min-h-screen p-3 flex flex-col gap-3 relative z-0" style={{ background: BG, color: RD.text }}>
      <div className="flex items-center gap-2">
        <BackLink fallback={authUser?.isAdmin ? '/admin' : '/'} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: CARD_LIGHT, color: RD.text }}>← {authUser?.isAdmin ? 'Admin' : 'Back'}</BackLink>
        <h1 className="font-extrabold text-lg">Live streams</h1>
        {(isPremium || authUser?.isAdmin) && (
          <Link href="/studio" className="ml-auto text-sm font-bold px-3 py-1.5 rounded-lg" style={{ background: RD.red, color: '#fff' }}>◉ Go live</Link>
        )}
      </div>

      {shown && (
        <div className="mx-auto w-full max-w-[1400px] flex flex-col gap-2">
          {shown.streams.length > 1 && (
            <p className="text-[13px] font-bold text-center" style={{ color: RD.muted }}>
              {shown.streams.map((s) => s.host).join(' & ')} are streaming their match together · each view has both voices
            </p>
          )}
          <div className={shown.streams.length > 1 ? 'grid gap-2 md:grid-cols-2' : 'mx-auto w-full max-w-[900px]'}>
            {shown.streams.map((s, i) => (
              <StreamView key={s.id} s={s}
                sound={(soundId ?? null) === s.id}
                onSound={() => setSoundId((cur) => (cur === s.id ? null : s.id))}
                onState={(st) => { if (st === 'failed') setFailed(true); if (st === 'live' && i === 0) setFailed(false); }} />
            ))}
          </div>
          <button onClick={close} className="self-center px-3 py-1 rounded-lg text-[12px] font-bold" style={{ background: CARD, color: RD.text }}>Close</button>
        </div>
      )}
      {failed && <p className="text-sm text-center" style={{ color: RD.muted }}>Some networks block direct connections. Try another network (for example Wi-Fi instead of mobile data).</p>}

      <div className="mx-auto w-full max-w-[900px] p-4 rounded-2xl" style={{ background: CARD, border: `1px solid ${RD.border}` }}>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: RD.muted }}>Live now</p>
        {list === null && <p className="text-sm" style={{ color: RD.muted }}>Loading…</p>}
        {list && entries.length === 0 && <p className="text-sm" style={{ color: RD.muted }}>Nobody is live right now. Pro members go live from Streamer Studio and show up here.</p>}
        <div className="flex flex-col gap-2">
          {entries.map((e) => {
            const first = e.streams[0];
            const co = e.streams.length > 1;
            const viewers = e.streams.reduce((n, s) => n + s.viewers, 0);
            const since = Math.min(...e.streams.map((s) => s.startedAt));
            return (
              <button key={e.key} onClick={() => open(e)} className="text-left p-3 rounded-xl flex items-center gap-3" style={{ background: CARD_LIGHT, border: `1px solid ${currentKey === e.key ? RD.green : RD.border}` }}>
                <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: RD.red }} />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{co ? e.streams.map((s) => s.host).join(' & ') : first.host}{co && <span className="ml-2 text-[10px] font-black px-1.5 py-0.5 rounded" style={{ background: RD.green, color: '#06110A' }}>CO-STREAM</span>}</span>
                  <span className="block text-[12px] truncate" style={{ color: RD.muted }}>{first.title || 'Playing on chessscout.net'} · {Math.max(1, Math.round((Date.now() - since) / 60000))} min · {viewers} watching</span>
                </span>
                <span className="text-sm font-bold" style={{ color: RD.green }}>Watch ▶</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
