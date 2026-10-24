import { api, publicAxios, PUBLIC_API_TIMEOUT_MS, sitePath, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type Event = Schemas['Event'];
export type EventImage = Schemas['Image'];
export type EventInput = Schemas['EventInput'];
export type EventPatch = Schemas['EventPatch'];
/** An image as the site's editors read it, with its `id`. */
export type StoredImage = EventImage & { id: number };

export function storedImages(images: EventImage[]): StoredImage[] {
  return images.filter((image): image is StoredImage => image.id !== undefined);
}

export interface EventRange {
  from?: string;
  to?: string;
}

function eventsPath(ref: SiteRef): string {
  return `${sitePath(ref)}/events`;
}

export const eventsApi = {
  /** Published events from today on, read without a session. */
  listPublished: async (ref: SiteRef, visibility: 'mobile' | 'tv'): Promise<Event[]> =>
    (
      await publicAxios.get(eventsPath(ref), {
        timeout: PUBLIC_API_TIMEOUT_MS,
        params: { visibility },
      })
    ).data.items,

  /** Drafts included; without `from`, past events as well. */
  list: async (ref: SiteRef, range: EventRange = {}): Promise<Event[]> =>
    (await api.get(eventsPath(ref), { params: range })).data.items,

  get: async (ref: SiteRef, id: number): Promise<Event> =>
    (await api.get(`${eventsPath(ref)}/${id}`)).data,

  create: async (ref: SiteRef, event: EventInput): Promise<Event> =>
    (await api.post(eventsPath(ref), event)).data,

  update: async (ref: SiteRef, id: number, patch: EventPatch): Promise<Event> =>
    (await api.patch(`${eventsPath(ref)}/${id}`, patch)).data,

  remove: async (ref: SiteRef, id: number): Promise<void> => {
    await api.delete(`${eventsPath(ref)}/${id}`);
  },

  publish: async (ref: SiteRef, id: number): Promise<Event> =>
    (await api.post(`${eventsPath(ref)}/${id}/publish`)).data,

  unpublish: async (ref: SiteRef, id: number): Promise<Event> =>
    (await api.post(`${eventsPath(ref)}/${id}/unpublish`)).data,

  duplicate: async (ref: SiteRef, id: number, date?: string): Promise<Event> =>
    (await api.post(`${eventsPath(ref)}/${id}/duplicate`, date ? { date } : {})).data,

  uploadImage: async (ref: SiteRef, eventId: number, file: File): Promise<EventImage> => {
    const formData = new FormData();
    formData.append('file', file);
    return (
      await api.post(`${eventsPath(ref)}/${eventId}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      })
    ).data;
  },

  deleteImage: async (ref: SiteRef, eventId: number, imageId: number): Promise<void> => {
    await api.delete(`${eventsPath(ref)}/${eventId}/images/${imageId}`);
  },

  orderImages: async (ref: SiteRef, eventId: number, imageIds: number[]): Promise<EventImage[]> =>
    (await api.put(`${eventsPath(ref)}/${eventId}/images/order`, { image_ids: imageIds })).data
      .items,
};
