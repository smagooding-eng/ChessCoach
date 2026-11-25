import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface LiveHistoryGame {
  id: string;
  gamesId: number | null;
  mode: 'casual' | 'ranked';
  timeControl: 'bullet_1_0' | 'bullet_2_1' | 'blitz_3_0' | 'blitz_3_2' | 'blitz_5_0' | 'blitz_5_3' | 'rapid_10_0' | 'rapid_10_5' | 'rapid_15_0' | 'rapid_15_10' | 'classical_30_0' | 'classical_30_20';
  color: 'white' | 'black';
  opponentUsername: string;
  result: 'win' | 'loss' | 'draw';
  termination: string;
  ratingBefore: number | null;
  ratingAfter: number | null;
  opponentRating: number | null;
  startedAt: string;
  finishedAt: string;
}

export function useLiveHistory(limit = 200) {
  return useQuery<{ games: LiveHistoryGame[] }>({
    queryKey: ['live-history', limit],
    queryFn: async () => {
      const res = await apiFetch(`/api/live/history?limit=${limit}`);
      if (!res.ok) throw new Error('Failed to load history');
      return res.json();
    },
    staleTime: 10_000,
  });
}
