import { api, publicAxios, PUBLIC_API_TIMEOUT_MS, sitePath, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type News = Schemas['News'];
export type NewsImage = Schemas['Image'];
export type NewsInput = Schemas['NewsInput'];
export type NewsPatch = Schemas['NewsPatch'];
export type NewsList = Schemas['NewsList'];
/** An image as the site's editors read it, with its `id`. */
export type StoredImage = NewsImage & { id: number };

export function storedImages(images: NewsImage[]): StoredImage[] {
  return images.filter((image): image is StoredImage => image.id !== undefined);
}

export interface NewsQuery {
  sort?: 'published' | 'date';
  from?: string;
  to?: string;
  status?: 'draft' | 'published';
  page?: number;
  per_page?: number;
}

export type DatedNews = News & { date: string };

export const isDated = (item: News): item is DatedNews => item.date !== null;

function newsPath(ref: SiteRef): string {
  return `${sitePath(ref)}/news`;
}

export const newsApi = {
  /** The published items dated from `from` on, soonest first, read without a session. */
  listPublished: async (ref: SiteRef, visibility: 'mobile' | 'tv', from: string): Promise<News[]> =>
    (
      await publicAxios.get(newsPath(ref), {
        timeout: PUBLIC_API_TIMEOUT_MS,
        params: { visibility, sort: 'date', from },
      })
    ).data.items,

  /** One page, drafts included. */
  list: async (ref: SiteRef, query: NewsQuery = {}): Promise<NewsList> =>
    (await api.get(newsPath(ref), { params: query })).data,

  get: async (ref: SiteRef, id: number): Promise<News> =>
    (await api.get(`${newsPath(ref)}/${id}`)).data,

  create: async (ref: SiteRef, item: NewsInput): Promise<News> =>
    (await api.post(newsPath(ref), item)).data,

  update: async (ref: SiteRef, id: number, patch: NewsPatch): Promise<News> =>
    (await api.patch(`${newsPath(ref)}/${id}`, patch)).data,

  remove: async (ref: SiteRef, id: number): Promise<void> => {
    await api.delete(`${newsPath(ref)}/${id}`);
  },

  publish: async (ref: SiteRef, id: number): Promise<News> =>
    (await api.post(`${newsPath(ref)}/${id}/publish`)).data,

  unpublish: async (ref: SiteRef, id: number): Promise<News> =>
    (await api.post(`${newsPath(ref)}/${id}/unpublish`)).data,

  duplicate: async (ref: SiteRef, id: number, date?: string): Promise<News> =>
    (await api.post(`${newsPath(ref)}/${id}/duplicate`, date ? { date } : {})).data,

  uploadImage: async (ref: SiteRef, newsId: number, file: File): Promise<NewsImage> => {
    const formData = new FormData();
    formData.append('file', file);
    return (
      await api.post(`${newsPath(ref)}/${newsId}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      })
    ).data;
  },

  deleteImage: async (ref: SiteRef, newsId: number, imageId: number): Promise<void> => {
    await api.delete(`${newsPath(ref)}/${newsId}/images/${imageId}`);
  },

  orderImages: async (ref: SiteRef, newsId: number, imageIds: number[]): Promise<NewsImage[]> =>
    (await api.put(`${newsPath(ref)}/${newsId}/images/order`, { image_ids: imageIds })).data.items,
};
