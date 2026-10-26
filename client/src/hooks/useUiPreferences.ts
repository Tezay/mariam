import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi, type UiPreferences } from '@/lib/api/user';

const KEY = ['ui-preferences'];

export function useUiPreferences(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: userApi.getUiPreferences,
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

export function useUpdateUiPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (prefs: Partial<UiPreferences>) => userApi.updateUiPreferences(prefs),
    // Applied locally without rollback on failure: a tour the user dismissed must
    // not come back, neither while the write is in flight nor if it never lands.
    onMutate: async (prefs) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      queryClient.setQueryData<UiPreferences>(KEY, (previous) =>
        previous ? { ...previous, ...prefs } : previous
      );
    },
    retry: 2,
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
}
