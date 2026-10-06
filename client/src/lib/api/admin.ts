import { parisToday } from '../date-utils';
import { api } from './client';
import type { User } from './auth';
import type { RestaurantSettings } from './restaurant';

export interface UiPreferences {
  tour_done: boolean;
  tour_catalog_done: boolean;
  tour_stats_done: boolean;
}

export interface Invitation {
  id: number;
  token: string;
  /** Suggested by the inviter; the invitee may enter another. */
  email: string | null;
  role: User['role'];
  expires_at: string;
  created_by_name: string | null;
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

export const adminApi = {
  getUiPreferences: async (): Promise<UiPreferences> => {
    const response = await api.get('/users/me/ui-preferences');
    return response.data as UiPreferences;
  },

  updateUiPreferences: async (prefs: Partial<UiPreferences>): Promise<UiPreferences> => {
    const response = await api.put('/users/me/ui-preferences', prefs);
    return response.data as UiPreferences;
  },

  listUsers: async () => {
    const response = await api.get('/users');
    return response.data.users;
  },

  updateUser: async (id: number, data: Partial<User>) => {
    const response = await api.put(`/users/${id}`, data);
    return response.data.user;
  },

  deleteUser: async (id: number, stepUpToken: string) => {
    await api.delete(`/users/${id}`, { headers: { 'X-Step-Up-Token': stepUpToken } });
  },

  resetUserMfa: async (id: number, stepUpToken: string) => {
    await api.post(`/users/${id}/reset-mfa`, null, {
      headers: { 'X-Step-Up-Token': stepUpToken },
    });
  },

  createInvitation: async (role: User['role'], email?: string): Promise<Invitation> => {
    const response = await api.post('/users/invite', { role, email });
    return response.data.invitation;
  },

  listInvitations: async (): Promise<Invitation[]> => {
    const response = await api.get('/users/invitations');
    return response.data.invitations;
  },

  revokeInvitation: async (id: number) => {
    await api.delete(`/users/invitations/${id}`);
  },

  getAuditLogs: async (params?: {
    page?: number;
    per_page?: number;
    action?: string;
    user_id?: number;
    restaurant_id?: number;
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
      responseType: 'blob',
    });

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

  listRestaurants: async () => {
    const response = await api.get('/restaurants');
    return response.data.restaurants;
  },

  createRestaurant: async (data: { name: string; code: string; address?: string }) => {
    const response = await api.post('/restaurants', data);
    return response.data.restaurant;
  },

  updateRestaurant: async (
    id: number,
    data: Partial<{ name: string; address: string; is_active: boolean }>
  ) => {
    const response = await api.put(`/restaurants/${id}`, data);
    return response.data.restaurant;
  },

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

  updateCalendarSettings: async (
    settings: Partial<CalendarSettings>
  ): Promise<CalendarSettings> => {
    const response = await api.put('/restaurant/calendar-settings', settings);
    return response.data as CalendarSettings;
  },

  getVacancesScolaires: async (year: number, zone: 'A' | 'B' | 'C'): Promise<VacanceScolaire[]> => {
    const response = await api.get(`/menus/vacances-scolaires/${year}`, { params: { zone } });
    return response.data.vacances as VacanceScolaire[];
  },
};
