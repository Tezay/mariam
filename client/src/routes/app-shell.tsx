/**
 * Layout of the routes App.tsx declares itself: they render in the browser only,
 * behind their own <Routes>, from `/` as no path of its own shifts their base.
 */
import { lazy, Suspense } from 'react';
import { PageLoader } from '@/components/PageLoader';

const BrowserApp = lazy(() => import('../BrowserApp.client'));

// With a client loader and no server one, the server renders HydrateFallback
// in place of this route.
export function clientLoader() {
  return null;
}

export function HydrateFallback() {
  return <PageLoader />;
}

export default function AppShell() {
  return (
    <Suspense fallback={<PageLoader />}>
      <BrowserApp />
    </Suspense>
  );
}
