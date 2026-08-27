import { Link } from 'wouter';
import { ArrowLeft, ArrowRight, Trophy, Sparkles, Gift, CheckCircle2 } from 'lucide-react';
import { useEffect } from 'react';
import { setPageMeta } from '@/lib/pageMeta';
import { useUser } from '@/hooks/use-user';

const G = '#81b64c';
const BG = '#141413';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const CARD = '#1c1b19';
const REFERRAL_CODE = 'ADCCB497';
const DRAWING_DATE = 'November 17, 2026';
const MIN_SUBS = 500;

export default function RafflePage() {
  const { isPremium } = useUser();

  useEffect(() => {
    setPageMeta(
      'Win a ChessNut Air — ChessScout.net Pro Raffle',
      `Subscribe to ChessScout.net Pro and get entered to win a ChessNut Air electronic chessboard. Use referral code ${REFERRAL_CODE} for 2 entries. Drawing on ${DRAWING_DATE}.`,
      '/raffle',
    );
  }, []);

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-12">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm mb-8" style={{ color: MUTED }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5" style={{ background: 'rgba(129,182,76,0.15)' }}>
            <Trophy className="w-8 h-8" style={{ color: G }} />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black mb-4"
            style={{ background: `${G}15`, color: G, border: `1px solid ${G}40` }}>
            <Sparkles className="w-3 h-3" /> LIMITED-TIME RAFFLE
          </div>
          <h1 className="text-3xl sm:text-4xl font-black mb-3" style={{ letterSpacing: '-0.02em' }}>
            Win a <span style={{ color: G }}>ChessNut Air</span>
          </h1>
          <p className="text-base" style={{ color: MUTED }}>
            Subscribe to ChessScout.net Pro and you're automatically entered to win a ChessNut Air electronic chessboard. Drawing on {DRAWING_DATE}.
          </p>
        </div>

        <div className="rounded-2xl p-6 mb-6" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Gift className="w-5 h-5" style={{ color: G }} /> How to enter
          </h2>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-sm" style={{ background: G, color: '#000' }}>1</div>
              <div>
                <p className="font-bold text-sm mb-0.5">Subscribe to Pro</p>
                <p className="text-sm" style={{ color: MUTED }}>Any active ChessScout.net Pro subscription during the entry period gets you 1 entry.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-sm" style={{ background: G, color: '#000' }}>2</div>
              <div>
                <p className="font-bold text-sm mb-0.5">Use referral code {REFERRAL_CODE} for a second entry</p>
                <p className="text-sm" style={{ color: MUTED }}>
                  Enter code <span className="font-mono font-bold" style={{ color: G }}>{REFERRAL_CODE}</span> at checkout and you'll get 2 entries instead of 1 — double your odds.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <Link href={isPremium ? '/profile' : '/subscription'}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-black text-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: `linear-gradient(180deg, #a8d876 0%, ${G} 55%, #5f8f36 100%)`, color: '#fff', boxShadow: '0 4px 0 #4a7028, 0 8px 16px rgba(0,0,0,0.3)' }}>
              {isPremium ? 'You\'re already entered — manage subscription' : 'Subscribe to Pro & Enter'} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="rounded-2xl p-6 mb-6 space-y-3" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: G }} />
            <p className="text-sm" style={{ color: MUTED }}>Drawing takes place on <strong style={{ color: TEXT }}>{DRAWING_DATE}</strong>.</p>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: G }} />
            <p className="text-sm" style={{ color: MUTED }}>The prize is only awarded if we reach <strong style={{ color: TEXT }}>{MIN_SUBS} qualifying subscriptions</strong> by the drawing date.</p>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: G }} />
            <p className="text-sm" style={{ color: MUTED }}>Your subscription needs to still be active at the time of the drawing to win.</p>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: G }} />
            <p className="text-sm" style={{ color: MUTED }}>No purchase necessary — there's a free way to enter too. See the official rules for details.</p>
          </div>
        </div>

        <p className="text-center text-xs" style={{ color: MUTED }}>
          <Link href="/raffle-rules" className="underline" style={{ color: G }}>Read the full official rules</Link> for eligibility, odds, the free entry method, and complete terms.
        </p>
      </div>
    </div>
  );
}
