// "Grown-ups only": a times-table question a young child can't answer, shown
// before anything that leaves Kid Mode or changes the child's settings.

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KID_FONT, INK } from './KidsChrome';

function question() {
  const a = 6 + Math.floor(Math.random() * 8);   // 6..13
  const b = 3 + Math.floor(Math.random() * 7);   // 3..9
  return { a, b, answer: a * b };
}

export function ParentGate({ open, title = 'Grown-ups only', note, onPass, onClose }:
  { open: boolean; title?: string; note?: string; onPass: () => void; onClose: () => void }) {
  const [q, setQ] = useState(question);
  const [value, setValue] = useState('');
  const [tries, setTries] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => { if (open) { setQ(question()); setValue(''); setTries(0); setTimeout(() => input.current?.focus(), 50); } }, [open]);
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [waitUntil]);
  const waiting = waitUntil > now;
  const secs = Math.ceil((waitUntil - now) / 1000);
  const words = useMemo(() => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen'], []);

  const check = () => {
    if (waiting) return;
    if (Number(value) === q.answer) { onPass(); return; }
    const n = tries + 1;
    setTries(n); setValue(''); setQ(question());
    if (n >= 3) { setWaitUntil(Date.now() + 30_000); setNow(Date.now()); setTries(0); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(30,20,60,0.55)', fontFamily: KID_FONT, color: INK }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="w-full max-w-[380px] rounded-[28px] bg-white p-5" style={{ boxShadow: '0 8px 0 rgba(47,34,87,0.2)' }}
            initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
            <p className="text-2xl font-extrabold">{title}</p>
            {note && <p className="text-base font-semibold opacity-75 mt-1">{note}</p>}
            {waiting ? (
              <p className="mt-4 text-lg font-bold">Too many tries. Please wait {secs} seconds.</p>
            ) : (
              <>
                <p className="mt-4 text-lg font-bold">What is {words[q.a]} times {words[q.b]}?</p>
                <form onSubmit={(e) => { e.preventDefault(); check(); }} className="mt-2 flex gap-2">
                  <input ref={input} value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    inputMode="numeric" autoComplete="off" aria-label="Answer"
                    className="flex-1 min-w-0 rounded-2xl px-4 py-3 text-2xl font-extrabold outline-none" style={{ background: '#F2EEFC', color: INK }} />
                  <button type="submit" className="rounded-2xl px-5 text-xl font-extrabold text-white" style={{ background: '#6C51C2', boxShadow: '0 4px 0 #4A3591' }}>OK</button>
                </form>
                {tries > 0 && <p className="mt-2 font-bold" style={{ color: '#D9534F' }}>Not quite. Here's a new one.</p>}
              </>
            )}
            <button type="button" onClick={onClose} className="mt-4 w-full rounded-2xl py-2.5 font-extrabold" style={{ background: '#EEE9F8' }}>Cancel</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
