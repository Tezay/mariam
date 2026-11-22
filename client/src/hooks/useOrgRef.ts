import { useOptionalPlace } from '@/contexts/PlaceContext';
import type { OrgRef } from '@/lib/api/client';

export function useOrgRef(): OrgRef | null {
  const place = useOptionalPlace()?.place;
  return place ? { org: place.org } : null;
}
