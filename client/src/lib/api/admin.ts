import { api } from './client';

export interface UiPreferences {
  tour_done: boolean;
  tour_catalog_done: boolean;
  tour_stats_done: boolean;
}

export const adminApi = {
  getUiPreferences: async (): Promise<UiPreferences> => {
    const response = await api.get('/users/me/ui-preferences');
    return response.data as UiPreferences;
  },

  updateUiPreferences: async (prefs: Partial<UiPreferences>): Promise<UiPreferences> => {
    const response = await api.put('/users/me/ui-preferences', prefs);
    return response.data as UiPreferences;
  },
};
