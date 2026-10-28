/**
 * The shapes the public menu and the display screen were written against, built
 * from the API's resources by publicMenuData(). An item may be a substitute the
 * view assembles itself, hence its optional fields.
 */
import type { Menu } from '@/lib/api/menus';
import type { Closure } from '@/lib/api/closures';
import type { Event } from '@/lib/api/events';
import type { Site } from '@/lib/api/sites';
import type { components } from '@/lib/api/schema.gen';

type Schemas = components['schemas'];
type PublicDish = Schemas['PublicDish'];

export interface MenuItemData {
  id?: number;
  category_id?: number;
  dish?: PublicDish;
  is_out_of_stock?: boolean;
  order?: number;
}

export interface CategorySubstitutionData {
  dish: PublicDish;
  order: number;
}

export interface DisplayCategory {
  id: number;
  label: string;
  is_highlighted: boolean;
  order: number;
  color_key?: string | null;
  items?: MenuItemData[];
  subcategories?: DisplayCategory[];
}

export interface MenuResponse {
  date: string;
  by_category: DisplayCategory[];
  chef_note?: string | null;
  substitutions?: Record<string, CategorySubstitutionData[]>;
}

export type RestaurantPublic = Site & {
  config: Pick<Site, 'service_days' | 'dietary_tags' | 'certifications'>;
};

export interface MenuData {
  date: string;
  day_name: string;
  menu: MenuResponse | null;
  restaurant: RestaurantPublic;
}

export type EventData = Omit<Event, 'date' | 'images'> & {
  event_date: string;
  images?: Schemas['Image'][];
};

export interface PublicMenuData {
  today: MenuData | null;
  tomorrow: MenuData | null;
  day: MenuData;
  todayEvent: EventData | null;
  upcomingEvents: EventData[];
  activeClosure: Closure | null;
  upcomingClosures: Closure[];
  restaurant: RestaurantPublic;
}

export interface SitePage {
  site: Site;
  menus: Menu[];
  events: Event[];
  closures: Closure[];
}
