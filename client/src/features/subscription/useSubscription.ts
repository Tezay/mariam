import { useQuery } from '@tanstack/react-query';
import { useOrgRef } from '@/hooks/useOrgRef';
import type { SiteRef } from '@/lib/api/client';
import { subscriptionsApi } from '@/lib/api/subscriptions';

// Written from the command line only: a page never changes it.
const STALE_MS = 10 * 60_000;

export function useSiteSubscription(site: SiteRef, enabled = true) {
  return useQuery({
    queryKey: ['subscription', site.org, site.site],
    queryFn: () => subscriptionsApi.get(site),
    enabled,
    staleTime: STALE_MS,
  });
}

export function useOrgSubscriptions() {
  const org = useOrgRef();
  return useQuery({
    queryKey: ['subscriptions', org?.org],
    queryFn: () => subscriptionsApi.listForOrg(org!),
    enabled: org !== null,
    staleTime: STALE_MS,
  });
}
