import { api, publicAxios, PUBLIC_API_TIMEOUT_MS } from './client';

export interface ExceptionalClosure {
  id: number;
  restaurant_id: number;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD — equals start_date for single-day closure
  reason?: string;
  description?: string;
  is_active: boolean;
  is_current: boolean;
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

  getPublic: async (restaurantSlug: string) => {
    const response = await publicAxios.get(`/public/${restaurantSlug}/closures`, {
      timeout: PUBLIC_API_TIMEOUT_MS,
    });
    return response.data as {
      current_closure: ExceptionalClosure | null;
      upcoming_closures: ExceptionalClosure[];
      closures: ExceptionalClosure[];
    };
  },
};
