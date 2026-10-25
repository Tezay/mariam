import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { SatisfactionView } from '@/features/analytics/SatisfactionView';
import { useOrgSites } from '@/features/analytics/hooks/useAnalyticsQueries';
import { PageHeader } from '../ui';

export function OrgSatisfactionPage() {
  const navigate = useNavigate();
  const { data: orgSites } = useOrgSites();

  const sites = useMemo(
    () => (orgSites ?? []).map((site) => ({ slug: site.slug, name: site.name })),
    [orgSites]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Satisfaction"
        description="Ce que les étudiants pensent des menus servis."
      />
      <SatisfactionView
        sites={sites}
        onSiteClick={(site) => navigate(`/org/sites/${site}`)}
        onDishClick={(dish) => navigate(`/org/catalog?q=${encodeURIComponent(dish.name)}`)}
      />
    </div>
  );
}
