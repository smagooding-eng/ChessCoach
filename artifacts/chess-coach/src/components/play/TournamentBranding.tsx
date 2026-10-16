import React, { useRef, useState } from 'react';
import { Trophy, Upload, X, Loader2 } from 'lucide-react';
import { apiFetch, apiUrl } from '@/lib/api';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import type { TournamentSummary } from '@/components/play/Tournaments';

// Organizer branding for tournaments: the club logo (or a trophy tile), the
// logo picker (resized in the browser) and the organizer's edit card.

export function TournamentLogo({ t, size = 44 }: { t: Pick<TournamentSummary, 'logoUrl' | 'status'>; size?: number }) {
  const [broken, setBroken] = useState(false);
  const radius = Math.round(size * 0.27);
  if (t.logoUrl && !broken) {
    return (
      <img src={apiUrl(t.logoUrl)} alt="" onError={() => setBroken(true)}
        className="shrink-0 object-cover" style={{ width: size, height: size, borderRadius: radius, background: '#FFFFFF', border: `1px solid ${PT.border}` }} />
    );
  }
  return (
    <span className="grid shrink-0 place-items-center" style={{ width: size, height: size, borderRadius: radius, background: '#81B64C', color: '#FFFFFF' }}>
      <Trophy size={Math.round(size * 0.45)} />
    </span>
  );
}

/** Reads an image file and returns a PNG/JPEG data URL no bigger than 256px. */
export async function resizeLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file is not an image we can read'));
      i.src = url;
    });
    const max = 256;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process the image');
    ctx.drawImage(img, 0, 0, w, h);
    // Keep transparency for PNG logos; photos go as JPEG to stay small.
    const png = canvas.toDataURL('image/png');
    return png.length < 300_000 ? png : canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Logo picker: preview + choose / remove. value is a data URL, an existing image URL, or null. */
export function LogoPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try { onChange(await resizeLogo(f)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not use that image'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img src={value.startsWith('data:') ? value : apiUrl(value)} alt="" className="h-14 w-14 shrink-0 rounded-[14px] object-cover" style={{ background: '#FFFFFF', border: `1px solid ${PT.border}` }} />
      ) : (
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px]" style={{ background: 'rgba(255,255,255,0.05)', border: `1px dashed ${PT.border}`, color: PT.muted }}><Upload size={20} /></span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] font-bold disabled:opacity-60" style={ghostBtn}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {value ? 'Change logo' : 'Upload logo'}
          </button>
          {value && (
            <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 rounded-[10px] px-3 py-2 text-[13px] font-bold" style={ghostBtn}>
              <X size={14} /> Remove
            </button>
          )}
        </div>
        <p className="mt-1 text-[11.5px]" style={{ color: err ? PT.red : PT.muted }}>{err ?? 'Square images work best (PNG or JPG).'}</p>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); }} />
    </div>
  );
}

const INPUT: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', color: PT.text, border: `1px solid ${PT.border}` };

/** The organizer's edit card on a tournament page. */
export function TournamentEditCard({ t, onClose, onSaved }: { t: TournamentSummary; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(t.name);
  const [club, setClub] = useState(t.clubName ?? '');
  const [note, setNote] = useState(t.description ?? '');
  const [logo, setLogo] = useState<string | null>(t.logoUrl ?? null);
  const [listed, setListed] = useState(t.visibility !== 'link');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    const body: Record<string, unknown> = { name, clubName: club, description: note, listed };
    // Only send the logo when it changed (a new data URL, or removed).
    if (logo === null && t.logoUrl) body.logo = null;
    else if (logo && logo.startsWith('data:')) body.logo = logo;
    try {
      const r = await apiFetch(`/api/tournaments/${t.id}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save');
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 p-4" style={cardStyle}>
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-extrabold" style={{ color: PT.text }}>Edit tournament</h2>
        <button onClick={onClose} aria-label="Close" style={{ color: PT.muted }}><X size={18} /></button>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>Title</p>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="w-full rounded-[10px] px-3 py-2.5 text-[14px] font-bold outline-none" style={INPUT} />
      </div>
      <div>
        <p className="mb-1 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>Club or organizer name</p>
        <input value={club} onChange={(e) => setClub(e.target.value)} maxLength={80} placeholder="e.g. Riverside Chess Club" className="w-full rounded-[10px] px-3 py-2.5 text-[14px] font-bold outline-none" style={INPUT} />
      </div>
      <div>
        <p className="mb-1 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>Logo</p>
        <LogoPicker value={logo} onChange={setLogo} />
      </div>
      <div>
        <p className="mb-1 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>Note for players</p>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} className="w-full rounded-[10px] px-3 py-2.5 text-[13.5px] outline-none" style={INPUT} />
      </div>
      <label className="flex cursor-pointer items-center gap-3 text-[13.5px] font-bold" style={{ color: PT.text }}>
        <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} className="h-4 w-4 accent-[#81B64C]" />
        Show it on the public tournaments list
      </label>
      {err && <p className="text-[12.5px] font-bold" style={{ color: PT.red }}>{err}</p>}
      <button onClick={save} disabled={busy} className="w-full rounded-xl py-3 text-[14px] font-extrabold disabled:opacity-60" style={greenBtn}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  );
}
