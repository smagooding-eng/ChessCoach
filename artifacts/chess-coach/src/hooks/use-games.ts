import { useListGames, useGetGame, useGetGameReplay, useImportGames } from '@workspace/api-client-react';
import { useUser } from './use-user';
import { useQueryClient } from '@tanstack/react-query';

export function useMyGames(limit?: number) {
  const { username } = useUser();
  return useListGames(
    username ? { username, limit } : undefined,
    { query: { enabled: !!username } }
  );
}

export function useGameDetails(id: number) {
  return useGetGame(id, { query: { enabled: !!id } });
}

export function useGameViewer(id: number) {
  return useGetGameReplay(id, { query: { enabled: !!id } });
}

export function useImportChessGames() {
  const queryClient = useQueryClient();
  const importMutation = useImportGames({
    mutation: {
      onSuccess: () => {
        // Invalidate lists after import
        queryClient.invalidateQueries({ queryKey: ['/api/games'] });
        queryClient.invalidateQueries({ queryKey: ['/api/analysis/summary'] });
      }
    }
  });

  return {
    importGames: async (username: string, months: number = 1) => {
      return importMutation.mutateAsync({ data: { username, months } });
    },
    isImporting: importMutation.isPending,
    error: importMutation.error
  };
}
