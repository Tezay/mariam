import { useQuery } from '@tanstack/react-query';
import { useOptionalSiteRef } from '@/contexts/SiteContext';
import { useOrgRef } from '@/hooks/useOrgRef';
import { analyticsApi, type AnalyticsQuery, type AnalyticsScope } from '@/lib/api/analytics';
import { orgApi } from '@/lib/api/org';

function useAnalyticsScope(): AnalyticsScope | null {
  const site = useOptionalSiteRef();
  const org = useOrgRef();
  return site ?? org;
}

export function useAnalyticsOverview(query: AnalyticsQuery) {
  const scope = useAnalyticsScope();
  return useQuery({
    queryKey: ['analytics', 'overview', scope, query],
    queryFn: () => analyticsApi.getOverview(scope!, query),
    enabled: scope !== null,
  });
}

export function useAnalyticsPublications(query: AnalyticsQuery) {
  const scope = useAnalyticsScope();
  return useQuery({
    queryKey: ['analytics', 'publications', scope, query],
    queryFn: () => analyticsApi.getPublications(scope!, query),
    enabled: scope !== null,
  });
}

export function useAnalyticsTraffic(query: AnalyticsQuery) {
  const scope = useAnalyticsScope();
  return useQuery({
    queryKey: ['analytics', 'traffic', scope, query],
    queryFn: () => analyticsApi.getTraffic(scope!, query),
    enabled: scope !== null,
  });
}

export function useAnalyticsSatisfaction(query: AnalyticsQuery) {
  const scope = useAnalyticsScope();
  return useQuery({
    queryKey: ['analytics', 'satisfaction', scope, query],
    queryFn: () => analyticsApi.getSatisfaction(scope!, query),
    enabled: scope !== null,
  });
}

export function useOrgSites(enabled = true) {
  const org = useOrgRef();
  return useQuery({
    queryKey: ['org', 'sites', org],
    queryFn: () => orgApi.getSites(org!),
    enabled: enabled && org !== null,
  });
}
