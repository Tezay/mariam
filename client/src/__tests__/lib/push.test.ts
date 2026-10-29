import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { pushSubscriptionsApi } from '@/lib/api/push-subscriptions';
import { DEFAULT_PREFERENCES, subscribeToPush } from '@/lib/push';

const SITE = { org: 'demo', site: 'sciences' };

function failed(response?: { status: number; data: unknown }): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError(
    'Request failed with status code 503',
    AxiosError.ERR_BAD_RESPONSE,
    config,
    null,
    response && { ...response, statusText: '', headers: {}, config }
  );
}

describe('subscribeToPush', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { requestPermission: async () => 'granted' });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('says what the API answered, in its words', async () => {
    vi.spyOn(pushSubscriptionsApi, 'publicKey').mockRejectedValue(
      failed({
        status: 503,
        data: {
          status: 503,
          code: 'push_unavailable',
          detail: 'Les notifications ne sont pas disponibles.',
        },
      })
    );

    expect(await subscribeToPush(DEFAULT_PREFERENCES, SITE)).toEqual({
      success: false,
      error: 'Les notifications ne sont pas disponibles.',
    });
  });

  it('says the service is unavailable when the API does not answer', async () => {
    vi.spyOn(pushSubscriptionsApi, 'publicKey').mockRejectedValue(failed());

    const result = await subscribeToPush(DEFAULT_PREFERENCES, SITE);

    expect(result.error).toMatch(/momentanément indisponible/);
  });
});
