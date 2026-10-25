import { isAxiosError } from 'axios';
import { publicAxios, PUBLIC_API_TIMEOUT_MS, sitePath, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type ServerSubscription = Schemas['PushSubscription'];
export type NotificationPreferences = Required<Schemas['PushPreferences']>;
export type SubscriptionInput = Schemas['PushSubscriptionInput'];

const options = { timeout: PUBLIC_API_TIMEOUT_MS };

/** SHA-256 of the endpoint in base64url: the subscription's address, which lets no one push. */
export async function subscriptionId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function subscriptionPath(ref: SiteRef, endpoint: string): Promise<string> {
  return `${sitePath(ref)}/push-subscriptions/${await subscriptionId(endpoint)}`;
}

export const pushSubscriptionsApi = {
  publicKey: async (): Promise<string> =>
    (await publicAxios.get('/push-key', options)).data.public_key,

  /** Subscribes the browser to the site, or moves its subscription there. */
  put: async (ref: SiteRef, subscription: SubscriptionInput): Promise<ServerSubscription> =>
    (
      await publicAxios.put(
        await subscriptionPath(ref, subscription.endpoint),
        subscription,
        options
      )
    ).data,

  /** `null` when the browser follows no site, or another one. */
  get: async (ref: SiteRef, endpoint: string): Promise<ServerSubscription | null> => {
    try {
      return (await publicAxios.get(await subscriptionPath(ref, endpoint), options)).data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) return null;
      throw error;
    }
  },

  update: async (
    ref: SiteRef,
    endpoint: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<ServerSubscription> =>
    (await publicAxios.patch(await subscriptionPath(ref, endpoint), preferences, options)).data,

  remove: async (ref: SiteRef, endpoint: string): Promise<void> => {
    await publicAxios.delete(await subscriptionPath(ref, endpoint), options);
  },

  sendTest: async (ref: SiteRef, endpoint: string): Promise<void> => {
    await publicAxios.post(`${await subscriptionPath(ref, endpoint)}/test`, undefined, options);
  },
};
