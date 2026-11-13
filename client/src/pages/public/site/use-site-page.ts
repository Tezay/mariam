import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { closuresApi } from '@/lib/api/closures';
import { menusApi, type Menu } from '@/lib/api/menus';
import { newsApi } from '@/lib/api/news';
import { sitesApi } from '@/lib/api/sites';
import type { SitePage } from '../menu-types';
import { PUBLIC_REFRESH } from '../use-public-menu';
import type { DayRange } from './days';

export function useSiteDetails(
  org: string,
  site: string,
  initial: Omit<SitePage, 'menus'>,
  fetchedAt: number
): Omit<SitePage, 'menus'> {
  const { data } = useQuery({
    queryKey: ['site-details', org, site],
    queryFn: async () => {
      const ref = { org, site };
      const [details, news, closures] = await Promise.all([
        sitesApi.get(org, site),
        newsApi.listPublished(ref, 'mobile'),
        closuresApi.listPublished(ref),
      ]);
      return { site: details, news, closures };
    },
    initialData: initial,
    initialDataUpdatedAt: fetchedAt,
    ...PUBLIC_REFRESH,
  });
  return data;
}

export interface HeldMenus extends DayRange {
  items: Menu[];
}

export function useSiteMenus(
  org: string,
  site: string,
  range: DayRange,
  loaded: HeldMenus,
  fetchedAt: number
): HeldMenus | undefined {
  const isLoaded = range.from === loaded.from && range.to === loaded.to;
  const { data } = useQuery({
    queryKey: ['site-menus', org, site, range.from, range.to],
    queryFn: async () => ({
      ...range,
      items: await menusApi.listPublished({ org, site }, range.from, range.to),
    }),
    initialData: isLoaded ? loaded : undefined,
    initialDataUpdatedAt: isLoaded ? fetchedAt : undefined,
    // The previous days stay on screen while the next range loads: each carries its
    // range, so a day it lacks reads as loading, not as unpublished.
    placeholderData: keepPreviousData,
    ...PUBLIC_REFRESH,
  });
  return data;
}
