// The puzzle hub, built on what only ChessScout has:
//  - Case Files: the mistakes from your own games, as puzzles. Solve one to close the case; a game
//    is "fixed" once all its cases are closed.
//  - Patterns: each tactic is a card you level up (Bronze 5 · Silver 20 · Gold 50 solved), with the
//    ones you miss in your own games flagged.
//  - Prep: pick a player you've scouted and practise the patterns that beat them.
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { Loader2, Check, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { useMyGames } from '@/hooks/use-games';
import { playedWhite, useMyNames } from '@/lib/gameSide';
import { AppIcon } from '@/components/AppIcon';
import { RedesignHeader } from '@/components/RedesignHeader';
import { setPageMeta } from '@/lib/pageMeta';

const PANEL = 'var(--rd-card-solid, #182123)';
const PANEL2 = 'var(--rd-card-light, #212B2D)';
const MUTED = '#8F9997';
const GREEN = '#81B64C';

type CasePuzzle = { id: number; themes: string[]; gameId: number | null; moveNumber: number | null; opponent?: string | null; playedAt?: string | null; attempted: boolean; solved: boolean };
type Pattern = { theme: string; tried: number; solved: number };

const LABEL: Record<string, string> = {
  fork: 'Fork', pin: 'Pin', skewer: 'Skewer', discoveredAttack: 'Discovered attack', hangingPiece: 'Hanging piece', sacrifice: 'Sacrifice',
  backRankMate: 'Back-rank mate', deflection: 'Deflection', attraction: 'Attraction', doubleCheck: 'Double check', mateIn1: 'Mate in 1',
  mateIn2: 'Mate in 2', endgame: 'Endgame', promotion: 'Promotion', blunder: 'A blunder', mistake: 'A mistake',
};
const PATTERNS = ['fork', 'pin', 'skewer', 'discoveredAttack', 'hangingPiece', 'sacrifice', 'backRankMate', 'deflection', 'attraction', 'doubleCheck', 'mateIn1', 'mateIn2', 'endgame', 'promotion'];
const LEVELS = [{ at: 50, name: 'Gold', c: '#F2B53A' }, { at: 20, name: 'Silver', c: '#C9D1D3' }, { at: 5, name: 'Bronze', c: '#C7894B' }];
const level = (n: number) => LEVELS.find((l) => n >= l.at) ?? null;
const nextAt = (n: number) => [5, 20, 50].find((x) => n < x) ?? null;
/** The most telling theme of a game puzzle (skip the generic tags). */
const caseTheme = (t: string[]) => t.find((x) => PATTERNS.includes(x)) ?? t.find((x) => x === 'blunder' || x === 'mistake') ?? null;

// Scout-report weakness categories → puzzle patterns that punish them
const WEAK_TO_PATTERN: [RegExp, string][] = [
  [/fork/i, 'fork'], [/pin/i, 'pin'], [/skewer/i, 'skewer'], [/back.?rank/i, 'backRankMate'], [/hang|loose|unprotect|blunder/i, 'hangingPiece'],
  [/discover/i, 'discoveredAttack'], [/king safety|king/i, 'sacrifice'], [/endgame/i, 'endgame'], [/promot|pawn/i, 'promotion'], [/mate|check/i, 'mateIn2'],
];

function Tabs({ tab, set }: { tab: string; set: (t: string) => void }) {
  const T = [['cases', 'Case Files'], ['patterns', 'Patterns'], ['prep', 'Prep']];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-[12px] p-1" style={{ background: PANEL }}>
      {T.map(([k, l]) => (
        <button key={k} onClick={() => set(k)} className="rounded-[9px] py-2 text-[13.5px] font-extrabold" style={tab === k ? { background: PANEL2, color: '#fff' } : { color: MUTED }}>{l}</button>
      ))}
    </div>
  );
}

function CaseFiles() {
  const [list, setList] = useState<CasePuzzle[] | null>(null);
  // opponent and date for each game (older servers don't send them with the puzzles)
  const { data: myGames } = useMyGames(100);
  const mine = useMyNames();
  const info = useMemo(() => new Map((myGames?.games ?? []).map((g) => [g.id, { opponent: playedWhite(g, mine) ? g.blackUsername : g.whiteUsername, playedAt: g.playedAt }])), [myGames, mine]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => apiFetch('/api/puzzles/my-puzzles', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { puzzles: [] })).then((d) => setList(d.puzzles ?? [])).catch(() => setList([]));
  useEffect(() => { void load(); }, []);
  const make = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await apiFetch('/api/puzzles/generate-from-games', { method: 'POST', credentials: 'include' });
      const d = await r.json().catch(() => ({}));
      setMsg(d.generated ? `${d.generated} new case${d.generated === 1 ? '' : 's'} from your games.` : 'No new cases: review more games and the mistakes will show up here.');
      await load();
    } finally { setBusy(false); }
  };

  const games = useMemo(() => {
    const m = new Map<number, CasePuzzle[]>();
    for (const p of list ?? []) { const k = p.gameId ?? -p.id; m.set(k, [...(m.get(k) ?? []), p]); }
    return [...m.values()].sort((a, b) => Number(a.every((p) => p.solved)) - Number(b.every((p) => p.solved)));
  }, [list]);
  const open = (list ?? []).filter((p) => !p.solved).length;
  const closed = (list ?? []).length - open;

  if (list === null) return <div className="grid place-items-center py-16"><Loader2 className="animate-spin" style={{ color: MUTED }} /></div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-[12px] p-3.5" style={{ background: PANEL }}>
        <AppIcon name="lookup" size={36} />
        <div className="min-w-0 flex-1">
          <b className="block text-[16px] font-black">{open} open · {closed} closed</b>
          <span className="text-[12.5px]" style={{ color: MUTED }}>Mistakes from your own games. Find the move you missed to close the case.</span>
        </div>
      </div>
      {games.length === 0 && <p className="px-1 text-[13.5px]" style={{ color: MUTED }}>No cases yet. Make them from the mistakes in your reviewed games.</p>}
      {games.map((cases) => {
        const g0 = cases[0];
        const g = { ...g0, opponent: g0.opponent ?? info.get(g0.gameId ?? -1)?.opponent ?? null, playedAt: g0.playedAt ?? (info.get(g0.gameId ?? -1)?.playedAt as string | undefined) ?? null };
        const fixed = cases.every((p) => p.solved);
        return (
          <div key={g.gameId ?? g.id} className="overflow-hidden rounded-[12px]" style={{ background: PANEL }}>
            <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ background: PANEL2 }}>
              <b className="min-w-0 flex-1 truncate text-[14px]">{g.opponent ? `vs ${g.opponent}` : 'Your game'}{g.playedAt && <span className="font-normal" style={{ color: MUTED }}> · {new Date(g.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}</b>
              {fixed
                ? <span className="inline-flex items-center gap-1 text-[12px] font-extrabold" style={{ color: GREEN }}><Check size={14} />Game fixed</span>
                : g.gameId && <Link href={`/games/${g.gameId}`} className="text-[12px] font-bold" style={{ color: MUTED }}>Open game</Link>}
            </div>
            {cases.map((p) => {
              const th = caseTheme(p.themes);
              return (
                <div key={p.id} className="flex items-center gap-3 border-t px-3.5 py-2.5" style={{ borderColor: 'rgba(255,255,255,.05)' }}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: p.solved ? GREEN : 'rgba(255,255,255,.08)' }}>
                    {p.solved ? <Check size={15} color="#fff" /> : <span className="h-2 w-2 rounded-full" style={{ background: '#E8524A' }} />}
                  </span>
                  <span className="min-w-0 flex-1 text-[13.5px]">
                    <b>{p.moveNumber ? `Move ${p.moveNumber}` : 'A moment'}</b>
                    <span style={{ color: MUTED }}>{th ? ` · ${th === 'blunder' || th === 'mistake' ? LABEL[th] : `missed: ${(LABEL[th] ?? th).toLowerCase()}`}` : ''}</span>
                  </span>
                  <Link href={`/puzzles?id=${p.id}`} className="rounded-[10px] px-3.5 py-1.5 text-[13px] font-extrabold" style={p.solved ? { background: PANEL2 } : { background: GREEN, color: '#fff' }}>{p.solved ? 'Again' : 'Solve'}</Link>
                </div>
              );
            })}
          </div>
        );
      })}
      <button onClick={make} disabled={busy} className="cs-cta cs-cta-quiet">{busy ? <Loader2 size={18} className="animate-spin" /> : 'Find new cases in my games'}</button>
      {msg && <p className="px-1 text-center text-[12.5px]" style={{ color: MUTED }}>{msg}</p>}
    </div>
  );
}

function Patterns() {
  const [rows, setRows] = useState<Pattern[] | null>(null);
  const [missed, setMissed] = useState<Record<string, number>>({});
  useEffect(() => {
    apiFetch('/api/puzzles/patterns', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null))
      .then((d) => setRows(d?.patterns ?? PATTERNS.map((theme) => ({ theme, tried: 0, solved: 0 })))).catch(() => setRows(PATTERNS.map((theme) => ({ theme, tried: 0, solved: 0 }))));
    // which patterns you miss in your own games: from your open Case Files
    apiFetch('/api/puzzles/my-puzzles', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { puzzles: [] })).then((d) => {
      const m: Record<string, number> = {};
      for (const p of (d.puzzles ?? []) as CasePuzzle[]) for (const t of p.themes) if (PATTERNS.includes(t)) m[t] = (m[t] ?? 0) + 1;
      setMissed(m);
    }).catch(() => {});
  }, []);
  if (!rows) return <div className="grid place-items-center py-16"><Loader2 className="animate-spin" style={{ color: MUTED }} /></div>;
  const focus = Object.entries(missed).sort((a, b) => b[1] - a[1])[0]?.[0] ?? [...rows].sort((a, b) => a.solved - b.solved)[0]?.theme;
  return (
    <div className="space-y-3">
      {focus && (
        <Link href={`/puzzles?puzzleTheme=${focus}`} className="flex items-center gap-3 rounded-[12px] p-3.5" style={{ background: PANEL }}>
          <AppIcon name="opponents" size={34} />
          <span className="min-w-0 flex-1">
            <b className="block text-[15px] font-black">Today: {LABEL[focus] ?? focus}</b>
            <span className="text-[12.5px]" style={{ color: MUTED }}>{missed[focus] ? `You missed ${missed[focus]} of these in your games.` : 'Your least practised pattern.'}</span>
          </span>
          <span className="rounded-[10px] px-3.5 py-2 text-[13px] font-extrabold text-white" style={{ background: GREEN }}>Practise</span>
        </Link>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rows.map((p) => {
          const lv = level(p.solved), nx = nextAt(p.solved);
          const base = nx === 5 ? 0 : nx === 20 ? 5 : nx === 50 ? 20 : 50;
          const pct = nx ? ((p.solved - base) / (nx - base)) * 100 : 100;
          return (
            <Link key={p.theme} href={`/puzzles?puzzleTheme=${p.theme}`} className="relative rounded-[12px] p-3" style={{ background: PANEL, border: `1px solid ${lv ? lv.c + '55' : 'rgba(255,255,255,.05)'}` }}>
              {missed[p.theme] ? <span className="absolute right-2 top-2 rounded px-1.5 py-px text-[9.5px] font-black text-white" style={{ background: '#C0392B' }}>MISSED {missed[p.theme]}</span> : null}
              <b className="block text-[14px] font-extrabold">{LABEL[p.theme] ?? p.theme}</b>
              <span className="mt-0.5 block text-[12px] font-bold" style={{ color: lv?.c ?? MUTED }}>{lv ? lv.name : 'Not started'}</span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
                <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: lv?.c ?? GREEN }} />
              </span>
              <span className="mt-1 block text-[11px]" style={{ color: MUTED }}>{p.solved} solved{nx ? ` · ${nx - p.solved} to ${nx === 5 ? 'Bronze' : nx === 20 ? 'Silver' : 'Gold'}` : ''}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

type Scout = { id: number; targetUsername: string; completedAt?: string };
type Weak = { category: string; severity?: string; frequency?: number };
function Prep() {
  const [, navigate] = useLocation();
  const [scouts, setScouts] = useState<Scout[] | null>(null);
  const [pick, setPick] = useState<Scout | null>(null);
  const [report, setReport] = useState<{ weaknesses: Weak[]; topOpenings: { opening?: string; name?: string }[] } | null>(null);
  const [name, setName] = useState('');
  useEffect(() => {
    apiFetch('/api/opponents/history', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { scouts: [] })).then((d) => setScouts(d.scouts ?? [])).catch(() => setScouts([]));
  }, []);
  useEffect(() => {
    if (!pick) return;
    setReport(null);
    apiFetch(`/api/opponents/history/${pick.id}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const res = d?.job?.result ?? {};
      setReport({ weaknesses: res.weaknesses ?? [], topOpenings: res.topOpenings ?? [] });
    }).catch(() => setReport({ weaknesses: [], topOpenings: [] }));
  }, [pick]);
  const themes = useMemo(() => {
    const out: { theme: string; why: string }[] = [];
    for (const w of report?.weaknesses ?? []) {
      const hit = WEAK_TO_PATTERN.find(([re]) => re.test(w.category));
      if (hit && !out.some((o) => o.theme === hit[1])) out.push({ theme: hit[1], why: w.category });
    }
    return out.slice(0, 4);
  }, [report]);

  if (scouts === null) return <div className="grid place-items-center py-16"><Loader2 className="animate-spin" style={{ color: MUTED }} /></div>;
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) navigate(`/opponents?username=${encodeURIComponent(name.trim())}`); }}
        className="flex items-center overflow-hidden rounded-[12px]" style={{ background: PANEL2 }}>
        <Search size={18} className="ml-3.5 shrink-0" style={{ color: MUTED }} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Scout someone new" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          className="h-[46px] min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-[#8F9997]" aria-label="Username to scout" />
        <button type="submit" className="h-[46px] px-4 text-[13.5px] font-extrabold text-white" style={{ background: GREEN }}>Scout</button>
      </form>
      {scouts.length === 0 && <p className="px-1 text-[13.5px]" style={{ color: MUTED }}>Scout a player first. Then come back here to practise the patterns that beat them.</p>}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
        {scouts.map((s) => (
          <button key={s.id} onClick={() => setPick(s)} className="shrink-0 rounded-[10px] px-3.5 py-2 text-[13.5px] font-bold"
            style={pick?.id === s.id ? { background: GREEN, color: '#fff' } : { background: PANEL }}>{s.targetUsername}</button>
        ))}
      </div>
      {pick && !report && <div className="grid place-items-center py-10"><Loader2 className="animate-spin" style={{ color: MUTED }} /></div>}
      {pick && report && (
        <div className="space-y-2">
          <b className="block px-1 text-[15px]">Prep for {pick.targetUsername}</b>
          {themes.length === 0 ? (
            <p className="px-1 text-[13px]" style={{ color: MUTED }}>
              This scout has no weakness breakdown{report.weaknesses.length ? ' that matches a puzzle pattern' : ' (that comes with a Pro scout)'}. <Link href={`/opponents?username=${encodeURIComponent(pick.targetUsername)}`} className="underline">Open the scout</Link>.
            </p>
          ) : themes.map((t) => (
            <Link key={t.theme} href={`/puzzles?puzzleTheme=${t.theme}`} className="flex items-center gap-3 rounded-[12px] p-3" style={{ background: PANEL }}>
              <AppIcon name="tactics" size={28} />
              <span className="min-w-0 flex-1">
                <b className="block text-[14.5px] font-extrabold">{LABEL[t.theme]}</b>
                <span className="block truncate text-[12px]" style={{ color: MUTED }}>Their weakness: {t.why}</span>
              </span>
              <span className="rounded-[10px] px-3.5 py-1.5 text-[13px] font-extrabold text-white" style={{ background: GREEN }}>Practise</span>
            </Link>
          ))}
          {report.topOpenings.length > 0 && (
            <div className="rounded-[12px] p-3" style={{ background: PANEL }}>
              <b className="mb-1.5 block text-[13px]">Openings they play</b>
              <div className="flex flex-wrap gap-1.5">
                {report.topOpenings.slice(0, 5).map((o, i) => {
                  const n = o.opening ?? o.name ?? '';
                  return n ? <Link key={i} href={`/openings/${encodeURIComponent(n)}`} className="rounded-[8px] px-2.5 py-1 text-[12px] font-bold" style={{ background: PANEL2 }}>{n}</Link> : null;
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PuzzleHubPage() {
  const { authUser } = useUser();
  const search = useSearch();
  const [tab, setTab] = useState(() => new URLSearchParams(search).get('tab') ?? 'cases');
  useEffect(() => { setPageMeta('Puzzles — ChessScout.net', 'Case Files from your own games, pattern cards and opponent prep.', '/puzzles/hub'); }, []);
  const set = (t: string) => { setTab(t); window.history.replaceState(null, '', `?tab=${t}`); };
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-28 pt-3" style={{ color: '#F5F7F6' }}>
      <RedesignHeader dense title="Puzzles" backHref="/"
        right={<Link href="/puzzles" className="rounded-[10px] px-3 py-1.5 text-[13px] font-extrabold text-white" style={{ background: GREEN }}>Quick play</Link>} />
      <Tabs tab={tab} set={set} />
      <div className="mt-3">
        {!authUser ? <p className="py-10 text-center text-[14px]" style={{ color: MUTED }}>Sign in to see your Case Files.</p>
          : tab === 'patterns' ? <Patterns /> : tab === 'prep' ? <Prep /> : <CaseFiles />}
      </div>
    </div>
  );
}
