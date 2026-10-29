// Each context names its own manifest: a phone installs the app of the page it is on,
// whatever the browser remembers of an earlier visit.
export const DASHBOARD_APPS = [
  {
    prefix: '/admin',
    manifest: '/manifest-admin.webmanifest',
    name: 'Mariam - Gestion',
    title: 'Gestion',
  },
  {
    prefix: '/org',
    manifest: '/manifest-org.webmanifest',
    name: 'Mariam - Supervision',
    title: 'Supervision',
  },
] as const;

export type DashboardApp = (typeof DASHBOARD_APPS)[number];

export function dashboardApp(pathname: string): DashboardApp | undefined {
  return DASHBOARD_APPS.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

interface AppIdentity {
  manifest: string | null;
  title: string;
}

export function appIdentity(
  pathname: string,
  site: { slug: string; name: string } | null
): AppIdentity {
  const dashboard = dashboardApp(pathname);
  if (dashboard) return { manifest: dashboard.manifest, title: dashboard.title };
  if (site) {
    return { manifest: `/app.webmanifest?site=${encodeURIComponent(site.slug)}`, title: site.name };
  }
  return { manifest: null, title: 'Mariam' };
}

const ICONS = [
  { src: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
  {
    src: '/web-app-manifest-192x192.png',
    sizes: '192x192',
    type: 'image/png',
    purpose: 'maskable',
  },
  {
    src: '/web-app-manifest-512x512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
  { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
];

// `id` equals `start_url`, the identity browsers gave the app before it was explicit.
export function siteManifest(name: string, pagePath: string) {
  return {
    id: pagePath,
    name,
    short_name: name,
    description: 'Le menu du jour, les horaires et les infos pratiques du restaurant.',
    start_url: pagePath,
    scope: '/',
    display: 'standalone',
    theme_color: '#093EAA',
    background_color: '#ffffff',
    lang: 'fr-FR',
    categories: ['food', 'lifestyle'],
    icons: ICONS,
  };
}
