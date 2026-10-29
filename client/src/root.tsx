import type { ReactNode } from 'react';
import { Links, Meta, Outlet, Scripts, useLocation, useRouteLoaderData } from 'react-router';
import { AppErrorFallback } from '@/components/ErrorBoundary';
import { appIdentity } from '@/lib/app-manifest';
import type { loader as siteLoader } from './pages/public/site-route';
import type { Route } from './+types/root';
import '@fontsource-variable/inter';
import './index.css';

export const meta: Route.MetaFunction = () => [
  { title: 'Mariam - Menu du Jour' },
  {
    name: 'description',
    content:
      'Consultez le menu du restaurant universitaire. Plateforme de gestion des menus Mariam.',
  },
];

function useAppIdentity() {
  const { pathname } = useLocation();
  const home = useRouteLoaderData<typeof siteLoader>('home');
  const page = useRouteLoaderData<typeof siteLoader>('site');
  const site = home?.kind === 'site' ? home : page?.kind === 'site' ? page : null;
  return appIdentity(pathname, site && { slug: site.siteSlug, name: site.menu.restaurant.name });
}

export function Layout({ children }: { children: ReactNode }) {
  const app = useAppIdentity();
  return (
    // theme-init.js adds the `dark` class before React hydrates the document.
    <html lang="fr" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script src="/theme-init.js" />
        <script src="/install-prompt.js" />
        <link
          rel="icon"
          href="/favicon.svg"
          type="image/svg+xml"
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="icon"
          href="/favicon-dark.svg"
          type="image/svg+xml"
          media="(prefers-color-scheme: dark)"
        />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/favicon-96x96.png" type="image/png" sizes="96x96" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        {app.manifest && <link rel="manifest" href={app.manifest} />}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={app.title} />
        <meta name="msapplication-TileColor" content="#093EAA" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="theme-color" content="#093EAA" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#12151c" media="(prefers-color-scheme: dark)" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        {/* Before the modules below: runtime-config.ts reads what it sets on import. */}
        <script src="/config.js" />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}

export function ErrorBoundary() {
  return <AppErrorFallback />;
}
