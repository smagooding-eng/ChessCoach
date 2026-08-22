// This app is a client-rendered SPA with no server-side rendering, so
// every route is served the same static index.html with the homepage's
// title/description/canonical baked in. This helper updates all three
// client-side per page -- not a full fix (a crawler that doesn't execute
// JS still sees the homepage's tags), but it's what's achievable without
// adding SSR/prerendering, and covers Googlebot and most modern crawlers
// which do execute JS.
export function setPageMeta(title: string, description?: string, path?: string) {
  document.title = title;

  if (description) {
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);
  }

  const canonicalHref = `https://chessscout.net${path ?? window.location.pathname}`;
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', canonicalHref);
}
