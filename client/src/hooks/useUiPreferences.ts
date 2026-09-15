import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type UiPreferences } from '@/lib/api';

const KEY = ['ui-preferences'];

export function useUiPreferences(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: adminApi.getUiPreferences,
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

export function useUpdateUiPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (prefs: Partial<UiPreferences>) => adminApi.updateUiPreferences(prefs),
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
}
