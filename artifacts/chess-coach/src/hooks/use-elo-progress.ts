import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

export interface EloProgress {
  hasData: boolean;
  firstRating: number;
  currentRating: number;
  delta: number;
  peak: number;
  low: number;
  sparkline: number[];
  totalGames: number;
  signedUpAt: string | null;
  firstGameAt: string;
  lastGameAt: string;
}

export interface MultiEloProgress {
  combined: EloProgress | null;
  chesscom: EloProgress | null;
  lichess: EloProgress | null;
}

const cache = new Map<string, EloProgress>();
const listeners = new Set<() => void>();

export function invalidateEloCache() {
  cache.clear();
  listeners.forEach(fn => fn());
}

function onEloInvalidate(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

async function fetchElo(username: string, platform?: string): Promise<EloProgress | null> {
  const key = platform ? `${username}:${platform}` : username;
  if (cache.has(key)) return cache.get(key)!;

  try {
    let url = `/api/games/elo-progress?username=${encodeURIComponent(username)}`;
    if (platform) url += `&platform=${platform}`;
    const r = await apiFetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    if (d && d.hasData) {
      cache.set(key, d);
      return d;
    }
    return null;
  } catch {
    return null;
  }
}

export function useEloProgress(username: string | undefined) {
  const [data, setData] = useState<EloProgress | null>(() => {
    if (!username) return null;
    return cache.get(username.toLowerCase()) ?? null;
  });
  const [loading, setLoading] = useState(!data && !!username);
  const requestId = useRef(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!username) {
      setData(null);
      setLoading(false);
      return;
    }
    const key = username.toLowerCase();
    if (refreshKey === 0 && cache.has(key)) {
      setData(cache.get(key)!);
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);

    fetchElo(key).then(d => {
      if (id !== requestId.current) return;
      setData(d);
    }).finally(() => {
      if (id === requestId.current) setLoading(false);
    });
  }, [username, refreshKey]);

  const refresh = () => {
    if (username) {
      const key = username.toLowerCase();
      cache.delete(key);
    }
    setRefreshKey(k => k + 1);
  };

  return { data, loading, refresh };
}

export function useMultiEloProgress(username: string | undefined) {
  const [data, setData] = useState<MultiEloProgress>({ combined: null, chesscom: null, lichess: null });
  const [loading, setLoading] = useState(!!username);
  const requestId = useRef(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    return onEloInvalidate(() => setRefreshKey(k => k + 1));
  }, []);

  useEffect(() => {
    if (!username) {
      setData({ combined: null, chesscom: null, lichess: null });
      setLoading(false);
      return;
    }
    const key = username.toLowerCase();
    const id = ++requestId.current;
    setLoading(true);

    if (refreshKey > 0) {
      cache.delete(key);
      cache.delete(`${key}:chesscom`);
      cache.delete(`${key}:lichess`);
    }

    Promise.all([
      fetchElo(key),
      fetchElo(key, 'chesscom'),
      fetchElo(key, 'lichess'),
    ]).then(([combined, chesscom, lichess]) => {
      if (id !== requestId.current) return;
      setData({ combined, chesscom, lichess });
    }).finally(() => {
      if (id === requestId.current) setLoading(false);
    });
  }, [username, refreshKey]);

  const refresh = () => setRefreshKey(k => k + 1);

  return { data, loading, refresh };
}
