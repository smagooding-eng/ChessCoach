// A small note when a Learn Path step moves on ("2 of 5 puzzles") or is done, with a way back.
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Check } from 'lucide-react';

export function PathStepToast() {
  const [msg, setMsg] = useState<{ text: string; done: boolean } | null>(null);
  useEffect(() => {
    let t: number | undefined;
    const show = (m: { text: string; done: boolean }) => { setMsg(m); window.clearTimeout(t); t = window.setTimeout(() => setMsg(null), m.done ? 7000 : 2500); };
    const onProg = (e: Event) => { const a = (e as CustomEvent<{ count: number; need: number; title: string }>).detail; show({ text: `Learn Path · ${a.title}: ${a.count} of ${a.need}`, done: false }); };
    const onDone = (e: Event) => show({ text: `${(e as CustomEvent<{ title: string }>).detail.title}: done`, done: true });
    window.addEventListener('cs:path-progress', onProg); window.addEventListener('cs:path-step-done', onDone);
    return () => { window.removeEventListener('cs:path-progress', onProg); window.removeEventListener('cs:path-step-done', onDone); window.clearTimeout(t); };
  }, []);
  if (!msg) return null;
  return (
    <div className="fixed inset-x-0 z-[95] flex justify-center px-4" style={{ bottom: 'calc(80px + env(safe-area-inset-bottom))' }} role="status">
      <div className="flex items-center gap-3 rounded-[14px] px-4 py-2.5 text-[13.5px] font-bold" style={{ background: '#212B2D', border: '1px solid rgba(255,255,255,.1)', color: '#F5F7F6', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
        {msg.done && <Check size={17} color="#81B64C" strokeWidth={3} />}
        <span>{msg.text}</span>
        {msg.done && <Link href="/path" onClick={() => setMsg(null)} className="rounded-[10px] px-3 py-1 text-[13px] font-extrabold text-white" style={{ background: '#81B64C' }}>Back to path</Link>}
      </div>
    </div>
  );
}
