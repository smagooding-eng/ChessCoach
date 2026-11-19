// "Back" means the page you came from, one step: every in-app back button goes one page
// back in this tab's history. Only when there's nothing in the app to go back to (you
// opened the page from a link or bookmark, or reloaded it) does it go to the page's usual
// parent instead, rather than out of the app.
//
// The app records how many of its own pages deep this tab is in each history entry
// (history.state.__csDepth), so "is there an app page behind this one?" survives reloads.
import { forwardRef, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { useLocation } from 'wouter';

const KEY = '__csDepth';
type St = Record<string, unknown> | null;
const depthOf = (s: unknown): number => (s && typeof s === 'object' && typeof (s as Record<string, unknown>)[KEY] === 'number' ? (s as Record<string, number>)[KEY] : 0);
const withDepth = (s: unknown, d: number): St => ({ ...(s && typeof s === 'object' ? (s as Record<string, unknown>) : {}), [KEY]: d });

let installed = false;
/** Called once at start-up, before anything navigates. */
export function installNavDepth(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const h = window.history;
  const push = h.pushState.bind(h), replace = h.replaceState.bind(h);
  h.pushState = (state: unknown, title: string, url?: string | URL | null) => push(withDepth(state, depthOf(h.state) + 1), title, url);
  h.replaceState = (state: unknown, title: string, url?: string | URL | null) => replace(withDepth(state, depthOf(h.state)), title, url);
  if (!h.state || depthOf(h.state) === 0) replace(withDepth(h.state, 0), '');
}

/** Is there a page of this app behind this one in the tab's history? */
export function canGoBack(): boolean {
  return typeof window !== 'undefined' && depthOf(window.history.state) > 0;
}

/** One page back, or to `fallback` if there's no app page behind this one. */
export function useGoBack(fallback: string) {
  const [, navigate] = useLocation();
  return () => { if (canGoBack()) window.history.back(); else navigate(fallback, { replace: true }); };
}

type BackLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { fallback: string; children?: ReactNode };
/** A back link: one page back (see above). Still a real link to `fallback` for new tabs. */
export const BackLink = forwardRef<HTMLAnchorElement, BackLinkProps>(function BackLink({ fallback, onClick, children, ...rest }, ref) {
  const back = useGoBack(fallback);
  return (
    <a ref={ref} href={fallback} {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        back();
      }}>
      {children}
    </a>
  );
});
