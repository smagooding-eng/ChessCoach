import { useAnalyzeGames, useGetWeaknesses, useGetAnalysisSummary } from '@workspace/api-client-react';
import { useUser } from './use-user';
import { useQueryClient } from '@tanstack/react-query';

export function useMyAnalysisSummary() {
  const { username } = useUser();
  return useGetAnalysisSummary(
    { username: username || '' },
    { query: { enabled: !!username } }
  );
}

export function useMyWeaknesses() {
  const { username } = useUser();
  return useGetWeaknesses(
    { username: username || '' },
    { query: { enabled: !!username } }
  );
}

export function useRunAnalysis() {
  const queryClient = useQueryClient();
  const mutation = useAnalyzeGames({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/analysis/weaknesses'] });
        queryClient.invalidateQueries({ queryKey: ['/api/analysis/summary'] });
        queryClient.invalidateQueries({ queryKey: ['/api/games'] });
      }
    }
  });

  return {
    analyze: async (username: string) => {
      return mutation.mutateAsync({ data: { username } });
    },
    isAnalyzing: mutation.isPending,
    error: mutation.error
  };
}
