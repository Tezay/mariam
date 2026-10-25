import { api, scopePath, type OrgRef, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type AnalyticsOverviewSite = Schemas['OverviewSite'];
export type AnalyticsOverview = Schemas['OverviewReport'];
export type PublicationDayStatus = Schemas['PublicationDay']['status'];
export type PublicationSiteRow = Schemas['PublicationSite'];
export type PublicationsReport = Schemas['PublicationsReport'];
export type TrafficSeriesPoint = Schemas['TrafficPoint'];
export type TrafficSiteRow = Schemas['TrafficSite'];
export type TrafficReport = Schemas['TrafficReport'];
export type SatisfactionSiteRow = Schemas['SatisfactionSite'];
export type SatisfactionDishRow = Schemas['DishRow'];
export type SatisfactionReport = Schemas['SatisfactionReport'];

export type AnalyticsScope = SiteRef | OrgRef;

export interface AnalyticsQuery {
  period?: string;
  start?: string;
  end?: string;
  /** Slugs; the organization's scope only. */
  sites?: string[];
}

function analyticsParams(query: AnalyticsQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.start && query.end) {
    params.from = query.start;
    params.to = query.end;
  } else if (query.period) {
    params.period = query.period;
  }
  if (query.sites?.length) {
    params.sites = query.sites.join(',');
  }
  return params;
}

async function report<T>(scope: AnalyticsScope, name: string, query: AnalyticsQuery): Promise<T> {
  return (
    await api.get(`${scopePath(scope)}/analytics/${name}`, { params: analyticsParams(query) })
  ).data;
}

export const analyticsApi = {
  getOverview: (scope: AnalyticsScope, query: AnalyticsQuery = {}) =>
    report<AnalyticsOverview>(scope, 'overview', query),
  getPublications: (scope: AnalyticsScope, query: AnalyticsQuery = {}) =>
    report<PublicationsReport>(scope, 'publications', query),
  getTraffic: (scope: AnalyticsScope, query: AnalyticsQuery = {}) =>
    report<TrafficReport>(scope, 'traffic', query),
  getSatisfaction: (scope: AnalyticsScope, query: AnalyticsQuery = {}) =>
    report<SatisfactionReport>(scope, 'satisfaction', query),
};
