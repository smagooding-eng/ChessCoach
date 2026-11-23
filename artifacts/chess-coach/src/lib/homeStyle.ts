// Which Home a member sees: the new clean one (default) or the previous one. Saved on this device.
import { useEffect, useState } from 'react';

export type HomeStyle = 'clean' | 'classic';
const KEY = 'cs_home_style';
const EVT = 'cs:home-style';

export function getHomeStyle(): HomeStyle {
  try { return localStorage.getItem(KEY) === 'classic' ? 'classic' : 'clean'; } catch { return 'clean'; }
}
export function setHomeStyle(v: HomeStyle) {
  try { localStorage.setItem(KEY, v); } catch { /* storage off */ }
  window.dispatchEvent(new Event(EVT));
  window.scrollTo({ top: 0 });
}
export function useHomeStyle(): HomeStyle {
  const [v, setV] = useState<HomeStyle>(getHomeStyle);
  useEffect(() => {
    const on = () => setV(getHomeStyle());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return v;
}
