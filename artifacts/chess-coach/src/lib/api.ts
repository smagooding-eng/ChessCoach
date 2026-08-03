const TOKEN_KEY = "chess_coach_token";

function resolveBase(): string {
  if (import.meta.env.VITE_API_URL) {
    return (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "";
  }
  if (import.meta.env.DEV) {
    return "";
  }
  console.warn(
    "VITE_API_URL is not set — API requests will fail. Set it to your backend's URL " +
      "(e.g. https://your-api.onrender.com) in Vercel's project environment variables."
  );
  return "";
}

const _base = resolveBase();

export function getApiBase(): string {
  return _base;
}

export function apiUrl(path: string): string {
  return `${_base}${path}`;
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {}
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers: {
      ...headers,
      ...(init?.headers as Record<string, string> || {}),
    },
  });
}
