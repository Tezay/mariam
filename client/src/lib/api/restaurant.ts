import { api } from './client';
import type { MenuCategory } from './categories';
import type { CertificationItem, DietaryTag } from './taxonomy';

export type ServiceHoursDay = { open: string; close: string };
export type ServiceHours = Record<string, ServiceHoursDay>; // keyed "0"…"6", Monday first

export interface RestaurantConfig {
  service_days: number[];
  service_hours: ServiceHours;
  menu_categories: MenuCategory[];
  dietary_tags: DietaryTag[];
  certifications: CertificationItem[];
  vote_enabled: boolean;
  vote_category_ids: number[];
  vote_icon_preset: string;
}

export interface RestaurantSettings {
  name?: string;
  logo_url?: string;
  service_days?: number[];
  service_hours?: ServiceHours;
  address_label?: string | null;
  address_lat?: number | null;
  address_lon?: number | null;
  email?: string | null;
  phone?: string | null;
  capacity?: number | null;
  payment_methods?: string[] | null;
  pmr_access?: boolean | null;
  vote_enabled?: boolean;
  vote_category_ids?: number[];
  vote_icon_preset?: string;
  dietary_tags?: string[];
  certifications?: string[];
}

export interface RestaurantWithConfig {
  id: number;
  name: string;
  code: string;
  logo_url?: string;
  is_active: boolean;
  address_label?: string | null;
  address_lat?: number | null;
  address_lon?: number | null;
  email?: string | null;
  phone?: string | null;
  capacity?: number | null;
  payment_methods?: string[] | null;
  pmr_access?: boolean | null;
  service_hours: ServiceHours;
  config: RestaurantConfig;
}

export interface AdminSite {
  id: number;
  name: string;
  slug?: string | null;
}

export const restaurantApi = {
  getMine: async () => {
    const response = await api.get('/settings');
    return response.data.restaurant;
  },
  list: async (): Promise<AdminSite[]> => {
    const response = await api.get('/restaurants');
    return (response.data.restaurants ?? []) as AdminSite[];
  },
};
