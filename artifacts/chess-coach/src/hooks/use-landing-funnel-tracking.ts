import { useEffect, useRef } from 'react';
import { trackFunnelEvent, trackFunnelEventBeacon, type LandingSectionId } from '@/lib/funnelTracking';

const SECTION_IDS: LandingSectionId[] = ['hero', 'how_it_works', 'differentiators', 'features', 'faq', 'pricing', 'final_cta'];
const SCROLL_MILESTONES = [25, 50, 75, 100] as const;

// Instruments a landing page for detailed funnel diagnostics beyond the
// basic view/click/complete events. Requires each tracked section to
// have `id="<sectionId>"` matching one of SECTION_IDS, and `data-track-section`
// on the same element so this hook can find them reliably regardless of
// other id usage on the page.
export function useLandingFunnelTracking() {
  const viewedSections = useRef<Set<string>>(new Set());
  const scrolledMilestones = useRef<Set<number>>(new Set());
  const currentSection = useRef<string | null>(null);
  const exitLogged = useRef(false);

  useEffect(() => {
    // Section visibility: fires `viewed_<section>` once per section the
    // first time at least half of it has scrolled into view, and keeps
    // track of whichever tracked section is most visible right now so
    // an exit event can reference it later.
    const sectionEls = SECTION_IDS
      .map((id) => document.querySelector(`[data-track-section="${id}"]`))
      .filter((el): el is Element => !!el);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-track-section');
          if (!id) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            currentSection.current = id;
            if (!viewedSections.current.has(id)) {
              viewedSections.current.add(id);
              trackFunnelEvent(`viewed_${id}` as any);
            }
          }
        }
      },
      { threshold: [0.5] }
    );
    sectionEls.forEach((el) => observer.observe(el));

    // Scroll depth: fires each milestone at most once, based on how far
    // through the full page height the visitor has scrolled.
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const pct = (scrollTop / docHeight) * 100;
      for (const milestone of SCROLL_MILESTONES) {
        if (pct >= milestone && !scrolledMilestones.current.has(milestone)) {
          scrolledMilestones.current.add(milestone);
          trackFunnelEvent(`scroll_${milestone}` as any);
        }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Engagement: a visitor who's still on the page after 10s is
    // meaningfully different from one who bounced in 2s, even if
    // neither one converts.
    const engagementTimer = window.setTimeout(() => {
      trackFunnelEvent('engaged_10s');
    }, 10_000);

    // Exit tracking: on tab close or navigation away, log whichever
    // tracked section was most recently in view. visibilitychange is
    // more reliable than beforeunload on mobile (where beforeunload
    // often doesn't fire at all when a tab is backgrounded/closed).
    const logExit = () => {
      if (exitLogged.current) return;
      if (!currentSection.current) return;
      exitLogged.current = true;
      trackFunnelEventBeacon(`exit_${currentSection.current}` as any);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') logExit();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', logExit);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(engagementTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', logExit);
    };
  }, []);
}
