import { api, publicAxios, PUBLIC_API_TIMEOUT_MS } from './client';
import type { components } from './schema.gen';

export type Holiday = components['schemas']['Holiday'];
export type SchoolHoliday = components['schemas']['SchoolHoliday'];
export type SchoolZone = 'A' | 'B' | 'C';

export const holidaysApi = {
  list: async (year: number): Promise<Holiday[]> =>
    (await publicAxios.get(`/holidays/${year}`, { timeout: PUBLIC_API_TIMEOUT_MS })).data.items,

  listSchool: async (year: number, zone: SchoolZone): Promise<SchoolHoliday[]> =>
    (await api.get(`/school-holidays/${year}`, { params: { zone } })).data.items,
};
