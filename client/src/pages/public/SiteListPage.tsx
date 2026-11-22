import { useEffect } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { trackPageView } from '@/lib/telemetry';
import { ChoiceList } from './ChoiceList';
import { useTenant } from './tenant';

export function SiteListPage() {
  const { organization, sites } = useTenant();

  useEffect(() => {
    trackPageView('sites', organization.slug);
  }, [organization.slug]);

  return (
    <ChoiceList
      title={organization.name}
      subtitle="Choisissez un restaurant"
      icon={UtensilsCrossed}
      choices={sites.map((site) => ({
        to: `/${organization.slug}/${site.slug}`,
        name: site.name,
        logoUrl: site.logo_url,
      }))}
    />
  );
}
