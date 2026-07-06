/**
 * MARIAM - Client API Axios
 * 
 * Configuration centralisée pour toutes les requêtes API.
 * Gère l'authentification JWT et le refresh automatique.
 */

import axios, { AxiosError, InternalAxiosRequestConfig, isAxiosError } from 'axios';
import { parisToday } from './date-utils';

/** Extrait le message d'erreur d'une réponse API, avec message de repli. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
    if (isAxiosError(error)) {
        const message = (error.response?.data as { error?: string } | undefined)?.error;
        if (message) return message;
    }
    return fallback;
}

// Déclaration du type pour la config runtime (injectée par docker-entrypoint.sh)
declare global {
    interface Window {
        __RUNTIME_CONFIG__?: {
            API_URL?: string;
            UMAMI_WEBSITE_ID?: string;
        };
        umami?: {
            track: (event: string, data?: Record<string, unknown>) => void;
            identify: (data: Record<string, unknown>) => void;
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
    return 'http://localhost:5000/v1';
};

const API_URL = getApiUrl();
const PUBLIC_API_TIMEOUT_MS = 20000;

// ========================================
// CACHE DU RÔLE UTILISATEUR (pour le manifest PWA dynamique)
// ========================================
// Persiste le rôle dans CacheStorage afin que le Service Worker puisse
// servir le bon manifest PWA (manifest-admin.webmanifest pour admin/éditeur).
// Fire-and-forget : les erreurs (SW inactif, contexte non sécurisé) sont silencieuses.
function setManifestRole(role: string | null): void {
    if (!('caches' in window)) return;
    if (role === 'admin' || role === 'editor') {
        caches.open('mariam-config')
            .then(cache => cache.put('/user-role', new Response(role, {
                headers: { 'Content-Type': 'text/plain' },
            })))
            .catch(() => {});
    } else {
        caches.open('mariam-config')
            .then(cache => cache.delete('/user-role'))
            .catch(() => {});
    }
}

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

        // Ignorer les endpoints d'authentification (pas de refresh automatique)
        const isAuthEndpoint = originalRequest.url?.includes('/auth/login') ||
            originalRequest.url?.includes('/auth/activate') ||
            originalRequest.url?.includes('/auth/mfa/verify') ||
            originalRequest.url?.includes('/auth/passkey/login') ||
            originalRequest.url?.includes('/auth/passkey/setup') ||
            originalRequest.url?.includes('/auth/passkey/reset-password') ||
            originalRequest.url?.includes('/auth/session-transfer/validate');

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
                const response = await axios.post(`${API_URL}/auth/refresh`, null, {
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
// AXIOS PUBLIC (sans authentification)
// ========================================
// Instance séparée sans intercepteur JWT ni refresh automatique.
const publicAxios = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' },
});

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
        setManifestRole(user.role);
        return { user, mfaRequired: false };
    },

    /**
     * Étape 2 de la connexion - Vérification MFA
     */
    verifyMfa: async (mfaToken: string, code: string) => {
        const response = await api.post('/auth/mfa/verify', { mfa_token: mfaToken, code });
        const { access_token, refresh_token, user } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        setManifestRole(user.role);
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
    verifyMfaSetup: async (userId: number, code: string, setupToken: string) => {
        const response = await api.post('/auth/mfa/verify-setup', { user_id: userId, code, setup_token: setupToken });
        const { access_token, refresh_token, user } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        setManifestRole(user.role);
        return user;
    },

    logout: () => {
        const refreshToken = localStorage.getItem('refresh_token');
        const accessToken = localStorage.getItem('access_token');
        // Clear session immediately (client-side)
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setManifestRole(null);
        // Revoke both tokens server-side (fire-and-forget)
        if (refreshToken) {
            axios.post(`${API_URL}/auth/logout`, { access_token: accessToken }, {
                headers: { Authorization: `Bearer ${refreshToken}` },
            }).catch(() => {});
        }
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

    // ---- Passkeys (WebAuthn) ----

    /** Démarre l'enregistrement d'une passkey (utilisateur connecté) */
    passkeyRegisterBegin: async () => {
        const response = await api.post('/auth/passkey/register/begin');
        return response.data as { options: Record<string, unknown>; challenge_token: string };
    },

    /** Finalise l'enregistrement d'une passkey */
    passkeyRegisterComplete: async (
        challengeToken: string,
        credential: unknown,
        deviceName?: string
    ) => {
        const response = await api.post('/auth/passkey/register/complete', {
            challenge_token: challengeToken,
            credential,
            device_name: deviceName,
        });
        return response.data;
    },


    /** Liste les passkeys de l'utilisateur connecté */
    listPasskeys: async (): Promise<PasskeyInfo[]> => {
        const response = await api.get('/auth/passkey');
        return response.data.passkeys as PasskeyInfo[];
    },

    /** Supprime une passkey */
    deletePasskey: async (id: number) => {
        await api.delete(`/auth/passkey/${id}`);
    },

    // ---- TOTP (compte settings) ----

    /** Génère un nouveau secret TOTP et retourne le QR code (ne l'active pas encore) */
    mfaSetupBegin: async (): Promise<{ qr_code: string; secret: string }> => {
        const response = await api.post('/auth/mfa/setup');
        return response.data;
    },

    /** Vérifie le code TOTP et active l'authentification par code */
    mfaSetupConfirm: async (code: string): Promise<User> => {
        const response = await api.post('/auth/mfa/setup/confirm', { code });
        return response.data.user as User;
    },

    /** Désactive l'authentification TOTP (nécessite au moins une passkey) */
    disableMfa: async (): Promise<User> => {
        const response = await api.delete('/auth/mfa');
        return response.data.user as User;
    },

    // ---- Changement de mot de passe via passkey ----

    /** Valide le mot de passe actuel et génère un challenge passkey */
    passkeyChangePasswordBegin: async (currentPassword: string) => {
        const response = await api.post('/auth/passkey/change-password/begin', {
            current_password: currentPassword,
        });
        return response.data as { options: Record<string, unknown>; challenge_token: string };
    },

    /** Vérifie la passkey et applique le nouveau mot de passe */
    passkeyChangePasswordComplete: async (
        newPassword: string,
        challengeToken: string,
        credential: unknown
    ) => {
        const response = await api.post('/auth/passkey/change-password/complete', {
            new_password: newPassword,
            challenge_token: challengeToken,
            credential,
        });
        return response.data;
    },

    /** Démarre une connexion standalone par passkey (découvrable, sans email/password) */
    passkeyLoginBegin: async () => {
        const response = await api.post('/auth/passkey/login/begin');
        return response.data as { options: Record<string, unknown>; challenge_token: string };
    },

    /** Finalise une connexion standalone par passkey */
    passkeyLoginComplete: async (challengeToken: string, credential: unknown) => {
        const response = await api.post('/auth/passkey/login/complete', {
            challenge_token: challengeToken,
            credential,
        });
        const { access_token, refresh_token, user } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        setManifestRole(user.role);
        return user;
    },

    /** Renomme une passkey enregistrée */
    renamePasskey: async (id: number, deviceName: string) => {
        const response = await api.patch(`/auth/passkey/${id}`, { device_name: deviceName });
        return response.data as { message: string; device_name: string };
    },

    /** Valide le lien de réinitialisation et génère un challenge passkey */
    passkeyResetPasswordBegin: async (resetToken: string) => {
        const response = await api.post('/auth/passkey/reset-password/begin', {
            reset_token: resetToken,
        });
        return response.data as { options: Record<string, unknown>; challenge_token: string };
    },

    /** Vérifie la passkey et applique le nouveau mot de passe (reset via lien) */
    passkeyResetPasswordComplete: async (
        newPassword: string,
        challengeToken: string,
        credential: unknown,
        resetToken: string
    ) => {
        const response = await api.post('/auth/passkey/reset-password/complete', {
            new_password: newPassword,
            challenge_token: challengeToken,
            credential,
            reset_token: resetToken,
        });
        return response.data;
    },

    /** Démarre l'enregistrement d'une passkey lors de l'activation du compte */
    passkeySetupBegin: async (userId: number, setupToken: string) => {
        const response = await api.post('/auth/passkey/setup/begin', { user_id: userId, setup_token: setupToken });
        return response.data as { options: Record<string, unknown>; challenge_token: string };
    },

    /** Finalise l'enregistrement d'une passkey lors de l'activation du compte */
    passkeySetupComplete: async (
        userId: number,
        challengeToken: string,
        credential: unknown,
        deviceName?: string
    ) => {
        const response = await api.post('/auth/passkey/setup/complete', {
            user_id: userId,
            challenge_token: challengeToken,
            credential,
            device_name: deviceName,
        });
        const { access_token, refresh_token, user } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        setManifestRole(user.role);
        return user;
    },

    /** Génère un jeton de transfert de session (5 min) pour l'onboarding PWA cross-device */
    generateSessionTransfer: async () => {
        const response = await api.post('/auth/session-transfer/generate');
        return response.data as { transfer_token: string; expires_in: number };
    },

    /** Valide un jeton de transfert de session et émet une paire de JWT */
    validateSessionTransfer: async (transferToken: string) => {
        const response = await api.post('/auth/session-transfer/validate', {
            transfer_token: transferToken,
        });
        const { access_token, refresh_token, user } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        setManifestRole(user.role);
        return user;
    },
};

// ========================================
// CATALOGUE DE PLATS
// ========================================

export interface DishCatalogItem {
    id: number;
    restaurant_id: number;
    category_id: number | null;
    name: string;
    image_url: string | null;
    usage_count: number;
    tags: DietaryTag[];
    certifications: CertificationItem[];
    created_at?: string;
}

export interface CategorySubstitution {
    id: number;
    menu_id: number;
    category_id: number;
    dish: DishCatalogItem;
    order: number;
}

export interface JourFerie {
    date: string;
    description: string;
}

export interface CatalogListResponse {
    dishes: DishCatalogItem[];
    total: number;
    page: number;
    per_page: number;
    has_more: boolean;
}

export const catalogApi = {
    list: async (params?: { category_id?: number; q?: string; sort?: 'usage' | 'name' | 'recent' }) => {
        const response = await api.get('/catalog', { params });
        return response.data.dishes as DishCatalogItem[];
    },

    listPaginated: async (params: { category_id?: number; q?: string; sort?: 'usage' | 'name' | 'recent'; page: number; per_page?: number }) => {
        const response = await api.get('/catalog', { params });
        return response.data as CatalogListResponse;
    },

    create: async (data: { name: string; category_id?: number | null; tag_ids?: string[]; certification_ids?: string[] }) => {
        const response = await api.post('/catalog', data);
        return response.data.dish as DishCatalogItem;
    },

    get: async (dishId: number) => {
        const response = await api.get(`/catalog/${dishId}`);
        return response.data.dish as DishCatalogItem;
    },

    update: async (dishId: number, data: { name?: string; category_id?: number | null; tag_ids?: string[]; certification_ids?: string[] }) => {
        const response = await api.put(`/catalog/${dishId}`, data);
        return response.data.dish as DishCatalogItem;
    },

    delete: async (dishId: number) => {
        await api.delete(`/catalog/${dishId}`);
    },

    uploadImage: async (dishId: number, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post(`/catalog/${dishId}/image`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
        });
        return response.data.dish as DishCatalogItem;
    },

    removeImage: async (dishId: number) => {
        const response = await api.delete(`/catalog/${dishId}/image`);
        return response.data;
    },

    getStats: async (dishId: number): Promise<DishStats> => {
        const response = await api.get(`/catalog/${dishId}/stats`);
        return response.data as DishStats;
    },

};

export interface DishStats {
    week: number;
    month: number;
    semester: number;
    year: number;
    history: { week: string; count: number }[];
    category_rank: number | null;
    similar_dishes: { id: number; name: string; month_count: number }[];
}

// ========================================
// API MENUS
// ========================================

export interface MenuItem {
    id?: number;
    menu_id?: number;
    category_id: number;
    dish_id: number;
    dish?: DishCatalogItem;
    order?: number;
    is_out_of_stock?: boolean;
}

export interface Menu {
    id: number;
    restaurant_id: number;
    date: string;
    status: 'draft' | 'published';
    items: MenuItem[];
    chef_note?: string;
    published_at?: string;
    substitutions?: Record<string, Array<{ dish: DishCatalogItem; order: number }>>;
}

export const menusApi = {
    getWeek: async (weekOffset = 0, restaurantId?: number) => {
        const params: Record<string, string | number> = { week_offset: weekOffset };
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/menus/week', { params });
        return response.data;
    },

    getByDate: async (date: string, restaurantId?: number): Promise<Menu | null> => {
        const params: Record<string, number> = {};
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get(`/menus/by-date/${date}`, { params });
        return response.data.menu ?? null;
    },

    save: async (
        date: string,
        items: Array<MenuItem | { category_id: number; dish_id?: number; name?: string; tag_ids?: string[]; certification_ids?: string[]; order?: number }>,
        restaurantId?: number,
        chefNote?: string
    ) => {
        const payload: Record<string, unknown> = { date, items, restaurant_id: restaurantId };
        if (chefNote !== undefined) payload.chef_note = chefNote;
        const response = await api.post('/menus', payload);
        return response.data.menu;
    },

    publish: async (menuId: number) => {
        const response = await api.post(`/menus/${menuId}/publish`);
        return response.data.menu;
    },

    unpublish: async (menuId: number) => {
        const response = await api.post(`/menus/${menuId}/unpublish`);
        return response.data.menu;
    },

    delete: async (menuId: number) => {
        await api.delete(`/menus/${menuId}`);
    },

    publishWeek: async (weekOffset = 0, restaurantId?: number) => {
        const response = await api.post('/menus/week/publish', {
            week_offset: weekOffset,
            restaurant_id: restaurantId
        });
        return response.data;
    },

    updateChefNote: async (menuId: number, chefNote: string | null) => {
        const response = await api.put(`/menus/${menuId}/chef-note`, {
            chef_note: chefNote,
        });
        return response.data.menu as Menu;
    },

    updateItemStock: async (menuId: number, itemId: number, isOutOfStock: boolean) => {
        const response = await api.patch(`/menus/${menuId}/items/${itemId}/stock`, {
            is_out_of_stock: isOutOfStock,
        });
        return response.data.item as MenuItem;
    },

    getSubstitutions: async (menuId: number) => {
        const response = await api.get(`/menus/${menuId}/substitutions`);
        return response.data.substitutions as Record<string, Array<{ dish: DishCatalogItem; order: number }>>;
    },

    updateSubstitutions: async (menuId: number, categoryId: number, dishIds: number[]) => {
        const response = await api.put(`/menus/${menuId}/substitutions/${categoryId}`, { dish_ids: dishIds });
        return response.data.substitutions as Record<string, Array<{ dish: DishCatalogItem; order: number }>>;
    },

    getJoursFeries: async (year: number): Promise<JourFerie[]> => {
        const response = await publicAxios.get(`/menus/jours-feries/${year}`, { timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data.jours_feries as JourFerie[];
    },

    // ——— Affichage public (sans auth) ———

    getToday: async (restaurantId?: number) => {
        const params: Record<string, number> = {};
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await publicAxios.get('/menus/today', { params, timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data;
    },

    getTomorrow: async (restaurantId?: number) => {
        const params: Record<string, number> = {};
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await publicAxios.get('/menus/tomorrow', { params, timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data;
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
        categories?: Record<string, number>;  // csv_column → category_id (int)
    };
    detected_date_format?: string;
}

export interface ColumnMapping {
    csv_column: string;
    target_field: 'date' | 'category' | 'ignore';
    category_id?: number;  // MenuCategory.id (integer)
}

export interface DateConfig {
    mode: 'from_file' | 'align_week' | 'start_date';
    start_date?: string;
    skip_weekends: boolean;
    date_format?: string;
    auto_detect_tags?: boolean;
}

/** Item construit depuis le CSV */
export interface CsvPreviewItem {
    category_id: number;
    name: string;
    order: number;
    tags: string[];
    certifications: string[];
}

export interface ImportPreviewResponse {
    menus: {
        date: string;
        date_display: string;
        items: CsvPreviewItem[];
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
        const response = await api.post('/imports/menus/upload', formData, {
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
        const response = await api.post('/imports/menus/preview', {
            file_id: fileId,
            column_mapping: columnMapping,
            date_config: dateConfig,
            restaurant_id: restaurantId
        });
        return response.data;
    },

    confirm: async (request: ImportConfirmRequest): Promise<ImportConfirmResponse> => {
        const response = await api.post('/imports/menus/confirm', request);
        return response.data;
    }
};

// ========================================
// IMPORT CATALOGUE (liste de plats)
// ========================================
export interface CatalogImportUploadResponse {
    file_id: string;
    filename: string;
    columns: string[];
    preview_rows: Record<string, string>[];
    row_count: number;
    delimiter: string | null;
    suggested_name_column: string | null;
}

export interface CatalogImportPreviewDish {
    name: string;
    tags: string[];            // IDs des tags alimentaires détectés
    certifications: string[];  // IDs des certifications détectées
    is_duplicate: boolean;
}

export interface CatalogImportPreviewResponse {
    dishes: CatalogImportPreviewDish[];
    total: number;
    new_count: number;
    duplicate_count: number;
}

export interface CatalogImportParams {
    file_id: string;
    name_column: string;
    tag_columns: string[];
    category_id: number;
    auto_detect_tags: boolean;
}

export interface CatalogImportResult {
    created_count: number;
    skipped_count: number;
}

export const catalogImportApi = {
    upload: async (file: File): Promise<CatalogImportUploadResponse> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/imports/catalog/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
        });
        return response.data;
    },

    preview: async (params: CatalogImportParams): Promise<CatalogImportPreviewResponse> => {
        const response = await api.post('/imports/catalog/preview', params);
        return response.data;
    },

    confirm: async (params: CatalogImportParams): Promise<CatalogImportResult> => {
        const response = await api.post('/imports/catalog/confirm', params);
        return response.data;
    },
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

    // ——— Affichage public (sans auth) ———

    getPublic: async (visibility?: 'tv' | 'mobile', restaurantId?: number) => {
        const params: Record<string, string | number> = {};
        if (visibility) params.visibility = visibility;
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await publicAxios.get('/events', { params, timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data as {
            today_event: Event | null;
            upcoming_events: Event[];
            events: Event[];
        };
    },
};

// ========================================
// API FERMETURES EXCEPTIONNELLES
// ========================================
export interface ExceptionalClosure {
    id: number;
    restaurant_id: number;
    start_date: string;      // YYYY-MM-DD
    end_date: string;        // YYYY-MM-DD — equals start_date for single-day closure
    reason?: string;
    description?: string;
    is_active: boolean;
    is_current: boolean;     // true if today is within [start_date, end_date]
    notified_7d: boolean;
    notified_1d: boolean;
    created_at?: string;
    updated_at?: string;
}

export const closuresApi = {
    list: async (upcoming = false, restaurantId?: number, includeInactive = false) => {
        const params: Record<string, string | number | boolean> = {
            upcoming: String(upcoming),
            include_inactive: String(includeInactive),
        };
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await api.get('/closures', { params });
        return response.data.closures as ExceptionalClosure[];
    },

    create: async (closure: Partial<ExceptionalClosure>) => {
        const response = await api.post('/closures', closure);
        return response.data.closure as ExceptionalClosure;
    },

    update: async (id: number, closure: Partial<ExceptionalClosure>) => {
        const response = await api.put(`/closures/${id}`, closure);
        return response.data.closure as ExceptionalClosure;
    },

    delete: async (id: number) => {
        await api.delete(`/closures/${id}`);
    },

    // ——— Affichage public (sans auth) ———
    getPublic: async (restaurantId?: number) => {
        const params: Record<string, number> = {};
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await publicAxios.get('/closures', { params, timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data as {
            current_closure: ExceptionalClosure | null;
            upcoming_closures: ExceptionalClosure[];
            closures: ExceptionalClosure[];
        };
    },
};


// ========================================
// API CATÉGORIES DE MENU
// ========================================
export const categoriesApi = {
    list: async (): Promise<{ categories: MenuCategory[] }> => {
        const response = await api.get('/settings/categories');
        return response.data;
    },

    create: async (data: { label: string; order?: number; parent_id?: number | null }) => {
        const response = await api.post('/settings/categories', data);
        return response.data.category as MenuCategory;
    },

    update: async (id: number, data: Partial<{ label: string; order: number; is_highlighted: boolean }>) => {
        const response = await api.put(`/settings/categories/${id}`, data);
        return response.data.category as MenuCategory;
    },

    delete: async (id: number) => {
        await api.delete(`/settings/categories/${id}`);
    },

    reorder: async (items: Array<{ id: number; order: number }>) => {
        await api.put('/settings/categories/reorder', { items });
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
    passkeys_count?: number;
}

export interface PasskeyInfo {
    id: number;
    device_name: string;
    transports: string[];
    created_at: string | null;
    last_used_at: string | null;
}

export const adminApi = {
    // Utilisateurs
    listUsers: async () => {
        const response = await api.get('/users');
        return response.data.users;
    },

    updateUser: async (id: number, data: Partial<User>) => {
        const response = await api.put(`/users/${id}`, data);
        return response.data.user;
    },

    deleteUser: async (id: number) => {
        await api.delete(`/users/${id}`);
    },

    resetUserMfa: async (id: number) => {
        const response = await api.post(`/users/${id}/reset-mfa`);
        return response.data;
    },

    // Invitations
    createInvitation: async (email: string, role: 'admin' | 'editor' | 'reader') => {
        const response = await api.post('/users/invite', { email, role });
        return response.data.invitation;
    },

    listInvitations: async () => {
        const response = await api.get('/users/invitations');
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
        const response = await api.get('/audit-logs', { params });
        return response.data;
    },

    exportAuditLogs: async (params?: {
        action?: string;
        user_id?: number;
        start_date?: string;
        end_date?: string;
    }) => {
        const response = await api.get('/audit-logs/export', {
            params,
            responseType: 'blob'
        });

        // Créer un lien de téléchargement
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${parisToday()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    },

    // Restaurants
    listRestaurants: async () => {
        const response = await api.get('/restaurants');
        return response.data.restaurants;
    },

    createRestaurant: async (data: { name: string; code: string; address?: string }) => {
        const response = await api.post('/restaurants', data);
        return response.data.restaurant;
    },

    updateRestaurant: async (id: number, data: Partial<{ name: string; address: string; is_active: boolean }>) => {
        const response = await api.put(`/restaurants/${id}`, data);
        return response.data.restaurant;
    },

    // Settings
    getSettings: async () => {
        const response = await api.get('/settings');
        return response.data.restaurant;
    },

    updateSettings: async (data: RestaurantSettings) => {
        const response = await api.put('/settings', data);
        return response.data.restaurant;
    },

    getCalendarSettings: async (): Promise<CalendarSettings> => {
        const response = await api.get('/restaurant/calendar-settings');
        return response.data as CalendarSettings;
    },

    updateCalendarSettings: async (settings: Partial<CalendarSettings>): Promise<CalendarSettings> => {
        const response = await api.put('/restaurant/calendar-settings', settings);
        return response.data as CalendarSettings;
    },

    getVacancesScolaires: async (year: number, zone: 'A' | 'B' | 'C'): Promise<VacanceScolaire[]> => {
        const response = await api.get(`/menus/vacances-scolaires/${year}`, { params: { zone } });
        return response.data.vacances as VacanceScolaire[];
    },
};

// ========================================
// TYPES DE CONFIGURATION RESTAURANT
// ========================================
export interface MenuCategory {
    id: number;
    restaurant_id?: number;
    parent_id: number | null;
    label: string;
    order: number;
    is_protected: boolean;
    is_highlighted: boolean;
    color_key?: string | null;
    subcategories?: MenuCategory[];
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

export type ServiceHoursDay = { open: string; close: string };
export type ServiceHours = Record<string, ServiceHoursDay>; // key = day index as string "0"…"6"

export interface RestaurantConfig {
    service_days: number[];
    service_hours: ServiceHours;
    menu_categories: MenuCategory[];
    dietary_tags: DietaryTag[];
    certifications: CertificationItem[];
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

// ========================================
// API INBOX (notifications in-app)
// ========================================
export interface InboxNotification {
    id: number;
    type: 'business_alert' | 'user_action' | string;
    title: string;
    body?: string | null;
    is_read: boolean;
    meta?: Record<string, unknown> | null;
    created_at: string;
    user_id?: number | null;
}

export interface CalendarSettings {
    show_public_holidays: boolean;
    show_school_vacations: boolean;
    school_vacation_zone: 'A' | 'B' | 'C' | null;
}

export interface VacanceScolaire {
    start_date: string;
    end_date: string;
    description: string;
}

export interface NotifPreferences {
    notify_menu_unpublished: boolean;
    notify_menu_during_service: boolean;
    notify_holiday_approaching: boolean;
    holiday_alert_days_before: number;
}

export interface LiveAlert {
    key: string;
    title: string;
    body: string;
    severity: 'error' | 'warning' | 'info';
}

export const inboxApi = {
    list: async (): Promise<InboxNotification[]> => {
        const response = await api.get('/inbox');
        return response.data.notifications as InboxNotification[];
    },

    unreadCount: async (): Promise<number> => {
        const response = await api.get('/inbox/unread-count');
        return response.data.count as number;
    },

    markRead: async (id: number): Promise<void> => {
        await api.put(`/inbox/${id}/read`);
    },

    markAllRead: async (): Promise<void> => {
        await api.put('/inbox/read-all');
    },

    delete: async (id: number): Promise<void> => {
        await api.delete(`/inbox/${id}`);
    },

    getNotifPreferences: async (): Promise<NotifPreferences> => {
        const response = await api.get('/inbox/notification-preferences');
        return response.data as NotifPreferences;
    },

    updateNotifPreferences: async (prefs: Partial<NotifPreferences>): Promise<NotifPreferences> => {
        const response = await api.put('/inbox/notification-preferences', prefs);
        return response.data as NotifPreferences;
    },

    getLiveAlerts: async (): Promise<LiveAlert[]> => {
        const response = await api.get('/inbox/live-alerts');
        return response.data.alerts as LiveAlert[];
    },
};

// ── Base Adresse Nationale (IGN Géoplateforme) ──────────────────────────────

export interface BanSuggestion {
    label: string;
    lat: number;
    lon: number;
}

export const banApi = {
    search: async (q: string): Promise<BanSuggestion[]> => {
        if (!q || q.length < 3) return [];
        const url = new URL('https://data.geopf.fr/geocodage/completion');
        url.searchParams.set('text', q);
        url.searchParams.set('maximumResponses', '6');
        url.searchParams.set('type', 'StreetAddress,PositionOfInterest');
        const res = await fetch(url.toString());
        if (!res.ok) return [];
        const json = await res.json();
        return (json.results ?? []).map((r: { fulltext: string; x: number; y: number }) => ({
            label: r.fulltext,
            lat: r.y,
            lon: r.x,
        }));
    },
};

// ========================================
// API PUBLIQUE (sans auth)
// ========================================
export const publicApi = {
    getWeekMenu: async (weekOffset = 0, restaurantId?: number) => {
        const params: Record<string, number> = { week_offset: weekOffset };
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await publicAxios.get('/menus/week', { params, timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data;
    },

    getRestaurant: async (restaurantId?: number) => {
        const params: Record<string, number> = {};
        if (restaurantId) params.restaurant_id = restaurantId;
        const response = await publicAxios.get('/restaurant', { params, timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data.restaurant;
    },

    getTaxonomy: async (): Promise<TaxonomyData> => {
        const response = await publicAxios.get('/taxonomy', { timeout: PUBLIC_API_TIMEOUT_MS });
        return response.data as TaxonomyData;
    },
};
