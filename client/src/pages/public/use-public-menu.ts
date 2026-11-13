/**
 * Refreshed every five minutes, for the screens nobody reloads; the data stays on
 * screen through a failed refresh.
 */
import { useQuery } from '@tanstack/react-query';
import { menusApi } from '@/lib/api/menus';
import { closuresApi } from '@/lib/api/closures';
import { newsApi } from '@/lib/api/news';
import { sitesApi } from '@/lib/api/sites';
import { addDays, nowInstant, parisToday } from '@/lib/date-utils';
import { publicMenuData } from './public-menu-data';
import type { PublicMenuData } from './menu-types';

export const PUBLIC_REFRESH = {
  refetchInterval: 5 * 60 * 1000,
  refetchIntervalInBackground: true,
  staleTime: 5 * 60 * 1000,
  // ~20s of resilience before surfacing an error on the initial load.
  retry: 10,
  retryDelay: 2000,
};

export function usePublicMenu(
  org: string,
  site: string,
  { initial }: { initial?: { data: PublicMenuData; fetchedAt: number } } = {}
) {
  return useQuery<PublicMenuData>({
    queryKey: ['public-menu', org, site],
    queryFn: async () => {
      const now = nowInstant();
      const today = parisToday(now);
      const [details, menus, news, closures] = await Promise.all([
        sitesApi.get(org, site),
        menusApi.listPublished({ org, site }, today, addDays(today, 1)),
        newsApi.listUpcoming({ org, site }, 'tv', today),
        closuresApi.listPublished({ org, site }),
      ]);
      return publicMenuData({ site: details, menus, news, closures }, now);
    },
    initialData: initial?.data,
    initialDataUpdatedAt: initial?.fetchedAt,
    ...PUBLIC_REFRESH,
  });
}
