import { redirect } from 'react-router';
import type { Route } from './+types/menu-redirect';

// The page's former address, still in old notifications, bookmarks and the TV screens.
export function loader({ request, params }: Route.LoaderArgs) {
  const { search } = new URL(request.url);
  // Encoded: `/\host` would read as `//host`, another site.
  throw redirect(`/${encodeURIComponent(params.restaurantSlug ?? '')}${search}`, 301);
}
