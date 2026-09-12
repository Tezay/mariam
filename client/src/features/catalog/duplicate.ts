import { isAxiosError } from 'axios';

export interface DuplicateDish {
  id: number;
  name: string;
}

/** The dish a 409 points at: a name already taken in the target category. */
export function duplicateFrom(error: unknown): DuplicateDish | null {
  if (!isAxiosError(error) || error.response?.status !== 409) return null;
  const data = error.response.data as { dish_id?: number; dish_name?: string } | undefined;
  if (typeof data?.dish_id !== 'number') return null;
  return { id: data.dish_id, name: data.dish_name ?? 'Ce plat' };
}
