import { api, publicAxios, PUBLIC_API_TIMEOUT_MS } from './client';

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

  getPublic: async (restaurantSlug: string, visibility?: 'tv' | 'mobile') => {
    const params: Record<string, string> = {};
    if (visibility) params.visibility = visibility;
    const response = await publicAxios.get(`/public/${restaurantSlug}/events`, {
      params,
      timeout: PUBLIC_API_TIMEOUT_MS,
    });
    return response.data as {
      today_event: Event | null;
      upcoming_events: Event[];
      events: Event[];
    };
  },
};
