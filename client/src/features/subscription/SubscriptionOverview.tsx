import type { ComponentType } from 'react';
import {
  Archive,
  CalendarCheck2,
  CalendarClock,
  CalendarRange,
  CalendarX2,
  Lock,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Subscription } from '@/lib/api/subscriptions';
import { parisToday } from '@/lib/date-utils';
import { SUPPORT_EMAIL } from '@/lib/runtime-config';
import { cn } from '@/lib/utils';
import { RenewalSteps } from './RenewalSteps';
import { SubscriptionBadge } from './SubscriptionBadge';
import { SubscriptionTimeline } from './SubscriptionTimeline';
import {
  canRequestRenewal,
  headline,
  quoteLabel,
  quoteMailto,
  renewalFacts,
  statusBadge,
  type Fact,
  type FactKind,
} from './subscription-view';

const FACT_ICON: Record<Exclude<FactKind, 'notice'>, ComponentType<{ className?: string }>> = {
  reconduction: RefreshCw,
  horizon: CalendarRange,
  renewed: CalendarCheck2,
  ending: CalendarX2,
  data: Archive,
  undecided: CalendarClock,
};

function FactIcon({ kind }: { kind: FactKind }) {
  if (kind === 'notice') {
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 justify-center">
        <span className="h-4 w-1 rounded-full bg-amber-500" />
      </span>
    );
  }
  const Icon = FACT_ICON[kind];
  return (
    <Icon
      className={cn(
        'mt-0.5 h-4 w-4 shrink-0',
        kind === 'reconduction' || kind === 'renewed'
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-muted-foreground'
      )}
    />
  );
}

function Facts({ facts }: { facts: Fact[] }) {
  if (!facts.length) return null;
  return (
    <ul className="mt-5 space-y-2.5">
      {facts.map((fact) => (
        <li key={fact.kind} className="flex items-start gap-2.5 text-sm text-foreground">
          <FactIcon kind={fact.kind} />
          {fact.text}
        </li>
      ))}
    </ul>
  );
}

export function SubscriptionOverview({
  subscription,
  siteName,
  supportText,
}: {
  subscription: Subscription;
  siteName: string;
  supportText: string;
}) {
  const today = parisToday();
  const title = headline(subscription);
  const { current } = subscription;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubscriptionBadge badge={statusBadge(subscription)} />
        {current?.renewed_tacitly && (
          <span className="text-xs text-muted-foreground">Reconduit tacitement</span>
        )}
      </div>

      <h2 className="mt-4 flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {subscription.state === 'disabled' && <Lock className="h-5 w-5 shrink-0" />}
        {title.title}
      </h2>
      {title.detail && <p className="mt-1 text-sm text-muted-foreground">{title.detail}</p>}

      {current && subscription.state === 'active' && (
        <SubscriptionTimeline standing={{ ...subscription, current }} today={today} />
      )}

      <Facts facts={renewalFacts(subscription, today)} />

      {canRequestRenewal(subscription) && SUPPORT_EMAIL && (
        <>
          <RenewalSteps />
          <Button asChild className="mt-4 w-full sm:w-auto">
            <a href={quoteMailto(SUPPORT_EMAIL, subscription, siteName, supportText)}>
              <Mail className="h-4 w-4" />
              {quoteLabel(subscription)}
            </a>
          </Button>
        </>
      )}

      <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
        Ces informations reprennent votre contrat ; en cas d'écart, le contrat fait foi.
      </p>
    </section>
  );
}
