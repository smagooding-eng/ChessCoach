import { useListCourses, useGetCourse, useGenerateCourses, useUpdateCourseProgress } from '@workspace/api-client-react';
import { useUser } from './use-user';
import { useQueryClient } from '@tanstack/react-query';

export function useMyCourses() {
  const { username, isLoaded } = useUser();
  const result = useListCourses(
    { username: username || '' },
    // @ts-expect-error orval generates UseQueryOptions but we only need { enabled }
    { query: { enabled: !!username } }
  );
  return { ...result, isLoading: !isLoaded || result.isLoading };
}

export function useCourseDetail(id: number) {
  // @ts-expect-error orval generates UseQueryOptions but we only need { enabled }
  return useGetCourse(id, { query: { enabled: !!id } });
}

export function useCreateCourses() {
  const queryClient = useQueryClient();
  const mutation = useGenerateCourses({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      }
    }
  });

  return {
    generate: async (username: string) => {
      return mutation.mutateAsync({ data: { username } });
    },
    isGenerating: mutation.isPending,
    error: mutation.error
  };
}

export function useMarkLessonComplete() {
  const queryClient = useQueryClient();
  const mutation = useUpdateCourseProgress({
    mutation: {
      onSuccess: (_: unknown, variables: { id: number; data: { lessonId: number; completed: boolean } }) => {
        queryClient.invalidateQueries({ queryKey: ['/api/courses', variables.id] });
        queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      }
    }
  });

  return {
    markComplete: async (courseId: number, lessonId: number, completed: boolean) => {
      return mutation.mutateAsync({ id: courseId, data: { lessonId, completed } });
    },
    isUpdating: mutation.isPending
  };
}
