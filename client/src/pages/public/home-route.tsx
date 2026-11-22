import { data, redirect } from 'react-router';
import { Building2 } from 'lucide-react';
import { fetchOrgs } from '@/lib/api/public.server';
import { ChoiceList } from './ChoiceList';
import { PublicError } from './PublicError';
import type { Route } from './+types/home-route';

export async function loader({ request }: Route.LoaderArgs) {
  let organizations;
  try {
    organizations = await fetchOrgs(request);
  } catch (error) {
    console.error(error);
    throw data('unavailable', { status: 503 });
  }
  if (organizations.length === 0) throw data('organization', { status: 404 });
  if (organizations.length === 1) throw redirect(`/${organizations[0].slug}`);
  return { organizations };
}

export const meta: Route.MetaFunction = () => [{ title: 'Mariam' }];

export default function HomeRoute({ loaderData }: Route.ComponentProps) {
  return (
    <ChoiceList
      title="Mariam"
      subtitle="Choisissez une organisation"
      icon={Building2}
      choices={loaderData.organizations.map((organization) => ({
        to: `/${organization.slug}`,
        name: organization.name,
      }))}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <PublicError error={error} />;
}
