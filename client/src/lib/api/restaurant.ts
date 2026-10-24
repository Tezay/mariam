import { api } from './client';

export interface AdminSite {
  id: number;
  name: string;
  slug?: string | null;
}

export const restaurantApi = {
  list: async (): Promise<AdminSite[]> => {
    const response = await api.get('/restaurants');
    return (response.data.restaurants ?? []) as AdminSite[];
  },
};
