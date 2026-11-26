import { data, redirect, type ShouldRevalidateFunctionArgs } from 'react-router';
import { fetchLiveStatus, fetchQuality, fetchSitePage } from '@/lib/api/public.server';
import { addDays, parisToday } from '@/lib/date-utils';
import { legalNoticeUrl, mapTiles } from '@/lib/runtime-config.server';
import { publicMenuData } from './public-menu-data';
import { onlyTheDayChanged } from './site/days';
import { menuDescription, restaurantJsonLd, siteName } from './seo/jsonld';
import { pageMeta } from './seo/meta';
import { SitePage } from './site/SitePage';
import { tenantOf } from './tenant';
import { siteFor, sitePath, tenantContext } from './tenant.server';
import type { Route } from './+types/site-route';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Read back, since Date rolls 30 February over to March.
function isDate(value: string): boolean {
  const day = new Date(`${value}T12:00:00Z`);
  return (
    ISO_DATE.test(value) && !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value)
  );
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const site = siteFor(tenant, params.site);
  const url = new URL(request.url);
  const pagePath = sitePath(tenant, site.slug);

  const now = Date.now();
  const today = parisToday(new Date(now));
  const asked = url.searchParams.get('date');
  if (asked !== null && (!isDate(asked) || asked === today)) throw redirect(pagePath);
  const date = asked ?? today;

  const org = tenant.organization.slug;
  let page, live, quality;
  try {
    [page, live, quality] = await Promise.all([
      fetchSitePage(request, org, site.slug, date, addDays(date, 1)),
      // The page stands without these: the gauge then shows the capacity alone, and the
      // quality section is left out.
      fetchLiveStatus(request, org, site.slug).catch(() => null),
      fetchQuality(request, org, site.slug).catch(() => null),
    ]);
  } catch (error) {
    console.error(error);
    throw data('unavailable', { status: 503 });
  }
  if (!page) throw data('site', { status: 404 });
  const { from, to } = page.site.menu_window;
  if (asked !== null && (asked < from || asked > to)) throw redirect(pagePath);

  return {
    organization: tenant.organization,
    siteSlug: site.slug,
    date,
    page,
    live,
    quality,
    now,
    url: `${tenant.origin}${pagePath}`,
    mapTiles: mapTiles(),
    legalNoticeUrl: legalNoticeUrl(),
  };
}

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return onlyTheDayChanged(currentUrl, nextUrl) ? false : defaultShouldRevalidate;
}

export const meta: Route.MetaFunction = ({ loaderData, matches, location }) => {
  const tenant = tenantOf(matches);
  if (!tenant || !loaderData) return [{ title: 'Mariam' }];
  const org = tenant.organization.name;
  const { page, url, now } = loaderData;
  const today = parisToday(new Date(now));
  const date = new URLSearchParams(location.search).get('date') ?? today;
  const menu = publicMenuData(page, new Date(now), date);
  const site = menu.restaurant;
  const tags = pageMeta({
    title: `${site.name} – ${org} : menu du jour, horaires et accès`,
    description: site.tagline ?? menuDescription(site.name, org, menu.day),
    url,
    siteName: siteName(org),
    image: site.cover_url ?? site.logo_url,
  });
  if (date !== today) {
    tags.push({ name: 'robots', content: 'noindex' });
  }
  tags.push({
    'script:ld+json': restaurantJsonLd({
      site,
      url,
      organization: { name: org, url: `${tenant.origin}/${tenant.organization.slug}` },
      day: menu.day,
    }),
  });
  return tags;
};

export default function SiteRoute({ loaderData }: Route.ComponentProps) {
  return (
    <SitePage
      key={loaderData.siteSlug}
      organization={loaderData.organization}
      siteSlug={loaderData.siteSlug}
      loadedDate={loaderData.date}
      initial={loaderData.page}
      initialLive={loaderData.live}
      quality={loaderData.quality}
      serverNow={loaderData.now}
      mapTiles={loaderData.mapTiles}
      legalNoticeUrl={loaderData.legalNoticeUrl}
    />
  );
}
