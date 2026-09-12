import type { CertificationItem, DietaryTag } from '@/lib/api';

export interface DishDraft {
  name: string;
  categoryId: number | null;
  tagIds: string[];
  certIds: string[];
}

export function draftOf(dish: {
  name: string;
  category_id: number | null;
  tags: DietaryTag[];
  certifications: CertificationItem[];
}): DishDraft {
  return {
    name: dish.name,
    categoryId: dish.category_id,
    tagIds: dish.tags.map((tag) => tag.id),
    certIds: dish.certifications.map((cert) => cert.id),
  };
}

export function countChanges(draft: DishDraft, baseline: DishDraft): number {
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  return [
    draft.name.trim() !== baseline.name.trim(),
    draft.categoryId !== baseline.categoryId,
    !sameSet(draft.tagIds, baseline.tagIds),
    !sameSet(draft.certIds, baseline.certIds),
  ].filter(Boolean).length;
}
