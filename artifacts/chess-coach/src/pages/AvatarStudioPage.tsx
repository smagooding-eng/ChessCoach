// /avatar-studio: create or edit your 3D avatar (signed-in players).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { RD } from '@/lib/redesignTheme';
import AvatarStudio from '@/components/avatar-studio/AvatarStudio';
import { defaultAvatar, type AvatarConfig } from '@/lib/avatarStudio/avatarConfig';
import { loadAvatarConfig, saveAvatarConfig } from '@/lib/avatarStudio/api';

export default function AvatarStudioPage() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; config: AvatarConfig; isNew: boolean }>({ status: 'loading' });
  const load = useCallback(() => {
    setState({ status: 'loading' });
    loadAvatarConfig()
      .then((c) => setState({ status: 'ready', config: c ?? defaultAvatar, isNew: !c }))
      .catch((e: unknown) => setState({ status: 'error', message: e instanceof Error ? e.message : 'Couldn’t load your avatar.' }));
  }, []);
  useEffect(load, [load]);
  const onSave = useCallback(async (config: AvatarConfig) => { await saveAvatarConfig(config); }, []);

  return (
    <div className="px-3 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-8" style={{ color: RD.text }}>
      <Link href="/profile" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-bold" style={{ color: RD.muted }}><ArrowLeft size={16} /> Profile</Link>
      {state.status === 'loading' && <div className="grid h-[50vh] place-items-center text-[14px]" style={{ color: RD.muted }}>Loading your avatar…</div>}
      {state.status === 'error' && (
        <div className="mx-auto mt-10 max-w-md rounded-2xl p-5 text-center" style={{ background: '#0D1516', border: `1px solid ${RD.border}` }}>
          <p className="mb-3 text-[14px]">{state.message}</p>
          <button onClick={load} className="rounded-xl px-4 py-2.5 text-[13px] font-extrabold" style={{ background: RD.green, color: '#06110A' }}>Try again</button>
        </div>
      )}
      {state.status === 'ready' && (<>
        {state.isNew && <p className="mx-auto mb-3 max-w-[1100px] text-[13px]" style={{ color: RD.muted }}>You haven’t made an avatar yet. Here’s a starting point: change anything, then save.</p>}
        <AvatarStudio initialConfig={state.config} onSave={onSave} />
      </>)}
    </div>
  );
}
