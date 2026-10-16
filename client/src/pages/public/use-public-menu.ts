/**
 * Refreshed every five minutes, for the screens nobody reloads; the data stays on
 * screen through a failed refresh.
 */
import { useQuery } from '@tanstack/react-query';
import { menusApi } from '@/lib/api/menus';
import { eventsApi } from '@/lib/api/events';
import { closuresApi } from '@/lib/api/closures';
import { publicApi } from '@/lib/api/public';
import type { PublicMenuData } from './menu-types';

const REFETCH_INTERVAL_MS = 5 * 60 * 1000;

export function usePublicMenu(
  restaurantSlug: string,
  mode: 'mobile' | 'tv',
  initial?: { data: PublicMenuData; fetchedAt: number }
) {
  return useQuery<PublicMenuData>({
    queryKey: ['public-menu', restaurantSlug, mode],
    queryFn: async () => {
      const [today, tomorrow, eventsData, closuresData, restaurant] = await Promise.all([
        menusApi.getToday(restaurantSlug),
        menusApi.getTomorrow(restaurantSlug),
        eventsApi.getPublic(restaurantSlug, mode),
        closuresApi.getPublic(restaurantSlug),
        mode === 'mobile' ? publicApi.getRestaurant(restaurantSlug) : Promise.resolve(null),
      ]);
      return {
        today,
        tomorrow,
        todayEvent: eventsData?.today_event ?? null,
        upcomingEvents: eventsData?.upcoming_events ?? [],
        activeClosure: closuresData?.current_closure ?? null,
        upcomingClosures: closuresData?.upcoming_closures ?? [],
        restaurant: restaurant ?? null,
      };
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
