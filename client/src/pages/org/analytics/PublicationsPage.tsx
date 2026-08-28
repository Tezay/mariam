import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicationsView } from '@/features/analytics/PublicationsView';
import { useOrgSites } from '@/features/analytics/hooks/useAnalyticsQueries';
import { PageHeader } from '../ui';

export function OrgPublicationsPage() {
  const navigate = useNavigate();
  const { data: orgSites } = useOrgSites();

  const sites = useMemo(
    () => (orgSites ?? []).map((site) => ({ id: site.id, name: site.name })),
    [orgSites]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Publications"
        description="Régularité de publication, ponctualité et complétude des menus."
      />
      <PublicationsView sites={sites} onSiteClick={(siteId) => navigate(`/org/sites/${siteId}`)} />
    </div>
  );
}
