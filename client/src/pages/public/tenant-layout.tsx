import { useState } from 'react';
import { Outlet, type ShouldRevalidateFunctionArgs } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PwaInstallProvider } from '@/contexts/PwaInstallContext';
import { PublicError } from './PublicError';
import { onlyTheDayChanged } from './site/days';
import { loadTenant, tenantContext } from './tenant.server';
import type { Route } from './+types/tenant-layout';

export const middleware: Route.MiddlewareFunction[] = [loadTenant];

export function loader({ context }: Route.LoaderArgs) {
  return context.get(tenantContext);
}

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return onlyTheDayChanged(currentUrl, nextUrl) ? false : defaultShouldRevalidate;
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
      <PwaInstallProvider>
        <Outlet />
      </PwaInstallProvider>
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  return <PublicError error={error} org={params.org} />;
}
