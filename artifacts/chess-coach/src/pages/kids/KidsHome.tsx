// Chess for Kids -- the adventure map (/kids).

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ParentGate } from '@/components/kids/ParentGate';
import { useKidMode, setKidMode } from '@/lib/kids/kidMode';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { KidsShell, TopBar, BuddyPicker, Bubble, KID_FONT } from '@/components/kids/KidsChrome';
import { KidPiece, KidAvatar, KidBear, StarRow, AVATARS } from '@/components/kids/KidsArt';
import { WORLDS } from '@/lib/kids/levels';
import { useKids, worldDone, worldStars, worldUnlocked } from '@/lib/kids/progress';

export default function KidsHome() {
  const { state, update, reset } = useKids();
  const [picker, setPicker] = useState(false);
  const kidMode = useKidMode();
  const [, navigate] = useLocation();
  const [gate, setGate] = useState<null | 'corner'>(null);
  const [grownUp, setGrownUp] = useState(false);
  useEffect(() => { if (!state.avatar) setPicker(true); }, [state.avatar]);

  const buddy = AVATARS.find((a) => a.id === state.avatar);
  const nextIndex = WORLDS.findIndex((w, i) => worldUnlocked(state, i) && !worldDone(state, w));
  const stickers = WORLDS.filter((w) => worldDone(state, w));

  return (
    <KidsShell>
      <TopBar back={kidMode ? undefined : '/'} onAvatar={() => setPicker(true)} />

      <div className="text-center mt-2 mb-4">
        <motion.h1 className="text-[44px] leading-none font-extrabold text-white"
          style={{ textShadow: '0 4px 0 #6C51C2, 0 8px 18px rgba(47,34,87,0.25)', fontFamily: KID_FONT }}
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
          Chess Adventure
        </motion.h1>
        <p className="mt-2 text-lg font-bold" style={{ color: '#4A3A86' }}>Meet every piece, one fun game at a time!</p>
      </div>

      {buddy && (
        <div className="mb-6">
          <Bubble who={<KidAvatar id={buddy.id} size={64} />}
            text={nextIndex === -1 ? 'WOW! You finished every world. Now you can play a real game with Benny the Bear!'
              : `Let's go to ${WORLDS[nextIndex].name}! Tap it to start.`} />
        </div>
      )}

      {/* the path */}
      <div className="relative">

        <div className="relative flex flex-col gap-1">
          {WORLDS.map((w, i) => {
            const open = worldUnlocked(state, i);
            const done = worldDone(state, w);
            const isNext = i === nextIndex;
            const got = worldStars(state, w);
            const max = w.levels.length * 3;
            const card = (
              <motion.div
                className="relative rounded-[28px] p-3 pr-4 flex items-center gap-3"
                style={{
                  background: open ? '#fff' : 'rgba(255,255,255,0.55)',
                  boxShadow: open ? `0 6px 0 ${w.color}` : '0 6px 0 rgba(47,34,87,0.12)',
                  border: `3px solid ${open ? w.color : 'transparent'}`,
                  width: '82%',
                  marginLeft: i % 2 === 0 ? 0 : 'auto',
                }}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                whileTap={open ? { scale: 0.97, y: 3 } : undefined}>
                <motion.div className="shrink-0 w-[76px] h-[76px] rounded-[22px] flex items-center justify-center"
                  style={{ background: open ? `${w.color}33` : 'rgba(0,0,0,0.06)', filter: open ? 'none' : 'grayscale(1)' }}
                  animate={isNext ? { rotate: [0, -5, 5, 0] } : {}} transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 1.2 }}>
                  <KidPiece type={w.piece} side="w" size={64} />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <p className="text-[22px] font-extrabold leading-tight">{w.name}</p>
                  {open ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="h-3 flex-1 rounded-full overflow-hidden" style={{ background: '#EFEAFB' }}>
                        <div className="h-full rounded-full" style={{ width: `${(got / max) * 100}%`, background: w.color, transition: 'width .5s' }} />
                      </div>
                      <span className="text-sm font-extrabold opacity-70">{got}/{max}</span>
                    </div>
                  ) : (
                    <p className="text-sm font-bold opacity-60 flex items-center gap-1"><Lock className="w-4 h-4" /> Finish {WORLDS[i - 1]?.name} first</p>
                  )}
                </div>
                {done && (
                  <span className="absolute -top-3 -right-2 rounded-full px-2.5 py-0.5 text-sm font-extrabold text-white" style={{ background: '#2FBF71', boxShadow: '0 3px 0 #1E8E50' }}>Done!</span>
                )}
                {isNext && !done && (
                  <motion.span className="absolute -top-3 -right-2 rounded-full px-2.5 py-0.5 text-sm font-extrabold text-white"
                    style={{ background: '#FF9F1C', boxShadow: '0 3px 0 #D97C00' }}
                    animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>Play!</motion.span>
                )}
              </motion.div>
            );
            const dotsRow = i < WORLDS.length - 1 && (
              <div className="flex justify-center gap-2 py-2.5" aria-hidden="true">
                {[0, 1, 2].map((d) => <span key={d} className="w-2.5 h-2.5 rounded-full bg-white/80" style={{ transform: `translateX(${(i % 2 === 0 ? 1 : -1) * (d - 1) * 14}px)` }} />)}
              </div>
            );
            return open
              ? <div key={w.id}><Link className="block" href={`/kids/${w.id}`} aria-label={`${w.name}${done ? ', finished' : ''}`}>{card}</Link>{dotsRow}</div>
              : <div key={w.id}><div aria-label={`${w.name}, locked`}>{card}</div>{dotsRow}</div>;
          })}
        </div>
      </div>

      {/* the reward: a real game with Benny the Bear */}
      {(() => {
        const ready = state.unlockAll || nextIndex === -1;
        const card = (
          <motion.div className="mt-6 rounded-[28px] p-4 flex items-center gap-3"
            style={{ background: ready ? '#fff' : 'rgba(255,255,255,0.55)', border: `3px solid ${ready ? '#E8A86B' : 'transparent'}`, boxShadow: ready ? '0 6px 0 #E8A86B' : '0 6px 0 rgba(47,34,87,0.12)' }}
            animate={ready ? { scale: [1, 1.02, 1] } : {}} transition={{ duration: 1.6, repeat: Infinity }}>
            <div className="shrink-0" style={{ filter: ready ? 'none' : 'grayscale(1)' }}><KidBear size={76} mood={ready ? 'happy' : 'think'} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[22px] font-extrabold leading-tight">Play Benny the Bear</p>
              {ready
                ? <p className="text-base font-bold opacity-70">A real game of chess! {state.bennyWins ? `You've beaten him ${state.bennyWins} time${state.bennyWins === 1 ? '' : 's'}.` : 'Can you beat him?'}</p>
                : <p className="text-sm font-bold opacity-60 flex items-center gap-1"><Lock className="w-4 h-4" /> Finish every world to play</p>}
            </div>
          </motion.div>
        );
        return ready ? <Link className="block" href="/kids/benny" aria-label="Play a game with Benny the Bear">{card}</Link> : <div aria-label="Benny the Bear game, locked">{card}</div>;
      })()}

      {/* sticker book */}
      <div className="mt-8 rounded-[28px] bg-white/80 p-4" style={{ boxShadow: '0 6px 0 rgba(47,34,87,0.12)' }}>
        <p className="text-2xl font-extrabold">My sticker book</p>
        <p className="text-base font-semibold opacity-70 mb-3">Finish a world to win its sticker!</p>
        <div className="grid grid-cols-5 gap-2">
          {WORLDS.map((w) => {
            const got = stickers.includes(w);
            return (
              <div key={w.id} className="flex flex-col items-center gap-1" aria-label={`${w.name} sticker${got ? '' : ', not yet'}`}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: got ? w.color : '#EEE9F8', border: `3px ${got ? 'solid' : 'dashed'} ${got ? '#fff' : '#CFC4EC'}`, boxShadow: got ? '0 3px 0 rgba(0,0,0,0.15)' : 'none' }}>
                  {got ? <KidPiece type={w.piece} side="w" size={40} /> : <span className="text-xl opacity-30 font-extrabold">?</span>}
                </div>
                <StarRow n={got ? 3 : 0} size={10} gap={1} />
              </div>
            );
          })}
        </div>
      </div>

      {/* grown-up corner: behind the grown-up question, so a child can't change settings or leave Kid Mode */}
      <div className="mt-6 rounded-3xl bg-white/60 p-4 text-sm font-semibold" style={{ color: '#4A3A86' }}>
        <p className="font-extrabold text-base mb-1">For grown-ups</p>
        <p className="opacity-80 mb-3">
          No chat, no ads, no names. Progress stays on this device.
          {kidMode ? ' Kid Mode is ON: this device stays in Chess for Kids, even after closing the app.' : ''}
        </p>
        {!grownUp ? (
          <button type="button" onClick={() => setGate('corner')} className="rounded-xl px-3 py-2 bg-white font-bold" style={{ boxShadow: '0 3px 0 rgba(47,34,87,0.15)' }}>
            Grown-up settings
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {kidMode ? (
              <button type="button" onClick={() => { setKidMode(false); navigate('/'); }}
                className="rounded-xl px-3 py-2 font-bold text-white" style={{ background: '#6C51C2', boxShadow: '0 3px 0 #4A3591' }}>
                Exit Kid Mode
              </button>
            ) : (
              <button type="button" onClick={() => { setKidMode(true); setGrownUp(false); }}
                className="rounded-xl px-3 py-2 font-bold text-white" style={{ background: '#2FBF71', boxShadow: '0 3px 0 #1E8E50' }}>
                Turn on Kid Mode
              </button>
            )}
            <button type="button" onClick={() => update({ unlockAll: !state.unlockAll })}
              className="rounded-xl px-3 py-2 bg-white font-bold" style={{ boxShadow: '0 3px 0 rgba(47,34,87,0.15)' }}>
              {state.unlockAll ? 'Lock levels in order' : 'Unlock all levels'}
            </button>
            <button type="button" onClick={() => { if (window.confirm('Start the adventure over? Stars will be cleared.')) reset(); }}
              className="rounded-xl px-3 py-2 bg-white font-bold" style={{ boxShadow: '0 3px 0 rgba(47,34,87,0.15)' }}>
              Start over
            </button>
            <button type="button" onClick={() => setGrownUp(false)} className="rounded-xl px-3 py-2 font-bold opacity-70">Done</button>
          </div>
        )}
      </div>

      <ParentGate open={gate === 'corner'} onClose={() => setGate(null)} onPass={() => { setGate(null); setGrownUp(true); }}
        note={kidMode ? 'Answer to change settings or leave Kid Mode.' : 'Answer to open the grown-up settings.'} />
      <BuddyPicker open={picker} onClose={() => setPicker(false)} />
    </KidsShell>
  );
}
