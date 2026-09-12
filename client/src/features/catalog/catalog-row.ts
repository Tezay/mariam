import {
  ArrowDownAZ,
  Building2,
  Clock,
  Image as ImageIcon,
  Star,
  UtensilsCrossed,
} from 'lucide-react';
import type {
  CertificationItem,
  DietaryTag,
  DishCatalogItem,
  DishSort,
  OrgCatalogDish,
  OrgCatalogSort,
} from '@/lib/api';

export type CatalogScope = 'site' | 'org';

/**
 * One line of either catalogue. A site row is a dish; an org row is every site's
 * dish of that name folded together, hence the two extra counts.
 */
export interface CatalogRow {
  key: string;
  id?: number;
  categoryId?: number | null;
  name: string;
  imageUrl: string | null;
  usageCount: number;
  votes: number;
  score: number | null;
  siteCount?: number;
  photoCount?: number;
  /** Empty on an org row: a pooled line spans sites that label the dish differently. */
  tags: DietaryTag[];
  certifications: CertificationItem[];
}

export function rowFromDish(dish: DishCatalogItem): CatalogRow {
  return {
    key: String(dish.id),
    id: dish.id,
    categoryId: dish.category_id,
    name: dish.name,
    imageUrl: dish.image_url,
    usageCount: dish.usage_count,
    votes: dish.votes,
    score: dish.score,
    tags: dish.tags,
    certifications: dish.certifications,
  };
}

export function rowFromPooled(dish: OrgCatalogDish): CatalogRow {
  return {
    key: dish.normalized_name,
    name: dish.display_name,
    imageUrl: dish.image_url,
    usageCount: dish.usage_count,
    votes: dish.votes,
    score: dish.score,
    siteCount: dish.site_count,
    photoCount: dish.photo_count,
    tags: [],
    certifications: [],
  };
}

/** Each criterion wears the icon its figure wears on the cards and in the table. */
export const SITE_SORTS: { value: DishSort; label: string; icon: typeof Star }[] = [
  { value: 'usage', label: 'Servis', icon: UtensilsCrossed },
  { value: 'score', label: 'Note', icon: Star },
  { value: 'name', label: 'Nom', icon: ArrowDownAZ },
  { value: 'recent', label: 'Ajout', icon: Clock },
];

export const ORG_SORTS: { value: OrgCatalogSort; label: string; icon: typeof Star }[] = [
  { value: 'usage', label: 'Servis', icon: UtensilsCrossed },
  { value: 'score', label: 'Note', icon: Star },
  { value: 'sites', label: 'Sites', icon: Building2 },
  { value: 'photos', label: 'Photos', icon: ImageIcon },
  { value: 'name', label: 'Nom', icon: ArrowDownAZ },
];
