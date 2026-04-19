import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface LiveRating {
  rating: number;
  rd: number;
  gamesPlayed: number;
  isProvisional: boolean;
}

export type LiveRatings = Record<string, LiveRating>;

export function useLiveRatings() {
  return useQuery<{ ratings: LiveRatings }>({
    queryKey: ['live-ratings'],
    queryFn: async () => {
      const res = await apiFetch('/api/live/ratings');
      if (!res.ok) throw new Error('Failed to load ratings');
      return res.json();
    },
    staleTime: 10_000,
  });
}

export function bestLiveRating(ratings?: LiveRatings): { rating: number; gamesPlayed: number } | null {
  if (!ratings) return null;
  let best: LiveRating | null = null;
  for (const r of Object.values(ratings)) {
    if (r.gamesPlayed > 0 && (!best || r.gamesPlayed > best.gamesPlayed)) best = r;
  }
  return best ? { rating: best.rating, gamesPlayed: best.gamesPlayed } : null;
}
