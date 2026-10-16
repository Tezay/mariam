import { useSyncExternalStore } from 'react';
import { PageLoader } from '@/components/PageLoader';
import { TvMenuDisplay } from './tv/TvMenuDisplay';
import { tenantOf } from './tenant';
import { siteFor, tenantContext } from './tenant.server';
import type { Route } from './+types/tv-route';

export function loader({ request, params, context }: Route.LoaderArgs) {
  const { site } = siteFor(context.get(tenantContext), request, params.restaurantSlug, 'tv');
  return { site };
}

export const meta: Route.MetaFunction = ({ loaderData, matches }) => {
  const tenant = tenantOf(matches);
  const title =
    tenant && loaderData ? `Menu ${loaderData.site.name} — ${tenant.organization.name}` : 'Mariam';
  return [{ title }, { name: 'robots', content: 'noindex' }];
};

const subscribe = () => () => {};

export default function TvRoute({ loaderData }: Route.ComponentProps) {
  // The display reads the screen and the clock: it renders in the browser only.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
  if (!hydrated) return <PageLoader />;
  return <TvMenuDisplay restaurantSlug={loaderData.site.slug} />;
}
