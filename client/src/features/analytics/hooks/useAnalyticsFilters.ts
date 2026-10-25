import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { AnalyticsQuery } from '@/lib/api/analytics';

export const PERIOD_OPTIONS = [
  { value: '1d', label: "Aujourd'hui" },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
] as const;

/** The segmented bar holds four presets; the long form only fits the popover. */
export const PERIOD_SHORT_LABELS: Record<PresetPeriod, string> = {
  '1d': "Aujourd'hui",
  '7d': '7 j',
  '30d': '30 j',
  '90d': '90 j',
};

export type PresetPeriod = (typeof PERIOD_OPTIONS)[number]['value'];
export type PeriodKey = PresetPeriod | 'custom';

const DEFAULT_PERIOD: PresetPeriod = '30d';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface AnalyticsFilters {
  period: PeriodKey;
  start?: string;
  end?: string;
  sites: string[];
}

function isPreset(value: string | null): value is PresetPeriod {
  return PERIOD_OPTIONS.some((option) => option.value === value);
}

/**
 * Filters live in the URL so a director can bookmark or share an exact view.
 */
export function useAnalyticsFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<AnalyticsFilters>(() => {
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const isCustom = Boolean(start && end && ISO_DATE.test(start) && ISO_DATE.test(end));
    const period = searchParams.get('period');
    const sites = (searchParams.get('sites') ?? '').split(',').filter(Boolean);

    return {
      period: isCustom ? 'custom' : isPreset(period) ? period : DEFAULT_PERIOD,
      start: isCustom ? start! : undefined,
      end: isCustom ? end! : undefined,
      sites,
    };
  }, [searchParams]);

  const update = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          mutate(next);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setPeriod = useCallback(
    (period: PresetPeriod) => {
      update((params) => {
        params.set('period', period);
        params.delete('start');
        params.delete('end');
      });
    },
    [update]
  );

  const setCustomRange = useCallback(
    (start: string, end: string) => {
      update((params) => {
        params.set('start', start);
        params.set('end', end);
        params.delete('period');
      });
    },
    [update]
  );

  const setSites = useCallback(
    (slugs: string[]) => {
      update((params) => {
        if (slugs.length) params.set('sites', slugs.join(','));
        else params.delete('sites');
      });
    },
    [update]
  );

  const query = useMemo<AnalyticsQuery>(
    () => ({
      period: filters.period === 'custom' ? undefined : filters.period,
      start: filters.start,
      end: filters.end,
      sites: filters.sites,
    }),
    [filters]
  );

  return { filters, query, setPeriod, setCustomRange, setSites };
}
