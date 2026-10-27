import { useCallback, useEffect, useState } from 'react';
import { announceChallengeSent } from '@/lib/challengeSent';
import { apiFetch } from '@/lib/api';

// Friends & messages: shared types, API calls and the unread badge.

export type Presence = 'playing' | 'online' | 'offline';

export interface Friend {
  userId: string;
  name: string;
  avatar: string;
  status: Presence;
  unread: number;
  lastMessage: { body: string; at: string; mine: boolean } | null;
}
export interface PersonLite { userId: string; name: string; avatar: string; status: Presence; at?: string }
export interface SearchResult extends PersonLite { relation: 'friends' | 'sent' | 'incoming' | 'none' }

export interface ChatMessage {
  id: number;
  mine: boolean;
  from: string;
  body: string;
  challengeCode: string | null;
  at: string;
  read: boolean;
}

async function json<T>(r: Response): Promise<T> {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error || 'Something went wrong');
  return d as T;
}

const post = (url: string, body?: unknown) => apiFetch(url, {
  method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const socialApi = {
  friends: async () => json<{ friends: Friend[]; incoming: PersonLite[]; sent: PersonLite[] }>(await apiFetch('/api/friends', { credentials: 'include' })),
  search: async (q: string) => json<{ results: SearchResult[] }>(await apiFetch(`/api/friends/search?q=${encodeURIComponent(q)}`, { credentials: 'include' })),
  request: async (userId: string) => json<{ relation: string }>(await post('/api/friends/request', { userId })),
  accept: async (userId: string) => json<{ ok: true }>(await post(`/api/friends/${userId}/accept`)),
  decline: async (userId: string) => json<{ ok: true }>(await post(`/api/friends/${userId}/decline`)),
  remove: async (userId: string) => json<{ ok: true }>(await apiFetch(`/api/friends/${userId}`, { method: 'DELETE', credentials: 'include' })),
  thread: async (userId: string, before?: number) => json<{
    friend: PersonLite & { isFriend: boolean };
    messages: ChatMessage[];
    challenges: Record<string, { status: string; label: string | null; expired: boolean }>;
    hasMore: boolean;
  }>(await apiFetch(`/api/messages/${userId}${before ? `?before=${before}` : ''}`, { credentials: 'include' })),
  send: async (userId: string, payload: { body?: string; challengeCode?: string }) =>
    json<{ message: ChatMessage }>(await post(`/api/messages/${userId}`, payload)),
  /** Live challenge sent straight into the chat (friend gets a notification). */
  challenge: async (userId: string, timeControl: string, mode: 'casual' | 'ranked') => {
    const ch = await json<{ challenge: { code: string } }>(await post('/api/challenges', { kind: 'live', timeControl, mode, color: 'random' }));
    const sent = await socialApi.send(userId, { challengeCode: ch.challenge.code });
    announceChallengeSent();
    return sent;
  },
};

/** Unread messages + incoming friend requests, kept live. */
export function useSocialUnread(): { messages: number; requests: number; total: number } {
  const [c, setC] = useState({ messages: 0, requests: 0 });
  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/social/unread', { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setC({ messages: Number(d.messages) || 0, requests: Number(d.requests) || 0 }); }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    void load();
    const on = () => { void load(); };
    window.addEventListener('cs:dm', on);
    window.addEventListener('cs:dm-read', on);
    window.addEventListener('cs:friends-update', on);
    window.addEventListener('cs:notification', on);
    return () => {
      window.removeEventListener('cs:dm', on);
      window.removeEventListener('cs:dm-read', on);
      window.removeEventListener('cs:friends-update', on);
      window.removeEventListener('cs:notification', on);
    };
  }, [load]);
  return { ...c, total: c.messages + c.requests };
}

export const LIVE_TCS = [
  { id: 'blitz_5_0', label: '5 min' },
  { id: 'blitz_5_3', label: '5 | 3' },
  { id: 'rapid_10_0', label: '10 min' },
  { id: 'rapid_15_0', label: '15 min' },
];

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
