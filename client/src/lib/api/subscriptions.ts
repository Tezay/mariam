import { api, orgPath, sitePath, type OrgRef, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type SubscriptionPeriod = Schemas['SubscriptionPeriod'];

// The generator widens a nullable nested object with an empty record.
type WithPeriods<T> = Omit<T, 'current' | 'next'> & {
  current: SubscriptionPeriod | null;
  next: SubscriptionPeriod | null;
};

export type Subscription = WithPeriods<Schemas['Subscription']>;
export type SiteSubscription = WithPeriods<Schemas['OrgSiteSubscription']>;
export type SubscriptionSummary = Omit<Subscription, 'past'>;
export type SubscriptionState = Subscription['state'];

export const subscriptionsApi = {
  /** The site's periods, for its admins and its supervisors. */
  get: async (ref: SiteRef): Promise<Subscription> =>
    (await api.get(`${sitePath(ref)}/subscription`)).data,

  listForOrg: async (ref: OrgRef): Promise<SiteSubscription[]> =>
    (await api.get(`${orgPath(ref)}/subscriptions`)).data.items,
};
