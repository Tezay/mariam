import { addDays, parisToday } from '@/lib/date-utils';
import type { Menu } from '@/lib/api/menus';
import type { Event } from '@/lib/api/events';
import type { Site } from '@/lib/api/sites';
import type { EventData, MenuData, PublicMenuData, RestaurantPublic, SitePage } from './menu-types';

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function restaurantOf(site: Site): RestaurantPublic {
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

const UPCOMING_EVENTS = 4;

function eventOf({ date, ...event }: Event): EventData {
  return { ...event, event_date: date };
}

/** Today and tomorrow are those of `now`, in Paris; `date` is the day a visitor chose. */
export function publicMenuData(
  { site, menus, events, closures }: SitePage,
  now: Date,
  date: string = parisToday(now)
): PublicMenuData {
  const today = parisToday(now);
  const restaurant = restaurantOf(site);
  return {
    today: dayOf(today, menus, restaurant),
    tomorrow: dayOf(addDays(today, 1), menus, restaurant),
    day: dayOf(date, menus, restaurant),
    todayEvent: events.filter((event) => event.date === today).map(eventOf)[0] ?? null,
    upcomingEvents: events
      .filter((event) => event.date > today)
      .slice(0, UPCOMING_EVENTS)
      .map(eventOf),
    activeClosure:
      closures.find((closure) => closure.start_date <= today && today <= closure.end_date) ?? null,
    upcomingClosures: closures.filter((closure) => closure.start_date > today),
    restaurant,
  };
}
