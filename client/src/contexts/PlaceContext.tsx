import { createContext, useCallback, useContext } from 'react';
import type { Role } from '@/lib/api/user';
import { type Place, orgPath } from '@/lib/dashboard-routes';

interface PlaceValue {
  place: Place;
  /** On a site, the account's membership role; over an organization, `org_admin`. */
  role: Role;
}

const PlaceContext = createContext<PlaceValue | null>(null);

export function PlaceProvider({
  value,
  children,
}: {
  value: PlaceValue;
  children: React.ReactNode;
}) {
  return <PlaceContext.Provider value={value}>{children}</PlaceContext.Provider>;
}

export function usePlace(): PlaceValue {
  const value = useContext(PlaceContext);
  if (!value) throw new Error('usePlace must be used inside PlaceProvider');
  return value;
}

export function useOptionalPlace(): PlaceValue | null {
  return useContext(PlaceContext);
}

export function useOrgPage(): (page: string) => string {
  const { org } = usePlace().place;
  return useCallback((page: string) => orgPath(org, page), [org]);
}
