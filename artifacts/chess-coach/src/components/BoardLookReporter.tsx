// Tells the server how this member's board looks (board, colours, piece set) so the admin
// "Online now" list can show a small picture of it. Sent once per change, a moment after.
import { useEffect } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useUser } from '@/hooks/use-user';
import { apiFetch } from '@/lib/api';
import { STUDIO_FRAME } from '@/lib/studioFrame';

export function BoardLookReporter() {
  const { authUser } = useUser();
  const s = useSettings();
  const look = JSON.stringify({
    boardTheme: s.boardTheme, boardTexture: s.boardTexture, pieceShape: s.pieceShape, pieceStyle: s.pieceStyle,
    light: s.boardColors?.light, dark: s.boardColors?.dark,
  });
  const uid = authUser?.id;
  useEffect(() => {
    if (!uid || STUDIO_FRAME) return undefined;
    const key = `cs_look_sent:${uid}`;
    try { if (localStorage.getItem(key) === look) return undefined; } catch { /* storage off */ }
    const t = window.setTimeout(() => {
      apiFetch('/api/me/board-look', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: look })
        .then((r) => { if (r.ok) try { localStorage.setItem(key, look); } catch { /* */ } })
        .catch(() => { /* try again next time */ });
    }, 4000);
    return () => window.clearTimeout(t);
  }, [uid, look]);
  return null;
}
