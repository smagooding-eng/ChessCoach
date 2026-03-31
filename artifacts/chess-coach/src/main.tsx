import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

if (import.meta.env.VITE_API_URL) {
  setBaseUrl(import.meta.env.VITE_API_URL);
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
