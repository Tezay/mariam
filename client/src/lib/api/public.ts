import axios from 'axios';
import { API_URL } from '../runtime-config';
import { publicAxios, PUBLIC_API_TIMEOUT_MS } from './client';
import type { TaxonomyData } from './taxonomy';

export interface PublicSite {
  slug: string;
  name: string;
  logo_url?: string | null;
}

export interface PublicOrg {
  organization: { name: string; slug: string };
  sites: PublicSite[];
}

export const publicApi = {
  getRestaurant: async (restaurantSlug: string) => {
    const response = await publicAxios.get(`/public/${restaurantSlug}/restaurant`, {
      timeout: PUBLIC_API_TIMEOUT_MS,
    });
    return response.data.restaurant;
  },

  getTaxonomy: async (): Promise<TaxonomyData> => {
    const response = await publicAxios.get('/taxonomy', { timeout: PUBLIC_API_TIMEOUT_MS });
    return response.data as TaxonomyData;
  },

  // /health sits outside the versioned API, so it is addressed from the API root.
  getServerVersion: async (): Promise<string | null> => {
    const response = await axios.get(API_URL.replace(/\/v1\/?$/, '') + '/health', {
      timeout: PUBLIC_API_TIMEOUT_MS,
    });
    return (response.data as { version?: string }).version ?? null;
  },
};
