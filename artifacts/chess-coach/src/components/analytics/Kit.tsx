// Building blocks for My Analytics: the coach's take that opens every tab (one finding in plain
// words, one button), progress rings, metal medallions and roomy cards. One idea per card.
import { Link } from 'wouter';
import { ChevronRight } from 'lucide-react';
import { ScoutIcon } from '@/components/ScoutIcons';

export const K = {
  bg: '#0E1415', card: '#151D1F', card2: '#1C2628', line: 'rgba(255,255,255,.07)',
  text: '#F5F7F6', muted: '#8F9997', green: '#81B64C', gold: '#E8B447', red: '#E8605A',
};

/** A round metal medallion around one of the ScoutIcons. */
export function Medal({ icon, size = 52, dim = false }: { icon: string; size?: number; dim?: boolean }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full p-[2.5px]" style={{ width: size, height: size, background: dim ? 'linear-gradient(160deg,#5B6567,#2E3638)' : 'linear-gradient(160deg,#FFF0B0,#F2C14E 45%,#9A6A18)', boxShadow: '0 4px 12px rgba(0,0,0,.45)' }}>
      <span className="grid h-full w-full place-items-center rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, #2A3436, #121819)' }}>
        <ScoutIcon name={icon} size={Math.round(size * 0.62)} />
      </span>
    </span>
  );
}

/** A progress ring with the number in the middle. */
export function Ring({ pct, size = 64, label, color = K.green, stroke = 6 }: { pct: number | null; size?: number; label?: string; color?: string; stroke?: number }) {
  const r = size / 2 - stroke, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, (pct ?? 0) / 100));
  return (
    <svg width={size} height={size} className="shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth={stroke} fill="none" />
      {pct != null && <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" fill={K.text} fontSize={size * 0.24} fontWeight="900">{label ?? (pct == null ? '—' : `${Math.round(pct)}%`)}</text>
    </svg>
  );
}

/** The opening of every tab: what the coach sees, in one sentence, and the one thing to do. */
export function CoachTake({ icon, eyebrow = "Coach's take", headline, detail, action, href, onAction, board }: {
  icon: string; eyebrow?: string; headline: string; detail?: string; action?: string; href?: string; onAction?: () => void; board?: React.ReactNode;
}) {
  const btn = action ? (href
    ? <Link href={href} className="cs-cta mt-4 inline-flex w-full items-center justify-center gap-1.5 sm:w-auto sm:px-6">{action} <ChevronRight size={17} /></Link>
    : <button onClick={onAction} className="cs-cta mt-4 inline-flex w-full items-center justify-center gap-1.5 sm:w-auto sm:px-6">{action} <ChevronRight size={17} /></button>) : null;
  return (
    <section className="rounded-[22px] p-5" style={{ background: `linear-gradient(180deg, ${K.card2}, ${K.card})`, border: `1px solid ${K.line}`, borderTop: `2px solid ${K.gold}` }}>
      <div className="flex items-start gap-4">
        <Medal icon={icon} size={56} />
        <div className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-black uppercase tracking-[.16em]" style={{ color: K.gold }}>{eyebrow}</span>
          <h2 className="mt-1 text-[20px] font-black leading-[1.2]" style={{ color: K.text }}>{headline}</h2>
          {detail && <p className="mt-1.5 text-[14px] leading-snug" style={{ color: 'rgba(245,247,246,.78)' }}>{detail}</p>}
        </div>
        {board && <div className="hidden shrink-0 sm:block">{board}</div>}
      </div>
      {board && <div className="mt-4 sm:hidden">{board}</div>}
      {btn}
    </section>
  );
}

/** A roomy card with an optional title and link. */
export function Panel({ title, more, href, onMore, children, className = '' }: { title?: string; more?: string; href?: string; onMore?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[20px] p-4 ${className}`} style={{ background: K.card, border: `1px solid ${K.line}` }}>
      {title && (
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-[17px] font-extrabold" style={{ color: K.text }}>{title}</h3>
          {more && (href ? <Link href={href} className="flex items-center gap-0.5 text-[13px] font-bold" style={{ color: K.green }}>{more} <ChevronRight size={14} /></Link>
            : <button onClick={onMore} className="flex items-center gap-0.5 text-[13px] font-bold" style={{ color: K.green }}>{more} <ChevronRight size={14} /></button>)}
        </div>
      )}
      {children}
    </section>
  );
}

/** One thing to do: medallion, what and why, and a button. */
export function ActionRow({ icon, title, sub, action, href }: { icon: string; title: string; sub?: string; action: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-[16px] p-3 transition-transform active:scale-[.99]" style={{ background: K.card2, border: `1px solid ${K.line}` }}>
      <Medal icon={icon} size={44} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px] font-extrabold" style={{ color: K.text }}>{title}</b>
        {sub && <span className="line-clamp-2 block text-[12.5px] leading-snug" style={{ color: K.muted }}>{sub}</span>}
      </span>
      <span className="shrink-0 rounded-[12px] px-3.5 py-2 text-[13px] font-extrabold text-white" style={{ background: K.green }}>{action}</span>
    </Link>
  );
}

/** A big number with a label (and an optional change). */
export function BigStat({ value, label, delta, suffix = '' }: { value: string; label: string; delta?: number | null; suffix?: string }) {
  return (
    <div className="min-w-0 text-center">
      <b className="block text-[26px] font-black leading-none" style={{ color: K.text }}>{value}</b>
      {delta ? <span className="mt-1 block text-[12px] font-extrabold" style={{ color: delta > 0 ? K.green : K.red }}>{delta > 0 ? '▲ +' : '▼ '}{delta}{suffix}</span> : <span className="mt-1 block text-[12px]">&nbsp;</span>}
      <span className="block text-[12px]" style={{ color: K.muted }}>{label}</span>
    </div>
  );
}

export const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();
