import { addDays, parisToday } from '@/lib/date-utils';
import type { Menu } from '@/lib/api/menus';
import type { PublicEvent, PublicSite } from '@/lib/api/sites';
import type { EventData, MenuData, PublicMenuData, RestaurantPublic, SitePage } from './menu-types';

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function restaurantOf(site: PublicSite): RestaurantPublic {
  const { service_days, dietary_tags, certifications } = site;
  return { ...site, config: { service_days, dietary_tags, certifications } };
}

function dayOf(date: string, menus: Menu[], restaurant: RestaurantPublic): MenuData {
  const menu = menus.find((candidate) => candidate.date === date);
  return {
    date,
    day_name: DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()],
    menu: menu
      ? {
          date,
          by_category: menu.categories,
          chef_note: menu.chef_note,
          substitutions: menu.substitutions,
        }
      : null,
    restaurant,
  };
}

function eventOf({ date, ...event }: PublicEvent): EventData {
  return { ...event, event_date: date };
}

/** Today and tomorrow are those of `now`, in Paris. */
export function publicMenuData(
  { site, menus, events, closures }: SitePage,
  now: Date
): PublicMenuData {
  const today = parisToday(now);
  const restaurant = restaurantOf(site);
  return {
    today: dayOf(today, menus, restaurant),
    tomorrow: dayOf(addDays(today, 1), menus, restaurant),
    todayEvent: events.filter((event) => event.date === today).map(eventOf)[0] ?? null,
    upcomingEvents: events.filter((event) => event.date > today).map(eventOf),
    activeClosure:
      closures.find((closure) => closure.start_date <= today && today <= closure.end_date) ?? null,
    upcomingClosures: closures.filter((closure) => closure.start_date > today),
    restaurant,
  };
}
