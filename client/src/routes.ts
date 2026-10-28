import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

// App.tsx draws these pages with its own <Routes>: the children only win their first
// segments over `:restaurantSlug`, which would otherwise take them.
const appShellPaths = ['login', 'notifications', 'admin/*', 'org/*', '*?'];

export default [
  route('config.js', 'routes/runtime-config.ts'),
  route('robots.txt', 'routes/robots.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  route('menu', 'pages/public/menu-redirect.ts', { id: 'menu' }),
  route(':restaurantSlug/menu', 'pages/public/menu-redirect.ts', { id: 'site-menu' }),
  layout('pages/public/tenant-layout.tsx', { id: 'tenant' }, [
    index('pages/public/site-route.tsx', { id: 'home' }),
    route(':restaurantSlug', 'pages/public/site-route.tsx', { id: 'site' }),
    route('tv', 'pages/public/tv-route.tsx', { id: 'tv' }),
    route(':restaurantSlug/tv', 'pages/public/tv-route.tsx', { id: 'site-tv' }),
  ]),
  route('privacy', 'pages/public/privacy-route.tsx'),
  layout('routes/app-shell.tsx', { id: 'app-shell' }, [
    ...appShellPaths.map((path) => route(path, 'routes/app-page.tsx', { id: `app-${path}` })),
  ]),
] satisfies RouteConfig;
