import { data } from 'react-router';
import { fetchLiveStatus, fetchSitePage } from '@/lib/api/public.server';
import { addDays, parisToday } from '@/lib/date-utils';
import { publicMenuData } from './public-menu-data';
import { tenantOf } from './tenant';
import { siteFor, tenantContext } from './tenant.server';
import { TvScreen } from './tv/TvScreen';
import { rotationOf } from './tv/tv-layout';
import type { Route } from './+types/tv-route';

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const tenant = context.get(tenantContext);
  const { site, multiSite } = siteFor(tenant, request, params.restaurantSlug, 'tv');
  const now = Date.now();
  const today = parisToday(new Date(now));
  const org = tenant.organization.slug;
  let page, live;
  try {
    [page, live] = await Promise.all([
      fetchSitePage(
        request,
        org,
        site.slug,
        today,
        addDays(today, 1),
        `visibility=tv&sort=date&from=${today}`
      ),
      // The screen stands without it: the dial then shows the capacity alone.
      fetchLiveStatus(request, org, site.slug).catch(() => null),
    ]);
  } catch (error) {
    console.error(error);
    throw data('unavailable', { status: 503 });
  }
  if (!page) throw data('site', { status: 404 });

  return {
    organization: tenant.organization,
    siteSlug: site.slug,
    menu: publicMenuData(page, new Date(now)),
    live,
    now,
    pageUrl: `${tenant.origin}${multiSite ? `/${site.slug}` : '/'}`,
    rotation: rotationOf(new URL(request.url).searchParams.get('rotation')),
  };
}

export const meta: Route.MetaFunction = ({ loaderData, matches }) => {
  const tenant = tenantOf(matches);
  const title =
    tenant && loaderData
      ? `Menu ${loaderData.menu.restaurant.name} — ${tenant.organization.name}`
      : 'Mariam';
  return [{ title }, { name: 'robots', content: 'noindex' }];
};

export default function TvRoute({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <TvScreen
        organization={loaderData.organization}
        siteSlug={loaderData.siteSlug}
        initial={loaderData.menu}
        initialLive={loaderData.live}
        serverNow={loaderData.now}
        pageUrl={loaderData.pageUrl}
        rotation={loaderData.rotation}
      />
      <script src="/tv-watchdog.js" />
    </>
  );
}
