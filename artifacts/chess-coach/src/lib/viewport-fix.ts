// Forces the browser to recompute viewport-based CSS (Tailwind's md: etc.)
// by toggling the viewport meta tag, forcing a synchronous reflow, and
// dispatching a resize event. Needed after browser-level rendering-context
// transitions where the layout viewport can be momentarily wrong -- notably
// the Android TWA -> external domain (Google OAuth) -> TWA transition,
// where Chrome has to switch between trusted standalone mode and Custom
// Tabs mode and can carry over incorrect viewport/zoom state across that
// switch.
export function forceViewportRecalc() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    const content = meta.getAttribute("content");
    meta.setAttribute("content", "width=device-width,initial-scale=1");
    requestAnimationFrame(() => {
      if (content) meta.setAttribute("content", content);
    });
  }
  void document.documentElement.offsetHeight;
  window.dispatchEvent(new Event('resize'));
}

// Runs forceViewportRecalc on a retry schedule. Regular app-mount glitches
// tend to resolve within a couple of animation frames, but the OAuth
// redirect chain is an OS-level window-mode transition (Custom Tabs back to
// trusted TWA) that can take noticeably longer to settle than a normal
// React re-render -- so this schedule spreads retries out further, up to
// ~2 seconds, specifically for that case.
export function forceViewportRecalcWithRetries(delaysMs: number[] = [0, 150, 400, 800, 1500]) {
  delaysMs.forEach((delay) => {
    if (delay === 0) {
      forceViewportRecalc();
    } else {
      setTimeout(forceViewportRecalc, delay);
    }
  });
}
