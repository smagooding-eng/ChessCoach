// The Learn Path page: a path of raised board squares (in the member's own board colours), one
// level per practice bot. Your token (in your own piece set) stands on the next step; it's a pawn
// at level 1 and becomes a new piece each level. Done steps turn green with a tick.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Check, Lock } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useSettings } from '@/context/SettingsContext';
import { useBoardTheme } from '@/components/MiniBoard';
import { AppIcon } from '@/components/AppIcon';
import { RedesignHeader } from '@/components/RedesignHeader';
import { LEVELS, readPath, onPathChange, syncPath, currentLevel, stepOpen, levelDone, startStep, type Level, type Step, type PathState } from '@/lib/learnPath';
import { setPageMeta } from '@/lib/pageMeta';

const MUTED = '#8F9997', GREEN = '#81B64C', GREEN_D = '#4F7A2A';
const X = [50, 72, 80, 66, 42, 24, 30, 54]; // zig-zag across the column (% of width)

function shade(hex: string, f: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return hex;
  const n = parseInt(m[1], 16); const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** One raised board square, seen from above at an angle. */
function Tile({ face, size, children, glow }: { face: string; size: number; children?: React.ReactNode; glow?: string }) {
  const side = shade(face, 0.62);
  return (
    <div className="relative" style={{ width: size * 1.42, height: size * 1.42 * 0.62 + 12 }}>
      {glow && <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: size * 1.9, height: size * 1.25, background: `radial-gradient(closest-side, ${glow}, transparent)` }} />}
      <div className="absolute left-1/2 top-0" style={{ width: size, height: size, transform: `translateX(-50%) scaleY(.62) rotate(45deg)`, transformOrigin: '50% 50%', marginTop: size * -0.19 }}>
        <div className="absolute inset-0 rounded-[10px]" style={{ background: side, transform: 'translate(7px, 7px)' }} />
        <div className="absolute inset-0 rounded-[10px]" style={{ background: face, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.18)' }} />
      </div>
      <div className="absolute inset-x-0 top-0 grid place-items-center" style={{ height: size * 1.42 * 0.62 }}>{children}</div>
    </div>
  );
}

function Token({ level, size }: { level: Level; size: number }) {
  const { renderPiece } = useBoardTheme();
  return (
    <div className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2" style={{ bottom: '46%', width: size, height: size }}>
      <div className="absolute bottom-[2%] left-1/2 h-[14%] w-[70%] -translate-x-1/2 rounded-[50%]" style={{ background: 'rgba(0,0,0,.35)' }} />
      {level.ring && <div className="absolute inset-[6%] rounded-full" style={{ boxShadow: `0 0 0 3px ${level.ring}, 0 0 18px ${level.ring}` }} />}
      <div className="cs-path-bob absolute inset-0">{renderPiece(level.piece)}</div>
    </div>
  );
}

export default function LearnPathPage() {
  const { authUser } = useUser();
  const { boardColors } = useSettings();
  const [, navigate] = useLocation();
  const [s, setS] = useState<PathState>(readPath);
  const hereRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setPageMeta('Learn Path — ChessScout.net', 'Level up from pawn to king: puzzles, tactics, lessons, openings, traps and a bot to beat at every level.', '/path'); }, []);
  useEffect(() => onPathChange(() => setS(readPath())), []);
  useEffect(() => { if (authUser) void syncPath(); }, [authUser]);
  useEffect(() => { const t = setTimeout(() => hereRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300); return () => clearTimeout(t); }, []);

  const cur = currentLevel(s);
  const next: Step | null = useMemo(() => cur.steps.find((x) => !s.done[x.key]) ?? null, [cur, s]);
  const go = (step: Step) => { startStep(step); navigate(step.href); };
  const light = boardColors?.light ?? '#EBECD0', dark = boardColors?.dark ?? '#739552';

  return (
    <div className="mx-auto w-full max-w-[520px] px-4 pb-32 pt-3" style={{ color: '#F5F7F6' }}>
      <style>{'@keyframes csPathBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6%)}} .cs-path-bob{animation:csPathBob 1.8s ease-in-out infinite}'}</style>
      <RedesignHeader dense title="Learn Path" backHref="/progress" />

      {LEVELS.map((l) => {
        const open = l.n === 1 || levelDone(s, LEVELS[l.n - 2]);
        const done = levelDone(s, l);
        const doneCount = l.steps.filter((x) => s.done[x.key]).length;
        return (
          <section key={l.n} className="mb-2" style={{ opacity: open ? 1 : 0.45 }}>
            {/* level banner */}
            <div className="sticky top-[56px] z-20 mb-3 flex items-center gap-3 rounded-[14px] px-3.5 py-2.5" style={{ background: 'var(--rd-card-solid, #182123)', border: `1px solid ${l.n === cur.n ? 'rgba(129,182,76,.45)' : 'rgba(255,255,255,.06)'}` }}>
              <img src={l.bot.avatar} alt="" className="h-10 w-10 rounded-full" style={{ background: '#212B2D' }} />
              <span className="min-w-0 flex-1">
                <b className="block text-[15px] font-black">Level {l.n} · {l.bot.name}</b>
                <span className="text-[12px]" style={{ color: MUTED }}>About {l.bot.rating} · your piece: {l.pieceName}</span>
              </span>
              <span className="text-[12.5px] font-extrabold" style={{ color: done ? GREEN : MUTED }}>{done ? <Check size={18} /> : open ? `${doneCount}/${l.steps.length}` : <Lock size={15} />}</span>
            </div>

            {/* the steps */}
            <div className="relative">
              {l.steps.map((st, i) => {
                const isDone = !!s.done[st.key];
                const can = stepOpen(s, l, i);
                const here = !isDone && can && next?.key === st.key && l.n === cur.n;
                const boss = st.kind === 'bot';
                const face = isDone ? GREEN : here ? light : can ? ((i % 2) ? dark : light) : '#3A4446';
                const left = X[i % X.length];
                return (
                  <div key={st.key} ref={here ? hereRef : undefined} className="relative flex items-center" style={{ height: boss ? 128 : 96 }}>
                    <button type="button" disabled={!can} onClick={() => go(st)} aria-label={`${st.title}: ${st.sub}`}
                      className="absolute -translate-x-1/2 transition-transform active:scale-95 disabled:cursor-default" style={{ left: `${left}%`, top: boss ? 6 : 4 }}>
                      <div className="relative">
                        <Tile face={face} size={boss ? 74 : 58} glow={here ? 'rgba(129,182,76,.45)' : undefined}>
                          {isDone ? <Check size={boss ? 34 : 28} strokeWidth={4} color="#fff" style={{ filter: `drop-shadow(0 2px 0 ${GREEN_D})` }} />
                            : boss ? <img src={l.bot.avatar} alt="" className="h-11 w-11 rounded-full ring-2 ring-white/70" />
                            : <span style={{ opacity: can ? 1 : 0.5 }}><AppIcon name={st.icon} size={26} /></span>}
                        </Tile>
                        {here && <Token level={l} size={boss ? 70 : 60} />}
                      </div>
                    </button>
                    {/* label beside the square */}
                    <div className="pointer-events-none absolute max-w-[42%] text-[12.5px] leading-tight" style={left >= 50 ? { right: `${100 - left + 22}%`, textAlign: 'right' } : { left: `${left + 22}%` }}>
                      <b className={boss ? 'text-[14px]' : ''} style={{ color: can ? '#F5F7F6' : MUTED }}>{st.title}</b>
                      <span className="block" style={{ color: MUTED }}>{st.sub}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {next && (
        <div className="fixed inset-x-0 z-30 px-4" style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
          <div className="mx-auto max-w-[520px]">
            <button onClick={() => go(next)} className="cs-cta shadow-lg">Continue: {next.title}</button>
          </div>
        </div>
      )}
      {!authUser && <p className="mt-4 text-center text-[12.5px]" style={{ color: MUTED }}><Link href="/" className="underline">Sign in</Link> to keep your progress on every device.</p>}
    </div>
  );
}
