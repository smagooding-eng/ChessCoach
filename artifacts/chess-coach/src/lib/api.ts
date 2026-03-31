const REPLIT_BACKEND = "https://chess-performance-analyzer.replit.app";

function resolveBase(): string {
  if (import.meta.env.VITE_API_URL) {
    return (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.includes("replit") || host === "localhost") {
      return "";
    }
  }
  return REPLIT_BACKEND;
}

const _base = resolveBase();

export function getApiBase(): string {
  return _base;
}

export function apiUrl(path: string): string {
  return `${_base}${path}`;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}
