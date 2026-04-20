import { useEffect, useState } from 'react';
import { Mail, X, Check } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';

const TEXT_LIGHT = '#e8e6e3';
const TEXT_MUTED = '#9e9b98';
const WARN = '#eac133';

export function EmailVerifyBanner() {
  const { authUser } = useUser();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('verify');
    if (!v) return;
    if (v === 'ok') setVerifyMessage('Email verified — you\'re all set.');
    else if (v === 'expired') setVerifyMessage('That verification link expired. Send a new one below.');
    else if (v === 'invalid') setVerifyMessage('That verification link is invalid.');
    else if (v === 'missing') setVerifyMessage('No verification token found in the link.');
    params.delete('verify');
    const newSearch = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (newSearch ? '?' + newSearch : ''));
  }, []);

  if (!authUser) return null;
  if (authUser.emailVerified) {
    if (verifyMessage && verifyMessage.includes('verified')) {
      return (
        <div className="rounded-xl px-4 py-2.5 text-sm flex items-center gap-2"
          style={{ background: 'rgba(129,182,76,0.12)', color: '#81b64c', border: '1px solid rgba(129,182,76,0.3)' }}>
          <Check className="w-4 h-4" /> {verifyMessage}
        </div>
      );
    }
    return null;
  }
  if (dismissed) return null;

  const resend = async () => {
    setSending(true);
    try {
      const r = await apiFetch('/api/auth/resend-verification', { method: 'POST', credentials: 'include' });
      if (r.ok) setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl px-4 py-3 flex items-start gap-3"
      style={{ background: 'rgba(234,193,51,0.1)', border: '1px solid rgba(234,193,51,0.3)' }}>
      <div className="rounded-lg p-1.5" style={{ background: 'rgba(234,193,51,0.15)', color: WARN }}>
        <Mail className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>
          Verify your email{authUser.email ? ` (${authUser.email})` : ''}
        </p>
        <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
          {verifyMessage || 'Check your inbox for the confirmation link.'}
          {sent && ' New link sent — check your inbox.'}
        </p>
      </div>
      <button onClick={resend} disabled={sending || sent}
        className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-md disabled:opacity-50"
        style={{ background: 'rgba(234,193,51,0.2)', color: WARN }}>
        {sent ? 'Sent' : sending ? 'Sending…' : 'Resend'}
      </button>
      <button onClick={() => setDismissed(true)} style={{ color: TEXT_MUTED }} className="hover:opacity-70">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
