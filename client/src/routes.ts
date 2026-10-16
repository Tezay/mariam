import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  route('config.js', 'routes/runtime-config.ts'),
  route('robots.txt', 'routes/robots.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  layout('pages/public/tenant-layout.tsx', { id: 'tenant' }, [
    index('pages/public/root-route.tsx'),
    route('menu', 'pages/public/menu-route.tsx', { id: 'menu' }),
    route(':restaurantSlug/menu', 'pages/public/menu-route.tsx', { id: 'site-menu' }),
    route('tv', 'pages/public/tv-route.tsx', { id: 'tv' }),
    route(':restaurantSlug/tv', 'pages/public/tv-route.tsx', { id: 'site-tv' }),
  ]),
  route('privacy', 'pages/public/privacy-route.tsx'),
  route('*?', 'routes/app-shell.tsx'),
] satisfies RouteConfig;
