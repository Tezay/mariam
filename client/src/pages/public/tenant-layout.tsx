import { useState } from 'react';
import { Outlet, isRouteErrorResponse, type ShouldRevalidateFunctionArgs } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicErrorFallback } from '@/components/ErrorBoundary';
import { PwaInstallProvider } from '@/contexts/PwaInstallContext';
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

// A 404 also comes from a proxy in front while a deployment recreates the containers:
// an outage, not a missing organization.
const MISSING: Record<string, string> = {
  organization: 'Organisation introuvable.',
  site: 'Restaurant introuvable.',
};

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const missing =
    isRouteErrorResponse(error) && error.status === 404 && typeof error.data === 'string'
      ? MISSING[error.data]
      : undefined;
  if (missing) {
    return (
      <div className="public-page flex h-screen items-center justify-center p-6 text-center text-site-subtle">
        {missing}
      </div>
    );
  }
  return <PublicErrorFallback />;
}
