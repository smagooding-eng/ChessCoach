// "Create avatar" / "Edit avatar": the way into the Avatar Studio from Profile and Settings.
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { RD } from '@/lib/redesignTheme';
import { loadAvatarConfig } from '@/lib/avatarStudio/api';

export function useHasSavedAvatar(): boolean | null {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => { let on = true; loadAvatarConfig().then((c) => { if (on) setHas(!!c); }).catch(() => { if (on) setHas(null); }); return () => { on = false; }; }, []);
  return has;
}

/** A small button (under the profile picture). */
export function AvatarStudioLink() {
  const has = useHasSavedAvatar();
  return (
    <Link href="/avatar-studio" className="mt-2 inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-[11.5px] font-extrabold"
      style={{ background: '#121B1D', color: RD.text, border: `1px solid ${RD.border}` }}>
      🧑‍🎨 {has ? 'Edit avatar' : 'Create avatar'}
    </Link>
  );
}

/** A full-width row (Settings). */
export function AvatarStudioCard() {
  const has = useHasSavedAvatar();
  return (
    <Link href="/avatar-studio" className="flex items-center justify-between gap-3 rounded-2xl p-4" style={{ background: '#0D1516', border: `1px solid ${RD.border}`, color: RD.text }}>
      <span>
        <span className="block text-[15px] font-extrabold">🧑‍🎨 3D Avatar</span>
        <span className="block text-[12px]" style={{ color: RD.muted }}>Make a cartoon 3D character of yourself.</span>
      </span>
      <span className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-extrabold" style={{ background: RD.green, color: '#06110A' }}>{has ? 'Edit avatar' : 'Create avatar'}</span>
    </Link>
  );
}
