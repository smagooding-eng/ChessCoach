import { useEffect } from 'react';

// Swipe left / right to move between menus (phones).
//
// Layout listens for horizontal swipes anywhere on the page. A page with its
// own tab bar registers it with useSwipeTabs(); a swipe first moves through
// those tabs, and once you're at the first/last tab it moves to the previous/
// next section in the bottom nav (Home, Play, Games, Analysis).
//
// Swipes are ignored when they start on a chessboard, a text field, a slider,
// something that scrolls sideways, or anything marked data-no-swipe.

type Handler = ((dir: 1 | -1) => boolean) & { can?: (dir: 1 | -1) => boolean };
let pageHandler: Handler | null = null;

// setTab is typed loosely on purpose: a React state setter for a union of
// tab ids (Dispatch<SetStateAction<'a' | 'b'>>) must be accepted as-is.
export function useSwipeTabs<T extends string>(ids: readonly T[], current: T, setTab: (t: never) => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const can = (dir: 1 | -1) => {
      const i = ids.indexOf(current);
      return i >= 0 && i + dir >= 0 && i + dir < ids.length;
    };
    const h: Handler = Object.assign((dir: 1 | -1) => {
      if (!can(dir)) return false;
      (setTab as (t: T) => void)(ids[ids.indexOf(current) + dir]);
      return true;
    }, { can });
    pageHandler = h;
    return () => { if (pageHandler === h) pageHandler = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|'), current, setTab, enabled]);
}

export function runPageSwipe(dir: 1 | -1): boolean {
  return pageHandler ? pageHandler(dir) : false;
}

/** Would a swipe in this direction move the current page's tabs? (no side effects) */
export function pageCanSwipe(dir: 1 | -1): boolean {
  return !!pageHandler?.can?.(dir);
}

const BLOCKERS = '[data-no-swipe],[data-square],[data-piece],input,textarea,select,[contenteditable="true"],[role="slider"],[draggable="true"]';

/** Like swipeAllowedFrom, but only boards, fields and data-no-swipe block it (not
 *  sideways-scrolling rows). Used on pages that swipe straight to the next page. */
export function swipeAllowedLoose(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return true;
  return !el.closest(BLOCKERS);
}

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
