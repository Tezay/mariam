import axios from 'axios';
import { API_URL } from '../runtime-config';
import { publicAxios, PUBLIC_API_TIMEOUT_MS } from './client';
import type { TaxonomyData } from './taxonomy';

export const publicApi = {
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
