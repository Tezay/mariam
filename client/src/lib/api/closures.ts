import { api, publicAxios, PUBLIC_API_TIMEOUT_MS, sitePath, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type Closure = Schemas['Closure'];
export type ClosureInput = Schemas['ClosureInput'];
export type ClosurePatch = Schemas['ClosurePatch'];

export interface ClosureRange {
  from?: string;
  to?: string;
}

function closuresPath(ref: SiteRef): string {
  return `${sitePath(ref)}/closures`;
}

export const closuresApi = {
  /** Closures under way or to come, read without a session. */
  listPublished: async (ref: SiteRef): Promise<Closure[]> =>
    (await publicAxios.get(closuresPath(ref), { timeout: PUBLIC_API_TIMEOUT_MS })).data.items,

  /** Those that overlap the range; without `from`, past ones as well. */
  list: async (ref: SiteRef, range: ClosureRange = {}): Promise<Closure[]> =>
    (await api.get(closuresPath(ref), { params: range })).data.items,

  create: async (ref: SiteRef, closure: ClosureInput): Promise<Closure> =>
    (await api.post(closuresPath(ref), closure)).data,

  update: async (ref: SiteRef, id: number, patch: ClosurePatch): Promise<Closure> =>
    (await api.patch(`${closuresPath(ref)}/${id}`, patch)).data,

  remove: async (ref: SiteRef, id: number): Promise<void> => {
    await api.delete(`${closuresPath(ref)}/${id}`);
  },
};
