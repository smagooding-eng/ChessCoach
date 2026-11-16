// Avatar Studio persistence: the signed-in player's config on the ChessScout API.
import { apiFetch } from '@/lib/api';
import { normalizeAvatarConfig, type AvatarConfig } from './avatarConfig';

/** The saved avatar, or null if this player hasn't saved one yet. */
export async function loadAvatarConfig(): Promise<AvatarConfig | null> {
  const r = await apiFetch('/api/me/avatar-config', { credentials: 'include' });
  if (!r.ok) throw new Error('Couldn’t load your avatar. Check your connection and try again.');
  const d = (await r.json()) as { config?: unknown };
  return d.config ? normalizeAvatarConfig(d.config) : null;
}

export async function saveAvatarConfig(config: AvatarConfig): Promise<AvatarConfig> {
  const r = await apiFetch('/api/me/avatar-config', {
    method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }),
  });
  const d = (await r.json().catch(() => ({}))) as { config?: unknown; error?: string };
  if (!r.ok) throw new Error(d.error ?? 'Couldn’t save your avatar. Please try again.');
  return normalizeAvatarConfig(d.config ?? config);
}
