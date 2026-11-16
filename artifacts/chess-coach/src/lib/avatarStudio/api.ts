// Avatar Studio persistence: the signed-in player's saved characters on the ChessScout API.
import { apiFetch } from '@/lib/api';
import { normalizeAvatarConfig, type AvatarConfig } from './avatarConfig';

export interface SavedCharacter { id: number; name: string; config: AvatarConfig; isActive: boolean; updatedAt: string }

const asCharacter = (c: { id: number; name: string; config: unknown; isActive: boolean; updatedAt: string }): SavedCharacter =>
  ({ id: c.id, name: c.name, config: normalizeAvatarConfig(c.config), isActive: c.isActive, updatedAt: c.updatedAt });

async function call<T>(path: string, init?: RequestInit, fallback = 'Something went wrong. Please try again.'): Promise<T> {
  const r = await apiFetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const d = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(d.error ?? fallback);
  return d;
}

export async function listCharacters(): Promise<SavedCharacter[]> {
  const d = await call<{ characters: Parameters<typeof asCharacter>[0][] }>('/api/me/avatars', undefined, 'Couldn’t load your characters. Check your connection and try again.');
  return d.characters.map(asCharacter);
}
export async function createCharacter(name: string, config: AvatarConfig): Promise<SavedCharacter> {
  const d = await call<{ character: Parameters<typeof asCharacter>[0] }>('/api/me/avatars', { method: 'POST', body: JSON.stringify({ name, config }) });
  return asCharacter(d.character);
}
export async function updateCharacter(id: number, patch: { name?: string; config?: AvatarConfig }): Promise<SavedCharacter> {
  const d = await call<{ character: Parameters<typeof asCharacter>[0] }>(`/api/me/avatars/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  return asCharacter(d.character);
}
export async function deleteCharacter(id: number): Promise<void> { await call(`/api/me/avatars/${id}`, { method: 'DELETE' }); }
export async function setActiveCharacter(id: number): Promise<void> { await call(`/api/me/avatars/${id}/active`, { method: 'POST' }); }
