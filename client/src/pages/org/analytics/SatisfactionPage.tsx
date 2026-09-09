import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SatisfactionView } from '@/features/analytics/SatisfactionView';
import { useOrgSites } from '@/features/analytics/hooks/useAnalyticsQueries';
import { PageHeader } from '../ui';

export function OrgSatisfactionPage() {
  const navigate = useNavigate();
  const { data: orgSites } = useOrgSites();

  const sites = useMemo(
    () => (orgSites ?? []).map((site) => ({ id: site.id, name: site.name })),
    [orgSites]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Satisfaction"
        description="Ce que les étudiants pensent des menus servis."
      />
      <SatisfactionView sites={sites} onSiteClick={(siteId) => navigate(`/org/sites/${siteId}`)} />
    </div>
  );
}
