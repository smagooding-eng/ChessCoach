// Scout Sprint: 3 minutes, puzzles get harder as you go, 3 misses and it's over. You race the
// ghost of your own best run; friends' bests are shown (no public leaderboard).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Loader2, X as XIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { ChessBoard } from '@/components/ChessBoard';
import { RedesignHeader } from '@/components/RedesignHeader';
import { AppIcon } from '@/components/AppIcon';
import { recordActivity } from '@/lib/activity';

const MUTED = '#8F9997', GREEN = '#81B64C', RED = '#E8524A';
const SECONDS = 180, STRIKES = 3;
type P = { id: number; fen: string; moves: string[] };

export default function ScoutSprintPage() {
  const { authUser } = useUser();
  const [best, setBest] = useState(0);
  const [friends, setFriends] = useState<{ name: string; best: number }[]>([]);
  const [phase, setPhase] = useState<'idle' | 'run' | 'done'>('idle');
  const [left, setLeft] = useState(SECONDS);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [p, setP] = useState<P | null>(null);
  const [fen, setFen] = useState('');
  const [idx, setIdx] = useState(0);
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [flash, setFlash] = useState<'' | 'ok' | 'no'>('');
  const seen = useRef<number[]>([]);
  const scoreRef = useRef(0); scoreRef.current = score;

  useEffect(() => {
    if (!authUser) return;
    apiFetch('/api/me/sprint', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setBest(d.best ?? 0); setFriends(d.friends ?? []); } }).catch(() => {});
  }, [authUser]);

  const next = useCallback(async (solved: number) => {
    const lo = 500 + solved * 60, hi = lo + 250;
    const qs = new URLSearchParams({ minRating: String(lo), maxRating: String(hi) });
    if (seen.current.length) qs.set('exclude', seen.current.slice(-60).join(','));
    try {
      const r = await apiFetch(`/api/puzzles/next?${qs}`, { credentials: 'include' });
      const d = r.ok ? await r.json() : null;
      if (!d?.puzzle) return;
      seen.current.push(d.puzzle.id);
      setP({ id: d.puzzle.id, fen: d.puzzle.fen, moves: (d.puzzle.moves ?? '').split(' ').filter(Boolean) });
      setFen(d.puzzle.fen); setIdx(0); setLast(null);
    } catch { /* try again on the next move */ }
  }, []);

  const finish = useCallback(() => {
    setPhase('done');
    const s = scoreRef.current;
    if (s > 0) recordActivity('puzzle');
    apiFetch('/api/me/sprint', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: s }) }).catch(() => {});
    setBest((b) => Math.max(b, s));
  }, []);

  useEffect(() => {
    if (phase !== 'run') return undefined;
    const t = setInterval(() => setLeft((l) => { if (l <= 1) { clearInterval(t); finish(); return 0; } return l - 1; }), 1000);
    return () => clearInterval(t);
  }, [phase, finish]);

  const start = () => { seen.current = []; setScore(0); setMisses(0); setLeft(SECONDS); setPhase('run'); void next(0); };

  const onMove = (san: string) => {
    if (!p || phase !== 'run') return;
    const want = p.moves[idx];
    let ok = false, played: ReturnType<Chess['move']> | null = null;
    try {
      const c = new Chess(fen);
      played = c.move(san);
      // the expected move, or any move that mates
      ok = !!played && ((played.from + played.to + (played.promotion ?? '')) === want || (want?.length === 4 && played.from + played.to === want) || c.isCheckmate());
    } catch { ok = false; }
    if (!ok) {
      setFlash('no'); setTimeout(() => setFlash(''), 350);
      const m = misses + 1; setMisses(m);
      if (m >= STRIKES) { finish(); return; }
      void next(score); return;
    }
    const c = new Chess(fen); c.move(san);
    if (idx + 1 >= p.moves.length || c.isGameOver()) {
      setFlash('ok'); setTimeout(() => setFlash(''), 250);
      const s = score + 1; setScore(s); void next(s); return;
    }
    // the opponent's reply, then your turn again
    const reply = p.moves[idx + 1];
    setFen(c.fen()); setLast({ from: played!.from, to: played!.to });
    setTimeout(() => {
      try { const m = c.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] || undefined }); setFen(c.fen()); setLast({ from: m.from, to: m.to }); setIdx(idx + 2); }
      catch { const s = score + 1; setScore(s); void next(s); }
    }, 350);
  };

  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const flipped = fen.split(' ')[1] === 'b';
  return (
    <div className="mx-auto w-full max-w-[620px] space-y-3 px-4 pb-28 pt-3" style={{ color: '#F5F7F6' }}>
      <RedesignHeader dense title="Scout Sprint" backHref="/progress" />
      {phase === 'run' && (
        <div className="flex items-center gap-3 rounded-[12px] px-3.5 py-2.5" style={{ background: 'var(--rd-card-solid, #182123)' }}>
          <b className="w-14 text-[22px] font-black tabular-nums" style={{ color: left <= 20 ? RED : undefined }}>{mm}</b>
          <div className="relative h-3 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
            <span className="block h-full rounded-full transition-all" style={{ width: `${best ? Math.min(100, (score / best) * 100) : Math.min(100, score * 5)}%`, background: score > best && best > 0 ? '#F2B53A' : GREEN }} />
          </div>
          <b className="text-[20px] font-black tabular-nums">{score}</b>
          <span className="flex gap-0.5">{Array.from({ length: STRIKES }, (_, i) => <XIcon key={i} size={16} color={i < misses ? RED : 'rgba(255,255,255,.18)'} />)}</span>
        </div>
      )}
      {phase === 'run' && <p className="-mt-1 px-1 text-[11.5px]" style={{ color: MUTED }}>{best ? (score > best ? 'Ahead of your best!' : `Your ghost: ${best}`) : 'First run: set your best.'}</p>}

      {phase === 'run' ? (
        fen ? (
          <div className="rounded-[12px] transition-shadow" style={{ boxShadow: flash === 'ok' ? `0 0 0 3px ${GREEN}` : flash === 'no' ? `0 0 0 3px ${RED}` : 'none' }}>
            <ChessBoard fen={fen} flipped={flipped} practiceMode suppressConfirmMoves onMovePlayed={onMove} lastMove={last} maxWidthOverride="100%" />
          </div>
        ) : <div className="grid place-items-center py-24"><Loader2 className="animate-spin" style={{ color: MUTED }} /></div>
      ) : (
        <div className="rounded-[14px] p-5 text-center" style={{ background: 'var(--rd-card-solid, #182123)' }}>
          <AppIcon name="rush" size={52} />
          {phase === 'done' ? (
            <>
              <b className="mt-2 block text-[30px] font-black">{score}</b>
              <p className="text-[14px]" style={{ color: MUTED }}>{score > 0 && score >= best ? 'New best!' : `Your best: ${best}`}</p>
            </>
          ) : (
            <>
              <b className="mt-2 block text-[20px] font-black">3 minutes. Three misses and you're out.</b>
              <p className="mt-1 text-[13.5px]" style={{ color: MUTED }}>Puzzles start easy and get harder with every one you solve.{best ? ` Your best: ${best}.` : ''}</p>
            </>
          )}
          <button onClick={start} className="cs-cta mt-4">{phase === 'done' ? 'Again' : 'Start'}</button>
        </div>
      )}

      {phase !== 'run' && friends.length > 0 && (
        <div className="rounded-[14px] p-3.5" style={{ background: 'var(--rd-card-solid, #182123)' }}>
          <b className="mb-2 block text-[14px]">Friends' bests</b>
          {friends.map((f, i) => (
            <div key={i} className="flex items-center justify-between py-1 text-[13.5px]"><span>{f.name}</span><b className="tabular-nums">{f.best}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}
