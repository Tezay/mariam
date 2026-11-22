import { siteName } from './seo/jsonld';
import { pageMeta } from './seo/meta';
import { SiteListPage } from './SiteListPage';
import { tenantOf } from './tenant';
import type { Route } from './+types/org-route';

export const meta: Route.MetaFunction = ({ matches }) => {
  const tenant = tenantOf(matches);
  if (!tenant) return [{ title: 'Mariam' }];
  const org = tenant.organization.name;
  return pageMeta({
    title: `${org} — Nos restaurants`,
    description: `Découvrez les menus des restaurants de ${org}.`,
    url: `${tenant.origin}/${tenant.organization.slug}`,
    siteName: siteName(org),
  });
};

export default function OrgRoute() {
  return <SiteListPage />;
}
