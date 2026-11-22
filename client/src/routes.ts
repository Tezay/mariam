import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';
import { DASHBOARD_SEGMENTS } from './lib/dashboard-paths';

// App.tsx draws these pages with its own <Routes>: the children only win their first
// segments over `:org`, which would otherwise take them.
const appShellPaths = [...DASHBOARD_SEGMENTS.map((segment) => `${segment}/*`), '*?'];

export default [
  route('config.js', 'routes/runtime-config.ts'),
  route('robots.txt', 'routes/robots.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  route('app.webmanifest', 'routes/app-manifest.ts'),
  index('pages/public/home-route.tsx', { id: 'home' }),
  route('privacy', 'pages/public/privacy-route.tsx'),
  route(':org', 'pages/public/tenant-layout.tsx', { id: 'tenant' }, [
    index('pages/public/org-route.tsx', { id: 'org' }),
    route(':site', 'pages/public/site-route.tsx', { id: 'site' }),
    route(':site/tv', 'pages/public/tv-route.tsx', { id: 'tv' }),
  ]),
  layout('routes/app-shell.tsx', { id: 'app-shell' }, [
    ...appShellPaths.map((path) => route(path, 'routes/app-page.tsx', { id: `app-${path}` })),
  ]),
] satisfies RouteConfig;
