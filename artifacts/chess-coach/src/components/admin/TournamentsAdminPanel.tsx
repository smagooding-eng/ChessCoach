import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Trophy, Loader2, Plus, ExternalLink, Copy, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { whenLabel, type TournamentSummary } from '@/components/play/Tournaments';

const CARD = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' };
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm outline-none bg-black/30 border border-white/10 text-white';
const LABEL = 'text-[11px] font-bold uppercase tracking-wider text-white/50';
type Opt = { id: string; label: string };

const LIVE_LENGTHS = [30, 45, 60, 90, 120, 180, 360, 720];
const DAILY_LENGTHS = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60].map((d) => d * 24 * 60);
const fmtLength = (m: number) => m < 60 ? `${m} minutes` : m < 24 * 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m / 1440} day${m > 1440 ? 's' : ''}`;

function localInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; sub?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className="rounded-lg px-2 py-2 text-left text-sm font-bold"
          style={value === o.id ? { background: '#81b64c', color: '#000' } : { background: 'rgba(0,0,0,.3)', color: '#fff', border: '1px solid rgba(255,255,255,.1)' }}>
          {o.label}
          {o.sub && <span className="block text-[11px] font-medium opacity-70">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

// Admin: create tournaments (arena or knockout, live or daily, open or Pro
// only) and see/cancel existing ones.
export function TournamentsAdminPanel() {
  const [list, setList] = useState<TournamentSummary[]>([]);
  const [liveTcs, setLiveTcs] = useState<Opt[]>([]);
  const [dailyTcs, setDailyTcs] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState(() => {
    const start = new Date(Date.now() + 60 * 60_000);
    start.setMinutes(0, 0, 0);
    return {
      name: '', description: '',
      format: 'arena' as 'arena' | 'bracket',
      kind: 'live' as 'live' | 'daily',
      timeControl: 'blitz_5_0',
      mode: 'casual',
      eligibility: 'all' as 'all' | 'pro',
      startsAt: localInputValue(start),
      durationMinutes: 60,
      maxPlayers: '' as string,
    };
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/admin/tournaments', { credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to load');
      setList(d.tournaments);
      setLiveTcs(d.liveTimeControls ?? d.timeControls ?? []);
      setDailyTcs(d.dailyTimeControls ?? []);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const tcs = form.kind === 'daily' ? dailyTcs : liveTcs;
  const lengths = form.kind === 'daily' ? DAILY_LENGTHS : LIVE_LENGTHS;
  const setKind = (kind: 'live' | 'daily') => {
    const list2 = kind === 'daily' ? dailyTcs : liveTcs;
    set({ kind, timeControl: list2[0]?.id ?? '', durationMinutes: kind === 'daily' ? 7 * 1440 : 60 });
  };

  const create = async (startNow: boolean) => {
    setSaving(true); setErr('');
    try {
      const r = await apiFetch('/api/admin/tournaments', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          maxPlayers: form.maxPlayers ? Number(form.maxPlayers) : null,
          // the browser's local time, sent as an absolute instant
          startsAt: startNow ? new Date().toISOString() : new Date(form.startsAt).toISOString(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not create');
      set({ name: '', description: '' });
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create'); }
    finally { setSaving(false); }
  };

  const cancel = async (t: TournamentSummary) => {
    if (!confirm(`Cancel "${t.name}"? Players waiting are sent back to the lobby; games in progress finish normally.`)) return;
    await apiFetch(`/api/admin/tournaments/${t.id}/cancel`, { method: 'POST', credentials: 'include' }).catch(() => {});
    void load();
  };

  const copyLink = async (id: string) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/tournaments/${id}`); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  };

  const endText = form.format === 'bracket'
    ? 'Ends when the final is played (no fixed end). Registration closes at the start.'
    : (() => {
        const s = new Date(form.startsAt);
        if (Number.isNaN(s.getTime())) return '';
        return `Ends ${new Date(s.getTime() + form.durationMinutes * 60_000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`;
      })();

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4 space-y-4" style={CARD}>
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h2 className="text-base font-black text-white">Create a tournament</h2>
        </div>

        <label className="block space-y-1">
          <span className={LABEL}>Name</span>
          <input className={INPUT} value={form.name} maxLength={80} placeholder="Friday Night Blitz" onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className={LABEL}>Description (optional)</span>
          <textarea className={INPUT} rows={2} maxLength={500} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </label>

        <div className="space-y-1">
          <span className={LABEL}>Format</span>
          <Choice value={form.format} onChange={(format) => set({ format })} options={[
            { id: 'arena', label: 'Arena', sub: 'Pair continuously, most points wins' },
            { id: 'bracket', label: 'Knockout bracket', sub: 'Seeded, lose and you\'re out' },
          ]} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <span className={LABEL}>Games</span>
            <Choice value={form.kind} onChange={setKind} options={[
              { id: 'live', label: 'Live', sub: 'Clock runs, play now' },
              { id: 'daily', label: 'Daily', sub: 'Days per move' },
            ]} />
          </div>
          <label className="block space-y-1">
            <span className={LABEL}>Time control</span>
            <select className={INPUT} value={form.timeControl} onChange={(e) => set({ timeControl: e.target.value })}>
              {tcs.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <div className="space-y-1">
            <span className={LABEL}>Who can join</span>
            <Choice value={form.eligibility} onChange={(eligibility) => set({ eligibility })} options={[
              { id: 'all', label: 'Everyone', sub: 'Free and Pro' },
              { id: 'pro', label: 'Pro only', sub: 'Pro members' },
            ]} />
          </div>
          <label className="block space-y-1">
            <span className={LABEL}>Mode</span>
            <select className={INPUT} value={form.mode} onChange={(e) => set({ mode: e.target.value })}>
              <option value="casual">Casual (no rating change)</option>
              <option value="ranked">Ranked (updates ratings)</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className={LABEL}>{form.format === 'bracket' ? 'Starts / registration closes' : 'Starts'} (your local time)</span>
            <input type="datetime-local" className={INPUT} value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
          </label>
          {form.format === 'arena' ? (
            <label className="block space-y-1">
              <span className={LABEL}>Length</span>
              <select className={INPUT} value={form.durationMinutes} onChange={(e) => set({ durationMinutes: Number(e.target.value) })}>
                {lengths.map((m) => <option key={m} value={m}>{fmtLength(m)}</option>)}
              </select>
            </label>
          ) : (
            <label className="block space-y-1">
              <span className={LABEL}>Player limit</span>
              <select className={INPUT} value={form.maxPlayers} onChange={(e) => set({ maxPlayers: e.target.value })}>
                <option value="">No limit</option>
                {[4, 8, 16, 32, 64, 128].map((n) => <option key={n} value={n}>{n} players</option>)}
              </select>
            </label>
          )}
        </div>
        <p className="text-[12px] text-white/50">{endText}</p>

        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => create(false)} disabled={saving || !form.name.trim() || !form.timeControl} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-black disabled:opacity-50" style={{ background: '#81b64c', color: '#000' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Schedule
          </button>
          <button onClick={() => create(true)} disabled={saving || !form.name.trim() || !form.timeControl} className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 bg-white/5 text-white border border-white/10">
            Start now
          </button>
        </div>
      </div>

      <div className="rounded-xl p-4 space-y-2" style={CARD}>
        <h2 className="text-base font-black text-white">Tournaments</h2>
        {loading ? <Loader2 className="w-5 h-5 animate-spin text-white/50" /> : list.length === 0 ? (
          <p className="text-sm text-white/50">None yet.</p>
        ) : list.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5 bg-black/20">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{t.name}{t.eligibility === 'pro' && <span className="ml-1.5 text-[10px] font-black text-[#81b64c]">PRO</span>}</p>
              <p className="text-[11.5px] text-white/50">
                {t.format === 'bracket' ? 'Knockout' : 'Arena'} · {t.kind} · {t.timeControlLabel} · {t.mode} · {t.players}{t.maxPlayers ? `/${t.maxPlayers}` : ''} players · <span className={t.status === 'running' ? 'text-amber-400' : t.status === 'cancelled' ? 'text-red-400' : ''}>{t.status}</span>
                {' · '}{t.status === 'cancelled' ? new Date(t.startsAt).toLocaleString() : whenLabel(t)}
              </p>
            </div>
            <button onClick={() => copyLink(t.id)} className="rounded-md p-1.5 text-white/60 bg-white/5" aria-label="Copy link">{copied === t.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
            {t.status !== 'cancelled' && <Link href={`/tournaments/${t.id}`} className="rounded-md p-1.5 text-white/60 bg-white/5" aria-label="Open"><ExternalLink className="w-4 h-4" /></Link>}
            {(t.status === 'scheduled' || t.status === 'running') && (
              <button onClick={() => cancel(t)} className="rounded-md px-2.5 py-1 text-xs font-bold text-red-300 bg-red-500/10">Cancel</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
