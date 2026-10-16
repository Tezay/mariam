import { useRouteLoaderData } from 'react-router';
import type { Tenant } from './tenant.server';

const TENANT_ROUTE_ID = 'tenant';

export function useTenant() {
  const tenant = useRouteLoaderData(TENANT_ROUTE_ID) as Tenant | undefined;
  if (!tenant) throw new Error('useTenant needs the tenant layout');
  return tenant;
}

export function tenantOf(matches: ReadonlyArray<{ id: string; loaderData?: unknown } | undefined>) {
  return matches.find((match) => match?.id === TENANT_ROUTE_ID)?.loaderData as Tenant | undefined;
}
