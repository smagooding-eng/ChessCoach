// Watch live streams on chessscout.net (admin-only while Streamer Studio is in development).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { RD } from '@/lib/redesignTheme';
import { listLive, watchLive, type LiveListing } from '@/lib/streamer/live';

const BG = '#050A0B', CARD = '#0D1516', CARD_LIGHT = '#121B1D';

export default function LiveStreams() {
  const [list, setList] = useState<LiveListing[] | null>(null);
  const [current, setCurrent] = useState<LiveListing | null>(null);
  const [state, setState] = useState<'connecting' | 'live' | 'ended' | 'failed' | null>(null);
  const [muted, setMuted] = useState(true);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => { try { const l = await listLive(); if (alive) setList(l); } catch { if (alive) setList([]); } };
    void load();
    const id = window.setInterval(load, 5000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!current || !video.current) return undefined;
    let stop: (() => void) | null = null, cancelled = false;
    setMuted(true);
    void watchLive(current.id, video.current, (s) => setState(s))
      .then((fn) => { if (cancelled) fn(); else stop = fn; })
      .catch(() => setState('failed'));
    return () => { cancelled = true; stop?.(); };
  }, [current]);

  return (
    <div className="min-h-screen p-3 flex flex-col gap-3 relative z-0" style={{ background: BG, color: RD.text }}>
      <div className="flex items-center gap-2">
        <Link href="/admin" className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: CARD_LIGHT, color: RD.text }}>← Admin</Link>
        <h1 className="font-extrabold text-lg">Live streams</h1>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: RD.gold, color: '#050A0B' }}>IN DEVELOPMENT</span>
        <Link href="/admin/streamer" className="ml-auto text-sm font-bold px-3 py-1.5 rounded-lg" style={{ background: RD.red, color: '#fff' }}>◉ Go live</Link>
      </div>

      {current && (
        <div className="rounded-2xl overflow-hidden relative mx-auto w-full max-w-[900px]" style={{ background: '#000' }}>
          <video ref={video} autoPlay playsInline muted={muted} className="w-full max-h-[78vh] object-contain" />
          <div className="absolute top-2 left-2 flex gap-2 items-center">
            <span className="px-2 py-1 rounded-md text-[11px] font-extrabold" style={{ background: state === 'live' ? RD.red : CARD, color: '#fff' }}>
              {state === 'live' ? '● LIVE' : state === 'connecting' ? 'Connecting…' : state === 'ended' ? 'Stream ended' : state === 'failed' ? 'Couldn’t connect' : ''}
            </span>
            <span className="text-[13px] font-bold drop-shadow">{current.host}{current.title ? ` · ${current.title}` : ''}</span>
          </div>
          {muted && state === 'live' && (
            <button onClick={() => setMuted(false)} className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl font-bold text-sm" style={{ background: RD.green, color: '#06110A' }}>🔊 Tap for sound</button>
          )}
          <button onClick={() => { setCurrent(null); setState(null); }} className="absolute top-2 right-2 px-3 py-1 rounded-lg text-[12px] font-bold" style={{ background: CARD, color: RD.text }}>Close</button>
        </div>
      )}
      {state === 'failed' && <p className="text-sm text-center" style={{ color: RD.muted }}>Some networks block direct connections. Try another network (for example Wi-Fi instead of mobile data).</p>}

      <div className="mx-auto w-full max-w-[900px] p-4 rounded-2xl" style={{ background: CARD, border: `1px solid ${RD.border}` }}>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: RD.muted }}>Live now</p>
        {list === null && <p className="text-sm" style={{ color: RD.muted }}>Loading…</p>}
        {list && list.length === 0 && <p className="text-sm" style={{ color: RD.muted }}>Nobody is live right now. Go live from Streamer Studio and it shows up here.</p>}
        <div className="flex flex-col gap-2">
          {(list ?? []).map((l) => (
            <button key={l.id} onClick={() => setCurrent(l)} className="text-left p-3 rounded-xl flex items-center gap-3" style={{ background: CARD_LIGHT, border: `1px solid ${current?.id === l.id ? RD.green : RD.border}` }}>
              <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: RD.red }} />
              <span className="flex-1 min-w-0">
                <span className="block font-bold truncate">{l.host}</span>
                <span className="block text-[12px] truncate" style={{ color: RD.muted }}>{l.title || 'Playing on chessscout.net'} · {Math.max(1, Math.round((Date.now() - l.startedAt) / 60000))} min · {l.viewers} watching</span>
              </span>
              <span className="text-sm font-bold" style={{ color: RD.green }}>Watch ▶</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
