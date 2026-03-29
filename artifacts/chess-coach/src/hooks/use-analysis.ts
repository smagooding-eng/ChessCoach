import { useAnalyzeGames, useGetWeaknesses, useGetAnalysisSummary } from '@workspace/api-client-react';
import { useUser } from './use-user';
import { useQueryClient } from '@tanstack/react-query';

export function useMyAnalysisSummary() {
  const { username, isLoaded } = useUser();
  const result = useGetAnalysisSummary(
    { username: username || '' },
    // @ts-expect-error orval generates UseQueryOptions but we only need { enabled }
    { query: { enabled: !!username } }
  );
  return { ...result, isLoading: !isLoaded || result.isLoading };
}

export function useMyWeaknesses() {
  const { username, isLoaded } = useUser();
  const result = useGetWeaknesses(
    { username: username || '' },
    // @ts-expect-error orval generates UseQueryOptions but we only need { enabled }
    { query: { enabled: !!username } }
  );
  return { ...result, isLoading: !isLoaded || result.isLoading };
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
