// Kids: chess tricks (forks, pins, back-row traps…) with friendly names, a little
// show-me animation, then easy puzzles. Stars are kept on this device.
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { KidsShell, TopBar, Bubble, KID_FONT } from '@/components/kids/KidsChrome';
import { KidBear } from '@/components/kids/KidsArt';
import { KIDS_MOTIFS, type Motif } from '@/lib/tactics';
import { MotifDemo } from '@/pages/Tactics';
import { TacticPuzzle, type TacticPuzzleData } from '@/components/tactics/TacticPuzzle';
import { apiFetch } from '@/lib/api';

const KEY = 'cs_kids_tactics';
const readStars = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const saveStars = (s: Record<string, number>) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };

const KID_SAY: Record<string, string> = {
  fork: 'One piece attacks TWO things at once. They can only save one!',
  pin: 'A piece is stuck: if it moves, something bigger behind it gets taken.',
  skewer: 'Attack the big piece. When it runs away, grab the one behind it!',
  hanging: 'Is anybody guarding that piece? No? Free snack!',
  trapped: 'A piece with nowhere safe to go. Catch it!',
  'mate-in-1': 'Find the one move that wins the whole game.',
  'back-rank': 'The king is stuck behind its own pawns on the back row.',
  promotion: 'Walk a pawn all the way to the end and it becomes a queen!',
};

export default function KidsTactics() {
  const [stars, setStars] = useState(readStars);
  const [open, setOpen] = useState<Motif | null>(null);
  const [step, setStep] = useState<'show' | 'play' | 'done'>('show');
  const [list, setList] = useState<TacticPuzzleData[] | null>(null);
  const [k, setK] = useState(0);
  const [got, setGot] = useState(0);

  useEffect(() => {
    if (!open || step !== 'play') return;
    setList(null); setK(0); setGot(0);
    void apiFetch(`/api/tactics/kids-batch?any=${open.any.join(',')}&n=5`).then((r) => (r.ok ? r.json() : null)).then((d) => setList(d?.puzzles ?? [])).catch(() => setList([]));
  }, [open?.id, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishSet = (n: number) => {
    if (!open) return;
    const s = { ...stars, [open.id]: Math.max(stars[open.id] ?? 0, n >= 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0) };
    setStars(s); saveStars(s); setStep('done');
  };

  if (open) return (
    <KidsShell>
      <TopBar />
      <button onClick={() => { setOpen(null); setStep('show'); }} className="mb-3 rounded-full bg-white px-4 py-2 text-lg font-extrabold" style={{ color: '#4A3A86', fontFamily: KID_FONT }}>← All tricks</button>
      <h1 className="mb-2 text-center text-[36px] font-extrabold text-white" style={{ fontFamily: KID_FONT, textShadow: '0 3px 0 #6C51C2' }}>{open.kid}</h1>
      <div className="mb-3"><Bubble who={<KidBear size={56} />} text={KID_SAY[open.id] ?? open.blurb} /></div>
      <div className="rounded-[24px] p-3" style={{ background: '#0F1819' }}>
        {step === 'show' && <MotifDemo m={open} onDone={() => setStep('play')} />}
        {step === 'play' && (!list ? <p className="p-6 text-center text-white">Getting puzzles…</p> : !list.length ? <p className="p-6 text-center text-white">No puzzles here yet. Try another trick!</p> : (
          <TacticPuzzle key={list[k].id} puzzle={list[k]} mode="kids"
            onDone={(ok) => { if (ok) setGot((g) => g + 1); }}
            nextLabel={k + 1 < list.length ? 'Next one' : 'Finish'}
            onNext={() => { if (k + 1 < list.length) setK(k + 1); else finishSet(got); }} />
        ))}
        {step === 'done' && (
          <div className="p-6 text-center">
            <p className="text-[40px]">{'⭐'.repeat(Math.max(1, stars[open.id] ?? 1))}</p>
            <p className="mt-2 text-2xl font-extrabold text-white" style={{ fontFamily: KID_FONT }}>You got {got} right!</p>
            <button onClick={() => setStep('play')} className="mt-4 rounded-full bg-[#81B64C] px-6 py-3 text-xl font-extrabold text-white" style={{ fontFamily: KID_FONT }}>Play again</button>
          </div>
        )}
      </div>
    </KidsShell>
  );

  return (
    <KidsShell>
      <TopBar back="/kids" />
      <h1 className="mt-2 text-center text-[40px] font-extrabold text-white" style={{ fontFamily: KID_FONT, textShadow: '0 4px 0 #6C51C2' }}>Chess Tricks</h1>
      <p className="mb-4 text-center text-lg font-bold" style={{ color: '#4A3A86' }}>Learn the sneaky moves that win games!</p>
      <div className="grid grid-cols-2 gap-3">
        {KIDS_MOTIFS.map((m, i) => (
          <motion.button key={m.id} onClick={() => setOpen(m)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            whileTap={{ scale: 0.96 }} className="rounded-[24px] bg-white p-4 text-left" style={{ boxShadow: '0 6px 0 #6C51C2' }}>
            <p className="text-[22px] font-extrabold leading-tight" style={{ color: '#2F2257', fontFamily: KID_FONT }}>{m.kid}</p>
            <p className="mt-1 text-sm font-bold" style={{ color: '#6C51C2' }}>{'⭐'.repeat(stars[m.id] ?? 0) || 'Not tried yet'}</p>
          </motion.button>
        ))}
      </div>
      <div className="mt-6 text-center"><Link href="/kids" className="font-bold underline" style={{ color: '#4A3A86' }}>Back to the adventure</Link></div>
    </KidsShell>
  );
}
