/**
 * Refreshed every five minutes, for the screens nobody reloads; the data stays on
 * screen through a failed refresh.
 */
import { useQuery } from '@tanstack/react-query';
import { menusApi } from '@/lib/api/menus';
import { closuresApi } from '@/lib/api/closures';
import { eventsApi } from '@/lib/api/events';
import { sitesApi } from '@/lib/api/sites';
import { addDays, nowInstant, parisToday } from '@/lib/date-utils';
import { publicMenuData } from './public-menu-data';
import type { PublicMenuData } from './menu-types';

const REFETCH_INTERVAL_MS = 5 * 60 * 1000;

export function usePublicMenu(
  org: string,
  site: string,
  mode: 'mobile' | 'tv',
  initial?: { data: PublicMenuData; fetchedAt: number }
) {
  return useQuery<PublicMenuData>({
    queryKey: ['public-menu', org, site, mode],
    queryFn: async () => {
      const now = nowInstant();
      const today = parisToday(now);
      const [details, menus, events, closures] = await Promise.all([
        sitesApi.get(org, site),
        menusApi.listPublished({ org, site }, today, addDays(today, 1)),
        eventsApi.listPublished({ org, site }, mode),
        closuresApi.listPublished({ org, site }),
      ]);
      return publicMenuData({ site: details, menus, events, closures }, now);
    },
    initialData: initial?.data,
    initialDataUpdatedAt: initial?.fetchedAt,
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: REFETCH_INTERVAL_MS,
    // ~20s of resilience before surfacing an error on the initial load.
    retry: 10,
    retryDelay: 2000,
  });
}
