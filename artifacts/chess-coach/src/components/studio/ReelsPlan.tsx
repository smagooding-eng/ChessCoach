// Reels plan: what to post this week and why, built from the account's own
// numbers (the knight's tour and Queen's Gambit reels reached ~1.6K plays,
// app promos and long explainers ~150-420). Each item opens the studio tool
// that makes it. Ticks are kept on this device only.
import { useState } from 'react';
import { Check, Copy, Clapperboard } from 'lucide-react';
import type { PuzzleReelOpts } from './PuzzleReel';

export type PlanAction =
  | { kind: 'puzzle'; opts: Partial<PuzzleReelOpts> }
  | { kind: 'section'; id: string }
  | { kind: 'tournament' }
  | { kind: 'view'; view: 'traps' | 'openings' | 'reviews' | 'moments' }
  | { kind: 'promo'; promo: 'knight' };

const CARD = { background: '#1A2224', border: '1px solid rgba(255,255,255,.08)' } as const;
const G = '#81B64C';

const mate2 = (reveal: boolean, theme = 'mateIn2'): PlanAction => ({ kind: 'puzzle', opts: { mode: 'mate2', theme, reveal } });
const abc = (theme: string, reveal = false): PlanAction => ({ kind: 'puzzle', opts: { mode: 'abc', theme, reveal } });

interface Item { title: string; detail: string; action?: PlanAction; actionLabel?: string }

const OPPORTUNITIES: Item[] = [
  { title: 'Mate in 2. Looks easy. It isn\'t.', detail: 'Puzzle, 8s, answer hidden. Comments are the answer, and comments spread a reel.', action: mate2(false) },
  { title: 'Play this and win in 7 moves', detail: 'A trap that still works below 1500 (Légal\'s Mate), 30s. Trap reels are the biggest chess format right now.', action: { kind: 'view', view: 'traps' }, actionLabel: 'Trap lessons' },
  { title: 'Remake your best reel: the knight\'s tour', detail: 'Your top reel was a question people needed answered. Post it again with a new board look and a new first line, e.g. "Bet you can\'t predict where the knight goes next."', action: { kind: 'promo', promo: 'knight' }, actionLabel: 'Knight\'s tour' },
  { title: 'The London: one setup against everything', detail: 'Opening cut to ~45s. Your Queen\'s Gambit reel worked; shorter keeps people watching.', action: { kind: 'view', view: 'openings' }, actionLabel: 'Openings' },
  { title: 'Stop playing this move as a beginner', detail: 'A common blunder, 15s. Problem-first hooks hold attention.', action: { kind: 'view', view: 'moments' }, actionLabel: 'Game moments' },
  { title: 'Run a chess tournament for your office, free', detail: 'Tournament reel, 20s. Groups (like ANPASA) are your best signups.', action: { kind: 'tournament' } },
  { title: 'Which move is correct? A, B or C', detail: 'Puzzle, 10s. The easiest comment there is: one letter.', action: abc('fork') },
];

const TOP_HOOKS = [
  "Mate in 2. Looks easy. It isn't.",
  'Can a knight land on all 64 squares… only once each?',
  'Play this and win in 7 moves.',
  "You're losing games because of this one move.",
  'Which move is correct? A, B or C',
];
const MORE_HOOKS = [
  'Why did White just give away the queen?', "This pawn move looks illegal. It isn't.", 'Can 8 queens fit on a board without attacking each other?',
  'How a 600 sees this position vs a 1800', 'Same position. One move wins, one move loses.', 'Stuck under 1000? Stop doing this.',
  'Why you keep losing on time', 'The most common blunder in the Italian', 'Never take this pawn',
  'I reviewed my last 50 losses. Same mistake every time.', 'From hanging pieces to 1200: one habit', 'Stop learning openings. Learn this instead.',
  'Blitz is making you worse.', 'He resigned. He was winning.', 'The only checkmate pattern you need this week',
];

const LEGAL: { t: string; screen: string; text: string }[] = [
  { t: '0–2s', screen: 'The finished mate, king trapped', text: 'Win in 7 moves. Your opponent won\'t see it.' },
  { t: '2–4s', screen: '1.e4 e5 2.Nf3 d6', text: 'Start normal' },
  { t: '4–7s', screen: '3.Bc4 Bg4', text: 'They pin your knight…' },
  { t: '7–9s', screen: '4.Nc3 g6', text: '…and make one lazy move' },
  { t: '9–13s', screen: '5.Nxe5!! (pause, arrow)', text: 'Give up your QUEEN' },
  { t: '13–16s', screen: '5…Bxd1', text: 'They take it…' },
  { t: '16–20s', screen: '6.Bxf7+ Ke7 7.Nd5#', text: '…and it\'s checkmate' },
  { t: '20–25s', screen: 'Mate, three pieces glowing', text: 'Bishop + two knights' },
  { t: '25–30s', screen: 'End card', text: 'Try it tonight. Tell me if it worked 👇' },
];

const SAVE_SHARE: Item[] = [
  { title: '5 checkmate patterns every beginner should know', detail: 'Carousel, one pattern per slide (back-rank, smothered, Arabian, ladder, queen-and-king). End: "Save this for your next game."', action: mate2(true, 'backRankMate'), actionLabel: 'Back-rank puzzle' },
  { title: 'The 3-question check before every move', detail: 'Checks, captures, threats, for both sides. End: "Send this to the friend who hangs their queen."' },
  { title: 'Your first opening, in 4 moves', detail: 'The Italian setup, 20s. "If you\'re new, start here." End: "Save it for your next game as White."', action: { kind: 'view', view: 'openings' }, actionLabel: 'Openings' },
  { title: 'Parents: teach chess in 10 minutes a day', detail: 'Carousel, one piece at a time. Gets shared to family chats. Ends on the free kids lessons.', action: { kind: 'section', id: 'kids' }, actionLabel: 'Kids promo' },
  { title: 'How to review a game you lost, in 3 steps', detail: '25s, a screen recording of your own review. End: "Review your last loss free at chessscout.net."', action: { kind: 'view', view: 'reviews' }, actionLabel: 'Game reviews' },
];

const TRENDS: { trend: string; ours: string; watch: string }[] = [
  { trend: '"Open with your knight instead of a pawn" traps (13M, 1.2M views)', ours: '"Play this and win in 7" with your own traps', watch: 'Use your own words; that phrasing is everywhere' },
  { trend: '"Brilliant, but why?" loops (2.1M)', ours: 'A brilliant move from a real reviewed game: "Why is this brilliant?"', watch: 'Under 10 seconds' },
  { trend: '"Mate in 2. Looks easy." puzzles (600K)', ours: 'Puzzle reels, answer hidden', watch: 'Change the second line each time' },
  { trend: '"A, B or C?" (768K)', ours: 'Puzzle reels, A/B/C', watch: 'Don\'t reveal in the same post' },
  { trend: '"600 vs 1800 thinking" (747K)', ours: '"How a 600, 1200 and 1800 see this" with review labels', watch: 'Needs one clear position' },
];

const CALENDAR: { day: string; am: Item; pm: Item; test: string }[] = [
  { day: 'Mon', am: { title: 'Mate in 2, hidden', detail: '8s', action: mate2(false) }, pm: { title: 'Légal\'s Mate, 30s', detail: 'Script below', action: { kind: 'view', view: 'traps' } }, test: 'Puzzle vs trap · comments, plays' },
  { day: 'Tue', am: { title: 'A, B or C (fork)', detail: '10s', action: abc('fork') }, pm: { title: 'Knight\'s tour remake, new first line', detail: '30s', action: { kind: 'promo', promo: 'knight' } }, test: 'One-letter comment vs curiosity' },
  { day: 'Wed', am: { title: 'Mate in 2, answer shown', detail: '12s', action: mate2(true) }, pm: { title: 'London, rewritten to 40s', detail: 'See below', action: { kind: 'view', view: 'openings' } }, test: 'Hidden vs shown answer · watch time, saves' },
  { day: 'Thu', am: { title: '"5 checkmate patterns" carousel', detail: 'Slides' }, pm: { title: '"600 vs 1800"', detail: '20s', action: { kind: 'view', view: 'moments' } }, test: 'Carousel vs reel · saves, sends' },
  { day: 'Fri', am: { title: 'Rook endgame, A/B/C', detail: '10s', action: abc('rookEndgame') }, pm: { title: '"Why is this brilliant?"', detail: 'From a real review', action: { kind: 'view', view: 'reviews' } }, test: 'Endgame vs brilliant move · plays' },
  { day: 'Sat', am: { title: 'Smothered mate, shown', detail: '12s', action: mate2(true, 'smotheredMate') }, pm: { title: 'Tournament reel', detail: '20s', action: { kind: 'tournament' } }, test: 'Entertainment vs app promo · link taps' },
  { day: 'Sun', am: { title: 'Repeat the week\'s best format', detail: 'New puzzle' }, pm: { title: 'Repeat the second best', detail: '' }, test: 'Is the winner repeatable? · plays vs Monday' },
];

const DONE_KEY = 'cs_reels_plan_done';
function useDone() {
  const [done, setDone] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); } catch { return {}; } });
  const toggle = (k: string) => setDone((d) => { const n = { ...d, [k]: !d[k] }; try { localStorage.setItem(DONE_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  return { done, toggle };
}

export function ReelsPlan({ onAction }: { onAction: (a: PlanAction) => void }) {
  const { done, toggle } = useDone();
  const [copied, setCopied] = useState('');
  const copy = (t: string) => { try { void navigator.clipboard.writeText(t); setCopied(t); setTimeout(() => setCopied(''), 1400); } catch { /* ignore */ } };
  const Make = ({ a, label }: { a?: PlanAction; label?: string }) => a ? (
    <button onClick={() => onAction(a)} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-black text-white" style={{ background: G }}>
      <Clapperboard size={13} /> {label ?? 'Make it'}
    </button>
  ) : null;
  const H = ({ n, t, s }: { n: string; t: string; s: string }) => (
    <div className="mt-6 mb-2">
      <p className="text-[16px] font-black text-white"><span style={{ color: G }}>{n}</span> {t}</p>
      <p className="text-[12.5px] text-white/55">{s}</p>
    </div>
  );

  return (
    <div className="max-w-3xl pb-10">
      <div className="rounded-xl p-3" style={CARD}>
        <p className="text-[14px] font-black text-white">This week's reels plan</p>
        <p className="mt-1 text-[12.5px] text-white/60">Your two best reels (the knight's tour and the Queen's Gambit, ~1.6K plays each) asked a question or made a promise in the first second. App promos and long explainers sat at 150–420. So: short puzzles, traps and curiosity, with promos at most one in five. Turn on Instagram's "Trial" setting for the morning post so it reaches non-followers.</p>
      </div>

      <H n="1" t="Seven-day calendar" s="Two a day, each testing one thing. Normal is about 200 plays; keep whatever beats it." />
      <div className="space-y-2">
        {CALENDAR.map((d) => (
          <div key={d.day} className="rounded-xl p-3" style={CARD}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-black text-white">{d.day}</p>
              <p className="text-[11.5px] text-white/45">{d.test}</p>
            </div>
            {([['am', 'Morning', d.am], ['pm', 'Evening', d.pm]] as const).map(([k, label, it]) => {
              const key = `${d.day}-${k}`;
              return (
                <div key={k} className="mt-2 flex items-center gap-2">
                  <button onClick={() => toggle(key)} aria-label="Posted" className="grid h-5 w-5 shrink-0 place-items-center rounded" style={{ background: done[key] ? G : 'transparent', border: `1.5px solid ${done[key] ? G : 'rgba(255,255,255,.3)'}` }}>{done[key] && <Check size={13} color="#fff" />}</button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold" style={{ color: done[key] ? 'rgba(255,255,255,.4)' : '#fff', textDecoration: done[key] ? 'line-through' : undefined }}><span className="text-white/45">{label}: </span>{it.title}</p>
                    {it.detail && <p className="text-[11.5px] text-white/45">{it.detail}</p>}
                  </div>
                  <Make a={it.action} label={it.actionLabel} />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <H n="2" t="Seven opportunities" s="What the audience wants, the angle, and the tool that makes it." />
      <div className="space-y-2">
        {OPPORTUNITIES.map((o) => (
          <div key={o.title} className="flex items-center gap-3 rounded-xl p-3" style={CARD}>
            <div className="min-w-0 flex-1"><p className="text-[13.5px] font-black text-white">{o.title}</p><p className="text-[12px] text-white/55">{o.detail}</p></div>
            <Make a={o.action} label={o.actionLabel} />
          </div>
        ))}
      </div>

      <H n="3" t="Hooks" s="Tap one to copy it. The top 5 first." />
      <div className="rounded-xl p-3" style={CARD}>
        {[...TOP_HOOKS, ...MORE_HOOKS].map((h, i) => (
          <button key={h} onClick={() => copy(h)} className="flex w-full items-center gap-2 border-b border-white/5 py-1.5 text-left last:border-0">
            <span className="w-5 shrink-0 text-[11px] font-black" style={{ color: i < 5 ? G : 'rgba(255,255,255,.35)' }}>{i + 1}</span>
            <span className="flex-1 text-[13px] text-white" style={{ fontWeight: i < 5 ? 800 : 500 }}>{h}</span>
            {copied === h ? <Check size={13} color={G} /> : <Copy size={13} className="text-white/30" />}
          </button>
        ))}
      </div>

      <H n="4" t={'Script: "Win in 7 moves" (Légal\'s Mate)'} s="About 30 seconds. Payoff first, then how. Build the board part in Trap lessons and add these text cards." />
      <div className="overflow-hidden rounded-xl" style={CARD}>
        {LEGAL.map((r) => (
          <div key={r.t} className="grid grid-cols-[56px_1fr_1fr] gap-2 border-b border-white/5 px-3 py-2 text-[12.5px] last:border-0">
            <span className="font-black" style={{ color: G }}>{r.t}</span>
            <span className="text-white/60">{r.screen}</span>
            <span className="font-bold text-white">{r.text}</span>
          </div>
        ))}
      </div>
      <div className="mt-2"><Make a={{ kind: 'view', view: 'traps' }} label="Open Trap lessons" /></div>

      <H n="5" t="Five reels people will save or send" s="Useful enough that sharing feels like helping someone. None ask for shares." />
      <div className="space-y-2">
        {SAVE_SHARE.map((o) => (
          <div key={o.title} className="flex items-center gap-3 rounded-xl p-3" style={CARD}>
            <div className="min-w-0 flex-1"><p className="text-[13.5px] font-black text-white">{o.title}</p><p className="text-[12px] text-white/55">{o.detail}</p></div>
            <Make a={o.action} label={o.actionLabel} />
          </div>
        ))}
      </div>

      <H n="6" t="Fixing a reel you already posted" s="The London System (Nov 3): 424 plays, 5 comments, 91 seconds." />
      <div className="space-y-1.5 rounded-xl p-3 text-[12.5px] text-white/75" style={CARD}>
        <p>The topic works (it got comments), but few people saw it: a busy first frame and 91 seconds.</p>
        <p><b className="text-white">1.</b> Cut to ~40s, one line only. <b className="text-white">2.</b> Open on the final setup: "One setup. Every game. Zero theory." <b className="text-white">3.</b> End on one frame worth saving: "Save this: d4, Bf4, e3, Nf3, c3".</p>
      </div>

      <H n="7" t="Trends, adapted" s="From small chess accounts' top reels (Aug–Nov 2026)." />
      <div className="space-y-2">
        {TRENDS.map((t) => (
          <div key={t.trend} className="rounded-xl p-3 text-[12.5px]" style={CARD}>
            <p className="font-black text-white">{t.trend}</p>
            <p className="text-white/70">Ours: {t.ours}</p>
            <p className="text-white/45">Watch out: {t.watch}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
