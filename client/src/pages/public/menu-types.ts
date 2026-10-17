/**
 * The shapes the public menu and the display screen were written against, built
 * from the API's resources by publicMenuData(). An item may be a substitute the
 * view assembles itself, hence its optional fields.
 */
import type { PublicClosure, PublicEvent, PublicMenu, PublicSite } from '@/lib/api/sites';
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

export type RestaurantPublic = PublicSite & {
  config: Pick<PublicSite, 'service_days' | 'dietary_tags' | 'certifications'>;
};

export interface MenuData {
  date: string;
  day_name: string;
  menu: MenuResponse | null;
  restaurant: RestaurantPublic;
}

export type EventData = Omit<PublicEvent, 'date' | 'images'> & {
  event_date: string;
  images?: Schemas['PublicImage'][];
};

export interface PublicMenuData {
  today: MenuData | null;
  tomorrow: MenuData | null;
  todayEvent: EventData | null;
  upcomingEvents: EventData[];
  activeClosure: PublicClosure | null;
  upcomingClosures: PublicClosure[];
  restaurant: RestaurantPublic | null;
}

export interface SitePage {
  site: PublicSite;
  menus: PublicMenu[];
  events: PublicEvent[];
  closures: PublicClosure[];
}
