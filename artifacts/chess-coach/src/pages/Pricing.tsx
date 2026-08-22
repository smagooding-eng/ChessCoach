import { Link } from 'wouter';
import { ArrowLeft, Check, Minus, Crown, ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { setPageMeta } from '@/lib/pageMeta';

const G = '#81b64c';
const BG = '#141413';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const CARD = '#1c1b19';

const ROWS: { feature: string; free: boolean; pro: boolean; chesscomFree: boolean }[] = [
  { feature: 'Cross-game pattern detection', free: false, pro: true, chesscomFree: false },
  { feature: 'Single-game review', free: true, pro: true, chesscomFree: true },
  { feature: 'Personalized courses', free: true, pro: true, chesscomFree: false },
  { feature: 'Opponent scouting', free: true, pro: true, chesscomFree: false },
  { feature: 'Practice bots', free: true, pro: true, chesscomFree: false },
  { feature: 'Scan Position (photo → board)', free: true, pro: true, chesscomFree: false },
  { feature: 'Daily puzzles', free: true, pro: true, chesscomFree: true },
  { feature: 'Games imported', free: '20 total', pro: 'Unlimited', chesscomFree: '—' } as any,
  { feature: 'Price', free: '$0', pro: '$5/mo or $55/yr', chesscomFree: '$0' } as any,
];

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === 'boolean') {
    return value
      ? <Check className="w-4 h-4 mx-auto" style={{ color: G }} />
      : <Minus className="w-4 h-4 mx-auto" style={{ color: MUTED }} />;
  }
  return <span className="text-xs font-bold" style={{ color: TEXT }}>{value}</span>;
}

export default function PricingPage() {
  useEffect(() => {
    setPageMeta(
      'Pricing — ChessScout.net',
      'ChessScout pricing: free tier and $5/month or $55/year Pro plan. See exactly what\'s included at each tier.',
      '/pricing',
    );
  }, []);

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm mb-8" style={{ color: MUTED }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <h1 className="text-3xl sm:text-4xl font-black mb-3 text-center" style={{ color: TEXT }}>Simple Pricing</h1>
        <p className="text-sm text-center mb-10" style={{ color: MUTED }}>
          Free forever, or $5/month for everything. No trial to track, no credits to count.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-12">
          <div className="rounded-xl p-6" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 className="text-lg font-black mb-1" style={{ color: TEXT }}>Free</h2>
            <p className="text-3xl font-black mb-4" style={{ color: TEXT }}>$0</p>
            <ul className="space-y-2 text-sm mb-6" style={{ color: MUTED }}>
              <li>Unlimited daily puzzles</li>
              <li>3 opponent scouts</li>
              <li>5 personalized courses</li>
              <li>Unlimited practice bots</li>
              <li>First 20 games imported</li>
            </ul>
            <Link href="/#pricing" className="block text-center py-2.5 rounded-xl text-sm font-bold"
              style={{ background: 'rgba(255,255,255,0.06)', color: TEXT }}>
              Start Free
            </Link>
          </div>

          <div className="rounded-xl p-6 relative" style={{ background: `${G}0a`, border: `1.5px solid ${G}50` }}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-black"
              style={{ background: G, color: '#000' }}>
              MOST POPULAR
            </div>
            <h2 className="text-lg font-black mb-1 flex items-center gap-1.5" style={{ color: TEXT }}>
              <Crown className="w-4 h-4" style={{ color: G }} /> Pro
            </h2>
            <p className="text-3xl font-black mb-1" style={{ color: TEXT }}>$5<span className="text-sm font-normal" style={{ color: MUTED }}>/mo</span></p>
            <p className="text-xs mb-4" style={{ color: MUTED }}>or $55/year</p>
            <ul className="space-y-2 text-sm mb-6" style={{ color: TEXT }}>
              <li>Everything in Free, unlimited</li>
              <li>Full cross-game pattern analysis</li>
              <li>Unlimited scouts, courses, imports</li>
            </ul>
            <Link href="/#pricing" className="block text-center py-2.5 rounded-xl text-sm font-black"
              style={{ background: G, color: '#fff' }}>
              Upgrade to Pro
            </Link>
          </div>
        </div>

        <h2 className="text-xl font-black mb-4 text-center" style={{ color: TEXT }}>
          ChessScout vs Free Chess.com Review
        </h2>
        <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: CARD }}>
                <th className="text-left p-3 font-bold" style={{ color: TEXT }}>Feature</th>
                <th className="p-3 font-bold text-center" style={{ color: MUTED }}>Free Chess.com Review</th>
                <th className="p-3 font-bold text-center" style={{ color: TEXT }}>ChessScout Free</th>
                <th className="p-3 font-bold text-center" style={{ color: G }}>ChessScout Pro</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={row.feature} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td className="p-3" style={{ color: TEXT }}>{row.feature}</td>
                  <td className="p-3 text-center"><Cell value={row.chesscomFree} /></td>
                  <td className="p-3 text-center"><Cell value={row.free} /></td>
                  <td className="p-3 text-center"><Cell value={row.pro} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-center mb-10" style={{ color: MUTED }}>
          Chess.com's own game review is genuinely good for a single game. ChessScout is built for a different question: what mistake do you keep making across all your games.
        </p>

        <div className="text-center">
          <Link href="/#pricing" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black"
            style={{ background: G, color: '#fff' }}>
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
