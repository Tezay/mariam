import { useQuery } from '@tanstack/react-query';
import { analyticsApi, orgApi, type AnalyticsQuery } from '@/lib/api';

export function useAnalyticsOverview(query: AnalyticsQuery) {
  return useQuery({
    queryKey: ['analytics', 'overview', query],
    queryFn: () => analyticsApi.getOverview(query),
  });
}

export function useAnalyticsPublications(query: AnalyticsQuery) {
  return useQuery({
    queryKey: ['analytics', 'publications', query],
    queryFn: () => analyticsApi.getPublications(query),
  });
}

export function useOrgSites(enabled = true) {
  return useQuery({
    queryKey: ['org', 'sites'],
    queryFn: () => orgApi.getSites(),
    enabled,
  });
}
