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
  firstGameAt: string;
  lastGameAt: string;
}

const cache = new Map<string, EloProgress>();

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

    apiFetch(`/api/games/elo-progress?username=${encodeURIComponent(key)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (id !== requestId.current) return;
        if (d && d.hasData) {
          cache.set(key, d);
          setData(d);
        } else {
          setData(null);
        }
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setData(null);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [username]);

  return { data, loading };
}
