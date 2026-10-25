import { describe, expect, it } from 'vitest';
import { subscriptionId } from '@/lib/api/push-subscriptions';

describe('a subscription id', () => {
  it('is the fingerprint the server computes for the same endpoint', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/migration-check';

    expect(await subscriptionId(endpoint)).toBe('rUAYd69AZMV6v-76kdPVJRgsJ9bugxQkZ0mNG8U-Yp8');
  });
});
