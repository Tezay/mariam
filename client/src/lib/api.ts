/**
 * MARIAM - Client API Axios
 * 
 * Configuration centralisée pour toutes les requêtes API.
 * Gère l'authentification JWT et le refresh automatique.
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// URL de l'API
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Instance Axios configurée
const api = axios.create({
    baseURL: API_URL,
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

        // Gérer le 401 (token expiré)
        if (error.response?.status === 401 && !originalRequest._retry) {
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
    is_vegetarian?: boolean;
    is_halal?: boolean;
    is_pork_free?: boolean;
    allergens?: string;
    tags?: string[];
    certifications?: string[];
}

export interface Menu {
    id: number;
    restaurant_id: number;
    date: string;
    status: 'draft' | 'published';
    items: MenuItem[];
    published_at?: string;
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

    save: async (date: string, items: MenuItem[], restaurantId?: number) => {
        const response = await api.post('/menus', { date, items, restaurant_id: restaurantId });
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
};

// ========================================
// API ÉVÉNEMENTS
// ========================================
export interface Event {
    id: number;
    restaurant_id: number;
    title: string;
    description?: string;
    event_date: string;
    visibility: 'tv' | 'mobile' | 'all';
    is_active: boolean;
}

export const eventsApi = {
    list: async (upcoming = true, restaurantId?: number) => {
        const params: Record<string, string | number | boolean> = { upcoming: String(upcoming) };
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/events', { params });
        return response.data.events;
    },

    create: async (event: Omit<Event, 'id' | 'is_active'>) => {
        const response = await api.post('/events', event);
        return response.data.event;
    },

    update: async (id: number, event: Partial<Event>) => {
        const response = await api.put(`/events/${id}`, event);
        return response.data.event;
    },

    delete: async (id: number) => {
        await api.delete(`/events/${id}`);
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
}

export interface Certification {
    id: string;
    label: string;
    icon: string;
    color: string;
}

export interface RestaurantConfig {
    service_days: number[];
    menu_categories: MenuCategory[];
    dietary_tags: DietaryTag[];
    certifications: Certification[];
}

export interface RestaurantSettings {
    name?: string;
    address?: string;
    logo_url?: string;
    service_days?: number[];
    menu_categories?: MenuCategory[];
    dietary_tags?: DietaryTag[];
    certifications?: Certification[];
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
        const response = await api.get('/public/menu/today', { params });
        return response.data;
    },

    getTomorrowMenu: async (restaurantId?: number) => {
        const params: Record<string, number> = {};
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/public/menu/tomorrow', { params });
        return response.data;
    },

    getWeekMenu: async (weekOffset = 0, restaurantId?: number) => {
        const params: Record<string, number> = { week_offset: weekOffset };
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/public/menu/week', { params });
        return response.data;
    },

    getEvents: async (visibility?: 'tv' | 'mobile', restaurantId?: number) => {
        const params: Record<string, string | number> = {};
        if (visibility) params.visibility = visibility;
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/public/events', { params });
        return response.data.events;
    },

    getRestaurant: async (restaurantId?: number) => {
        const params: Record<string, number> = {};
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/public/restaurant', { params });
        return response.data.restaurant;
    },
};
