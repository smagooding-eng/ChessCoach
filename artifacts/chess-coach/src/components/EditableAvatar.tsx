import React, { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { apiFetch } from '@/lib/api';

/** A picture the player uploaded themselves (served from /api/avatars/). */
export const isUploadedAvatar = (url: string | null | undefined) => !!url && url.includes('/api/avatars/');

/**
 * The player's picture everywhere in the app: one they uploaded, else their
 * Chess.com avatar, else their Google photo.
 */
export function useMyAvatar(): string | null {
  const { authUser, username } = useUser();
  const { player } = useChessPlayer(username ?? undefined);
  const own = authUser?.profileImageUrl ?? null;
  if (isUploadedAvatar(own)) return own;
  return player?.avatar || own || null;
}

/** Square-crops and shrinks a photo to 320px JPEG in the browser. */
async function toAvatarDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't a picture we can read."));
      i.src = url;
    });
    const side = Math.min(img.width, img.height);
    const out = Math.min(320, side);
    const canvas = document.createElement('canvas');
    canvas.width = out; canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process the picture.');
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The player's own picture with a camera badge: tap to upload a new one (or,
 * if they already uploaded one, change or remove it).
 */
export function EditableAvatar({ size, radius = '9999px', border, fallback, className = '' }: {
  size: number; radius?: string; border?: string; fallback: React.ReactNode; className?: string;
}) {
  const { authUser, refreshAuth } = useUser();
  const src = useMyAvatar();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Menu and errors are positioned on screen (fixed), so cards with
  // overflow-hidden don't clip them.
  const [menu, setMenu] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const place = () => { const r = box.current?.getBoundingClientRect(); if (r) setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - 232)), top: r.bottom + 8 }); };
  const [error, setError] = useState('');
  const uploaded = isUploadedAvatar(authUser?.profileImageUrl);

  const pick = () => { setMenu(false); setError(''); input.current?.click(); };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {
      const dataUrl = await toAvatarDataUrl(file);
      const r = await apiFetch('/api/me/avatar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ dataUrl }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save your picture.');
      await refreshAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your picture.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setMenu(false); setBusy(true); setError('');
    try {
      const r = await apiFetch('/api/me/avatar', { method: 'DELETE', credentials: 'include' });
      if (!r.ok) throw new Error('Could not remove your picture.');
      await refreshAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your picture.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={box} className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <button type="button" onClick={() => { place(); if (uploaded) setMenu((m) => !m); else pick(); }} aria-label="Change profile picture"
        className="grid h-full w-full place-items-center overflow-hidden" style={{ borderRadius: radius, border, background: 'rgba(129,182,76,.10)' }}>
        {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : fallback}
        {busy && <span className="absolute inset-0 grid place-items-center" style={{ borderRadius: radius, background: 'rgba(0,0,0,.5)' }}><Loader2 className="h-5 w-5 animate-spin text-white" /></span>}
      </button>
      <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full"
        style={{ width: Math.max(20, Math.round(size * 0.34)), height: Math.max(20, Math.round(size * 0.34)), background: '#81B64C', color: '#fff', border: '2px solid #0B1213' }}>
        <Camera size={Math.max(11, Math.round(size * 0.17))} />
      </span>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/*" className="hidden" onChange={onFile} />
      {menu && (
        <div className="fixed z-[60] w-44 overflow-hidden rounded-xl text-left text-[13px] font-bold shadow-xl" style={{ left: at?.left, top: at?.top, background: '#16201F', border: '1px solid rgba(255,255,255,.12)' }}>
          <button type="button" onClick={pick} className="block w-full px-3.5 py-2.5 text-left hover:bg-white/5" style={{ color: '#F5F7F6' }}>Change photo</button>
          <button type="button" onClick={remove} className="block w-full px-3.5 py-2.5 text-left hover:bg-white/5" style={{ color: '#E5484D', borderTop: '1px solid rgba(255,255,255,.08)' }}>Remove photo</button>
        </div>
      )}
      {error && <p onClick={() => setError('')} className="fixed z-[60] w-56 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold" style={{ left: at?.left, top: at?.top, background: '#2A1416', color: '#FF8A8E' }}>{error}</p>}
    </div>
  );
}
