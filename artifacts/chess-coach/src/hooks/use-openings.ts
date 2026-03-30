import { useQuery } from '@tanstack/react-query';
import { useUser } from './use-user';

export interface OpeningStat {
  eco: string | null;
  opening: string;
  totalGames: number;
  percentage: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  white: { games: number; wins: number; losses: number; draws: number; winRate: number };
  black: { games: number; wins: number; losses: number; draws: number; winRate: number };
}

export function useMyOpenings() {
  const { username, isLoaded } = useUser();
  return useQuery<{ openings: OpeningStat[]; totalGames: number }>({
    queryKey: ['/api/games/openings', username],
    queryFn: async () => {
      const res = await fetch(`/api/games/openings?username=${encodeURIComponent(username ?? '')}`);
      if (!res.ok) throw new Error('Failed to load openings');
      return res.json();
    },
    enabled: isLoaded && !!username,
  });
}
