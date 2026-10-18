import { isAxiosError } from 'axios';
import { api, publicAxios, PUBLIC_API_TIMEOUT_MS, sitePath, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type Menu = Schemas['Menu'];
export type MenuCategoryNode = Schemas['PublicCategory'];
export type MenuItem = Schemas['PublicMenuItem'];
export type MenuDish = Schemas['PublicDish'];
export type MenuItemInput = Schemas['MenuItemInput'];
export type Substitute = Schemas['PublicSubstitution'];
export type Vote = Schemas['Vote'];
export type VoteState = Schemas['VoteState'];
export type VoteDishGroup = Schemas['DishGroup'];
export type VoteInput = Schemas['VoteInput'];

export type MenuDayStatus = 'published' | 'draft' | 'missing' | 'closed';

const publicOptions = { timeout: PUBLIC_API_TIMEOUT_MS };

function menusPath(ref: SiteRef): string {
  return `${sitePath(ref)}/menus`;
}

export const menusApi = {
  /** Published menus of the site's window, read without a session. */
  listPublished: async (ref: SiteRef, from: string, to: string): Promise<Menu[]> =>
    (await publicAxios.get(menusPath(ref), { ...publicOptions, params: { from, to } })).data.items,

  getVote: async (ref: SiteRef, date: string, deviceId: string): Promise<VoteState> =>
    (
      await publicAxios.get(`${menusPath(ref)}/${date}/vote`, {
        ...publicOptions,
        headers: { 'Device-Id': deviceId },
      })
    ).data,

  putVote: async (ref: SiteRef, date: string, deviceId: string, vote: VoteInput): Promise<Vote> =>
    (
      await publicAxios.put(`${menusPath(ref)}/${date}/vote`, vote, {
        ...publicOptions,
        headers: { 'Device-Id': deviceId },
      })
    ).data,

  /** Every menu of the range, drafts included. */
  list: async (ref: SiteRef, from: string, to: string): Promise<Menu[]> =>
    (await api.get(menusPath(ref), { params: { from, to } })).data.items,

  get: async (ref: SiteRef, date: string): Promise<Menu | null> => {
    try {
      return (await api.get(`${menusPath(ref)}/${date}`)).data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) return null;
      throw error;
    }
  },

  put: async (
    ref: SiteRef,
    date: string,
    items: MenuItemInput[],
    chefNote: string | null
  ): Promise<Menu> =>
    (await api.put(`${menusPath(ref)}/${date}`, { items, chef_note: chefNote })).data,

  setChefNote: async (ref: SiteRef, date: string, chefNote: string | null): Promise<Menu> =>
    (await api.patch(`${menusPath(ref)}/${date}`, { chef_note: chefNote })).data,

  remove: async (ref: SiteRef, date: string): Promise<void> => {
    await api.delete(`${menusPath(ref)}/${date}`);
  },

  publish: async (ref: SiteRef, date: string): Promise<Menu> =>
    (await api.post(`${menusPath(ref)}/${date}/publish`)).data,

  unpublish: async (ref: SiteRef, date: string): Promise<Menu> =>
    (await api.post(`${menusPath(ref)}/${date}/unpublish`)).data,

  setItemStock: async (
    ref: SiteRef,
    date: string,
    itemId: number,
    isOutOfStock: boolean
  ): Promise<MenuItem> =>
    (
      await api.patch(`${menusPath(ref)}/${date}/items/${itemId}`, {
        is_out_of_stock: isOutOfStock,
      })
    ).data,

  setSubstitutes: async (
    ref: SiteRef,
    date: string,
    categoryId: number,
    dishIds: number[]
  ): Promise<Substitute[]> =>
    (
      await api.put(`${menusPath(ref)}/${date}/substitutions/${categoryId}`, {
        dish_ids: dishIds,
      })
    ).data.items,
};
