// Every puzzle reel made in the Content Studio, with its answer, so comments can be
// answered days later. Find one by the small #number on the reel, or by date.
import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Trash2, Film, Search, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { MiniBoard } from '@/components/MiniBoard';
import { themeLabel } from '@/components/studio/StudioPlayer';
import type { PuzzleReelOpts } from '@/components/studio/PuzzleReel';

interface SavedReel {
  puzzle_id: number; mode: 'mate2' | 'abc'; theme: string | null; fen: string; moves: string; rating: number | null;
  answer: string; letter: string | null; headline: string | null; choices: PuzzleReelOpts['choices'] | null; rendered: boolean; created_at: string; updated_at: string;
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}
      className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black">
      {done ? <Check size={14} /> : <Copy size={14} />}{done ? 'Copied' : label}
    </button>
  );
}

export function PuzzleAnswers({ onMakeAnswerReel }: { onMakeAnswerReel: (o: Partial<PuzzleReelOpts>) => void }) {
  const [list, setList] = useState<SavedReel[] | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const load = useCallback(async (query = '') => {
    setErr(null);
    try {
      const r = await apiFetch(`/api/admin/studio/puzzle-reels${query ? `?q=${encodeURIComponent(query)}` : ''}`, { credentials: 'include' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'failed');
      setList(d.reels ?? []);
    } catch { setErr('Couldn’t load your puzzle reels.'); setList([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => void load(q.trim()), 300); return () => clearTimeout(t); }, [q, load]);

  const del = async (r: SavedReel) => {
    await apiFetch(`/api/admin/studio/puzzle-reels/${r.puzzle_id}/${r.mode}`, { method: 'DELETE', credentials: 'include' }).catch(() => undefined);
    setConfirm(null); void load(q.trim());
  };

  return (
    <div>
      <p className="mb-3 text-[12.5px] text-white/60">Every puzzle reel you turn into an MP4 or Clean view is saved here with its answer. Look for the small <b>#number</b> above the board in the reel, or find it by date.</p>
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
        <Search size={15} className="text-white/40" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Puzzle # or a move (e.g. 4821 or Qh7#)" className="w-full bg-transparent text-[14px] text-white outline-none" />
      </div>
      {err && <p className="text-[12px] text-[#E5484D]">{err}</p>}
      {list === null && <p className="flex items-center gap-2 text-[13px] text-white/60"><Loader2 size={14} className="animate-spin" />Loading…</p>}
      {list && list.length === 0 && !err && <p className="text-[13px] text-white/60">{q ? 'No puzzle reel matches that.' : 'No puzzle reels saved yet. Make one in Puzzles or the Reels plan: when you tap MP4 or Clean view its answer lands here.'}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(list ?? []).map((r) => {
          const key = `${r.puzzle_id}-${r.mode}`;
          const toPlay = r.fen.split(' ')[1] === 'b' ? 'Black' : 'White';
          const answerLine = r.mode === 'abc' && r.letter ? `${r.letter}: ${r.answer}` : r.answer;
          const reply = `✅ Answer: ${answerLine}\n${toPlay} to play. Did you get it? New puzzles every day on ChessScout.net ♟️`;
          return (
            <div key={key} className="rounded-xl p-3" style={{ background: '#121B1D', border: '1px solid rgba(255,255,255,.08)' }}>
              <div className="flex gap-3">
                <div className="w-[96px] shrink-0"><MiniBoard fen={r.fen} size={96} flipped={toPlay === 'Black'} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-black text-white">#{r.puzzle_id} {r.rendered && <span title="Made into an MP4"><Film size={12} className="inline text-[#81B64C]" /></span>}</p>
                  <p className="text-[11.5px] text-white/50">{new Date(r.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {r.mode === 'abc' ? 'A/B/C' : themeLabel(r.theme || 'mateIn2')}{r.rating ? ` · ${r.rating}` : ''}</p>
                  <p className="mt-1 text-[11.5px] text-white/50">{toPlay} to play</p>
                  <p className="mt-1 break-words text-[16px] font-black text-[#81B64C]">{answerLine || '—'}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <CopyBtn text={reply} label="Copy reply" />
                <CopyBtn text={answerLine} label="Answer only" />
                <button onClick={() => onMakeAnswerReel({ mode: r.mode, theme: r.theme ?? undefined, puzzle: { id: r.puzzle_id, fen: r.fen, moves: r.moves, rating: r.rating ?? 0, themes: [] }, choices: r.choices ?? undefined, reveal: true })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#81B64C] px-3 py-1.5 text-[12.5px] font-black text-white"><Film size={14} />Answer reel</button>
                {confirm === key
                  ? <button onClick={() => void del(r)} className="ml-auto rounded-lg bg-[#E5484D] px-3 py-1.5 text-[12.5px] font-black text-white">Tap to remove</button>
                  : <button onClick={() => setConfirm(key)} className="ml-auto inline-flex items-center rounded-lg bg-white/5 px-2 py-1.5 text-white/50" aria-label="Remove"><Trash2 size={14} /></button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
