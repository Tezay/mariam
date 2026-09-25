import { useQuery } from '@tanstack/react-query';
import { analyticsApi, type AnalyticsQuery } from '@/lib/api/analytics';
import { orgApi } from '@/lib/api/org';

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

export function useAnalyticsTraffic(query: AnalyticsQuery) {
  return useQuery({
    queryKey: ['analytics', 'traffic', query],
    queryFn: () => analyticsApi.getTraffic(query),
  });
}

export function useAnalyticsSatisfaction(query: AnalyticsQuery) {
  return useQuery({
    queryKey: ['analytics', 'satisfaction', query],
    queryFn: () => analyticsApi.getSatisfaction(query),
  });
}

export function useOrgSites(enabled = true) {
  return useQuery({
    queryKey: ['org', 'sites'],
    queryFn: () => orgApi.getSites(),
    enabled,
  });
}
