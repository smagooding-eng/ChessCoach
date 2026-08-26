import { useUser } from '@/hooks/use-user';
import { UpgradeNudge } from '@/components/UpgradeNudge';

interface PremiumGateProps {
  children: React.ReactNode;
  feature: string;
}

export function PremiumGate({ children, feature }: PremiumGateProps) {
  const { isPremium, isAuthenticated, isAuthLoading, isSubscriptionLoaded } = useUser();

  if (!isAuthenticated && !isAuthLoading) {
    return <>{children}</>;
  }

  if (isPremium) {
    return <>{children}</>;
  }

  if (isAuthLoading || !isSubscriptionLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="py-4">
      <UpgradeNudge
        headline={`Upgrade to Pro to unlock ${feature}`}
        subtext="No trial period — just cancel anytime if it's not for you."
      />
    </div>
  );
}
