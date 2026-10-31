import { useQuery } from '@tanstack/react-query';
import { sitesApi, type LiveStatus } from '@/lib/api/sites';

const REFRESH_MS = 60_000;

export function useLiveStatus(
  org: string,
  site: string,
  {
    initial,
    fetchedAt,
    inService,
  }: { initial: LiveStatus | null; fetchedAt: number; inService: boolean }
): LiveStatus | null {
  const { data } = useQuery({
    queryKey: ['live-status', org, site],
    queryFn: () => sitesApi.getLiveStatus({ org, site }),
    initialData: initial ?? undefined,
    initialDataUpdatedAt: fetchedAt,
    refetchInterval: inService ? REFRESH_MS : false,
    staleTime: REFRESH_MS,
  });
  return data ?? null;
}
