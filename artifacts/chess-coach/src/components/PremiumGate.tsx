import { useUser } from '@/hooks/use-user';
import { Crown, Lock, Clock, CreditCard } from 'lucide-react';
import { Link } from 'wouter';

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
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Lock className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-xl font-bold mb-2">Your Free Trial Has Ended</h2>
      <p className="text-muted-foreground mb-2 max-w-sm">
        {feature} is a premium feature. Your 3-day free trial is over.
      </p>
      <p className="text-muted-foreground mb-6 max-w-sm text-sm">
        Subscribe to ChessScout Pro to continue using all premium features.
      </p>
      <Link href="/subscription" className="flex items-center gap-2 btn-primary px-6 py-3">
        <CreditCard className="w-4 h-4" />
        Subscribe Now
      </Link>
    </div>
  );
}
