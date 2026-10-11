import { useEffect } from 'react';

// Swipe left / right to move between menus (phones).
//
// Layout listens for horizontal swipes anywhere on the page. A page with its
// own tab bar registers it with useSwipeTabs(); a swipe first moves through
// those tabs, and once you're at the first/last tab it moves to the previous/
// next section in the bottom nav (Home, Scout, Games, Analysis).
//
// Swipes are ignored when they start on a chessboard, a text field, a slider,
// something that scrolls sideways, or anything marked data-no-swipe.

type Handler = (dir: 1 | -1) => boolean;
let pageHandler: Handler | null = null;

// setTab is typed loosely on purpose: a React state setter for a union of
// tab ids (Dispatch<SetStateAction<'a' | 'b'>>) must be accepted as-is.
export function useSwipeTabs<T extends string>(ids: readonly T[], current: T, setTab: (t: never) => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const h: Handler = (dir) => {
      const i = ids.indexOf(current);
      const next = i + dir;
      if (i < 0 || next < 0 || next >= ids.length) return false;
      (setTab as (t: T) => void)(ids[next]);
      return true;
    };
    pageHandler = h;
    return () => { if (pageHandler === h) pageHandler = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|'), current, setTab, enabled]);
}

export function runPageSwipe(dir: 1 | -1): boolean {
  return pageHandler ? pageHandler(dir) : false;
}

const BLOCKERS = '[data-no-swipe],[data-square],[data-piece],input,textarea,select,[contenteditable="true"],[role="slider"],[draggable="true"]';

/** Should a touch that started on `el` be allowed to become a menu swipe? */
export function swipeAllowedFrom(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return true;
  if (el.closest(BLOCKERS)) return false;
  // Anything between here and the page that scrolls sideways owns the swipe.
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return false;
    }
  }
  return true;
}
