// Home page: the two ways in for brand-new players -- the Beginner Path and
// Chess for Kids -- featured near the top so a beginner (or a parent) finds
// them straight away. Used by both the classic and the redesigned home.

import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, ChevronRight, ShieldCheck, X } from 'lucide-react';
import { KidBear, KidPiece } from '@/components/kids/KidsArt';
import { useLearn, nextLesson, totalLessons } from '@/lib/learn/progress';
import { setKidMode } from '@/lib/kids/kidMode';

export function StartHereCards({ variant = 'classic' }: { variant?: 'classic' | 'redesign' }) {
  const { state } = useLearn();
  const [, navigate] = useLocation();
  const [setup, setSetup] = useState(false);
  const done = Object.values(state.lessons).filter((n) => n > 0).length;
  const total = totalLessons();
  const next = nextLesson(state);

  const card = variant === 'redesign'
    ? { background: 'var(--rd-card, linear-gradient(160deg, #0F1819 0%, #0B1213 100%))', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20 }
    : { background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, boxShadow: '0 18px 50px -16px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3)' };
  const text = '#F5F7F6';
  const muted = '#9e9b98';
  const green = '#81B64C';

  return (
    <div className={variant === 'redesign' ? 'lg:col-span-2' : ''}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-2 px-1" style={{ color: muted }}>New to chess? Start here</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Beginner Path */}
        <Link href={next ? `/beginner/${next.unit.id}/${next.lesson.id}` : '/beginner'} className="block group">
          <div className="relative overflow-hidden p-4 h-full flex items-center gap-3 transition-transform group-hover:scale-[1.01] group-active:scale-[0.99]" style={card}>
            <div className="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,158,218,0.16)', color: '#4a9eda' }}>
              <GraduationCap className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base leading-tight" style={{ color: text }}>Beginner Path</p>
              <p className="text-xs mt-0.5 leading-snug" style={{ color: muted }}>
                {done === 0 ? 'Learn how every piece moves, check and checkmate, then play your first game with a coach.'
                  : next ? `Continue: ${next.lesson.title} · ${done} of ${total} lessons done` : 'Path complete! Replay any lesson.'}
              </p>
              {done > 0 && (
                <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full" style={{ width: `${(done / total) * 100}%`, background: '#4a9eda' }} />
                </div>
              )}
            </div>
            <ChevronRight className="w-5 h-5 shrink-0 opacity-50" style={{ color: text }} />
          </div>
        </Link>

        {/* Chess for Kids */}
        <div className="relative overflow-hidden p-4 h-full flex items-center gap-3" style={{ ...card, background: 'linear-gradient(135deg, #8FD0FF 0%, #C9B6FF 60%, #FFE1EF 100%)', border: 'none' }}>
          <div className="shrink-0 relative" style={{ width: 66, height: 58 }}>
            <div className="absolute" style={{ left: 0, top: 0 }}><KidBear size={52} /></div>
            <div className="absolute" style={{ right: 0, bottom: 0 }}><KidPiece type="n" side="w" size={30} /></div>
          </div>
          <div className="flex-1 min-w-0" style={{ color: '#2F2257' }}>
            <p className="font-extrabold text-base leading-tight">Chess for Kids</p>
            <p className="text-xs mt-0.5 leading-snug font-semibold opacity-80">Playful lessons for ages 5–8, then a real game with Benny the Bear.</p>
            <div className="flex gap-2 mt-2">
              <Link href="/kids" className="rounded-lg px-3 py-1.5 text-xs font-extrabold text-white" style={{ background: '#6C51C2', boxShadow: '0 3px 0 #4A3591' }}>Play</Link>
              <button type="button" onClick={() => setSetup(true)} className="rounded-lg px-3 py-1.5 text-xs font-extrabold bg-white" style={{ color: '#2F2257', boxShadow: '0 3px 0 rgba(47,34,87,0.2)' }}>
                Set up for my child
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {setup && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSetup(false)}>
            <motion.div className="w-full max-w-[420px] rounded-2xl p-5" style={{ background: '#1c1b19', border: '1px solid rgba(255,255,255,0.08)', color: text }}
              initial={{ scale: 0.95, y: 8 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Set up Kid Mode">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(129,182,76,0.16)', color: green }}><ShieldCheck className="w-5 h-5" /></div>
                <div className="flex-1">
                  <p className="font-bold text-lg leading-tight">Turn on Kid Mode?</p>
                  <p className="text-sm mt-1" style={{ color: muted }}>Hand this device to your child with peace of mind.</p>
                </div>
                <button type="button" onClick={() => setSetup(false)} aria-label="Close" className="opacity-60"><X className="w-5 h-5" /></button>
              </div>
              <ul className="mt-4 space-y-2 text-sm" style={{ color: '#cfccc8' }}>
                <li>• This device opens straight into Chess for Kids, even after the app is closed or someone signs out and back in.</li>
                <li>• The rest of ChessScout is hidden: no chat, no notifications, no ads.</li>
                <li>• To leave Kid Mode, open <b>For grown-ups</b> at the bottom of the kids map and answer a times-table question.</li>
              </ul>
              <button type="button" onClick={() => { setKidMode(true); setSetup(false); navigate('/kids'); }}
                className="mt-5 w-full rounded-xl py-3 font-bold text-white" style={{ background: green }}>
                Turn on Kid Mode
              </button>
              <button type="button" onClick={() => setSetup(false)} className="mt-2 w-full rounded-xl py-2.5 font-semibold" style={{ color: muted }}>Not now</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
