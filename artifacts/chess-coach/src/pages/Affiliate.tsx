import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, DollarSign, CheckCircle2, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';

const G = '#81b64c';
const BG = '#141413';
const CARD = '#1c1b19';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';

interface AffiliateStatus {
  isAffiliate: boolean;
  connected?: boolean;
  payoutsEnabled?: boolean;
  inviteCode?: string | null;
  affiliateProgramEndsAt?: string | null;
  owedUnpaidCents?: number;
  paidCents?: number;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AffiliatePage() {
  const { isAuthenticated, isAuthLoading } = useUser();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<AffiliateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const res = await apiFetch('/api/affiliate/status');
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch { /* leave status null, show the generic not-an-affiliate state */ }
    setLoading(false);
  };

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      navigate('/');
      return;
    }
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isAuthenticated]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/affiliate/connect/onboard', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start onboarding.');
        setConnecting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Something went wrong. Please try again.');
      setConnecting(false);
    }
  };

  if (isAuthLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: G }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="max-w-xl mx-auto px-4 sm:px-8 py-12">
        <Link href="/profile" className="inline-flex items-center gap-1.5 text-sm mb-8" style={{ color: MUTED }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5" style={{ background: 'rgba(129,182,76,0.15)' }}>
            <DollarSign className="w-8 h-8" style={{ color: G }} />
          </div>
          <h1 className="text-3xl font-black mb-2" style={{ letterSpacing: '-0.02em' }}>Affiliate Dashboard</h1>
          <p className="text-sm" style={{ color: MUTED }}>Track your referral commission and connect your payout account.</p>
        </div>

        {!status?.isAffiliate ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
            <AlertCircle className="w-6 h-6 mx-auto mb-3" style={{ color: MUTED }} />
            <p className="text-sm" style={{ color: MUTED }}>
              This account isn't part of the affiliate program. If you think that's wrong, reach out to us.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl p-5 text-center" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-2xl font-black mb-1" style={{ color: G }}>{formatUsd(status.owedUnpaidCents ?? 0)}</p>
                <p className="text-xs" style={{ color: MUTED }}>Owed, unpaid</p>
              </div>
              <div className="rounded-xl p-5 text-center" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-2xl font-black mb-1" style={{ color: TEXT }}>{formatUsd(status.paidCents ?? 0)}</p>
                <p className="text-xs" style={{ color: MUTED }}>Paid out lifetime</p>
              </div>
            </div>

            <div className="rounded-2xl p-6 mb-6" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
              {status.payoutsEnabled ? (
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: G }} />
                  <div>
                    <p className="font-bold text-sm">Payout account connected</p>
                    <p className="text-xs" style={{ color: MUTED }}>You're all set — payouts go to this account when we send them.</p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-bold text-sm mb-1">{status.connected ? 'Finish connecting your payout account' : 'Connect your payout account'}</p>
                  <p className="text-xs mb-4" style={{ color: MUTED }}>
                    We use Stripe to send payouts directly to your bank account. Takes a couple of minutes.
                  </p>
                  {error && <p className="text-xs mb-3" style={{ color: '#f87171' }}>{error}</p>}
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-black text-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                    style={{ background: `linear-gradient(180deg, #a8d876 0%, ${G} 55%, #5f8f36 100%)`, color: '#fff', boxShadow: '0 4px 0 #4a7028' }}
                  >
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                    {status.connected ? 'Finish with Stripe' : 'Connect with Stripe'}
                  </button>
                </>
              )}
            </div>

            {status.inviteCode && (
              <div className="rounded-xl p-4 text-center" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs mb-1" style={{ color: MUTED }}>Your referral code</p>
                <p className="font-mono font-black text-lg" style={{ color: G }}>{status.inviteCode}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
