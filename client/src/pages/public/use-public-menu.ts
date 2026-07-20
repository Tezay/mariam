/**
 * Shared data hook for the public menu (mobile + TV).
 *
 * A single React Query fetches the day's menus, events and closures (plus the
 * restaurant on mobile). Query caching and cancellation replace the previous
 * hand-rolled request-id/timer logic. `refetchInterval` keeps unattended TV
 * signage up to date; `retry` provides resilience on flaky networks without
 * flashing an error, and cached data stays on screen during a failed refresh.
 */
import { useQuery } from '@tanstack/react-query';
import { menusApi, eventsApi, closuresApi, publicApi, type ExceptionalClosure } from '@/lib/api';
import type { MenuData, EventData, RestaurantPublic } from './menu-types';

const REFETCH_INTERVAL_MS = 5 * 60 * 1000;

export interface PublicMenuData {
  today: MenuData | null;
  tomorrow: MenuData | null;
  todayEvent: EventData | null;
  upcomingEvents: EventData[];
  activeClosure: ExceptionalClosure | null;
  upcomingClosures: ExceptionalClosure[];
  restaurant: RestaurantPublic | null;
}

export function usePublicMenu(restaurantSlug: string, mode: 'mobile' | 'tv') {
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
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: REFETCH_INTERVAL_MS,
    // ~20s of resilience before surfacing an error on the initial load.
    retry: 10,
    retryDelay: 2000,
  });
}
