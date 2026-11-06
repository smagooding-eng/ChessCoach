// Tactics (the middlegame): learn one pattern at a time, then drill it until you
// spot it on sight. Each motif: See it (demo) → Guided (3) → Drill (10, 8 right
// masters it) → Speed round. Mastered motifs come back for review. "Missed in your
// games", speed rounds and review are Pro. Endgame tactics show on /endgames.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Chess } from 'chess.js';
import { ArrowLeft, Check, ChevronRight, Crown, Loader2, Play, RotateCcw, Sparkles, Target, Timer, Trophy, Zap, SkipForward, SkipBack } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { RD } from '@/lib/redesignTheme';
import { ChessBoard } from '@/components/ChessBoard';
import { MiniBoard } from '@/components/MiniBoard';
import { ProUpsell } from '@/components/ProUpsell';
import { TacticPuzzle, type TacticPuzzleData } from '@/components/tactics/TacticPuzzle';
import { GROUPS, MOTIFS, motifById, motifsIn, motifForThemes, isDue, type Motif, type TacticGroup, type TacticProgress } from '@/lib/tactics';

const card = { background: RD.card, border: `1px solid ${RD.border}` } as const;
const DIFF = { easy: [0, 1300], medium: [1300, 1800], hard: [1800, 3200] } as const;
type Diff = keyof typeof DIFF;
const readDiff = (): Diff => { try { const v = localStorage.getItem('cs_tactics_diff'); return v === 'easy' || v === 'hard' ? v : 'medium'; } catch { return 'medium'; } };

export function useTacticsProgress() {
  const [data, setData] = useState<{ progress: Record<string, TacticProgress>; pro: boolean } | null>(null);
  const load = useCallback(() => apiFetch('/api/tactics/progress', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => setData(d ?? { progress: {}, pro: false })).catch(() => setData({ progress: {}, pro: false })), []);
  useEffect(() => { void load(); }, [load]);
  return { progress: data?.progress ?? {}, pro: !!data?.pro, loaded: !!data, reload: load };
}

async function fetchPuzzles(m: Motif, n: number, diff?: Diff, exclude: number[] = []): Promise<TacticPuzzleData[]> {
  const q = new URLSearchParams({ any: m.any.join(','), all: (m.all ?? []).join(','), n: String(n) });
  if (diff) { q.set('minRating', String(DIFF[diff][0])); q.set('maxRating', String(DIFF[diff][1])); }
  if (exclude.length) q.set('exclude', exclude.join(','));
  const r = await apiFetch(`/api/tactics/batch?${q}`, { credentials: 'include' }).catch(() => null);
  const d = r?.ok ? await r.json().catch(() => null) : null;
  let list: TacticPuzzleData[] = d?.puzzles ?? [];
  // Not enough at this level: any level.
  if (diff && list.length < Math.min(n, 3)) list = [...list, ...(await fetchPuzzles(m, n - list.length, undefined, [...exclude, ...list.map((p) => p.id)]))];
  return list;
}
const record = (motif: string, puzzleId: number, solved: boolean, timeMs: number) =>
  void apiFetch('/api/tactics/result', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motif, puzzleId, solved, timeMs }) }).catch(() => {});

// ── Cards ──
function Ring({ value, done }: { value: number; done: boolean }) {
  const r = 15, c = 2 * Math.PI * r;
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" className="shrink-0">
      <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4" />
      <circle cx="19" cy="19" r={r} fill="none" stroke={done ? RD.gold : RD.green} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value))} transform="rotate(-90 19 19)" />
      {done && <path d="M13 19.5l4 4 8-9" fill="none" stroke={RD.gold} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
function MotifCard({ m, p }: { m: Motif; p?: TacticProgress }) {
  const done = !!p?.masteredAt;
  const due = isDue(p);
  return (
    <Link href={`/tactics/${m.id}`} className="flex items-center gap-3 rounded-[16px] p-3 transition-transform active:scale-[.99]" style={card}>
      {m.demo ? <MiniBoard fen={m.demo.fen} size={56} /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg text-2xl" style={{ background: 'rgba(255,255,255,.05)' }}>{m.group === 'mates' ? '♚' : m.group === 'endgame' ? '♙' : '♞'}</span>}
      <span className="min-w-0 flex-1">
        <b className="flex items-center gap-1.5 truncate text-[15px] font-extrabold" style={{ color: RD.text }}>{m.name}{due && <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-black" style={{ background: RD.gold, color: '#1A1A19' }}>REVIEW</span>}</b>
        <span className="mt-0.5 block text-[12px] leading-snug line-clamp-2" style={{ color: RD.muted }}>{m.blurb}</span>
      </span>
      <Ring value={done ? 1 : (p?.bestSession ?? 0) / 8} done={done} />
    </Link>
  );
}

/** A group's motif cards (the Endgames page shows the endgame group). */
export function TacticsGroupCards({ group, title }: { group: TacticGroup; title?: string }) {
  const { progress } = useTacticsProgress();
  const g = GROUPS.find((x) => x.id === group)!;
  const list = motifsIn(group);
  const mastered = list.filter((m) => progress[m.id]?.masteredAt).length;
  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-extrabold" style={{ color: RD.text }}>{title ?? g.title}</h2>
          <p className="text-[12.5px]" style={{ color: RD.muted }}>{g.sub}</p>
        </div>
        <span className="shrink-0 text-[12px] font-bold" style={{ color: RD.muted }}>{mastered}/{list.length} mastered</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">{list.map((m) => <MotifCard key={m.id} m={m} p={progress[m.id]} />)}</div>
    </section>
  );
}

// ── Home ──
export function Tactics() {
  const { progress, pro, loaded } = useTacticsProgress();
  const due = MOTIFS.filter((m) => isDue(progress[m.id]));
  const total = MOTIFS.filter((m) => m.group !== 'endgame');
  const mastered = total.filter((m) => progress[m.id]?.masteredAt).length;
  return (
    <div className="min-h-screen px-3 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pt-6" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto max-w-[900px] space-y-5">
        <div>
          <h1 className="flex items-center gap-2 text-[26px] font-black"><Zap size={24} style={{ color: RD.green }} />Tactics</h1>
          <p className="text-[13.5px]" style={{ color: RD.muted }}>The middlegame: learn each pattern, then drill it until you see it instantly. {loaded && `${mastered} of ${total.length} mastered.`}</p>
          <p className="mt-1 text-[12px]" style={{ color: RD.muted }}>
            <Link href="/openings" className="font-bold underline" style={{ color: RD.green }}>Openings</Link> → <b style={{ color: RD.text }}>Tactics</b> → <Link href="/endgames" className="font-bold underline" style={{ color: RD.green }}>Endgames</Link>
          </p>
        </div>

        {/* Review (Pro) */}
        {due.length > 0 && (pro ? (
          <div className="rounded-[16px] p-3" style={{ background: 'rgba(232,180,71,.10)', border: '1px solid rgba(232,180,71,.35)' }}>
            <p className="text-[13.5px] font-extrabold" style={{ color: RD.gold }}>Time to review: {due.length} pattern{due.length === 1 ? '' : 's'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{due.map((m) => <Link key={m.id} href={`/tactics/${m.id}?tab=drill`} className="rounded-full px-3 py-1 text-[12.5px] font-bold" style={{ background: 'rgba(255,255,255,.08)', color: RD.text }}>{m.name}</Link>)}</div>
          </div>
        ) : (
          <ProUpsell compact title={`${due.length} mastered pattern${due.length === 1 ? '' : 's'} due for review`} text="Pro brings mastered patterns back after a few days so they stick." />
        ))}

        {/* Missed in your games */}
        <Link href="/tactics/missed" className="flex items-center gap-3 rounded-[18px] p-4" style={{ ...card, border: '1px solid rgba(129,182,76,.4)' }}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px]" style={{ background: RD.green, color: '#fff' }}><Target size={20} /></span>
          <span className="min-w-0 flex-1">
            <b className="flex items-center gap-1.5 text-[15.5px] font-extrabold">Missed in your games {!pro && <Crown size={14} style={{ color: RD.gold }} />}</b>
            <span className="block text-[12.5px]" style={{ color: RD.muted }}>The tactics you missed in your own reviewed games, sorted by pattern.</span>
          </span>
          <ChevronRight size={18} style={{ color: RD.muted }} />
        </Link>

        {(['basics', 'next', 'mates'] as TacticGroup[]).map((g) => <TacticsGroupCards key={g} group={g} />)}

        <Link href="/endgames" className="flex items-center gap-3 rounded-[18px] p-4" style={card}>
          <span className="text-2xl">♙</span>
          <span className="min-w-0 flex-1">
            <b className="block text-[15px] font-extrabold">Endgame tactics</b>
            <span className="block text-[12.5px]" style={{ color: RD.muted }}>Promotion, breakthroughs, zugzwang and more, in Endgames.</span>
          </span>
          <ChevronRight size={18} style={{ color: RD.muted }} />
        </Link>
      </div>
    </div>
  );
}

// ── Demo ("See it") ──
function useDemo(m: Motif) {
  const [steps, setSteps] = useState<{ fen: string; intro: string; steps: { san: string; say: string }[] } | null>(m.demo ?? null);
  const [real, setReal] = useState(false);
  useEffect(() => {
    if (m.demo) { setSteps(m.demo); return; }
    let live = true;
    void fetchPuzzles(m, 1, 'easy').then(([p]) => {
      if (!live || !p) return;
      const c = new Chess(p.fen); const out: { san: string; say: string }[] = [];
      p.moves.forEach((u, i) => {
        try {
          const mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] as 'q' | undefined });
          const mine = p.setup ? i % 2 === 1 : i % 2 === 0;
          const first = p.setup ? i === 1 : i === 0;
          out.push({ san: mv.san, say: first ? `The key move: ${mv.san}.` : mine ? `Then ${mv.san}.` : p.setup && i === 0 ? 'Their move sets it up…' : '' });
        } catch { /* stop */ }
      });
      setReal(true);
      setSteps({ fen: p.fen, intro: 'From a real game.', steps: out });
    });
    return () => { live = false; };
  }, [m.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return { demo: steps, real };
}
export function MotifDemo({ m, onDone }: { m: Motif; onDone: () => void }) {
  const { demo, real } = useDemo(m);
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  const positions = useMemo(() => {
    if (!demo) return [];
    const c = new Chess(demo.fen); const out = [{ fen: c.fen(), last: null as { from: string; to: string } | null }];
    for (const s of demo.steps) { try { const mv = c.move(s.san); out.push({ fen: c.fen(), last: { from: mv.from, to: mv.to } }); } catch { break; } }
    return out;
  }, [demo]);
  useEffect(() => { setI(0); setAuto(true); }, [demo]);
  useEffect(() => {
    if (!auto || !positions.length || i >= positions.length - 1) return;
    const t = setTimeout(() => setI((x) => x + 1), i === 0 ? 1600 : 1900);
    return () => clearTimeout(t);
  }, [auto, i, positions.length]);
  if (!demo) return <Loader2 className="mx-auto mt-8 animate-spin" style={{ color: RD.green }} />;
  const flipped = new Chess(demo.fen).turn() === 'b';
  const say = i === 0 ? demo.intro : demo.steps[i - 1]?.say || '';
  const nextMove = demo.steps[i];
  const end = i >= positions.length - 1;
  return (
    <div className="mx-auto max-w-[520px] space-y-2">
      <p className="min-h-[44px] rounded-xl px-3 py-2 text-[14px] font-bold" style={{ background: 'rgba(255,255,255,.05)', color: RD.text }}>{say || ' '}</p>
      <ChessBoard fen={positions[i]?.fen ?? demo.fen} lastMove={positions[i]?.last ?? null} flipped={flipped} maxWidthOverride="100%" suppressConfirmMoves
        arrows={!end && nextMove ? (() => { try { const mv = new Chess(positions[i].fen).move(nextMove.san); return [{ from: mv.from, to: mv.to, color: 'rgba(129,182,76,0.6)' }]; } catch { return undefined; } })() : undefined} />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setAuto(false); setI((x) => Math.max(0, x - 1)); }} className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,.07)' }} aria-label="Back"><SkipBack size={15} /></button>
        <button onClick={() => { setAuto(false); setI((x) => Math.min(positions.length - 1, x + 1)); }} className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,.07)' }} aria-label="Forward"><SkipForward size={15} /></button>
        <button onClick={() => { setI(0); setAuto(true); }} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold" style={{ background: 'rgba(255,255,255,.07)' }}><RotateCcw size={14} />Replay</button>
        {end && <button onClick={onDone} className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-extrabold" style={{ background: RD.green, color: '#fff' }}>Try it yourself <ChevronRight size={15} /></button>}
      </div>
      {real && <p className="text-[11.5px]" style={{ color: RD.muted }}>This example is a real puzzle position.</p>}
    </div>
  );
}

// ── A run of puzzles (guided 3, drill 10, missed list) ──
function PuzzleRun({ m, mode, puzzles, onFinish, recordAs }: { m: Motif; mode: 'guided' | 'drill'; puzzles: TacticPuzzleData[]; onFinish: (correct: number, total: number) => void; recordAs?: string }) {
  const [k, setK] = useState(0);
  const [score, setScore] = useState(0);
  const p = puzzles[k];
  if (!p) return null;
  return (
    <div className="mx-auto max-w-[520px] space-y-2">
      <div className="flex items-center gap-1">
        {puzzles.map((_, j) => <span key={j} className="h-1.5 flex-1 rounded-full" style={{ background: j < k ? RD.green : j === k ? 'rgba(129,182,76,.5)' : 'rgba(255,255,255,.1)' }} />)}
      </div>
      <TacticPuzzle key={p.id} puzzle={p} mode={mode}
        onDone={(ok, ms) => { if (ok) setScore((s) => s + 1); if (recordAs !== '') record(recordAs ?? m.id, p.id, ok, ms); }}
        nextLabel={k + 1 < puzzles.length ? 'Next' : 'Finish'}
        onNext={() => { if (k + 1 < puzzles.length) setK(k + 1); else onFinish(score, puzzles.length); }} />
    </div>
  );
}

// ── Speed round (Pro) ──
function SpeedRound({ m, diff, onExit }: { m: Motif; diff: Diff; onExit: () => void }) {
  const [list, setList] = useState<TacticPuzzleData[] | null>(null);
  const [k, setK] = useState(0);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(60);
  const [phase, setPhase] = useState<'ready' | 'go' | 'end'>('ready');
  const [leaders, setLeaders] = useState<{ name: string; best: number; me: boolean }[] | null>(null);
  const scoreRef = useRef(0);
  useEffect(() => { void fetchPuzzles(m, 40, diff).then(setList); }, [m.id, diff]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== 'go') return;
    const t = setInterval(() => setLeft((s) => {
      if (s <= 1) { clearInterval(t); setPhase('end'); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'end') return;
    void apiFetch('/api/tactics/speed', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motif: m.id, score: scoreRef.current }) })
      .catch(() => null).then(() => apiFetch(`/api/tactics/speed/leaders?motif=${m.id}`, { credentials: 'include' })).then((r) => (r?.ok ? r.json() : null)).then((d) => setLeaders(d?.leaders ?? [])).catch(() => setLeaders([]));
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list) return <Loader2 className="mx-auto mt-8 animate-spin" style={{ color: RD.green }} />;
  if (!list.length) return <p className="text-center text-[13px]" style={{ color: RD.muted }}>No puzzles for this pattern yet.</p>;
  if (phase === 'ready') return (
    <div className="mx-auto max-w-[420px] space-y-3 rounded-[18px] p-5 text-center" style={card}>
      <Timer size={30} className="mx-auto" style={{ color: RD.green }} />
      <p className="text-[18px] font-extrabold">Find the {m.name.toLowerCase()}: 60 seconds</p>
      <p className="text-[13px]" style={{ color: RD.muted }}>Solve as many as you can. A wrong move skips to the next one.</p>
      <button onClick={() => setPhase('go')} className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[14px] font-extrabold" style={{ background: RD.green, color: '#fff' }}><Play size={15} />Start</button>
    </div>
  );
  if (phase === 'end') return (
    <div className="mx-auto max-w-[420px] space-y-3 rounded-[18px] p-5" style={card}>
      <p className="text-center text-[15px] font-bold" style={{ color: RD.muted }}>Time!</p>
      <p className="text-center text-[44px] font-black leading-none" style={{ color: RD.green }}>{score}</p>
      <p className="text-center text-[13px]" style={{ color: RD.muted }}>solved in 60 seconds</p>
      {leaders && leaders.length > 0 && (
        <div className="rounded-xl p-2" style={{ background: 'rgba(255,255,255,.04)' }}>
          <p className="mb-1 flex items-center gap-1.5 px-1 text-[12px] font-black uppercase tracking-wide" style={{ color: RD.muted }}><Trophy size={13} />Top scores</p>
          {leaders.map((l, j) => <p key={j} className="flex justify-between px-1 py-0.5 text-[13px]" style={{ color: l.me ? RD.green : RD.text }}><span>{j + 1}. {l.name}</span><b>{l.best}</b></p>)}
        </div>
      )}
      <div className="flex justify-center gap-2">
        <button onClick={() => { setK(0); setScore(0); scoreRef.current = 0; setLeft(60); setLeaders(null); setList(null); setPhase('ready'); void fetchPuzzles(m, 40, diff).then(setList); }} className="rounded-xl px-4 py-2 text-[13px] font-extrabold" style={{ background: RD.green, color: '#fff' }}>Again</button>
        <button onClick={onExit} className="rounded-xl px-4 py-2 text-[13px] font-bold" style={{ background: 'rgba(255,255,255,.07)' }}>Done</button>
      </div>
    </div>
  );
  const p = list[k % list.length];
  return (
    <div className="mx-auto max-w-[520px] space-y-2">
      <div className="flex items-center justify-between text-[15px] font-black">
        <span style={{ color: left <= 10 ? RD.red : RD.text }} className="tabular-nums">⏱ {left}s</span>
        <span style={{ color: RD.green }}>{score} solved</span>
      </div>
      <TacticPuzzle key={`${p.id}-${k}`} puzzle={p} mode="speed"
        onDone={(ok, ms) => { if (ok) { scoreRef.current += 1; setScore(scoreRef.current); } record(m.id, p.id, ok, ms); setTimeout(() => setK((x) => x + 1), ok ? 350 : 700); }} />
    </div>
  );
}

// ── One motif ──
type Tab = 'learn' | 'guided' | 'drill' | 'speed';
export function TacticMotif() {
  const [, params] = useRoute('/tactics/:id');
  const m = motifById(params?.id ?? '');
  const { progress, pro, reload } = useTacticsProgress();
  const [tab, setTab] = useState<Tab>(() => { const t = new URLSearchParams(window.location.search).get('tab'); return t === 'drill' || t === 'guided' || t === 'speed' ? t : 'learn'; });
  const [diff, setDiff] = useState<Diff>(readDiff);
  useEffect(() => { try { localStorage.setItem('cs_tactics_diff', diff); } catch { /* ignore */ } }, [diff]);
  const [set, setSet] = useState<TacticPuzzleData[] | null>(null);
  const [result, setResult] = useState<{ correct: number; total: number; mastered?: boolean; newly?: boolean; reviewed?: boolean } | null>(null);
  const [run, setRun] = useState(0);
  const p = m ? progress[m.id] : undefined;

  useEffect(() => {
    if (!m || (tab !== 'guided' && tab !== 'drill')) return;
    setSet(null); setResult(null);
    void fetchPuzzles(m, tab === 'guided' ? 3 : 10, tab === 'guided' ? 'easy' : diff).then(setSet);
  }, [m?.id, tab, diff, run]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) return <div className="p-6 text-center" style={{ color: RD.muted }}>That pattern doesn’t exist. <Link href="/tactics" className="underline">All tactics</Link></div>;
  const back = m.group === 'endgame' ? '/endgames' : '/tactics';

  const finishDrill = async (correct: number, total: number) => {
    const r = await apiFetch('/api/tactics/session', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motif: m.id, correct, total }) }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    setResult({ correct, total, mastered: d?.mastered, newly: d?.newlyMastered, reviewed: d?.reviewed });
    void reload();
  };

  const TABS: [Tab, string][] = [['learn', 'See it'], ['guided', 'Guided'], ['drill', isDue(p) ? 'Review' : 'Drill'], ['speed', 'Speed']];
  return (
    <div className="min-h-screen px-3 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pt-6" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto max-w-[900px] space-y-3">
        <Link href={back} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold" style={{ background: 'rgba(255,255,255,.06)' }}><ArrowLeft size={15} />{m.group === 'endgame' ? 'Endgames' : 'Tactics'}</Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-black">{m.name}</h1>
            <p className="text-[13.5px]" style={{ color: RD.muted }}>{m.blurb}</p>
            {m.note && <p className="mt-1 text-[12px]" style={{ color: RD.muted }}>{m.note}</p>}
            {m.id === 'underpromotion' && <p className="mt-1 text-[12px]" style={{ color: RD.muted }}>Tip: turn on "ask which piece" for promotions in Settings, so you can pick the knight.</p>}
          </div>
          <div className="shrink-0 text-right text-[12px]" style={{ color: RD.muted }}>
            {p?.masteredAt ? <span className="font-black" style={{ color: RD.gold }}>✓ Mastered</span> : <span>Best drill: {p?.bestSession ?? 0}/10</span>}
            {p && <span className="block">{p.solved}/{p.attempts} solved</span>}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-[14px] p-1" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className="flex items-center justify-center gap-1 rounded-[10px] py-2 text-[13px] font-bold"
              style={tab === id ? { background: 'rgba(255,255,255,.08)', color: RD.text, boxShadow: `inset 0 0 0 1.5px ${RD.green}` } : { color: RD.muted }}>
              {label}{id === 'speed' && !pro && <Crown size={12} style={{ color: RD.gold }} />}
            </button>
          ))}
        </div>
        {(tab === 'drill' || tab === 'speed') && (
          <div className="flex items-center gap-1.5 text-[12px]" style={{ color: RD.muted }}>
            Level:
            {(['easy', 'medium', 'hard'] as Diff[]).map((d) => (
              <button key={d} onClick={() => setDiff(d)} className="rounded-full px-2.5 py-1 font-bold capitalize" style={diff === d ? { background: RD.green, color: '#fff' } : { background: 'rgba(255,255,255,.06)', color: RD.text }}>{d}</button>
            ))}
          </div>
        )}

        {tab === 'learn' && <MotifDemo m={m} onDone={() => setTab('guided')} />}

        {(tab === 'guided' || tab === 'drill') && (
          result ? (
            <div className="mx-auto max-w-[420px] space-y-3 rounded-[18px] p-5 text-center" style={card}>
              {result.newly ? <Sparkles size={32} className="mx-auto" style={{ color: RD.gold }} /> : <Check size={32} className="mx-auto" style={{ color: RD.green }} />}
              <p className="text-[20px] font-black">{result.correct}/{result.total}{tab === 'guided' ? ' done' : ' right'}</p>
              <p className="text-[13px]" style={{ color: RD.muted }}>
                {tab === 'guided' ? 'Now try a drill: 10 puzzles, no help. Get 8 right to master this pattern.'
                  : result.newly ? `${m.name} mastered! ${pro ? 'It will come back for a quick review in a few days.' : ''}`
                  : result.reviewed ? (result.correct >= 7 ? 'Review passed. See you again in a bit longer.' : 'Needs another look. It will come back tomorrow.')
                  : result.mastered ? 'Already mastered. Try a speed round or a harder level.' : `Get ${8 - result.correct > 0 ? 8 - result.correct : 0} more right next time to master it.`}
              </p>
              <div className="flex justify-center gap-2">
                <button onClick={() => { if (tab === 'guided') setTab('drill'); else setRun((x) => x + 1); }} className="rounded-xl px-4 py-2 text-[13px] font-extrabold" style={{ background: RD.green, color: '#fff' }}>{tab === 'guided' ? 'Start the drill' : 'Another drill'}</button>
                {tab === 'drill' && <button onClick={() => setTab('speed')} className="rounded-xl px-4 py-2 text-[13px] font-bold" style={{ background: 'rgba(255,255,255,.07)' }}>Speed round</button>}
              </div>
            </div>
          ) : !set ? <Loader2 className="mx-auto mt-8 animate-spin" style={{ color: RD.green }} />
            : !set.length ? <p className="text-center text-[13px]" style={{ color: RD.muted }}>No puzzles for this pattern yet. Try another level.</p>
            : <PuzzleRun key={`${tab}-${run}`} m={m} mode={tab === 'guided' ? 'guided' : 'drill'} puzzles={set} recordAs={tab === 'guided' ? '' : m.id}
                onFinish={(c, t) => { if (tab === 'drill') void finishDrill(c, t); else setResult({ correct: c, total: t }); }} />
        )}

        {tab === 'speed' && (pro ? <SpeedRound key={`${m.id}-${diff}`} m={m} diff={diff} onExit={() => setTab('drill')} /> : (
          <ProUpsell title="Speed rounds are Pro" text="60 seconds, one pattern, as many as you can, with top scores for every pattern." perks={['Speed rounds for every pattern', 'Missed tactics from your own games', 'Reviews that bring mastered patterns back']} />
        ))}
      </div>
    </div>
  );
}

// ── Missed in your games (Pro) ──
interface MissedPuzzle extends TacticPuzzleData { gameId: number | null; moveNumber: number | null; playedAt: string | null; solved: boolean | null }
export function TacticsMissed() {
  const [d, setD] = useState<{ puzzles: MissedPuzzle[]; linked: boolean; pro: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ name: string; list: MissedPuzzle[] } | null>(null);
  const load = () => apiFetch('/api/tactics/missed', { credentials: 'include' }).then(async (r) => {
    if (r.status === 402) { setD({ puzzles: [], linked: true, pro: false }); return; }
    const j = r.ok ? await r.json() : { puzzles: [], linked: true };
    setD({ ...j, pro: true });
  }).catch(() => setD({ puzzles: [], linked: true, pro: true }));
  useEffect(() => { void load(); }, []);
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; list: MissedPuzzle[]; month: number }>();
    const monthAgo = Date.now() - 30 * 86400_000;
    for (const p of d?.puzzles ?? []) {
      const m = motifForThemes(p.themes);
      const key = m?.id ?? 'other', name = m?.name ?? 'Other big chances';
      const g = map.get(key) ?? { name, list: [], month: 0 };
      g.list.push(p); if (p.playedAt && new Date(p.playedAt).getTime() >= monthAgo) g.month++;
      map.set(key, g);
    }
    return [...map.entries()].sort((a, b) => b[1].list.length - a[1].list.length);
  }, [d]);
  const findMore = async () => {
    setBusy(true); setNote(null);
    const r = await apiFetch('/api/puzzles/generate-from-games', { method: 'POST', credentials: 'include' }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setNote(r?.ok ? (j?.generated ? `Found ${j.generated} new position${j.generated === 1 ? '' : 's'}.` : 'Nothing new in your latest reviewed games.') : (j?.error ?? "Couldn't check your games."));
    setBusy(false); void load();
  };
  return (
    <div className="min-h-screen px-3 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pt-6" style={{ background: RD.bg, color: RD.text }}>
      <div className="mx-auto max-w-[760px] space-y-3">
        <Link href={playing ? '#' : '/tactics'} onClick={(e) => { if (playing) { e.preventDefault(); setPlaying(null); } }} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold" style={{ background: 'rgba(255,255,255,.06)' }}><ArrowLeft size={15} />{playing ? 'Missed in your games' : 'Tactics'}</Link>
        <h1 className="text-[24px] font-black">{playing ? playing.name : 'Missed in your games'}</h1>
        {!d ? <Loader2 className="mx-auto mt-8 animate-spin" style={{ color: RD.green }} /> : !d.pro ? (
          <ProUpsell title="See the tactics you missed" text="Pro goes through your reviewed games, finds the moments you missed a tactic, and sorts them by pattern so you can train exactly those." perks={['Your own missed forks, pins and mates', 'Sorted by pattern, with this month’s count', 'Speed rounds and reviews too']} />
        ) : playing ? (
          <PuzzleRun m={motifForThemes(playing.list[0].themes) ?? MOTIFS[0]} mode="drill" puzzles={playing.list} recordAs={motifForThemes(playing.list[0].themes)?.id ?? 'fork'} onFinish={() => { setPlaying(null); void load(); }} />
        ) : (<>
          <p className="text-[13px]" style={{ color: RD.muted }}>Positions from your reviewed games where a better move was there and you missed it.</p>
          {!d.linked && <p className="text-[13px]" style={{ color: RD.muted }}>Link your Chess.com or Lichess name in Settings so we can find your games.</p>}
          {groups.length === 0 ? (
            <div className="rounded-[18px] p-5 text-center" style={card}>
              <p className="text-[14px] font-bold">Nothing yet.</p>
              <p className="mt-1 text-[12.5px]" style={{ color: RD.muted }}>Review a few games, then look for missed tactics.</p>
            </div>
          ) : groups.map(([key, g]) => (
            <button key={key} onClick={() => setPlaying({ name: g.name, list: g.list.slice(0, 15) })} className="flex w-full items-center gap-3 rounded-[16px] p-3 text-left" style={card}>
              <MiniBoard fen={g.list[0].fen} size={56} flipped={new Chess(g.list[0].fen).turn() === 'b'} />
              <span className="min-w-0 flex-1">
                <b className="block text-[15px] font-extrabold">{g.name}</b>
                <span className="block text-[12.5px]" style={{ color: RD.muted }}>
                  {g.month > 0 ? `You missed ${g.month} this month · ` : ''}{g.list.length} in all · {g.list.filter((p) => p.solved).length} solved since
                </span>
              </span>
              <ChevronRight size={18} style={{ color: RD.muted }} />
            </button>
          ))}
          <button onClick={() => void findMore()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-extrabold disabled:opacity-50" style={{ background: RD.green, color: '#fff' }}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Target size={15} />} Look through my latest games
          </button>
          {note && <p className="text-[12.5px]" style={{ color: RD.muted }}>{note}</p>}
        </>)}
      </div>
    </div>
  );
}

export default Tactics;
