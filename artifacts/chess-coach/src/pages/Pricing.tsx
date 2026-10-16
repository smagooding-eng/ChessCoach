import { Link } from 'wouter';
import { ArrowLeft, Check, Minus, Crown, ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { setPageMeta } from '@/lib/pageMeta';
import { t, noGT } from '@/lib/i18n';
import { LanguageSelect } from '@/components/LanguagePicker';

const G = '#81b64c';
const BG = '#141413';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const CARD = '#1c1b19';

const ROWS: { feature: string; free: boolean | string; pro: boolean | string; chesscomFree: boolean | string }[] = [
  { feature: 'Cross-game pattern detection', free: false, pro: true, chesscomFree: false },
  { feature: 'Single-game review (Stockfish)', free: true, pro: true, chesscomFree: true },
  { feature: 'AI coach explanations & game summary', free: false, pro: true, chesscomFree: false },
  { feature: 'Basic analysis (from reviewed games)', free: true, pro: true, chesscomFree: false },
  { feature: 'Deep weakness analysis', free: false, pro: true, chesscomFree: false },
  { feature: 'Personalized courses', free: false, pro: true, chesscomFree: false },
  { feature: 'Opponent scouting', free: 'Unlimited stats', pro: '+ AI weaknesses & prep', chesscomFree: false } as any,
  { feature: 'Practice bots & Opening Trainer', free: true, pro: true, chesscomFree: false },
  { feature: 'Local Play', free: true, pro: true, chesscomFree: false },
  { feature: 'Scan Position (photo → board)', free: false, pro: true, chesscomFree: false },
  { feature: 'Puzzles', free: 'Unlimited', pro: '+ AI explanations', chesscomFree: true } as any,
  { feature: 'Lesson read-aloud', free: 'Device voice', pro: 'Natural coach voice', chesscomFree: false } as any,
  { feature: 'Games viewable', free: 'Unlimited', pro: 'Unlimited', chesscomFree: '—' } as any,
  { feature: 'Create tournaments', free: true, pro: true, chesscomFree: false },
  { feature: 'Pro tournaments', free: false, pro: 'Join + host & earn $1 per new Pro', chesscomFree: false } as any,
  { feature: 'Price', free: '$0', pro: '$5/mo', chesscomFree: '$0' } as any,
];

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === 'boolean') {
    return value
      ? <Check className="w-4 h-4 mx-auto" style={{ color: G }} />
      : <Minus className="w-4 h-4 mx-auto" style={{ color: MUTED }} />;
  }
  return <span className="text-xs font-bold" style={{ color: TEXT }}>{t(value)}</span>;
}

export default function PricingPage() {
  useEffect(() => {
    setPageMeta(
      'Pricing — ChessScout.net',
      'ChessScout.net pricing: free tier and a $5/month Pro plan. See exactly what\'s included at each tier.',
      '/pricing',
    );
  }, []);

  return (
    <div {...noGT()} className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm" style={{ color: MUTED }}>
            <ArrowLeft className="w-4 h-4" /> {t('Back')}
          </Link>
          <LanguageSelect compact className="text-sm" style={{ color: MUTED }} />
        </div>

        <h1 className="text-3xl sm:text-4xl font-black mb-3 text-center" style={{ color: TEXT }}>{t('Simple Pricing')}</h1>
        <p className="text-sm text-center mb-10" style={{ color: MUTED }}>
          {t('Free forever, or $5/month for everything. No trial to track, no credits to count.')}
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-12">
          <div className="rounded-xl p-6" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 className="text-lg font-black mb-1" style={{ color: TEXT }}>{t('Free')}</h2>
            <p className="text-3xl font-black mb-4" style={{ color: TEXT }}>$0</p>
            <ul className="space-y-2 text-sm mb-6" style={{ color: MUTED }}>
              <li>{t('Unlimited game import & Stockfish review')}</li>
              <li>{t('Unlimited opponent scouts (stats)')}</li>
              <li>{t('Unlimited puzzles')}</li>
              <li>{t('Weaknesses from your reviewed games')}</li>
              <li>{t('Unlimited practice bots & Opening Trainer')}</li>
              <li>{t('Unlimited Local Play')}</li>
            </ul>
            <Link href="/#pricing" className="block text-center py-2.5 rounded-xl text-sm font-bold"
              style={{ background: 'rgba(255,255,255,0.06)', color: TEXT }}>
              {t('Start Free')}
            </Link>
          </div>

          <div className="rounded-xl p-6 relative" style={{ background: `${G}0a`, border: `1.5px solid ${G}50` }}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-black"
              style={{ background: G, color: '#000' }}>
              {t('MOST POPULAR')}
            </div>
            <h2 className="text-lg font-black mb-1 flex items-center gap-1.5" style={{ color: TEXT }}>
              <Crown className="w-4 h-4" style={{ color: G }} /> Pro
            </h2>
            <p className="text-3xl font-black mb-1" style={{ color: TEXT }}>$5<span className="text-sm font-normal" style={{ color: MUTED }}>{t('/mo')}</span></p>
            <p className="text-xs mb-4" style={{ color: MUTED }}>{t('Cancel anytime')}</p>
            <ul className="space-y-2 text-sm mb-6" style={{ color: TEXT }}>
              <li>{t('AI coach on every game you review')}</li>
              <li>{t('Personalized courses from your mistakes')}</li>
              <li>{t('AI scouting reports: weaknesses & prep')}</li>
              <li>{t('Full AI weakness analysis')}</li>
              <li>{t('Scan a board from a photo')}</li>
              <li>{t('AI puzzle explanations & natural-voice lessons')}</li>
              <li>{t('Join every Pro tournament free')}</li>
              <li>{t('Host Pro tournaments and earn $1 per new Pro signup')}</li>
            </ul>
            <Link href="/#pricing" className="block text-center py-2.5 rounded-xl text-sm font-black"
              style={{ background: G, color: '#fff' }}>
              {t('Upgrade to Pro')}
            </Link>
          </div>
        </div>

        <h2 className="text-xl font-black mb-4 text-center" style={{ color: TEXT }}>
          {t('ChessScout.net vs Free Chess.com Review')}
        </h2>
        <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: CARD }}>
                <th className="text-left p-3 font-bold" style={{ color: TEXT }}>{t('Feature')}</th>
                <th className="p-3 font-bold text-center" style={{ color: MUTED }}>{t('Free Chess.com Review')}</th>
                <th className="p-3 font-bold text-center" style={{ color: TEXT }}>{t('ChessScout.net Free')}</th>
                <th className="p-3 font-bold text-center" style={{ color: G }}>{t('ChessScout.net Pro')}</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={row.feature} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td className="p-3" style={{ color: TEXT }}>{t(row.feature)}</td>
                  <td className="p-3 text-center"><Cell value={row.chesscomFree} /></td>
                  <td className="p-3 text-center"><Cell value={row.free} /></td>
                  <td className="p-3 text-center"><Cell value={row.pro} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-center mb-10" style={{ color: MUTED }}>
          {t("Chess.com's own game review is genuinely good for a single game. ChessScout.net is built for a different question: what mistake do you keep making across all your games.")}
        </p>

        <div className="text-center">
          <Link href="/#pricing" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black"
            style={{ background: G, color: '#fff' }}>
            {t('Get Started Free')} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
