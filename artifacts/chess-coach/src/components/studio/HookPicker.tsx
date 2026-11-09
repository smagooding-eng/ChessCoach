// A library of opening lines for reels, grouped by what makes people stop
// (curiosity, a challenge, a problem, a promise...) and filtered by the kind of
// video. Tap one to use it; "Surprise me" picks a random one from the list.
// None of them claim numbers about viewers we can't back up.
import { useMemo, useState } from 'react';
import { Sparkles, Shuffle, X } from 'lucide-react';

export type HookTopic = 'puzzle' | 'tactics' | 'endgame' | 'trap' | 'opening' | 'riddle' | 'app' | 'tournament' | 'improve';
export type HookKind = 'Challenge' | 'Curiosity' | 'Problem' | 'Promise' | 'Contrast' | 'Opinion' | 'Story';
export interface Hook { text: string; sub?: string; kind: HookKind; topics: HookTopic[] }

export const HOOKS: Hook[] = [
  // Challenges (comments are the answer)
  { text: 'MATE IN 2', sub: "Looks easy. It isn't.", kind: 'Challenge', topics: ['puzzle', 'endgame'] },
  { text: 'Which move is correct?', sub: 'A, B or C', kind: 'Challenge', topics: ['puzzle', 'tactics', 'endgame'] },
  { text: 'Find the winning move', sub: 'You have 7 seconds.', kind: 'Challenge', topics: ['puzzle', 'tactics', 'endgame'] },
  { text: 'Only one move wins here', sub: 'Can you see it?', kind: 'Challenge', topics: ['puzzle', 'tactics', 'endgame'] },
  { text: 'Pause the video', sub: 'Find the move before the timer ends.', kind: 'Challenge', topics: ['puzzle', 'tactics'] },
  { text: 'Grandmasters see this instantly', sub: 'Do you?', kind: 'Challenge', topics: ['puzzle', 'tactics'] },
  { text: 'Drop your move in the comments', sub: 'No engine.', kind: 'Challenge', topics: ['puzzle', 'tactics', 'endgame'] },
  { text: 'White to play and win', sub: "It's not the obvious move.", kind: 'Challenge', topics: ['puzzle', 'tactics', 'endgame'] },
  { text: 'Win it or draw it?', sub: 'One move decides.', kind: 'Challenge', topics: ['endgame'] },
  { text: 'Can you stop this pawn?', sub: 'Think before you answer.', kind: 'Challenge', topics: ['endgame'] },
  // Curiosity
  { text: 'Why did White just give away the queen?', kind: 'Curiosity', topics: ['puzzle', 'tactics', 'trap'] },
  { text: 'This move looks like a blunder', sub: "It's the best move on the board.", kind: 'Curiosity', topics: ['puzzle', 'tactics'] },
  { text: "This pawn move looks illegal. It isn't.", kind: 'Curiosity', topics: ['riddle', 'endgame'] },
  { text: 'Can a knight land on all 64 squares', sub: '…only once each?', kind: 'Curiosity', topics: ['riddle'] },
  { text: 'Can 8 queens share a board', sub: 'without attacking each other?', kind: 'Curiosity', topics: ['riddle'] },
  { text: 'Brilliant, but why?', kind: 'Curiosity', topics: ['tactics', 'puzzle'] },
  { text: 'Watch the king', sub: "It's already lost.", kind: 'Curiosity', topics: ['tactics', 'endgame', 'trap'] },
  { text: 'Everything is defended', sub: 'And it still falls apart.', kind: 'Curiosity', topics: ['tactics'] },
  // Problems
  { text: "You're losing games because of this one move", kind: 'Problem', topics: ['improve', 'tactics', 'app'] },
  { text: 'Stuck under 1000?', sub: 'Stop doing this.', kind: 'Problem', topics: ['improve', 'app'] },
  { text: 'Stop hanging your pieces', sub: 'One habit fixes it.', kind: 'Problem', topics: ['improve', 'tactics'] },
  { text: 'The most common blunder in the Italian', kind: 'Problem', topics: ['opening', 'trap'] },
  { text: 'Why you keep losing winning endgames', kind: 'Problem', topics: ['endgame', 'improve'] },
  { text: 'Why you keep losing on time', kind: 'Problem', topics: ['improve'] },
  { text: "You've been reviewing your games wrong", kind: 'Problem', topics: ['app', 'improve'] },
  // Promises
  { text: 'Play this and win in 7 moves', kind: 'Promise', topics: ['trap', 'opening'] },
  { text: 'One setup. Every game. Zero theory.', kind: 'Promise', topics: ['opening'] },
  { text: 'The only checkmate pattern you need this week', kind: 'Promise', topics: ['endgame', 'tactics'] },
  { text: 'Learn this fork', sub: 'Win a piece next game.', kind: 'Promise', topics: ['tactics'] },
  { text: 'Your first opening, in 4 moves', kind: 'Promise', topics: ['opening', 'improve'] },
  { text: 'Find your weaknesses in 30 seconds', kind: 'Promise', topics: ['app', 'improve'] },
  { text: 'Know your opponent before you play', kind: 'Promise', topics: ['app'] },
  { text: 'Run a chess tournament for your club', sub: 'Free.', kind: 'Promise', topics: ['tournament'] },
  { text: 'Your office needs a chess tournament', kind: 'Promise', topics: ['tournament'] },
  // Contrast
  { text: 'How a 600 sees this vs an 1800', kind: 'Contrast', topics: ['improve', 'tactics'] },
  { text: 'Same position', sub: 'One move wins, one move loses.', kind: 'Contrast', topics: ['puzzle', 'tactics', 'endgame'] },
  { text: 'Beginners play this', sub: 'Strong players play this.', kind: 'Contrast', topics: ['opening', 'improve'] },
  { text: 'What you see vs what the engine sees', kind: 'Contrast', topics: ['app', 'tactics'] },
  // Opinions (spark comments; reply to them)
  { text: 'Stop learning openings', sub: 'Learn this instead.', kind: 'Opinion', topics: ['improve', 'tactics'] },
  { text: 'Blitz is making you worse', kind: 'Opinion', topics: ['improve'] },
  { text: 'Chess.com is dead', kind: 'Opinion', topics: ['app'] },
  { text: '9 reasons I stopped opening Chess.com', kind: 'Opinion', topics: ['app'] },
  // Stories
  { text: 'He resigned', sub: 'He was winning.', kind: 'Story', topics: ['tactics', 'endgame'] },
  { text: 'I reviewed my last 50 losses', sub: 'Same mistake every time.', kind: 'Story', topics: ['app', 'improve'] },
  { text: 'My opponent fell for this in 30 seconds', kind: 'Story', topics: ['trap'] },
];

const KINDS: HookKind[] = ['Challenge', 'Curiosity', 'Problem', 'Promise', 'Contrast', 'Opinion', 'Story'];

/** A "Pick a hook" button and its picker. `topics` narrows the list to this kind of video. */
export function HookPicker({ topics, onPick, label = 'Pick a hook' }: { topics?: HookTopic[]; onPick: (h: Hook) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<HookKind | 'All'>('All');
  const [all, setAll] = useState(false);
  const list = useMemo(() => HOOKS.filter((h) => (all || !topics || h.topics.some((t) => topics.includes(t))) && (kind === 'All' || h.kind === kind)), [topics, kind, all]);
  const pick = (h: Hook) => { onPick(h); setOpen(false); };
  return (
    <>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black text-white"><Sparkles size={14} /> {label}</button>
        <button type="button" onClick={() => { const pool = HOOKS.filter((h) => !topics || h.topics.some((t) => topics.includes(t))); if (pool.length) onPick(pool[Math.floor(Math.random() * pool.length)]); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-black text-white"><Shuffle size={14} /> Surprise me</button>
      </div>
      {open && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center" style={{ background: 'rgba(0,0,0,.7)' }} onClick={() => setOpen(false)}>
          <div className="flex max-h-[85dvh] w-full max-w-[520px] flex-col rounded-t-2xl p-3 sm:rounded-2xl" style={{ background: '#141D1F', border: '1px solid #243033' }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[15px] font-black text-white">Pick a hook</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-white/60"><X size={18} /></button>
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {(['All', ...KINDS] as const).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} className="rounded-full px-2.5 py-1 text-[11.5px] font-bold" style={{ background: kind === k ? '#81B64C' : 'rgba(255,255,255,.07)', color: '#fff' }}>{k}</button>
              ))}
              {topics && <button type="button" onClick={() => setAll((v) => !v)} className="ml-auto rounded-full px-2.5 py-1 text-[11.5px] font-bold text-white/70" style={{ background: 'rgba(255,255,255,.05)' }}>{all ? 'Only for this video' : 'Show all hooks'}</button>}
            </div>
            <div className="-mx-1 flex-1 overflow-y-auto px-1">
              {list.map((h) => (
                <button key={h.text + (h.sub ?? '')} type="button" onClick={() => pick(h)} className="mb-1.5 block w-full rounded-xl p-2.5 text-left" style={{ background: '#1A2224', border: '1px solid rgba(255,255,255,.07)' }}>
                  <span className="block text-[14px] font-black text-white">{h.text}</span>
                  {h.sub && <span className="block text-[12.5px] font-bold" style={{ color: '#81B64C' }}>{h.sub}</span>}
                  <span className="mt-0.5 block text-[10.5px] font-bold uppercase tracking-wider text-white/35">{h.kind}</span>
                </button>
              ))}
              {list.length === 0 && <p className="py-6 text-center text-[12.5px] text-white/50">No hooks of this kind for this video. Tap "Show all hooks".</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** One line from a hook (for tools with a single hook field). */
export const hookLine = (h: Hook) => (h.sub ? `${h.text}${/[?.!…]$/.test(h.text) ? '' : '.'} ${h.sub}` : h.text);
