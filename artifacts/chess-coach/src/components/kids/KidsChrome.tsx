// Chess for Kids -- the shared frame: sky background, top bar, speech
// bubble, chunky buttons and the buddy picker.

import { useEffect, type ReactNode, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowLeft, Volume2, VolumeX, Mic, MicOff } from 'lucide-react';
import { KidAvatar, AVATARS, Cloud } from './KidsArt';
import { useKids, totalStars, speak, playSfx } from '@/lib/kids/progress';

export const KID_FONT = "'Baloo 2', 'Nunito', ui-rounded, system-ui, sans-serif";
export const INK = '#2F2257';

function useKidFont() {
  useEffect(() => {
    const id = 'kids-font-baloo';
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id;
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&display=swap';
    document.head.appendChild(l);
  }, []);
}

export function KidsShell({ children, tint = '#C9B6FF' }: { children: ReactNode; tint?: string }) {
  useKidFont();
  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        fontFamily: KID_FONT,
        color: INK,
        background: `linear-gradient(180deg, #8FD0FF 0%, #B9DDFF 28%, ${tint} 72%, #FFE1EF 100%)`,
      }}
    >
      {/* drifting clouds */}
      <motion.div className="absolute pointer-events-none" style={{ top: 70, left: -40 }}
        animate={{ x: [0, 40, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}>
        <Cloud width={150} />
      </motion.div>
      <motion.div className="absolute pointer-events-none" style={{ top: 160, right: -30 }}
        animate={{ x: [0, -30, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}>
        <Cloud width={110} opacity={0.75} />
      </motion.div>
      <motion.div className="absolute pointer-events-none" style={{ top: 420, left: '55%' }}
        animate={{ x: [0, 24, 0] }} transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}>
        <Cloud width={90} opacity={0.6} />
      </motion.div>
      <div className="relative mx-auto w-full max-w-[560px] px-4 pb-16" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        {children}
      </div>
    </div>
  );
}

export function TopBar({ back, onAvatar }: { back: string; onAvatar?: () => void }) {
  const { state, update } = useKids();
  const round: CSSProperties = { boxShadow: '0 4px 0 rgba(47,34,87,0.18)' };
  return (
    <div className="flex items-center gap-2 py-2">
      <Link href={back} aria-label="Back"
        className="w-11 h-11 rounded-2xl bg-white flex items-center justify-center active:translate-y-0.5" style={round}>
        <ArrowLeft className="w-6 h-6" style={{ color: INK }} />
      </Link>
      <div className="flex-1" />
      <div className="h-11 px-3 rounded-2xl bg-white flex items-center gap-1.5 font-extrabold text-lg" style={round} aria-label={`${totalStars(state)} stars`}>
        <svg viewBox="0 0 100 100" width="24" height="24" aria-hidden="true">
          <path d="M50 8 L61 35 L90 37 L67 56 L75 85 L50 69 L25 85 L33 56 L10 37 L39 35 Z" fill="#FFC93C" stroke="#E08A00" strokeWidth="7" strokeLinejoin="round" />
        </svg>
        {totalStars(state)}
      </div>
      <button type="button" onClick={() => { update({ sound: !state.sound }); }}
        aria-label={state.sound ? 'Turn sounds off' : 'Turn sounds on'}
        className="w-11 h-11 rounded-2xl bg-white flex items-center justify-center active:translate-y-0.5" style={round}>
        {state.sound ? <Volume2 className="w-5 h-5" style={{ color: INK }} /> : <VolumeX className="w-5 h-5 opacity-50" style={{ color: INK }} />}
      </button>
      <button type="button" onClick={() => { update({ voice: !state.voice }); }}
        aria-label={state.voice ? 'Stop reading out loud' : 'Read out loud'}
        className="w-11 h-11 rounded-2xl bg-white flex items-center justify-center active:translate-y-0.5" style={round}>
        {state.voice ? <Mic className="w-5 h-5" style={{ color: INK }} /> : <MicOff className="w-5 h-5 opacity-50" style={{ color: INK }} />}
      </button>
      {onAvatar && (
        <button type="button" onClick={onAvatar} aria-label="Change your buddy" className="rounded-full active:translate-y-0.5" style={{ filter: 'drop-shadow(0 4px 0 rgba(47,34,87,0.18))' }}>
          <KidAvatar id={state.avatar ?? 'fox'} size={46} />
        </button>
      )}
    </div>
  );
}

/** A speech bubble next to a character, with a "read it to me" button. */
export function Bubble({ who, text, tone = 'normal' }: { who: ReactNode; text: string; tone?: 'normal' | 'good' | 'oops' }) {
  const bg = tone === 'good' ? '#E3FBE9' : tone === 'oops' ? '#FFF0E0' : '#FFFFFF';
  const border = tone === 'good' ? '#5CCB86' : tone === 'oops' ? '#FFB561' : '#FFFFFF';
  return (
    <div className="flex items-end gap-2">
      <div className="shrink-0">{who}</div>
      <AnimatePresence mode="wait">
        <motion.div key={text}
          initial={{ opacity: 0, scale: 0.9, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 380, damping: 24 }}
          className="relative flex-1 rounded-3xl px-4 py-3 text-[17px] leading-snug font-semibold"
          style={{ background: bg, border: `3px solid ${border}`, boxShadow: '0 5px 0 rgba(47,34,87,0.12)' }}>
          <span className="absolute -left-2 bottom-4 w-4 h-4 rotate-45" style={{ background: bg, borderLeft: `3px solid ${border}`, borderBottom: `3px solid ${border}` }} />
          <div className="flex items-start gap-2">
            <p className="flex-1">{text}</p>
            <button type="button" onClick={() => speak(text, true)} aria-label="Read it to me"
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#EEE8FF' }}>
              <Volume2 className="w-5 h-5" style={{ color: '#6C51C2' }} />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** A big, squishy 3D button. */
export function ChunkyButton({ children, onClick, color = '#FF9F1C', shade = '#D97C00', disabled, className = '', ariaLabel }:
  { children: ReactNode; onClick?: () => void; color?: string; shade?: string; disabled?: boolean; className?: string; ariaLabel?: string }) {
  return (
    <motion.button type="button" whileTap={disabled ? undefined : { y: 4, boxShadow: `0 1px 0 ${shade}` }}
      onClick={() => { if (!disabled) { playSfx('tap'); onClick?.(); } }} disabled={disabled} aria-label={ariaLabel}
      className={`rounded-2xl px-5 py-3 text-white font-extrabold text-xl tracking-wide disabled:opacity-50 ${className}`}
      style={{ background: color, boxShadow: `0 5px 0 ${shade}`, textShadow: '0 2px 0 rgba(0,0,0,0.15)', fontFamily: KID_FONT }}>
      {children}
    </motion.button>
  );
}

export function BuddyPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, update } = useKids();
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
          style={{ background: 'rgba(47,34,87,0.45)', fontFamily: KID_FONT, color: INK }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="w-full max-w-[480px] rounded-[28px] bg-white p-5"
            initial={{ y: 60, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 60 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
            <h2 className="text-3xl font-extrabold text-center">Pick your buddy!</h2>
            <p className="text-center text-base font-semibold opacity-70 mb-4">Your buddy cheers you on while you learn.</p>
            <div className="grid grid-cols-3 gap-3">
              {AVATARS.map((a) => {
                const on = (state.avatar ?? '') === a.id;
                return (
                  <motion.button key={a.id} type="button" whileTap={{ scale: 0.92 }}
                    onClick={() => { playSfx('pop'); update({ avatar: a.id }); speak(`Hi! I'm ${a.name}!`); }}
                    className="flex flex-col items-center gap-1 rounded-3xl p-2"
                    style={{ background: on ? '#F1EBFF' : 'transparent', border: `3px solid ${on ? '#9479E0' : 'transparent'}` }}
                    aria-pressed={on} aria-label={a.name}>
                    <motion.div animate={on ? { rotate: [0, -6, 6, 0] } : {}} transition={{ duration: 0.5 }}>
                      <KidAvatar id={a.id} size={76} />
                    </motion.div>
                    <span className="text-sm font-bold leading-tight text-center">{a.name}</span>
                  </motion.button>
                );
              })}
            </div>
            <div className="mt-5 flex justify-center">
              <ChunkyButton onClick={onClose} disabled={!state.avatar} color="#5CCB86" shade="#35A060" className="min-w-[200px]">
                {state.avatar ? "Let's go!" : 'Tap a buddy'}
              </ChunkyButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Party time: little shapes bursting out from the middle. */
export function Confetti({ run }: { run: number }) {
  if (!run) return null;
  const colors = ['#FFC93C', '#FF6B9E', '#45D9F7', '#7BE07B', '#9479E0', '#FF9F1C'];
  const bits = Array.from({ length: 36 }, (_, i) => {
    const angle = (i / 36) * Math.PI * 2 + (i % 3) * 0.2;
    const dist = 140 + ((i * 53) % 120);
    return { i, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist - 60, c: colors[i % colors.length], r: (i * 47) % 360, round: i % 3 === 0 };
  });
  return (
    <div key={run} className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center" aria-hidden="true">
      {bits.map((b) => (
        <motion.span key={b.i} className="absolute block"
          style={{ width: b.round ? 12 : 10, height: b.round ? 12 : 18, background: b.c, borderRadius: b.round ? 999 : 3 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
          animate={{ x: b.x, y: [0, b.y, b.y + 260], opacity: [1, 1, 0], rotate: b.r + 360, scale: 1 }}
          transition={{ duration: 1.6, ease: 'easeOut' }} />
      ))}
    </div>
  );
}
