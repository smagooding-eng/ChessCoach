// Spot the square: a coordinate drill on your own board colours. 30 seconds, tap the named
// square; play as White or Black (the board turns). Best scores are kept on this device.
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { RedesignHeader } from '@/components/RedesignHeader';
import { AppIcon } from '@/components/AppIcon';
import { recordActivity } from '@/lib/activity';

const MUTED = '#8F9997', GREEN = '#81B64C', RED = '#E8524A';
const FILES = 'abcdefgh';
const rnd = () => FILES[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8));
const BEST = (side: string) => `cs_coords_best_${side}`;

export default function CoordinatesPage() {
  const { boardColors } = useSettings();
  const [side, setSide] = useState<'w' | 'b'>('w');
  const [run, setRun] = useState(false);
  const [left, setLeft] = useState(30);
  const [target, setTarget] = useState(rnd());
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState<{ sq: string; ok: boolean } | null>(null);
  const [best, setBest] = useState(0);
  const scoreRef = useRef(0); scoreRef.current = score;
  useEffect(() => { try { setBest(Number(localStorage.getItem(BEST(side))) || 0); } catch { /* */ } }, [side]);
  useEffect(() => {
    if (!run) return undefined;
    const t = setInterval(() => setLeft((l) => {
      if (l > 1) return l - 1;
      clearInterval(t); setRun(false); recordActivity('lesson');
      try { const b = Math.max(Number(localStorage.getItem(BEST(side))) || 0, scoreRef.current); localStorage.setItem(BEST(side), String(b)); setBest(b); } catch { /* */ }
      return 0;
    }), 1000);
    return () => clearInterval(t);
  }, [run, side]);
  const start = () => { setScore(0); setLeft(30); setTarget(rnd()); setRun(true); };
  const tap = (sq: string) => {
    if (!run) return;
    const ok = sq === target;
    setFlash({ sq, ok }); setTimeout(() => setFlash(null), 220);
    if (ok) { setScore((s) => s + 1); let n = rnd(); while (n === target) n = rnd(); setTarget(n); }
  };
  const ranks = side === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = side === 'w' ? FILES.split('') : FILES.split('').reverse();
  return (
    <div className="mx-auto w-full max-w-[560px] space-y-3 px-4 pb-28 pt-3" style={{ color: '#F5F7F6' }}>
      <RedesignHeader dense title="Spot the square" backHref="/progress" />
      <div className="flex items-center justify-between rounded-[12px] px-3.5 py-2.5" style={{ background: 'var(--rd-card-solid, #182123)' }}>
        <b className="w-12 text-[20px] tabular-nums" style={{ color: left <= 5 && run ? RED : undefined }}>0:{String(left).padStart(2, '0')}</b>
        <b className="text-[34px] font-black tracking-wide" style={{ color: run ? GREEN : MUTED }}>{run ? target : '—'}</b>
        <b className="w-12 text-right text-[20px] tabular-nums">{score}</b>
      </div>
      <div className="relative mx-auto grid aspect-square w-full max-w-[480px] grid-cols-8 overflow-hidden rounded-[8px] select-none">
        {ranks.flatMap((r) => files.map((f) => {
          const sq = `${f}${r}`; const light = (FILES.indexOf(f) + r) % 2 === 1;
          const fl = flash?.sq === sq ? (flash.ok ? 'rgba(129,182,76,.85)' : 'rgba(232,82,74,.85)') : undefined;
          return <button key={sq} onPointerDown={() => tap(sq)} aria-label={sq} className="aspect-square" style={{ background: fl ?? (light ? boardColors.light : boardColors.dark) }} />;
        }))}
      </div>
      {!run && (
        <div className="space-y-2 rounded-[14px] p-4 text-center" style={{ background: 'var(--rd-card-solid, #182123)' }}>
          <AppIcon name="coords" size={40} />
          <p className="text-[14px]">{left === 0 ? <><b className="text-[22px]">{score}</b> squares. Best as {side === 'w' ? 'White' : 'Black'}: {best}.</> : 'Tap the square that shows up top. As many as you can in 30 seconds.'}</p>
          <div className="mx-auto grid max-w-[260px] grid-cols-2 gap-1 rounded-[12px] p-1" style={{ background: 'var(--rd-card-light, #212B2D)' }}>
            {(['w', 'b'] as const).map((s) => <button key={s} onClick={() => setSide(s)} className="rounded-[9px] py-1.5 text-[13px] font-bold" style={side === s ? { background: GREEN, color: '#fff' } : { color: MUTED }}>{s === 'w' ? 'As White' : 'As Black'}</button>)}
          </div>
          <button onClick={start} className="cs-cta">{left === 0 ? 'Again' : 'Start'}</button>
        </div>
      )}
    </div>
  );
}
