import { api, sitePath, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type Quality = Schemas['Quality'];
export type EgalimDeclaration = Schemas['EgalimDeclaration'];
export type EgalimDeclarationInput = Schemas['EgalimDeclarationInput'];

const declarationsPath = (ref: SiteRef) => `${sitePath(ref)}/egalim-declarations`;

export const qualityApi = {
  listDeclarations: async (ref: SiteRef): Promise<EgalimDeclaration[]> =>
    (await api.get(declarationsPath(ref))).data.items,

  putDeclaration: async (
    ref: SiteRef,
    year: number,
    input: EgalimDeclarationInput
  ): Promise<EgalimDeclaration> => (await api.put(`${declarationsPath(ref)}/${year}`, input)).data,

  deleteDeclaration: async (ref: SiteRef, year: number): Promise<void> => {
    await api.delete(`${declarationsPath(ref)}/${year}`);
  },
};
