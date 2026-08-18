import { createRoot } from "react-dom/client";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { getApiBase, getAuthToken } from "./lib/api";
import App from "./App";
import "./index.css";

// Some standalone iOS PWAs (launched from the home screen) fail to honor
// the viewport meta tag on the very first launch after being added to the
// home screen, silently falling back to the browser's virtual "desktop"
// viewport width (980px) instead of the device's real width. This forces
// the browser to re-read and re-apply the tag, which is the standard,
// documented workaround for this exact failure mode.
(function forceViewportReapply() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  const content = meta.getAttribute("content");
  meta.setAttribute("content", "width=device-width,initial-scale=1");
  requestAnimationFrame(() => {
    if (content) meta.setAttribute("content", content);
  });
})();

const apiBase = getApiBase();
if (apiBase) {
  setBaseUrl(apiBase);
}

setAuthTokenGetter(() => getAuthToken());

window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  if (reason?.name === "AbortError") {
    e.preventDefault();
    return;
  }
  if (
    reason?.name === "ApiError" &&
    typeof reason.status === "number" &&
    (reason.status === 0 || reason.status === 408 || reason.status === 429 || reason.status >= 500)
  ) {
    e.preventDefault();
    return;
  }
  if (
    reason instanceof TypeError &&
    (reason.message === "Failed to fetch" ||
     reason.message === "NetworkError when attempting to fetch resource." ||
     reason.message === "Load failed")
  ) {
    e.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);

requestAnimationFrame(() => {
  const splash = document.getElementById("splash");
  if (splash) {
    const isLanding = window.location.pathname.endsWith("/setup") || window.location.pathname.endsWith("/setup/");
    const delay = isLanding ? 0 : 1200;
    setTimeout(() => {
      splash.classList.add("hide");
      setTimeout(() => splash.remove(), 500);
    }, delay);
  }
});
