import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrafficView } from '@/features/analytics/TrafficView';
import { useOrgSites } from '@/features/analytics/hooks/useAnalyticsQueries';
import { PageHeader } from '../ui';

export function OrgTrafficPage() {
  const navigate = useNavigate();
  const { data: orgSites } = useOrgSites();

  const sites = useMemo(
    () => (orgSites ?? []).map((site) => ({ id: site.id, name: site.name })),
    [orgSites]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consultations du menu"
        description="Ouvertures des pages de menu en ligne, hors fréquentation sur place."
      />
      <TrafficView sites={sites} onSiteClick={(siteId) => navigate(`/org/sites/${siteId}`)} />
    </div>
  );
}
