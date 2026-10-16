import { redirect } from 'react-router';
import { SiteListPage } from './SiteListPage';
import { pageMeta } from './seo/meta';
import { tenantOf } from './tenant';
import { tenantContext } from './tenant.server';
import type { Route } from './+types/root-route';

export function loader({ context }: Route.LoaderArgs) {
  if (context.get(tenantContext).sites.length === 1) throw redirect('/menu');
  return null;
}

export const meta: Route.MetaFunction = ({ matches }) => {
  const tenant = tenantOf(matches);
  if (!tenant) return [{ title: 'Mariam' }];
  const name = tenant.organization.name;
  return pageMeta({
    title: `${name} — Nos restaurants`,
    description: `Découvrez les menus des restaurants de ${name}.`,
    url: `${tenant.origin}/`,
    siteName: name,
  });
};

export default function RootRoute() {
  return <SiteListPage />;
}
