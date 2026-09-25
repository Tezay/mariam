import { api } from './client';

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

export interface NotifPreferences {
  notify_menu_unpublished: boolean;
  notify_menu_during_service: boolean;
  notify_menu_tomorrow: boolean;
  notify_traffic_drop: boolean;
  notify_low_satisfaction: boolean;
  notify_vote_anomaly: boolean;
  notify_site_inactive: boolean;
  notify_holiday_approaching: boolean;
  holiday_alert_days_before: number;
  weekly_digest: boolean;
  /** Day of week (Monday = 0) and whole hour, in Paris, of the weekly email. */
  digest_day: number;
  digest_hour: number;
}

export interface LiveAlert {
  key: string;
  title: string;
  body: string;
  /** Sites the alert caught; empty when the rule is not site-scoped. */
  site_ids: number[];
  site_names: string[];
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
