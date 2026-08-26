import { Link } from 'wouter';
import { Sparkles, ArrowRight } from 'lucide-react';

const CHESSCOM_GREEN = '#81b64c';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';

interface UpgradeNudgeProps {
  headline: string;
  subtext?: string;
  compact?: boolean; // smaller, inline variant for tight spaces (e.g. a small banner near a button)
}

// The one, consistent, on-brand way to invite an upgrade anywhere in the
// app -- deliberately NOT styled like an error (no red border, no
// exclamation icon, no "Retry" button). This is an invitation, not a
// failure message. Used both for hard blocks (a Pro-only feature) and
// soft nudges (a persistent upsell near a feature that's still usable).
export function UpgradeNudge({ headline, subtext, compact = false }: UpgradeNudgeProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{ background: 'rgba(129,182,76,0.08)', border: '1px solid rgba(129,182,76,0.25)' }}>
        <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(129,182,76,0.15)' }}>
          <Sparkles className="w-4 h-4" style={{ color: CHESSCOM_GREEN }} />
        </div>
        <p className="flex-1 text-xs font-bold" style={{ color: TEXT_LIGHT }}>{headline}</p>
        <Link href="/subscription"
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-transform hover:scale-105"
          style={{ background: CHESSCOM_GREEN, color: '#000' }}>
          Upgrade <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center py-10 px-6 rounded-2xl"
      style={{ background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)', border: '1px solid rgba(129,182,76,0.3)' }}>
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(129,182,76,0.12)' }}>
        <Sparkles className="w-7 h-7" style={{ color: CHESSCOM_GREEN }} />
      </div>
      <h3 className="text-lg font-bold mb-1.5 max-w-sm" style={{ color: TEXT_LIGHT }}>{headline}</h3>
      {subtext && (
        <p className="text-sm mb-6 max-w-sm" style={{ color: TEXT_MUTED }}>{subtext}</p>
      )}
      <Link href="/subscription"
        className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm transition-transform hover:scale-[1.03] active:scale-[0.98]"
        style={{ background: `linear-gradient(180deg, #a8d876 0%, ${CHESSCOM_GREEN} 55%, #5f8f36 100%)`, color: '#fff', boxShadow: '0 4px 0 #4a7028, 0 8px 16px rgba(0,0,0,0.3)' }}>
        Upgrade to Pro <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
