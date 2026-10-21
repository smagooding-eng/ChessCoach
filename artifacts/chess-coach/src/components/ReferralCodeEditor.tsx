// Lets a Pro member or affiliate change their referral code to something that
// fits them (their channel, stream or club name). Used on the Profile
// referral card and the Affiliate Dashboard.

import { useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export function ReferralCodeEditor({ code, onChange, tone = 'app' }: {
  code: string;
  onChange: (next: string) => void;
  /** 'app' uses the theme classes; 'dark' uses fixed colors (Affiliate page). */
  tone?: 'app' | 'dark';
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(code);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const clean = value.toUpperCase().replace(/[\s-]+/g, '').replace(/[^A-Z0-9_]/g, '');
  const muted = tone === 'dark' ? { color: '#9e9b98' } : undefined;

  const save = async () => {
    setError('');
    if (clean.length < 3 || clean.length > 20) { setError('Use 3 to 20 letters, numbers or underscores.'); return; }
    if (clean === code) { setEditing(false); return; }
    setSaving(true);
    try {
      const r = await apiFetch('/api/auth/referrals/code', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: clean }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Could not save that code.'); return; }
      onChange(d.inviteCode);
      setEditing(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch { setError('Could not save that code.'); }
    finally { setSaving(false); }
  };

  if (!editing) {
    return (
      <div className="mt-2 text-center">
        <button type="button" onClick={() => { setValue(code); setError(''); setEditing(true); }}
          className={`inline-flex items-center gap-1.5 text-xs font-bold ${tone === 'app' ? 'text-primary hover:text-primary/80' : ''}`}
          style={tone === 'dark' ? { color: '#81B64C' } : undefined}>
          {saved ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          {saved ? 'Code updated' : 'Make it yours: edit your code'}
        </button>
        <p className={`mt-1 text-[11px] ${tone === 'app' ? 'text-muted-foreground' : ''}`} style={muted}>
          Use your channel, stream or club name so your audience remembers it.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus value={value} maxLength={24}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="e.g. CHESSWITHSAM"
          aria-label="New referral code"
          className={`flex-1 min-w-0 rounded-xl px-3 py-2.5 font-mono font-black uppercase tracking-wider outline-none ${tone === 'app' ? 'bg-background/60 border border-primary/30 text-foreground' : ''}`}
          style={tone === 'dark' ? { background: 'rgba(0,0,0,.3)', border: '1px solid rgba(129,182,76,.4)', color: '#fff' } : undefined}
        />
        <button type="button" onClick={save} disabled={saving}
          className={`shrink-0 inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-xs font-bold disabled:opacity-60 ${tone === 'app' ? 'bg-primary text-primary-foreground' : ''}`}
          style={tone === 'dark' ? { background: '#81B64C', color: '#fff' } : undefined}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
        </button>
        <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="shrink-0 p-2" style={muted}>
          <X className="w-4 h-4" />
        </button>
      </div>
      {clean && clean !== value.toUpperCase() && (
        <p className={`text-[11px] ${tone === 'app' ? 'text-muted-foreground' : ''}`} style={muted}>Will be saved as <b>{clean}</b></p>
      )}
      {error && <p className="text-[11px] font-semibold" style={{ color: '#f87171' }}>{error}</p>}
      <p className={`text-[11px] leading-snug ${tone === 'app' ? 'text-muted-foreground' : ''}`} style={muted}>
        3 to 20 letters, numbers or underscores. People you've already referred stay credited to you, but links with your old code will stop working, so update anywhere you've posted it.
      </p>
    </div>
  );
}
