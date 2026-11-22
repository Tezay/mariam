/**
 * Site-level statistics. Renders the same analytics views as the supervision
 * dashboard; the API scopes them to the caller's own site, so nothing here
 * needs to know whether the organization has one site or thirty.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AnalyticsTabs, type AnalyticsTab } from '@/features/analytics/ui/AnalyticsTabs';
import { PublicationsView } from '@/features/analytics/PublicationsView';
import { SatisfactionView } from '@/features/analytics/SatisfactionView';
import { TrafficView } from '@/features/analytics/TrafficView';
import { TourHost } from '@/features/tour/TourHost';
import { useSitePage } from '@/contexts/SiteContext';

export function StatsPage() {
  const navigate = useNavigate();
  const sitePage = useSitePage();
  const [tab, setTab] = useState<AnalyticsTab>('traffic');

  return (
    <div className="container-mariam space-y-6 py-6">
      <AnalyticsTabs value={tab} onChange={setTab} />

      {tab === 'traffic' && <TrafficView />}
      {tab === 'satisfaction' && (
        <SatisfactionView
          onDishClick={(dish) => navigate(sitePage(`/catalogue/${dish.dish_id}`))}
        />
      )}
      {tab === 'publications' && <PublicationsView />}

      <TourHost tour="stats" enabled={tab === 'traffic'} />
    </div>
  );
}
