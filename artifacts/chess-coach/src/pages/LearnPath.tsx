// The Learn Path page: one level per practice bot. A winding trail of metal medallions (puzzles, a
// tactic, a lesson, an opening per side, a trap, then the bot), with your piece on the step you're
// on. Beside it: progress for the level, what finishing it unlocks, and the roadmap of all levels.
// The older board-square view is still there (Board view).
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Check, Lock, Play, ChevronRight } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useBoardTheme } from '@/components/MiniBoard';
import { ScoutIcon } from '@/components/ScoutIcons';
import { RedesignHeader } from '@/components/RedesignHeader';
import { LearnPathBoard } from '@/pages/LearnPathBoard';
import { apiFetch } from '@/lib/api';
import { LEVELS, setHasGames, readPath, onPathChange, syncPath, currentLevel, stepOpen, levelDone, startStep, markPathStarted, type Level, type Step, type PathState } from '@/lib/learnPath';
import { setPageMeta } from '@/lib/pageMeta';

const MUTED = '#8F9997', GREEN = '#81B64C', GOLD = '#E8B447', CARD = '#182123', CARD2 = '#212B2D', BORDER = 'rgba(255,255,255,.07)';
const VIEW_KEY = 'cs_learn_path_view';
const iconFor = (st: Step, _i: number) => st.icon;
const X = [26, 70, 30, 72, 28, 66, 34, 70, 30]; // trail positions across the column (%)
const ROW = 104;

function Ring({ pct, size = 64 }: { pct: number; size?: number }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth="6" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={GREEN} strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="54%" textAnchor="middle" dominantBaseline="middle" fill="#F5F7F6" fontSize={size * 0.24} fontWeight="900">{Math.round(pct * 100)}%</text>
    </svg>
  );
}

/** The level badge: a gold-rimmed shield with the level number. */
function Shield({ n }: { n: number }) {
  return (
    <svg width="58" height="66" viewBox="0 0 58 66" className="shrink-0" aria-hidden="true">
      <defs><linearGradient id="lpgold" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stopColor="#FFF0B0" /><stop offset=".45" stopColor="#F2C14E" /><stop offset="1" stopColor="#B07A1E" /></linearGradient></defs>
      <path d="M29 2l25 8v20c0 16-11 28-25 34C15 58 4 46 4 30V10z" fill="url(#lpgold)" />
      <path d="M29 7l20 6.5V30c0 13-9 23-20 28C18 53 9 43 9 30V13.5z" fill="#1A2224" />
      <text x="29" y="21" textAnchor="middle" fill="#C9D1D3" fontSize="8.5" fontWeight="800">LEVEL</text>
      <text x="29" y="45" textAnchor="middle" fill="url(#lpgold)" fontSize="22" fontWeight="900">{n}</text>
    </svg>
  );
}

/** A step on the trail: a round metal medallion with the step's icon. */
function Medallion({ st, i, state, level, big }: { st: Step; i: number; state: 'done' | 'here' | 'open' | 'locked'; level: Level; big: boolean }) {
  const { renderPiece } = useBoardTheme();
  const size = big ? 82 : 64;
  const rim = state === 'locked' ? 'linear-gradient(160deg,#5B6567,#2E3638)' : 'linear-gradient(160deg,#FFF0B0,#F2C14E 45%,#9A6A18)';
  const glow = state === 'done' ? '0 0 0 3px rgba(129,182,76,.55), 0 0 16px rgba(129,182,76,.35)' : state === 'here' ? '0 0 0 3px rgba(232,180,71,.6), 0 0 26px rgba(232,180,71,.45)' : 'none';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {st.kind === 'bot' ? <img src={level.bot.avatar} alt="" className="absolute inset-0 h-full w-full rounded-full" style={{ boxShadow: `0 6px 14px rgba(0,0,0,.5), ${glow}`, filter: state === 'locked' ? 'grayscale(1) brightness(.6)' : undefined }} /> :
      <div className="absolute inset-0 rounded-full p-[3px]" style={{ background: rim, boxShadow: `0 6px 14px rgba(0,0,0,.5), ${glow}` }}>
        <div className="grid h-full w-full place-items-center rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, #2A3436, #141B1C)', filter: state === 'locked' ? 'grayscale(1) brightness(.6)' : undefined }}>
          <ScoutIcon name={iconFor(st, i)} size={big ? 46 : 36} />
        </div>
      </div>}
      {state === 'done' && <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full" style={{ background: GREEN, border: '2px solid #101617' }}><Check size={14} strokeWidth={4} color="#fff" /></span>}
      {state === 'locked' && <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full" style={{ background: '#2E3638', border: '2px solid #101617' }}><Lock size={12} color="#C9D1D3" /></span>}
      {state === 'here' && <div className="cs-path-bob pointer-events-none absolute left-1/2" style={{ bottom: '78%', width: 44, height: 44, transform: 'translateX(-50%)' }}>{renderPiece(level.piece)}</div>}
    </div>
  );
}

function Trail({ l, s, cur, go }: { l: Level; s: PathState; cur: Level; go: (st: Step) => void }) {
  const H = l.steps.length * ROW + 30;
  const pts = l.steps.map((_, i) => ({ x: X[i % X.length], y: 52 + i * ROW }));
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => `M${a.x} ${a.y} C${a.x} ${a.y + ROW * 0.6} ${b.x} ${b.y - ROW * 0.6} ${b.x} ${b.y}`;
  return (
    <div className="relative" style={{ height: H }}>
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {pts.slice(1).map((b, i) => {
          const done = !!s.done[l.steps[i].key];
          return <g key={i}>
            <path d={seg(pts[i], b)} stroke="rgba(0,0,0,.45)" strokeWidth="14" fill="none" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            <path d={seg(pts[i], b)} stroke={done ? '#3E5A2A' : '#2A3335'} strokeWidth="10" fill="none" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            <path d={seg(pts[i], b)} stroke={done ? GREEN : 'rgba(255,255,255,.14)'} strokeWidth="2.5" strokeDasharray={done ? undefined : '6 7'} fill="none" vectorEffect="non-scaling-stroke" strokeLinecap="round" style={done ? { filter: 'drop-shadow(0 0 4px rgba(129,182,76,.8))' } : undefined} />
          </g>;
        })}
      </svg>
      {l.steps.map((st, i) => {
        const isDone = !!s.done[st.key];
        const can = stepOpen(s, l, i);
        const here = !isDone && can && l.n === cur.n;
        const state = isDone ? 'done' : here ? 'here' : can ? 'open' : 'locked';
        const big = here || st.kind === 'bot';
        const { x, y } = pts[i];
        const right = x < 50;
        const n = s.count?.[st.key] ?? 0;
        return (
          <div key={st.key} className="absolute" style={{ left: `${x}%`, top: y, transform: 'translate(-50%,-50%)' }}>
            <button type="button" disabled={!can} onClick={() => go(st)} aria-label={`${st.title}: ${st.sub}`} className="block transition-transform active:scale-95 disabled:cursor-default">
              <Medallion st={st} i={i} state={state} level={l} big={big} />
            </button>
            <div className="pointer-events-none absolute top-1/2 w-[150px] -translate-y-1/2 rounded-[12px] px-2.5 py-1.5 text-[12.5px] leading-tight"
              style={{ ...(right ? { left: '100%', marginLeft: 10 } : { right: '100%', marginRight: 10, textAlign: 'right' }), background: 'rgba(16,22,23,.82)', border: `1px solid ${here ? 'rgba(232,180,71,.4)' : BORDER}` }}>
              <b className="block text-[14px] font-extrabold" style={{ color: state === 'locked' ? MUTED : '#F5F7F6' }}>{st.title}</b>
              {isDone ? <span className="font-bold" style={{ color: GREEN }}>✓ Completed</span>
                : here ? <span style={{ color: GOLD }}>{n > 0 ? `${n} of ${st.need} done` : st.sub}</span>
                : <span style={{ color: MUTED }}>{st.sub}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LearnPathPage() {
  const [view, setView] = useState<'trail' | 'board'>(() => { try { return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'trail'; } catch { return 'trail'; } });
  const pick = (v: 'trail' | 'board') => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* */ } };
  useEffect(() => { setPageMeta('Learn Path — ChessScout.net', 'Level up from pawn to king: puzzles, tactics, lessons, openings, traps and a bot to beat at every level.', '/path'); }, []);
  return view === 'board' ? <LearnPathBoard onList={() => pick('trail')} /> : <TrailPage onBoard={() => pick('board')} />;
}

function TrailPage({ onBoard }: { onBoard: () => void }) {
  const { authUser } = useUser();
  const [, navigate] = useLocation();
  const [s, setS] = useState<PathState>(readPath);
  useEffect(() => { markPathStarted(); return onPathChange(() => setS(readPath())); }, []);
  useEffect(() => {
    if (!authUser) return;
    void syncPath();
    // the recent-game review step only shows for members with imported games
    apiFetch('/api/games?limit=1', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setHasGames(((d.games ?? d) as unknown[]).length > 0); }).catch(() => {});
  }, [authUser]);
  const cur = currentLevel(s);
  const [viewN, setViewN] = useState(cur.n);
  useEffect(() => setViewN(cur.n), [cur.n]);
  const l = LEVELS[viewN - 1] ?? cur;
  const next: Step | null = useMemo(() => cur.steps.find((x) => !s.done[x.key]) ?? null, [cur, s]);
  const go = (st: Step) => { startStep(st); navigate(st.href); };
  const doneIn = l.steps.filter((x) => s.done[x.key]).length;
  const after = LEVELS[l.n];
  const allDone = LEVELS.reduce((a, x) => a + x.steps.filter((y) => s.done[y.key]).length, 0), all = LEVELS.reduce((a, x) => a + x.steps.length, 0);
  const levelOpen = (x: Level) => x.n === 1 || levelDone(s, LEVELS[x.n - 2]);

  return (
    <div className="min-h-screen pb-36" style={{ background: 'radial-gradient(120% 60% at 50% 0%, #1B2A22 0%, #0E1415 60%)', color: '#F5F7F6' }}>
      <style>{'@keyframes csPathBob{0%,100%{translate:0 0}50%{translate:0 -5px}} .cs-path-bob{animation:csPathBob 1.8s ease-in-out infinite}'}</style>
      <div className="mx-auto w-full max-w-[980px] px-4 pt-3">
        <RedesignHeader dense title="Learn Path" backHref="/progress" right={<button onClick={onBoard} className="rounded-full px-3 py-1.5 text-[12.5px] font-extrabold" style={{ background: CARD2, color: '#F5F7F6' }}>Board view</button>} />
        <p className="-mt-1 mb-3 px-1 text-[13px]" style={{ color: MUTED }}>Your chess journey: from pawn to king, one bot at a time.</p>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            {/* the level */}
            <div className="mb-2 flex items-center gap-3 rounded-[18px] p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <Shield n={l.n} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <b className="truncate text-[17px] font-black">{l.bot.name}</b>
                  <span className="shrink-0 text-[12px] font-bold" style={{ color: MUTED }}>about {l.bot.rating}</span>
                </div>
                <span className="block text-[12.5px]" style={{ color: MUTED }}>The {l.pieceName}'s path</span>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex flex-1 gap-1">{l.steps.map((x) => <span key={x.key} className="h-2 flex-1 rounded-full" style={{ background: s.done[x.key] ? GREEN : 'rgba(255,255,255,.1)' }} />)}</div>
                  <span className="text-[12px] font-extrabold">{doneIn}/{l.steps.length}</span>
                </div>
              </div>
            </div>

            <div className="mx-auto max-w-[520px]"><Trail l={l} s={s} cur={cur} go={go} /></div>
          </div>

          {/* beside the trail */}
          <aside className="space-y-3">
            {next && <button onClick={() => go(next)} className="cs-cta hidden lg:flex"><Play size={17} fill="#fff" /> Continue: {next.title}</button>}
            <div className="flex items-center gap-3 rounded-[18px] p-3.5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <Ring pct={doneIn / l.steps.length} />
              <div>
                <b className="block text-[15px] font-extrabold">Level progress</b>
                <span className="text-[12.5px]" style={{ color: MUTED }}>{doneIn} of {l.steps.length} steps · {allDone} of {all} on the whole path</span>
              </div>
            </div>

            <div className="rounded-[18px] p-3.5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-3">
                <ScoutIcon name="tournaments" size={40} />
                <div className="min-w-0">
                  <b className="block text-[15px] font-extrabold">{levelDone(s, l) ? 'Level complete' : 'Finish this level'}</b>
                  <span className="text-[12.5px]" style={{ color: MUTED }}>
                    {after ? <>Your piece becomes a <b style={{ color: '#F5F7F6' }}>{after.pieceName}</b> and Level {after.n} · {after.bot.name} opens.</> : 'The last level: beat it to finish the path.'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-[18px] p-3.5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <b className="mb-2 block text-[15px] font-extrabold">Level roadmap</b>
              <div className="relative">
                <span className="absolute bottom-3 left-[9px] top-3 w-[2px]" style={{ background: 'rgba(255,255,255,.08)' }} />
                {LEVELS.map((x) => {
                  const d = levelDone(s, x), o = levelOpen(x), sel = x.n === l.n;
                  return (
                    <button key={x.n} type="button" disabled={!o} onClick={() => setViewN(x.n)} className="relative flex w-full items-center gap-3 rounded-[10px] py-1.5 pr-2 text-left disabled:cursor-default" style={{ background: sel ? 'rgba(129,182,76,.08)' : undefined }}>
                      <span className="relative z-10 grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: d ? GREEN : '#101617', border: `2px solid ${d || x.n === cur.n ? GREEN : '#3A4446'}` }}>
                        {d ? <Check size={11} strokeWidth={4} color="#fff" /> : !o ? <Lock size={9} color={MUTED} /> : <span className="h-2 w-2 rounded-full" style={{ background: GREEN }} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: o ? '#F5F7F6' : MUTED, fontWeight: sel ? 800 : 600 }}>Level {x.n} · {x.bot.name}</span>
                      <span className="text-[11.5px]" style={{ color: MUTED }}>{x.pieceName}</span>
                      {o && <ChevronRight size={14} style={{ color: MUTED }} />}
                    </button>
                  );
                })}
              </div>
            </div>
            {!authUser && <p className="text-center text-[12.5px]" style={{ color: MUTED }}><Link href="/" className="underline">Sign in</Link> to keep your progress on every device.</p>}
          </aside>
        </div>
      </div>

      {next && (
        <div className="fixed inset-x-0 z-30 px-4 lg:hidden" style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
          <div className="mx-auto max-w-[520px]">
            <button onClick={() => go(next)} className="cs-cta flex items-center justify-center gap-2 shadow-lg"><Play size={17} fill="#fff" /> Continue: {next.title}</button>
          </div>
        </div>
      )}
    </div>
  );
}
