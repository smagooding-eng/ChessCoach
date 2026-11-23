// The Daily Scout result: saved once (the first try of the day counts) and shared as a
// spoiler-free line of squares, e.g. "ChessScout Daily Scout #12 🟩🟩🟩 0:41".
import { useEffect, useRef, useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { AppIcon } from '@/components/AppIcon';

const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const clock = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function DailyScoutShare({ number, solved, ms, goodMoves }: { number: number; solved: boolean; ms: number; goodMoves: number }) {
  const sent = useRef(false);
  const [stats, setStats] = useState<{ played: number; solvedPct: number | null } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    apiFetch('/api/daily-scout/result', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: localDay(), solved, ms, tries: goodMoves + (solved ? 0 : 1) }) })
      .catch(() => {})
      .finally(() => { apiFetch(`/api/daily-scout?day=${localDay()}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setStats(d.stats)).catch(() => {}); });
  }, [solved, ms, goodMoves]);
  const squares = '🟩'.repeat(Math.max(0, goodMoves)) + (solved ? '' : '🟥');
  const text = `ChessScout Daily Scout #${number} ${squares} ${solved ? clock(ms) : 'missed it'}\nhttps://chessscout.net/daily`;
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { /* cancelled */ }
  };
  return (
    <div className="w-full rounded-[14px] p-4 text-center" style={{ background: 'var(--rd-card-solid, #182123)', border: '1px solid rgba(255,255,255,.08)' }}>
      <div className="flex items-center justify-center gap-2"><AppIcon name="daily-scout" size={22} /><b className="text-[15px]">Daily Scout #{number}</b></div>
      <p className="mt-2 text-[26px] leading-none tracking-[2px]">{squares || '·'}</p>
      <p className="mt-2 text-[13px]" style={{ color: '#8F9997' }}>
        {solved ? `Found in ${clock(ms)}.` : 'Not this time. Tomorrow is a new one.'}
        {stats?.played ? ` ${stats.solvedPct ?? 0}% of ${stats.played} scouts solved it today.` : ''}
      </p>
      <button onClick={share} className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-[12px] px-5 py-2.5 text-[14px] font-extrabold text-white" style={{ background: '#81B64C' }}>
        {copied ? <Check size={16} /> : <Share2 size={16} />}{copied ? 'Copied' : 'Share'}
      </button>
    </div>
  );
}
