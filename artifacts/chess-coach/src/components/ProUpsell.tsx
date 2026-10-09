import React from 'react';
import { Link } from 'wouter';
import { Crown, ArrowRight, Check, Sparkles } from 'lucide-react';
import { useDashboardRedesignFlag } from '@/hooks/use-app-config';
import { RD } from '@/lib/redesignTheme';

// The single inline "go Pro" card used wherever a free user meets an AI
// feature. Never a popup or a blocking overlay: it sits in the page where the
// AI result would have been, next to the free (Stockfish) version they already
// have. Matches whichever UI is active.
//
// Pricing comes from the real plans ($5/month, $55/year) -- keep in sync with
// the Subscription page if those change.
export const PRO_PRICE_LINE = 'From $5/month · cancel anytime';

export function ProUpsell({
  title,
  text,
  perks,
  compact = false,
  cta = 'Upgrade to Pro',
  className = '',
}: {
  title: string;
  text?: string;
  perks?: string[];
  /** One-line strip instead of a card. */
  compact?: boolean;
  cta?: string;
  className?: string;
}) {
  const { enabled: redesign } = useDashboardRedesignFlag();
  const green = redesign ? RD.green : '#81b64c';
  const text1 = redesign ? RD.text : '#e8e6e3';
  const muted = redesign ? RD.muted : '#9e9b98';

  if (compact) {
    return (
      <Link
        href="/subscription"
        className={`flex items-center gap-3 rounded-[14px] px-3.5 py-3 transition-transform active:scale-[.99] ${className}`}
        style={{ background: 'linear-gradient(135deg, rgba(232,180,71,.12), rgba(129,182,76,.06))', border: '1px solid rgba(232,180,71,.35)' }}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px]" style={{ background: 'rgba(232,180,71,.16)', color: RD.gold }}>
          <Crown size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[13.5px] font-extrabold" style={{ color: text1 }}>{title}</b>
          {text && <span className="block text-[12px] leading-snug" style={{ color: muted }}>{text}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-[12.5px] font-extrabold" style={{ color: RD.gold }}>
          Pro <ArrowRight size={14} />
        </span>
      </Link>
    );
  }

  return (
    <section
      className={`relative overflow-hidden rounded-[20px] p-5 ${className}`}
      style={{
        background: redesign ? 'linear-gradient(160deg, #15160E 0%, #0B1213 100%)' : 'linear-gradient(180deg, #383532 0%, #2a2825 100%)',
        border: '1px solid rgba(232,180,71,.38)',
        boxShadow: '0 18px 50px -28px rgba(232,180,71,.45)',
      }}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full" style={{ background: 'radial-gradient(circle, rgba(232,180,71,.16) 0%, transparent 70%)' }} />
      <div className="relative">
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-extrabold" style={{ background: 'linear-gradient(180deg,#F2C560,#D99A24)', color: '#1A1205' }}>
          <Crown size={11} /> PRO
        </span>
        <h3 className="mt-2 text-[18px] font-extrabold leading-snug" style={{ color: text1 }}>{title}</h3>
        {text && <p className="mt-1 text-[13px] leading-snug" style={{ color: muted }}>{text}</p>}
        {perks && perks.length > 0 && (
          <ul className="mt-3 grid gap-1.5">
            {perks.map((p) => (
              <li key={p} className="flex items-start gap-2 text-[13px]" style={{ color: text1 }}>
                <Check size={15} className="mt-0.5 shrink-0" style={{ color: green }} />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/subscription"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[12px] py-3 text-[14px] font-extrabold transition-transform active:scale-[.98]"
          style={{ background: 'linear-gradient(180deg,#F2C560,#D99A24)', color: '#1A1205' }}
        >
          <Sparkles size={16} /> {cta}
        </Link>
        <p className="mt-2 text-center text-[11.5px]" style={{ color: muted }}>{PRO_PRICE_LINE}</p>
      </div>
    </section>
  );
}
