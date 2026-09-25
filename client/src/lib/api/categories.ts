import { api } from './client';

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

export const categoriesApi = {
  list: async (restaurantId?: number): Promise<{ categories: MenuCategory[] }> => {
    const response = await api.get('/settings/categories', {
      headers: restaurantId ? { 'X-Restaurant-Id': String(restaurantId) } : undefined,
    });
    return response.data;
  },

  create: async (data: {
    label: string;
    order?: number;
    parent_id?: number | null;
    move_dishes?: boolean;
  }) => {
    const response = await api.post('/settings/categories', data);
    return response.data.category as MenuCategory;
  },

  update: async (
    id: number,
    data: Partial<{ label: string; order: number; is_highlighted: boolean }>
  ) => {
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
