// Inside a Content Studio promo, each app section plays in a frame signed in as
// the ChessScout.net showcase account (?studioAs=<token>), with a board look of
// its own (?studioLook=…). Storage there is kept in memory, so nothing the frame
// does reaches the real signed-in app around it. Imported first in main.tsx.
export interface StudioFrame { token: string; look: Record<string, unknown> | null }
export const STUDIO_FRAME: StudioFrame | null = (() => {
  try {
    if (window.self === window.top) return null;
    const p = new URLSearchParams(window.location.search);
    const token = p.get('studioAs');
    if (!token || !/^[a-f0-9]{20,128}$/i.test(token)) return null;
    const lookRaw = p.get('studioLook');
    return { token, look: lookRaw ? JSON.parse(lookRaw) : null };
  } catch { return null; }
})();

if (STUDIO_FRAME) {
  const mem = new Map<string, string>();
  // Starts empty: none of your own filters, settings or drafts carry into the footage.
  mem.set('chess_coach_token', STUDIO_FRAME.token);
  const store: Storage = {
    get length() { return mem.size; },
    clear: () => mem.clear(),
    getItem: (k) => (mem.has(k) ? mem.get(k)! : null),
    key: (i) => [...mem.keys()][i] ?? null,
    removeItem: (k) => { mem.delete(k); },
    setItem: (k, v) => { mem.set(k, String(v)); },
  };
  try { Object.defineProperty(window, 'localStorage', { value: store, configurable: true }); } catch { /* ignore */ }
  try { Object.defineProperty(window, 'sessionStorage', { value: { ...store }, configurable: true }); } catch { /* ignore */ }
}
