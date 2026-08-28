import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AnalyticsQuery } from '@/lib/api';

export const PERIOD_OPTIONS = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
] as const;

export type PresetPeriod = (typeof PERIOD_OPTIONS)[number]['value'];
export type PeriodKey = PresetPeriod | 'custom';

const DEFAULT_PERIOD: PresetPeriod = '30d';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface AnalyticsFilters {
  period: PeriodKey;
  start?: string;
  end?: string;
  siteIds: number[];
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
    const siteIds = (searchParams.get('sites') ?? '')
      .split(',')
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);

    return {
      period: isCustom ? 'custom' : isPreset(period) ? period : DEFAULT_PERIOD,
      start: isCustom ? start! : undefined,
      end: isCustom ? end! : undefined,
      siteIds,
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

  const setSiteIds = useCallback(
    (ids: number[]) => {
      update((params) => {
        if (ids.length) params.set('sites', ids.join(','));
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
      siteIds: filters.siteIds,
    }),
    [filters]
  );

  return { filters, query, setPeriod, setCustomRange, setSiteIds };
}
