import { useEffect, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

// The ChessScout.net username field, with a live availability check.
// Rules match the server: 3-20 characters, letters, numbers, - and _.

export type ScoutNameStatus = 'empty' | 'checking' | 'ok' | 'bad';

export function localScoutNameError(name: string): string | null {
  const n = name.trim();
  if (!n) return null;
  if (n.length < 3) return 'Use at least 3 characters.';
  if (n.length > 20) return 'Use 20 characters or fewer.';
  if (!/^[A-Za-z0-9_-]+$/.test(n)) return 'Letters, numbers, - and _ only.';
  if (!/[A-Za-z0-9]/.test(n[0])) return 'Start with a letter or number.';
  return null;
}

export async function saveScoutUsername(name: string): Promise<string | null> {
  try {
    const res = await apiFetch('/api/auth/scout-username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: name.trim() }),
    });
    if (res.ok) return null;
    const d = await res.json().catch(() => ({}));
    return d.error || 'Could not save that username.';
  } catch {
    return 'Could not save that username.';
  }
}

export function ScoutUsernameInput({
  value, onChange, onStatus, current, autoFocus, placeholder = 'e.g. KnightRider', inputStyle, textColor = '#e8e6e3', mutedColor = '#9e9b98',
}: {
  value: string;
  onChange: (v: string) => void;
  onStatus?: (s: ScoutNameStatus) => void;
  /** The user's existing ChessScout username, which counts as available. */
  current?: string | null;
  autoFocus?: boolean;
  placeholder?: string;
  inputStyle?: React.CSSProperties;
  textColor?: string;
  mutedColor?: string;
}) {
  const [status, setStatus] = useState<ScoutNameStatus>('empty');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const n = value.trim();
    if (!n) { setStatus('empty'); setMsg(null); return; }
    const local = localScoutNameError(n);
    if (local) { setStatus('bad'); setMsg(local); return; }
    if (current && n.toLowerCase() === current.toLowerCase()) { setStatus('ok'); setMsg(null); return; }
    setStatus('checking'); setMsg(null);
    let cancelled = false;
    const t = setTimeout(() => {
      apiFetch(`/api/auth/scout-username/check?name=${encodeURIComponent(n)}`, { credentials: 'include' })
        .then(r => r.json())
        .then((d: { available: boolean; error?: string }) => {
          if (cancelled) return;
          setStatus(d.available ? 'ok' : 'bad');
          setMsg(d.available ? 'Available' : (d.error || 'Not available'));
        })
        .catch(() => { if (!cancelled) { setStatus('ok'); setMsg(null); } });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value, current]);

  useEffect(() => { onStatus?.(status); }, [status, onStatus]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\s/g, ''))}
          placeholder={placeholder}
          autoFocus={autoFocus}
          maxLength={20}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-lg py-2.5 pl-3 pr-9 text-sm font-bold outline-none"
          style={{ background: 'rgba(0,0,0,0.3)', color: textColor, border: '1px solid rgba(255,255,255,0.08)', ...inputStyle }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          {status === 'checking' && <Loader2 className="h-4 w-4 animate-spin" style={{ color: mutedColor }} />}
          {status === 'ok' && <Check className="h-4 w-4" style={{ color: '#81B64C' }} />}
          {status === 'bad' && <X className="h-4 w-4" style={{ color: '#E06A5F' }} />}
        </span>
      </div>
      {msg && (
        <p className="text-[11px] font-semibold" style={{ color: status === 'bad' ? '#E06A5F' : mutedColor }}>{msg}</p>
      )}
    </div>
  );
}

/** Profile card: shows the ChessScout.net username and lets any user create or change it. */
export function ScoutUsernameCard({ current, onSaved, text = '#e8e6e3', muted = '#9e9b98', border = 'rgba(255,255,255,0.08)' }: {
  current: string | null | undefined;
  onSaved: () => void | Promise<void>;
  text?: string;
  muted?: string;
  border?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? '');
  const [status, setStatus] = useState<ScoutNameStatus>('empty');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const n = value.trim();
    if (!n || n === current) { setEditing(false); return; }
    if (status === 'bad' || status === 'checking') return;
    setSaving(true); setError(null);
    const err = await saveScoutUsername(n);
    setSaving(false);
    if (err) { setError(err); return; }
    await onSaved();
    setEditing(false);
  };

  return (
    <div className="rounded-[14px] px-3 py-2.5" style={{ background: 'rgba(255,255,255,.035)', border: `1px solid ${border}` }}>
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: muted }}>ChessScout.net username</p>
      {editing ? (
        <div className="mt-1.5 space-y-2">
          <ScoutUsernameInput value={value} onChange={setValue} onStatus={setStatus} current={current} autoFocus textColor={text} mutedColor={muted} />
          {error && <p className="text-[11px] font-semibold" style={{ color: '#E06A5F' }}>{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || status === 'bad' || status === 'checking'} className="rounded-lg px-3 py-1.5 text-[12.5px] font-extrabold disabled:opacity-50" style={{ background: '#81B64C', color: '#FFFFFF' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); setValue(current ?? ''); setError(null); }} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold" style={{ background: 'rgba(255,255,255,.06)', color: muted }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          {current
            ? <b className="truncate text-[14px] font-bold" style={{ color: text }}>{current}</b>
            : <p className="text-[13px]" style={{ color: muted }}>Not set yet</p>}
          <button onClick={() => { setValue(current ?? ''); setEditing(true); }} className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-extrabold" style={{ background: 'rgba(255,255,255,.06)', color: text, border: `1px solid ${border}` }}>
            {current ? 'Change' : 'Create'}
          </button>
        </div>
      )}
    </div>
  );
}
