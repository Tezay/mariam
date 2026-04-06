import type { DietaryTag, CertificationItem } from '@/lib/api';

export type { DietaryTag, CertificationItem };

export interface MenuItemData {
    id?: number;
    name: string;
    category_id?: number;
    is_out_of_stock?: boolean;
    replacement_label?: string | null;
    tags?: DietaryTag[];
    certifications?: CertificationItem[];
    images?: { id: number; menu_item_id: number; gallery_image_id: number; url: string; display_order: number }[];
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
    images?: { id: number; url: string; filename?: string; order: number }[];
    chef_note?: string;
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
