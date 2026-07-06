import type { DietaryTag, CertificationItem, DishCatalogItem } from '@/lib/api';

export type { DietaryTag, CertificationItem, DishCatalogItem };

export interface MenuItemData {
    id?: number;
    category_id?: number;
    dish_id?: number;
    dish?: DishCatalogItem;
    is_out_of_stock?: boolean;
    order?: number;
}

export interface CategorySubstitutionData {
    dish: DishCatalogItem;
    order: number;
}

export interface DisplayCategory {
    id: number;
    label: string;
    icon: string;
    is_highlighted: boolean;
    is_protected: boolean;
    order: number;
    color_key?: string | null;
    items?: MenuItemData[];
    subcategories?: DisplayCategory[];
}

export interface MenuResponse {
    date: string;
    items: MenuItemData[];
    by_category: DisplayCategory[];
    chef_note?: string;
    substitutions?: Record<string, CategorySubstitutionData[]>;
}

export interface MenuData {
    date: string;
    day_name: string;
    menu: MenuResponse | null;
    restaurant?: {
        name: string;
        logo_url?: string;
        config?: {
            dietary_tags: DietaryTag[];
            certifications: CertificationItem[];
        };
    };
}

export interface EventData {
    id: number;
    title: string;
    subtitle?: string;
    description?: string;
    color?: string;
    event_date: string;
    images?: { id: number; url: string; filename?: string; order: number }[];
}

export interface RestaurantPublic {
    id: number;
    name: string;
    logo_url?: string;
    address_label?: string | null;
    email?: string | null;
    phone?: string | null;
    capacity?: number | null;
    payment_methods?: string[] | null;
    pmr_access?: boolean | null;
    service_hours: Record<string, { open: string; close: string }>;
    config?: {
        service_days: number[];
        dietary_tags: DietaryTag[];
        certifications: CertificationItem[];
    };
}
