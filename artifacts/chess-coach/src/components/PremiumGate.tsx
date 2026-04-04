import { useUser } from '@/hooks/use-user';
import { Lock, CreditCard } from 'lucide-react';
import { Link } from 'wouter';

const CHESSCOM_GREEN = '#81b64c';
const BG_CARD = '#302e2b';
const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';

interface PremiumGateProps {
  children: React.ReactNode;
  feature: string;
}

export function PremiumGate({ children, feature }: PremiumGateProps) {
  const { isPremium, isAuthenticated, subscription } = useUser();

  if (!isAuthenticated || isPremium) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(129,182,76,0.12)' }}>
        <Lock className="w-7 h-7" style={{ color: CHESSCOM_GREEN }} />
      </div>
      <h2 className="text-xl font-bold mb-2" style={{ color: TEXT_LIGHT }}>Premium subscription required</h2>
      <p className="mb-2 max-w-sm text-sm" style={{ color: TEXT_MUTED }}>
        {feature} is a premium feature. Subscribe to ChessScout Pro to unlock it.
      </p>
      <p className="mb-6 max-w-sm text-xs" style={{ color: TEXT_MUTED }}>
        Includes a 3-day free trial — cancel anytime.
      </p>
      <Link href="/subscription" className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm text-white transition-opacity hover:opacity-90" style={{ background: CHESSCOM_GREEN }}>
        <CreditCard className="w-4 h-4" />
        Subscribe Now
      </Link>
    </div>
  );
}
