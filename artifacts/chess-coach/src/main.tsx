import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import { getApiBase } from "./lib/api";
import App from "./App";
import "./index.css";

const apiBase = getApiBase();
if (apiBase) {
  setBaseUrl(apiBase);
}

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
