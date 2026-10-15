import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Trophy, Loader2, Plus, ExternalLink, Copy, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { whenLabel, type TournamentSummary } from '@/components/play/Tournaments';

const CARD = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' };
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm outline-none bg-black/30 border border-white/10 text-white';
const DURATIONS = [30, 45, 60, 90, 120, 180];

function localInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Admin: create Arena tournaments and see/cancel existing ones.
export function TournamentsAdminPanel() {
  const [list, setList] = useState<TournamentSummary[]>([]);
  const [tcs, setTcs] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState(() => {
    const start = new Date(Date.now() + 60 * 60_000);
    start.setMinutes(0, 0, 0);
    return { name: '', description: '', timeControl: 'blitz_5_0', mode: 'casual', startsAt: localInputValue(start), durationMinutes: 60 };
  });

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/admin/tournaments', { credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to load');
      setList(d.tournaments);
      setTcs(d.timeControls);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async (startNow: boolean) => {
    setSaving(true); setErr('');
    try {
      const r = await apiFetch('/api/admin/tournaments', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          // the browser's local time, sent as an absolute instant
          startsAt: startNow ? new Date().toISOString() : new Date(form.startsAt).toISOString(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not create');
      setForm((f) => ({ ...f, name: '', description: '' }));
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4 space-y-3" style={CARD}>
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h2 className="text-base font-black text-white">Create a tournament</h2>
        </div>
        <p className="text-[12px] text-white/50">Arena format: players are paired continuously with whoever is free (closest score first). Win 2, draw 1, loss 0. It shows on everyone's Live play screen while upcoming or running.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">Name</span>
            <input className={INPUT} value={form.name} maxLength={80} placeholder="Friday Night Blitz" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">Description (optional)</span>
            <textarea className={INPUT} rows={2} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">Time control</span>
            <select className={INPUT} value={form.timeControl} onChange={(e) => setForm({ ...form, timeControl: e.target.value })}>
              {(tcs.length ? tcs : [{ id: 'blitz_5_0', label: '5 min' }]).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">Mode</span>
            <select className={INPUT} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option value="casual">Casual (no rating change)</option>
              <option value="ranked">Ranked (updates ratings)</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">Starts (your local time)</span>
            <input type="datetime-local" className={INPUT} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">Length</span>
            <select className={INPUT} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}>
              {DURATIONS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`}</option>)}
            </select>
          </label>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => create(false)} disabled={saving || !form.name.trim()} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-black disabled:opacity-50" style={{ background: '#81b64c', color: '#000' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Schedule
          </button>
          <button onClick={() => create(true)} disabled={saving || !form.name.trim()} className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 bg-white/5 text-white border border-white/10">
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
              <p className="truncate text-sm font-bold text-white">{t.name}</p>
              <p className="text-[11.5px] text-white/50">
                {t.timeControlLabel} · {t.mode} · {t.players} players · <span className={t.status === 'running' ? 'text-amber-400' : t.status === 'cancelled' ? 'text-red-400' : ''}>{t.status}</span>
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
