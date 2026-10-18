import { api, sitePath, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type MenuImport = Schemas['MenuImport'];
export type ColumnMapping = Schemas['ColumnMapping'];
export type DateConfig = Schemas['DateConfig'];
export type MenuImportPreview = Schemas['MenuImportPreview'];
export type MenuImportConfirm = Schemas['MenuImportConfirm'];
export type MenuImportResult = Schemas['MenuImportResult'];
export type DishImport = Schemas['DishImport'];
export type DishImportInput = Schemas['DishImportInput'];
export type DishImportPreview = Schemas['DishImportPreview'];
export type DishImportResult = Schemas['DishImportResult'];

async function send(path: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return (
    await api.post(path, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    })
  ).data;
}

export const menuImportsApi = {
  create: async (ref: SiteRef, file: File): Promise<MenuImport> =>
    send(`${sitePath(ref)}/menu-imports`, file),

  preview: async (
    ref: SiteRef,
    importId: string,
    columnMapping: ColumnMapping[],
    dateConfig: DateConfig
  ): Promise<MenuImportPreview> =>
    (
      await api.post(`${sitePath(ref)}/menu-imports/${importId}/preview`, {
        column_mapping: columnMapping,
        date_config: dateConfig,
      })
    ).data,

  confirm: async (
    ref: SiteRef,
    importId: string,
    request: MenuImportConfirm
  ): Promise<MenuImportResult> =>
    (await api.post(`${sitePath(ref)}/menu-imports/${importId}/confirm`, request)).data,
};

export const dishImportsApi = {
  create: async (ref: SiteRef, file: File): Promise<DishImport> =>
    send(`${sitePath(ref)}/dish-imports`, file),

  preview: async (
    ref: SiteRef,
    importId: string,
    params: DishImportInput
  ): Promise<DishImportPreview> =>
    (await api.post(`${sitePath(ref)}/dish-imports/${importId}/preview`, params)).data,

  confirm: async (
    ref: SiteRef,
    importId: string,
    params: DishImportInput
  ): Promise<DishImportResult> =>
    (await api.post(`${sitePath(ref)}/dish-imports/${importId}/confirm`, params)).data,
};
