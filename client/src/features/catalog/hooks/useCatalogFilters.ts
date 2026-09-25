import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CatalogPeriod } from '@/lib/api/catalog';

export interface CatalogFilters {
  q: string;
  /** Dishes served for the first time within the period. */
  newOnly: boolean;
  categoryIds: number[];
  tagIds: string[];
  certIds: string[];
  period: CatalogPeriod;
  sort: string;
  /** Null means "whatever suits this criterion", resolved by the server. */
  order: 'asc' | 'desc' | null;
}

const PERIODS: CatalogPeriod[] = ['all', '7d', '30d', '90d', '12m'];

export const PERIOD_LABELS: Record<CatalogPeriod, string> = {
  all: 'Depuis le début',
  '12m': '12 derniers mois',
  '90d': '90 derniers jours',
  '30d': '30 derniers jours',
  '7d': '7 derniers jours',
};

/** What the closed control shows, beside the word it qualifies. */
export const PERIOD_SHORT: Record<CatalogPeriod, string> = {
  all: 'Tout',
  '12m': '12 m',
  '90d': '90 j',
  '30d': '30 j',
  '7d': '7 j',
};

export const PERIOD_ORDER: CatalogPeriod[] = ['all', '12m', '90d', '30d', '7d'];

function csv(raw: string | null): string[] {
  return (raw ?? '').split(',').filter(Boolean);
}

function numbers(raw: string | null): number[] {
  return csv(raw).map(Number).filter(Number.isInteger);
}

export function useCatalogFilters(defaultSort: string) {
  const [params, setParams] = useSearchParams();

  const filters: CatalogFilters = useMemo(() => {
    const period = params.get('period') as CatalogPeriod | null;
    const order = params.get('order');
    return {
      q: params.get('q') ?? '',
      newOnly: params.get('new') === '1',
      categoryIds: numbers(params.get('categories')),
      tagIds: csv(params.get('tags')),
      certIds: csv(params.get('certs')),
      period: period && PERIODS.includes(period) ? period : 'all',
      sort: params.get('sort') ?? defaultSort,
      order: order === 'asc' || order === 'desc' ? order : null,
    };
  }, [params, defaultSort]);

  const patch = useCallback(
    (next: Partial<CatalogFilters>) => {
      setParams(
        (current) => {
          const draft = new URLSearchParams(current);
          const write = (key: string, value: string | null) => {
            if (value) draft.set(key, value);
            else draft.delete(key);
          };
          if ('q' in next) write('q', next.q ?? null);
          if ('newOnly' in next) write('new', next.newOnly ? '1' : null);
          if ('categoryIds' in next) write('categories', (next.categoryIds ?? []).join(','));
          if ('tagIds' in next) write('tags', (next.tagIds ?? []).join(','));
          if ('certIds' in next) write('certs', (next.certIds ?? []).join(','));
          if ('period' in next)
            write('period', next.period === 'all' ? null : (next.period ?? null));
          if ('sort' in next) write('sort', next.sort ?? null);
          if ('order' in next) write('order', next.order ?? null);
          return draft;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  /** Everything the Filters popover holds, which is what its badge counts. */
  const activeCount =
    filters.categoryIds.length +
    filters.tagIds.length +
    filters.certIds.length +
    (filters.newOnly ? 1 : 0);

  const clear = useCallback(
    () => patch({ categoryIds: [], tagIds: [], certIds: [], newOnly: false }),
    [patch]
  );

  return { filters, patch, activeCount, clear };
}
