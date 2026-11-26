import { BadgeCheck } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';
import { useSiteRef } from '@/contexts/SiteContext';
import {
  DocumentsCard,
  IncludedFeatures,
  PastPeriods,
  SubscriptionReferences,
  SupportCard,
} from '@/features/subscription/SubscriptionDetails';
import { SubscriptionOverview } from '@/features/subscription/SubscriptionOverview';
import { references, supportText } from '@/features/subscription/subscription-view';
import { useSiteSubscription } from '@/features/subscription/useSubscription';

export function SubscriptionPage() {
  const site = useSiteRef();
  const { user } = useAuth();
  const { data: subscription, isPending, isError } = useSiteSubscription(site);
  const own = user?.sites.find((s) => s.slug === site.site && s.organization.slug === site.org);
  const siteName = own?.name ?? site.site;
  const organization = own?.organization.name ?? site.org;

  if (isPending) {
    return (
      <div className="container-mariam flex justify-center py-8">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }
  if (isError || subscription.state === 'none') {
    return (
      <div className="container-mariam max-w-4xl py-6">
        <EmptyState
          icon={BadgeCheck}
          title={isError ? "L'abonnement n'a pas pu être chargé" : 'Aucun abonnement enregistré'}
          description={
            isError
              ? 'Réessayez dans un instant.'
              : "Aucune période d'abonnement n'est enregistrée pour ce site."
          }
        />
      </div>
    );
  }

  const context = {
    organization,
    site: siteName,
    path: `${site.org}/${site.site}`,
  };
  const text = supportText(subscription, context);

  return (
    <div className="container-mariam max-w-5xl space-y-6 py-6">
      <SubscriptionOverview subscription={subscription} siteName={siteName} supportText={text} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6 lg:order-last">
          <SubscriptionReferences rows={references(subscription, context)} supportText={text} />
          <DocumentsCard />
        </div>
        <div className="space-y-6">
          <IncludedFeatures />
          <SupportCard supportText={text} siteName={siteName} organization={organization} />
          <PastPeriods periods={subscription.past} />
        </div>
      </div>
    </div>
  );
}
