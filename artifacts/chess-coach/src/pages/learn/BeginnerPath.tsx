// Beginner path -- the course map (/beginner).

import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { GraduationCap, Lock, Check, ChevronRight, Volume2, VolumeX, Play } from 'lucide-react';
import { L, usePieceIcon } from '@/components/learn/theme';
import { PieceGradientDefs } from '@/components/PieceGradientDefs';
import { StarRow } from '@/components/kids/KidsArt';
import { UNITS } from '@/lib/learn/beginner';
import { useUser } from '@/hooks/use-user';
import { useLearn, lessonUnlocked, nextLesson, unitProgress, totalLessons } from '@/lib/learn/progress';

export default function BeginnerPath() {
  const { state, update, reset } = useLearn();
  const icon = usePieceIcon();
  const { authUser } = useUser();
  const admin = !!authUser?.isAdmin;
  const next = nextLesson(state);
  const doneCount = Object.values(state.lessons).filter((n) => n > 0).length;
  const total = totalLessons();

  return (
    <div className="min-h-screen" style={{ background: L.bg, color: L.text }}>
      <PieceGradientDefs />
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="rounded-xl p-2.5" style={{ background: `${L.accent}18`, color: L.accent }}><GraduationCap className="w-6 h-6" /></div>
          <h1 className="text-3xl font-black" style={{ letterSpacing: '-0.02em' }}>Beginner Path</h1>
        </div>
        <p className="text-sm mb-5" style={{ color: L.muted }}>
          Learn chess from zero: how every piece moves, check and checkmate, castling, and your first tactics. Short explanations, then hands-on practice.
        </p>

        {/* progress + continue */}
        <div className="rounded-2xl p-4 mb-6" style={{ background: L.card, border: `1px solid ${L.line}` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold">{doneCount} of {total} lessons complete</span>
            <span className="text-xs font-bold" style={{ color: L.muted }}>{Math.round((doneCount / total) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <motion.div className="h-full rounded-full" style={{ background: L.accent }} initial={{ width: 0 }} animate={{ width: `${(doneCount / total) * 100}%` }} />
          </div>
          {next ? (
            <Link href={`/beginner/${next.unit.id}/${next.lesson.id}`}
              className="flex items-center gap-3 rounded-xl px-4 py-3 font-bold text-white" style={{ background: L.accent }}>
              <Play className="w-5 h-5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold opacity-80">{doneCount ? 'Continue' : 'Start here'} · {next.unit.title}</p>
                <p className="truncate">{next.lesson.title}</p>
              </div>
              <ChevronRight className="w-5 h-5" />
            </Link>
          ) : (
            <p className="text-sm font-bold" style={{ color: L.good }}>Path complete. Nice work. Head to Puzzles and Practice Bots to keep sharpening.</p>
          )}
        </div>

        {/* units */}
        <div className="space-y-3">
          {UNITS.map((u, ui) => {
            const p = unitProgress(state, u);
            const unitOpen = lessonUnlocked(state, u.lessons[0].id);
            return (
              <motion.div key={u.id} className="rounded-2xl overflow-hidden" style={{ background: L.card, border: `1px solid ${L.line}`, opacity: unitOpen ? 1 : 0.55 }}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: unitOpen ? 1 : 0.55, y: 0 }} transition={{ delay: ui * 0.03 }}>
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${L.line}` }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: L.card2 }}>
                    {icon(`w${u.icon.toUpperCase()}`, 34)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: L.muted }}>Unit {ui + 1}</p>
                    <p className="font-black leading-tight">{u.title}</p>
                    <p className="text-xs" style={{ color: L.muted }}>{u.blurb}</p>
                  </div>
                  <span className="text-xs font-bold shrink-0" style={{ color: p.done === p.total ? L.good : L.muted }}>
                    {p.done === p.total ? <Check className="w-5 h-5" /> : `${p.done}/${p.total}`}
                  </span>
                </div>
                {u.lessons.map((l) => {
                  const open = lessonUnlocked(state, l.id);
                  const stars = state.lessons[l.id] ?? 0;
                  const isNext = next?.lesson.id === l.id;
                  const row = (
                    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]">
                      <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black"
                        style={{ background: stars ? `${L.good}25` : isNext ? `${L.accent}25` : 'rgba(255,255,255,0.05)', color: stars ? L.good : isNext ? L.accent : L.muted }}>
                        {!open ? <Lock className="w-3.5 h-3.5" /> : stars ? <Check className="w-4 h-4" /> : l.game ? '♟' : l.exercises.length}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{l.title}</p>
                        <p className="text-[11px]" style={{ color: L.muted }}>{l.game ? 'A full game with a coach' : `${l.exercises.length} exercises`}</p>
                      </div>
                      {stars > 0 && <StarRow n={stars} size={14} gap={1} />}
                      {open && <ChevronRight className="w-4 h-4 shrink-0" style={{ color: L.muted }} />}
                    </div>
                  );
                  return open
                    ? <Link key={l.id} href={`/beginner/${u.id}/${l.id}`} className="block">{row}</Link>
                    : <div key={l.id}>{row}</div>;
                })}
              </motion.div>
            );
          })}
        </div>

        {/* preview tools */}
        <div className="mt-8 rounded-2xl p-4 text-sm" style={{ background: L.card, border: `1px solid ${L.line}`, color: L.muted }}>
          <p className="font-bold mb-2" style={{ color: L.text }}>Settings</p>
          <p className="mb-3">Your progress is saved on this device.</p>
          <div className="flex flex-wrap gap-2">
            {admin && (
              <button type="button" onClick={() => update({ unlockAll: !state.unlockAll })} className="rounded-lg px-3 py-2 font-bold" style={{ background: L.card2, color: L.text }}>
                {state.unlockAll ? 'Lock lessons in order' : 'Unlock all lessons'}
              </button>
            )}
            <button type="button" onClick={() => update({ sound: !state.sound })} className="rounded-lg px-3 py-2 font-bold flex items-center gap-1.5" style={{ background: L.card2, color: L.text }}>
              {state.sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />} Sounds {state.sound ? 'on' : 'off'}
            </button>
            <button type="button" onClick={() => { if (window.confirm('Clear all Beginner Path progress?')) reset(); }} className="rounded-lg px-3 py-2 font-bold" style={{ background: L.card2, color: L.text }}>
              Reset progress
            </button>
            {admin && (
              <Link href="/admin/beginner-courses" className="rounded-lg px-3 py-2 font-bold" style={{ background: L.card2, color: L.text }}>
                Server-built courses (old, admin)
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
