/**
 * MARIAM - Client API Axios
 * 
 * Configuration centralisée pour toutes les requêtes API.
 * Gère l'authentification JWT et le refresh automatique.
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Déclaration du type pour la config runtime (injectée par docker-entrypoint.sh)
declare global {
    interface Window {
        __RUNTIME_CONFIG__?: {
            API_URL?: string;
        };
    }
}

// URL de l'API - Priority:
// 1. Runtime config (docker container) - pour Scaleway
// 2. Build-time env (VITE_API_URL) - pour docker-compose avec nginx proxy
// 3. Default localhost - pour développement local
const getApiUrl = (): string => {
    // Runtime config (injected by docker-entrypoint.sh at container startup)
    const runtimeUrl = window.__RUNTIME_CONFIG__?.API_URL;
    if (runtimeUrl && runtimeUrl !== '__API_URL__') {
        return runtimeUrl;
    }
    // Build-time env (Vite)
    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
    }
    // Default for local development
    return 'http://localhost:5000/api';
};

const API_URL = getApiUrl();
const PUBLIC_API_TIMEOUT_MS = 20000;

// Instance Axios configurée
const api = axios.create({
    baseURL: API_URL,
    timeout: 10000, // 10 secondes
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

// ========================================
// INTERCEPTOR - Ajout du token JWT
// ========================================
api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// ========================================
// INTERCEPTOR - Gestion du refresh token
// ========================================
let isRefreshing = false;
let failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else if (token) {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // Ignorer les endpoints d'authentification
        const isAuthEndpoint = originalRequest.url?.includes('/auth/login') ||
            originalRequest.url?.includes('/auth/activate') ||
            originalRequest.url?.includes('/auth/verify-mfa');

        if (isAuthEndpoint) {
            return Promise.reject(error);
        }

        const status = error.response?.status;

        // Gérer le 401 (token expiré)
        if (status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then((token) => {
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                        return api(originalRequest);
                    })
                    .catch((err) => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const refreshToken = localStorage.getItem('refresh_token');

            if (!refreshToken) {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login';
                return Promise.reject(error);
            }

            try {
                const response = await axios.post(`${API_URL}/auth/refresh`, {}, {
                    headers: {
                        Authorization: `Bearer ${refreshToken}`,
                    },
                });

                const newAccessToken = response.data.access_token;
                localStorage.setItem('access_token', newAccessToken);
                processQueue(null, newAccessToken);

                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return api(originalRequest);

            } catch (refreshError) {
                processQueue(refreshError as Error, null);
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login';
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export default api;

// ========================================
// API AUTHENTIFICATION
// ========================================
export const authApi = {
    /**
     * Étape 1 de la connexion
     */
    login: async (email: string, password: string) => {
        const response = await api.post('/auth/login', { email, password });

        if (response.data.mfa_required) {
            return {
                mfaRequired: true,
                mfaToken: response.data.mfa_token
            };
        }

        const { access_token, refresh_token, user } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        return { user, mfaRequired: false };
    },

    /**
     * Étape 2 de la connexion - Vérification MFA
     */
    verifyMfa: async (mfaToken: string, code: string) => {
        const response = await api.post('/auth/verify-mfa', { mfa_token: mfaToken, code });
        const { access_token, refresh_token, user } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        return user;
    },

    /**
     * Vérifie un lien d'activation
     */
    checkActivationLink: async (token: string) => {
        const response = await api.get(`/auth/check-activation/${token}`);
        return response.data;
    },

    /**
     * Active un compte via lien d'invitation
     */
    activate: async (token: string, password: string, email?: string, username?: string) => {
        const response = await api.post('/auth/activate', { token, password, email, username });
        return response.data;
    },

    /**
     * Confirme la configuration MFA
     */
    verifyMfaSetup: async (userId: number, code: string) => {
        const response = await api.post('/auth/mfa/verify-setup', { user_id: userId, code });
        const { access_token, refresh_token, user } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        return user;
    },

    logout: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    },

    getCurrentUser: async () => {
        const response = await api.get('/auth/me');
        return response.data.user;
    },

    isAuthenticated: () => {
        return !!localStorage.getItem('access_token');
    },

    /**
     * Change le mot de passe (nécessite MFA)
     */
    changePassword: async (currentPassword: string, newPassword: string, mfaCode: string) => {
        const response = await api.post('/auth/change-password', {
            current_password: currentPassword,
            new_password: newPassword,
            mfa_code: mfaCode
        });
        return response.data;
    },

    /**
     * Vérifie un lien de réinitialisation de mot de passe
     */
    checkResetLink: async (token: string) => {
        const response = await api.get(`/auth/check-reset/${token}`);
        return response.data;
    },

    /**
     * Réinitialise le mot de passe via lien dédié (nécessite MFA)
     */
    resetPassword: async (token: string, newPassword: string, mfaCode: string) => {
        const response = await api.post('/auth/reset-password', {
            token,
            new_password: newPassword,
            mfa_code: mfaCode
        });
        return response.data;
    },
};

// ========================================
// API MENUS
// ========================================
export interface MenuItem {
    id?: number;
    menu_id?: number;
    category: string;
    name: string;
    order?: number;
    tags?: DietaryTag[];
    certifications?: CertificationItem[];
}

export interface Menu {
    id: number;
    restaurant_id: number;
    date: string;
    status: 'draft' | 'published';
    items: MenuItem[];
    images?: MenuImage[];
    item_images?: MenuItemImageLink[];
    chef_note?: string;
    published_at?: string;
}

export interface MenuImage {
    id: number;
    menu_id: number;
    url: string;
    filename?: string;
    order: number;
}

export interface MenuItemImageLink {
    id: number;
    menu_id: number;
    gallery_image_id: number;
    category: string;
    item_index: number;
    display_order: number;
    url: string;
    filename?: string;
}

export const menusApi = {
    getWeek: async (weekOffset = 0, restaurantId?: number) => {
        const params: Record<string, string | number> = { week_offset: weekOffset };
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/menus/week', { params });
        return response.data;
    },

    getByDate: async (date: string, restaurantId?: number) => {
        const params: Record<string, number> = {};
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get(`/menus/by-date/${date}`, { params });
        return response.data;
    },

    save: async (date: string, items: MenuItem[], restaurantId?: number, chefNote?: string) => {
        const payload: Record<string, unknown> = { date, items, restaurant_id: restaurantId };
        if (chefNote !== undefined) payload.chef_note = chefNote;
        const response = await api.post('/menus', payload);
        return response.data.menu;
    },

    publish: async (menuId: number) => {
        const response = await api.post(`/menus/${menuId}/publish`);
        return response.data.menu;
    },

    publishWeek: async (weekOffset = 0, restaurantId?: number) => {
        const response = await api.post('/menus/week/publish', {
            week_offset: weekOffset,
            restaurant_id: restaurantId
        });
        return response.data;
    },

    // Images du menu (photos du jour)
    uploadImage: async (menuId: number, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post(`/menus/${menuId}/images`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
        });
        return response.data.image as MenuImage;
    },

    deleteImage: async (menuId: number, imageId: number) => {
        await api.delete(`/menus/${menuId}/images/${imageId}`);
    },

    reorderImages: async (menuId: number, imageIds: number[]) => {
        const response = await api.put(`/menus/${menuId}/images/reorder`, {
            image_ids: imageIds,
        });
        return response.data.images as MenuImage[];
    },

    updateChefNote: async (menuId: number, chefNote: string | null) => {
        const response = await api.put(`/menus/${menuId}/chef-note`, {
            chef_note: chefNote,
        });
        return response.data.menu as Menu;
    },
};

// ========================================
// API IMPORT CSV
// ========================================
export interface CsvUploadResponse {
    file_id: string;
    filename: string;
    columns: string[];
    preview_rows: Record<string, string>[];
    row_count: number;
    detected_delimiter: string | null;
    auto_mapping: {
        date?: string;
        categories?: Record<string, string>;
    };
    detected_date_format?: string;
}

export interface ColumnMapping {
    csv_column: string;
    target_field: 'date' | 'category' | 'ignore';
    category_id?: string;
}

export interface DateConfig {
    mode: 'from_file' | 'align_week' | 'start_date';
    start_date?: string;
    skip_weekends: boolean;
    date_format?: string;
    auto_detect_tags?: boolean;
}

export interface ImportPreviewResponse {
    menus: {
        date: string;
        date_display: string;
        items: MenuItem[];
        has_duplicate: boolean;
        existing_menu?: {
            id: number;
            status: string;
            items: MenuItem[];
        };
    }[];
    total_count: number;
    duplicates_count: number;
    new_count: number;
}

export interface ImportConfirmRequest {
    file_id: string;
    column_mapping: ColumnMapping[];
    date_config: DateConfig;
    duplicate_action: 'skip' | 'replace' | 'merge';
    auto_publish: boolean;
    restaurant_id?: number;
}

export interface ImportConfirmResponse {
    success: boolean;
    imported_count: number;
    replaced_count: number;
    skipped_count: number;
    message: string;
}

export const csvImportApi = {
    upload: async (file: File): Promise<CsvUploadResponse> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/menus/import/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000 // 30 secondes pour les gros fichiers
        });
        return response.data;
    },

    preview: async (
        fileId: string,
        columnMapping: ColumnMapping[],
        dateConfig: DateConfig,
        restaurantId?: number
    ): Promise<ImportPreviewResponse> => {
        const response = await api.post('/menus/import/preview', {
            file_id: fileId,
            column_mapping: columnMapping,
            date_config: dateConfig,
            restaurant_id: restaurantId
        });
        return response.data;
    },

    confirm: async (request: ImportConfirmRequest): Promise<ImportConfirmResponse> => {
        const response = await api.post('/menus/import/confirm', request);
        return response.data;
    }
};

// ========================================
// API ÉVÉNEMENTS
// ========================================
export interface EventImage {
    id: number;
    event_id: number;
    url: string;
    filename?: string;
    order: number;
}

export interface Event {
    id: number;
    restaurant_id: number;
    title: string;
    subtitle?: string;
    description?: string;
    color?: string;
    event_date: string;
    status: 'draft' | 'published';
    visibility: 'tv' | 'mobile' | 'all';
    is_active: boolean;
    images?: EventImage[];
    created_at?: string;
    updated_at?: string;
}

export const eventsApi = {
    list: async (upcoming = true, restaurantId?: number, includeInactive = false) => {
        const params: Record<string, string | number | boolean> = {
            upcoming: String(upcoming),
            include_inactive: String(includeInactive),
        };
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/events', { params });
        return response.data.events as Event[];
    },

    get: async (id: number) => {
        const response = await api.get(`/events/${id}`);
        return response.data.event as Event;
    },

    create: async (event: Partial<Event>) => {
        const response = await api.post('/events', event);
        return response.data.event as Event;
    },

    update: async (id: number, event: Partial<Event>) => {
        const response = await api.put(`/events/${id}`, event);
        return response.data.event as Event;
    },

    delete: async (id: number) => {
        await api.delete(`/events/${id}`);
    },

    publish: async (id: number) => {
        const response = await api.post(`/events/${id}/publish`);
        return response.data.event as Event;
    },

    unpublish: async (id: number) => {
        const response = await api.post(`/events/${id}/unpublish`);
        return response.data.event as Event;
    },

    duplicate: async (id: number, newDate?: string) => {
        const response = await api.post(`/events/${id}/duplicate`, {
            event_date: newDate,
        });
        return response.data.event as Event;
    },

    // Images S3
    storageStatus: async () => {
        const response = await api.get('/events/storage-status');
        return response.data.configured as boolean;
    },

    uploadImage: async (eventId: number, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post(`/events/${eventId}/images`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
        });
        return response.data.image as EventImage;
    },

    deleteImage: async (eventId: number, imageId: number) => {
        await api.delete(`/events/${eventId}/images/${imageId}`);
    },

    reorderImages: async (eventId: number, imageIds: number[]) => {
        const response = await api.put(`/events/${eventId}/images/reorder`, {
            image_ids: imageIds,
        });
        return response.data.images as EventImage[];
    },
};

// ========================================
// API GALERIE DE PHOTOS
// ========================================
export interface GalleryImageTag {
    id: number;
    gallery_image_id: number;
    name: string;
    tag_type: 'dish' | 'category' | 'manual';
    category_id?: string;
}

export interface GalleryImage {
    id: number;
    restaurant_id: number;
    url: string;
    filename?: string;
    file_size?: number;
    mime_type?: string;
    created_at?: string;
    tags: GalleryImageTag[];
    usage_count?: number;
    usages?: MenuItemImageLink[];
}

export interface GalleryListResponse {
    images: GalleryImage[];
    total: number;
    page: number;
    per_page: number;
    pages: number;
}

export const galleryApi = {
    list: async (params?: {
        q?: string;
        category?: string;
        page?: number;
        per_page?: number;
        sort?: 'recent' | 'oldest' | 'usage';
        restaurant_id?: number;
    }): Promise<GalleryListResponse> => {
        const response = await api.get('/gallery', { params });
        return response.data;
    },

    get: async (id: number): Promise<GalleryImage> => {
        const response = await api.get(`/gallery/${id}`);
        return response.data.image;
    },

    upload: async (
        file: File,
        opts?: { dish_name?: string; category_id?: string; category_label?: string; restaurant_id?: number }
    ): Promise<GalleryImage> => {
        const formData = new FormData();
        formData.append('file', file);
        if (opts?.dish_name) formData.append('dish_name', opts.dish_name);
        if (opts?.category_id) formData.append('category_id', opts.category_id);
        if (opts?.category_label) formData.append('category_label', opts.category_label);
        if (opts?.restaurant_id) formData.append('restaurant_id', String(opts.restaurant_id));
        const response = await api.post('/gallery', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
        });
        return response.data.image;
    },

    delete: async (id: number) => {
        await api.delete(`/gallery/${id}`);
    },

    updateTags: async (id: number, tags: Array<{ name: string; tag_type: 'dish' | 'manual' }>) => {
        const response = await api.put(`/gallery/${id}/tags`, { tags });
        return response.data.image as GalleryImage;
    },

    addTag: async (id: number, name: string) => {
        const response = await api.post(`/gallery/${id}/tags`, { name });
        return response.data.tag as GalleryImageTag;
    },

    deleteTag: async (imageId: number, tagId: number) => {
        await api.delete(`/gallery/${imageId}/tags/${tagId}`);
    },
};

// ========================================
// API MENU — Item Images (galerie)
// ========================================
export const menuItemImagesApi = {
    sync: async (menuId: number, itemImages: Array<{
        gallery_image_id: number;
        category: string;
        item_index: number;
        display_order: number;
    }>) => {
        const response = await api.post(`/menus/${menuId}/item-images`, { item_images: itemImages });
        return response.data.item_images as MenuItemImageLink[];
    },

    remove: async (menuId: number, linkId: number) => {
        await api.delete(`/menus/${menuId}/item-images/${linkId}`);
    },
};

// ========================================
// API ADMIN
// ========================================
export interface User {
    id: number;
    email: string;
    username?: string;
    role: 'admin' | 'editor' | 'reader';
    mfa_enabled: boolean;
    is_active: boolean;
    restaurant_id?: number;
    created_at: string;
    last_login?: string;
}

export const adminApi = {
    // Utilisateurs
    listUsers: async () => {
        const response = await api.get('/admin/users');
        return response.data.users;
    },

    updateUser: async (id: number, data: Partial<User>) => {
        const response = await api.put(`/admin/users/${id}`, data);
        return response.data.user;
    },

    deleteUser: async (id: number) => {
        await api.delete(`/admin/users/${id}`);
    },

    resetUserMfa: async (id: number) => {
        const response = await api.post(`/admin/users/${id}/reset-mfa`);
        return response.data;
    },

    // Invitations
    createInvitation: async (email: string, role: 'admin' | 'editor' | 'reader') => {
        const response = await api.post('/admin/invite', { email, role });
        return response.data.invitation;
    },

    listInvitations: async () => {
        const response = await api.get('/admin/invitations');
        return response.data.invitations;
    },

    // Audit logs
    getAuditLogs: async (params?: {
        page?: number;
        per_page?: number;
        action?: string;
        user_id?: number;
        start_date?: string;
        end_date?: string;
    }) => {
        const response = await api.get('/admin/audit-logs', { params });
        return response.data;
    },

    exportAuditLogs: async (params?: {
        action?: string;
        user_id?: number;
        start_date?: string;
        end_date?: string;
    }) => {
        const response = await api.get('/admin/audit-logs/export', {
            params,
            responseType: 'blob'
        });

        // Créer un lien de téléchargement
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    },

    // Restaurants
    listRestaurants: async () => {
        const response = await api.get('/admin/restaurants');
        return response.data.restaurants;
    },

    createRestaurant: async (data: { name: string; code: string; address?: string }) => {
        const response = await api.post('/admin/restaurants', data);
        return response.data.restaurant;
    },

    updateRestaurant: async (id: number, data: Partial<{ name: string; address: string; is_active: boolean }>) => {
        const response = await api.put(`/admin/restaurants/${id}`, data);
        return response.data.restaurant;
    },

    // Settings
    getSettings: async () => {
        const response = await api.get('/admin/settings');
        return response.data.restaurant;
    },

    updateSettings: async (data: RestaurantSettings) => {
        const response = await api.put('/admin/settings', data);
        return response.data.restaurant;
    },
};

// ========================================
// TYPES DE CONFIGURATION RESTAURANT
// ========================================
export interface MenuCategory {
    id: string;
    label: string;
    icon: string;
    order: number;
}

export interface DietaryTag {
    id: string;
    label: string;
    icon: string;
    color: string;
    category_id: string;
    sort_order: number;
}

export interface DietaryTagCategory {
    id: string;
    name: string;
    color: string;
    sort_order: number;
    tags: DietaryTag[];
}

export interface CertificationItem {
    id: string;
    name: string;
    official_name: string;
    issuer: string;
    scheme_type: 'public' | 'private';
    jurisdiction: 'france' | 'eu' | 'international';
    guarantee: string;
    logo_filename: string;
    category_id: string;
    sort_order: number;
}

export interface CertificationCategory {
    id: string;
    name: string;
    sort_order: number;
    certifications: CertificationItem[];
}

export interface TaxonomyData {
    dietary_tag_categories: DietaryTagCategory[];
    certification_categories: CertificationCategory[];
}

export interface RestaurantConfig {
    service_days: number[];
    menu_categories: MenuCategory[];
    dietary_tags: DietaryTag[];
    certifications: CertificationItem[];
}

export interface RestaurantSettings {
    name?: string;
    address?: string;
    logo_url?: string;
    service_days?: number[];
    menu_categories?: MenuCategory[];
    dietary_tags?: string[];       // send IDs only
    certifications?: string[];     // send IDs only
}

export interface RestaurantWithConfig {
    id: number;
    name: string;
    code: string;
    address?: string;
    logo_url?: string;
    is_active: boolean;
    config: RestaurantConfig;
}

// ========================================
// API PUBLIQUE (sans auth)
// ========================================
export const publicApi = {
    getTodayMenu: async (restaurantId?: number) => {
        const params: Record<string, number> = {};
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/public/menu/today', { params, timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data;
    },

    getTomorrowMenu: async (restaurantId?: number) => {
        const params: Record<string, number> = {};
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/public/menu/tomorrow', { params, timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data;
    },

    getWeekMenu: async (weekOffset = 0, restaurantId?: number) => {
        const params: Record<string, number> = { week_offset: weekOffset };
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/public/menu/week', { params, timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data;
    },

    getEvents: async (visibility?: 'tv' | 'mobile', restaurantId?: number) => {
        const params: Record<string, string | number> = {};
        if (visibility) params.visibility = visibility;
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/public/events', { params, timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data as {
            today_event: Event | null;
            upcoming_events: Event[];
            events: Event[];
        };
    },

    getRestaurant: async (restaurantId?: number) => {
        const params: Record<string, number> = {};
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/public/restaurant', { params, timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data.restaurant;
    },

    getTaxonomy: async (): Promise<TaxonomyData> => {
        const response = await api.get('/public/taxonomy', { timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data as TaxonomyData;
    },
};
