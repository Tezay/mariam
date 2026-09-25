import { api } from './client';

export interface AnalyticsMetric {
  value: number | null;
  previous: number | null;
  delta: number | null;
  delta_pct: number | null;
}

export interface AnalyticsCompleteness {
  categories_filled_rate: number | null;
  photo_rate: number | null;
  chef_note_rate: number | null;
}

export interface AnalyticsTrendPoint {
  date: string;
  published_sites: number;
  views: number | null;
  unique_visitors: number | null;
  score: number | null;
}

export interface AnalyticsOverviewSite {
  site_id: number;
  name: string;
  is_active: boolean;
  publication_rate: number | null;
  punctuality_rate: number | null;
  last_published_at: string | null;
  views: number | null;
  views_sparkline: number[] | null;
  score: number | null;
  votes: number | null;
}

export interface AnalyticsOverview {
  period: { start: string; end: string; days: number };
  scope: { site_count: number };
  kpis: {
    sites: { total: number; active: number };
    publication_rate: AnalyticsMetric;
    punctuality_rate: AnalyticsMetric;
    avg_lead_time_hours: AnalyticsMetric;
    completeness: AnalyticsCompleteness;
    views: AnalyticsMetric | null;
    unique_visitors: AnalyticsMetric | null;
    satisfaction: AnalyticsMetric | null;
    participation_rate: AnalyticsMetric | null;
  };
  trend: AnalyticsTrendPoint[];
  sites: AnalyticsOverviewSite[];
  top_dishes: SatisfactionDishRow[] | null;
  flop_dishes: SatisfactionDishRow[] | null;
}

export type PublicationDayStatus =
  | 'published_on_time'
  | 'published_late'
  | 'draft'
  | 'missing'
  | 'closed';

export interface PublicationSiteRow {
  site_id: number;
  name: string;
  publication_rate: number | null;
  punctuality_rate: number | null;
  avg_lead_time_hours: number | null;
  categories_filled_rate: number | null;
  photo_rate: number | null;
  chef_note_rate: number | null;
}

export interface PublicationsReport {
  summary: {
    publication_rate: number | null;
    punctuality_rate: number | null;
    avg_lead_time_hours: number | null;
    completeness: AnalyticsCompleteness;
  };
  sites: PublicationSiteRow[];
  matrix: {
    site_id: number;
    name: string;
    days: { date: string; status: PublicationDayStatus }[];
  }[];
}

export interface TrafficSeriesPoint {
  date: string;
  views: number;
  unique_visitors: number;
}

export interface TrafficSiteRow {
  site_id: number;
  name: string;
  views: number;
  unique_visitors: number;
  delta_pct: number | null;
  sparkline: number[];
}

export interface TrafficReport {
  granularity: 'day' | 'hour';
  series: TrafficSeriesPoint[];
  by_site: TrafficSiteRow[];
  by_page_kind: { page_kind: string; views: number }[];
  hour_profile: { hour: number; views: number }[];
  totals: { views: number; unique_visitors: number; org_root_views: number };
}

export interface SatisfactionSiteRow {
  site_id: number;
  name: string;
  votes: number;
  score: number | null;
  participation_rate: number | null;
  delta: number | null;
}

export interface SatisfactionDishRow {
  dish_id: number;
  name: string;
  site_id: number;
  site_name: string;
  votes: number;
  score: number;
}

export interface SatisfactionPresetRow {
  preset: string;
  votes: number;
  score: number | null;
}

export interface SatisfactionReport {
  granularity: 'day' | 'hour';
  by_preset: SatisfactionPresetRow[];
  summary: {
    score: number | null;
    delta: number | null;
    votes: number;
    participation_rate: number | null;
    distribution: Record<'1' | '2' | '3', number>;
  };
  series: { date?: string; hour?: number; votes: number; score: number | null }[];
  by_site: SatisfactionSiteRow[];
  top_dishes: SatisfactionDishRow[];
  flop_dishes: SatisfactionDishRow[];
  settings: {
    site_count: number;
    sites_with_vote: number;
    /** Null when the sites in scope do not all offer the same set. */
    icon_preset: string | null;
    /** Only resolved for a single site; null otherwise. */
    dish_question: boolean | null;
  };
}

export interface AnalyticsQuery {
  period?: string;
  start?: string;
  end?: string;
  siteIds?: number[];
}

function analyticsParams(query: AnalyticsQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.start && query.end) {
    params.start = query.start;
    params.end = query.end;
  } else if (query.period) {
    params.period = query.period;
  }
  if (query.siteIds?.length) {
    params.site_ids = query.siteIds.join(',');
  }
  return params;
}

// The same endpoints serve a site admin and a director; the server scopes them to the caller.
export const analyticsApi = {
  getOverview: async (query: AnalyticsQuery = {}): Promise<AnalyticsOverview> => {
    const response = await api.get('/analytics/overview', { params: analyticsParams(query) });
    return response.data as AnalyticsOverview;
  },
  getPublications: async (query: AnalyticsQuery = {}): Promise<PublicationsReport> => {
    const response = await api.get('/analytics/publications', { params: analyticsParams(query) });
    return response.data as PublicationsReport;
  },
  getTraffic: async (query: AnalyticsQuery = {}): Promise<TrafficReport> => {
    const response = await api.get('/analytics/traffic', { params: analyticsParams(query) });
    return response.data as TrafficReport;
  },
  getSatisfaction: async (query: AnalyticsQuery = {}): Promise<SatisfactionReport> => {
    const response = await api.get('/analytics/satisfaction', { params: analyticsParams(query) });
    return response.data as SatisfactionReport;
  },
};
