import { useState, useEffect, useRef } from 'react';
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

  useEffect(() => {
    if (!username) {
      setData(null);
      setLoading(false);
      return;
    }
    const key = username.toLowerCase();
    if (cache.has(key)) {
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
  }, [username]);

  return { data, loading };
}

export function useMultiEloProgress(username: string | undefined) {
  const [data, setData] = useState<MultiEloProgress>({ combined: null, chesscom: null, lichess: null });
  const [loading, setLoading] = useState(!!username);
  const requestId = useRef(0);

  useEffect(() => {
    if (!username) {
      setData({ combined: null, chesscom: null, lichess: null });
      setLoading(false);
      return;
    }
    const key = username.toLowerCase();
    const id = ++requestId.current;
    setLoading(true);

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
  }, [username]);

  return { data, loading };
}
