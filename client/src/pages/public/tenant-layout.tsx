import { useState } from 'react';
import { Outlet, isRouteErrorResponse } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicErrorFallback } from '@/components/ErrorBoundary';
import { loadTenant, tenantContext } from './tenant.server';
import type { Route } from './+types/tenant-layout';

export const middleware: Route.MiddlewareFunction[] = [loadTenant];

export function loader({ context }: Route.LoaderArgs) {
  return context.get(tenantContext);
}

export default function TenantLayout() {
  // One client per request on the server, so that no visitor reads another's cache.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
      })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="public-page flex h-screen items-center justify-center p-6 text-center text-site-subtle">
        {error.data === 'site' ? 'Restaurant introuvable.' : 'Organisation introuvable.'}
      </div>
    );
  }
  return <PublicErrorFallback />;
}
