import { useListGames, useGetGame, useGetGameReplay, useImportGames } from '@workspace/api-client-react';
import { useUser } from './use-user';
import { useQueryClient } from '@tanstack/react-query';

export function useMyGames(limit?: number) {
  const { username, isLoaded } = useUser();
  const result = useListGames(
    username ? { username, limit } : undefined,
    // @ts-expect-error orval generates UseQueryOptions but we only need { enabled }
    { query: { enabled: !!username } }
  );
  return {
    ...result,
    isLoading: !isLoaded || result.isLoading,
  };
}

export function useGameDetails(id: number) {
  // @ts-expect-error orval generates UseQueryOptions but we only need { enabled }
  return useGetGame(id, { query: { enabled: !!id } });
}

export function useGameViewer(id: number) {
  // @ts-expect-error orval generates UseQueryOptions but we only need { enabled }
  return useGetGameReplay(id, { query: { enabled: !!id } });
}

export function useImportChessGames() {
  const queryClient = useQueryClient();
  const importMutation = useImportGames({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/games'] });
        queryClient.invalidateQueries({ queryKey: ['/api/analysis/summary'] });
      }
    }
  });

  return {
    importGames: async (username: string, months: number = 3) => {
      return importMutation.mutateAsync({ data: { username, months } });
    },
    isImporting: importMutation.isPending,
    error: importMutation.error
  };
}
