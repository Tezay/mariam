import { api, sitePath, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type MenuCategory = Schemas['MenuCategory'];
export type MenuCategoryInput = Schemas['MenuCategoryInput'];
export type MenuCategoryPatch = Schemas['MenuCategoryPatch'];

function categoriesPath(ref: SiteRef): string {
  return `${sitePath(ref)}/categories`;
}

export const categoriesApi = {
  list: async (ref: SiteRef): Promise<MenuCategory[]> =>
    (await api.get(categoriesPath(ref))).data.items,

  create: async (ref: SiteRef, category: MenuCategoryInput): Promise<MenuCategory> =>
    (await api.post(categoriesPath(ref), category)).data,

  update: async (ref: SiteRef, id: number, patch: MenuCategoryPatch): Promise<MenuCategory> =>
    (await api.patch(`${categoriesPath(ref)}/${id}`, patch)).data,

  remove: async (ref: SiteRef, id: number): Promise<void> => {
    await api.delete(`${categoriesPath(ref)}/${id}`);
  },

  /** Every category of one level, in its new order; answers the whole tree. */
  order: async (ref: SiteRef, categoryIds: number[]): Promise<MenuCategory[]> =>
    (await api.put(`${categoriesPath(ref)}/order`, { category_ids: categoryIds })).data.items,
};
