import { type RouteConfig, route } from '@react-router/dev/routes';

export default [
  route('config.js', 'routes/runtime-config.ts'),
  route('robots.txt', 'routes/robots.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  route('*?', 'routes/app-shell.tsx'),
] satisfies RouteConfig;
