import { data, redirect } from 'react-router';
import { fetchSitePage } from '@/lib/api/public.server';
import { addDays, parisToday } from '@/lib/date-utils';
import { MobileMenuDisplay } from './mobile/MobileMenuDisplay';
import { publicMenuData } from './public-menu-data';
import { menuDescription, restaurantJsonLd } from './seo/jsonld';
import { pageMeta } from './seo/meta';
import { tenantOf } from './tenant';
import { siteFor, tenantContext } from './tenant.server';
import type { Route } from './+types/menu-route';

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const { site, multiSite } = siteFor(tenant, request, params.restaurantSlug, 'menu');
  if (new URL(request.url).searchParams.get('mode') === 'tv') {
    throw redirect(multiSite ? `/${site.slug}/tv` : '/tv', 301);
  }

  const now = Date.now();
  const today = parisToday(new Date(now));
  const org = tenant.organization.slug;
  let page;
  try {
    page = await fetchSitePage(request, org, site.slug, today, addDays(today, 1));
  } catch (error) {
    console.error(error);
    throw data('unavailable', { status: 503 });
  }
  if (!page) throw data('site', { status: 404 });
  return {
    org,
    site,
    menu: publicMenuData(page, new Date(now)),
    now,
    url: multiSite ? `${tenant.origin}/${site.slug}/menu` : `${tenant.origin}/menu`,
  };
}

export const meta: Route.MetaFunction = ({ loaderData, matches }) => {
  const tenant = tenantOf(matches);
  if (!tenant || !loaderData) return [{ title: 'Mariam' }];
  const { site, menu, url } = loaderData;
  const org = tenant.organization.name;
  return [
    ...pageMeta({
      title: `Menu ${site.name} — ${org}`,
      description: menuDescription(site.name, org, menu.today),
      url,
      siteName: org,
      image: menu.restaurant?.logo_url,
    }),
    { 'script:ld+json': restaurantJsonLd(site.name, url, menu.restaurant, menu.today) },
  ];
};

export default function MenuRoute({ loaderData }: Route.ComponentProps) {
  const { org, site, menu, now } = loaderData;
  return (
    <MobileMenuDisplay
      key={site.slug}
      org={org}
      restaurantSlug={site.slug}
      initial={menu}
      serverNow={now}
    />
  );
}
