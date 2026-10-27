import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Loader2, RefreshCw, Search, Clapperboard, Shuffle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { MiniBoard } from '@/components/MiniBoard';
import { useUser } from '@/hooks/use-user';
import { StudioPlayer, type StudioMoment } from '@/components/studio/StudioPlayer';
import { Chess } from 'chess.js';

// Admin > Content Studio: notable moments from every reviewed game on the
// site (not only the admin's), filterable by what happened — brilliant moves,
// traps, forks, sacrifices, mates, blunders, endgames — and by opening. Pick
// one to open it in the 9:16 Studio player for TikTok / Reels / Shorts.

interface Moment extends StudioMoment { id: number; fenBefore: string; score: number; playedAt: string | null; evalAfter: number | null }

const TAGS: { id: string; label: string }[] = [
  { id: 'brilliant', label: 'Brilliant !!' }, { id: 'great', label: 'Great !' }, { id: 'trap', label: 'Traps' }, { id: 'checkmate', label: 'Checkmates' },
  { id: 'sacrifice', label: 'Sacrifices' }, { id: 'fork', label: 'Forks' }, { id: 'pin', label: 'Pins' }, { id: 'skewer', label: 'Skewers' },
  { id: 'discovered', label: 'Discovered attacks' }, { id: 'promotion', label: 'Promotions' }, { id: 'missed_win', label: 'Missed wins' },
  { id: 'blunder', label: 'Blunders ??' }, { id: 'endgame', label: 'Endgames' }, { id: 'opening', label: 'Opening phase' },
];
const TAG_COLOR: Record<string, string> = { brilliant: '#1BACA6', great: '#4A8BD6', trap: '#E8B447', checkmate: '#E8B447', blunder: '#CA3431', missed_win: '#B8343E' };

const afterFen = (fen: string, san: string) => { try { const c = new Chess(fen); c.move(san); return c.fen(); } catch { return fen; } };

export function ContentStudio() {
  const { authUser } = useUser();
  const [tags, setTags] = useState<string[]>([]);
  const [opening, setOpening] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [platform, setPlatform] = useState('');
  const [sort, setSort] = useState<'best' | 'new' | 'random'>('best');
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const [more, setMore] = useState(true);
  const [summary, setSummary] = useState<{ counts: Record<string, number>; progress: { scanned: number; reviewed: number; moments: number } } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [open, setOpen] = useState<Moment | null>(null);

  const query = useCallback((offset: number) => {
    const p = new URLSearchParams({ tags: tags.join(','), sort, limit: '48', offset: String(offset) });
    if (opening.trim()) p.set('opening', opening.trim());
    if (minRating) p.set('minRating', String(minRating));
    if (platform) p.set('platform', platform);
    return apiFetch(`/api/admin/studio/moments?${p}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : { moments: [] })).then((d) => (d.moments ?? []) as Moment[]);
  }, [tags, opening, minRating, platform, sort]);

  useEffect(() => {
    let live = true;
    setMoments(null);
    const t = setTimeout(() => { query(0).then((m) => { if (live) { setMoments(m); setMore(m.length === 48); } }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query]);
  const loadSummary = () => apiFetch('/api/admin/studio/summary', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setSummary(d)).catch(() => {});
  useEffect(() => { void loadSummary(); }, []);

  const scan = async () => {
    setScanning(true);
    try { await apiFetch('/api/admin/studio/scan', { method: 'POST', credentials: 'include' }); await loadSummary(); setSort((s) => s); setTags((t) => [...t]); } finally { setScanning(false); }
  };

  if (!authUser?.isAdmin) return <div className="p-6 text-white">Admins only.</div>;
  const pr = summary?.progress;

  return (
    <div className="mx-auto max-w-6xl px-3 pb-24 pt-3 text-white md:px-0">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/admin" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10" aria-label="Back to admin"><ArrowLeft size={20} /></Link>
        <Clapperboard size={22} className="text-[#81B64C]" />
        <h1 className="text-[22px] font-black">Content Studio</h1>
      </div>
      <p className="mb-3 text-[13px] text-white/60">
        Moments from every reviewed game on ChessScout. Pick one to turn it into a vertical clip with a random board on every move, stickers, a find-the-move countdown and effects. Player names are hidden in clips unless you turn them on.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-[12.5px] text-white/70">
        {pr ? <span><b className="text-white">{pr.moments.toLocaleString()}</b> moments from <b className="text-white">{pr.scanned.toLocaleString()}</b> of {pr.reviewed.toLocaleString()} reviewed games scanned{pr.scanned < pr.reviewed ? ' (the rest are scanned in the background)' : ''}</span> : <span>Loading…</span>}
        <button onClick={scan} disabled={scanning} className="ml-auto flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 font-bold text-white disabled:opacity-50">
          {scanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Scan more now
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {TAGS.map((t) => {
          const on = tags.includes(t.id);
          const n = summary?.counts?.[t.id];
          return (
            <button key={t.id} onClick={() => setTags((cur) => (on ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
              className="rounded-full px-3 py-1.5 text-[12.5px] font-bold"
              style={{ background: on ? '#81B64C' : 'rgba(255,255,255,.06)', color: on ? '#fff' : '#C9CFCD', border: `1px solid ${on ? '#81B64C' : 'rgba(255,255,255,.1)'}` }}>
              {t.label}{n != null ? <span className="ml-1 opacity-70">{n.toLocaleString()}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
          <Search size={15} className="text-white/50" />
          <input value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Opening (e.g. Sicilian, Italian, London)" className="w-full bg-transparent text-[13px] text-white outline-none" />
        </div>
        <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="rounded-lg bg-white/5 px-2 py-2 text-[13px] text-white ring-1 ring-white/10">
          <option value={0}>Any rating</option><option value={1000}>1000+</option><option value={1500}>1500+</option><option value={2000}>2000+</option><option value={2500}>2500+</option>
        </select>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="rounded-lg bg-white/5 px-2 py-2 text-[13px] text-white ring-1 ring-white/10">
          <option value="">All sites</option><option value="chessscout">ChessScout</option><option value="chesscom">Chess.com</option><option value="lichess">Lichess</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg bg-white/5 px-2 py-2 text-[13px] text-white ring-1 ring-white/10">
          <option value="best">Best first</option><option value="new">Newest</option><option value="random">Shuffle</option>
        </select>
        {sort === 'random' && <button onClick={() => setTags((t) => [...t])} className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-2 text-[12.5px] font-bold"><Shuffle size={13} />Again</button>}
      </div>

      {!moments ? <Loader2 className="mx-auto mt-10 animate-spin text-white/60" /> : moments.length === 0 ? (
        <p className="mt-10 text-center text-[14px] text-white/60">Nothing matches yet{pr && pr.scanned < pr.reviewed ? ' — more games are still being scanned' : ''}.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {moments.map((m) => {
              const white = m.moveIndex % 2 === 0;
              const no = `${Math.floor(m.moveIndex / 2) + 1}${white ? '.' : '...'}`;
              return (
                <button key={m.id} onClick={() => setOpen(m)} className="overflow-hidden rounded-xl bg-white/5 text-left ring-1 ring-white/10 transition hover:ring-[#81B64C]">
                  <div className="aspect-square w-full"><MiniBoard fen={afterFen(m.fenBefore, m.san)} size={400} flipped={!white} /></div>
                  <div className="p-2.5">
                    <p className="truncate text-[13.5px] font-black">{no}{m.san}{m.trapName ? <span className="font-bold text-[#E8B447]"> · {m.trapName}</span> : null}</p>
                    <p className="truncate text-[11.5px] text-white/55">{m.opening ?? 'Unknown opening'}</p>
                    <p className="truncate text-[11.5px] text-white/45">{m.whiteRating ?? '?'} vs {m.blackRating ?? '?'} · {m.platform === 'chesscom' ? 'Chess.com' : m.platform === 'lichess' ? 'Lichess' : 'ChessScout'}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.tags.filter((t) => t !== 'opening').slice(0, 4).map((t) => (
                        <span key={t} className="rounded px-1.5 py-0.5 text-[10px] font-black uppercase" style={{ background: `${TAG_COLOR[t] ?? '#81B64C'}33`, color: TAG_COLOR[t] ?? '#B8E08C' }}>{t.replace('_', ' ')}</span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {more && (
            <button onClick={() => query(moments.length).then((m) => { setMoments((cur) => [...(cur ?? []), ...m]); setMore(m.length === 48); })}
              className="mx-auto mt-4 block rounded-lg bg-white/10 px-4 py-2 text-[13px] font-bold">Load more</button>
          )}
        </>
      )}
      {open && <StudioPlayer moment={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
