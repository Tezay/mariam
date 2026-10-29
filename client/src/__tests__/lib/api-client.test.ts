import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { api, publicAxios } from '@/lib/api/client';
import { onSessionEnd } from '@/lib/api/session';
import { stubCookies, stubLocalStorage } from '../session-fixtures';

const SESSION = '__Host-csrf-access=access-csrf; __Host-csrf-refresh=refresh-csrf';

function refuse(config: InternalAxiosRequestConfig): Promise<never> {
  return Promise.reject(
    new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, config, null, {
      status: 401,
      statusText: 'UNAUTHORIZED',
      data: { code: 'token_expired' },
      headers: {},
      config,
    })
  );
}

function answer(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  return Promise.resolve({ status: 200, statusText: 'OK', data: {}, headers: {}, config });
}

function expiredOnce(): AxiosAdapter & { seen: InternalAxiosRequestConfig[] } {
  const seen: InternalAxiosRequestConfig[] = [];
  return Object.assign(
    (config: InternalAxiosRequestConfig) => {
      seen.push(config);
      return seen.length === 1 ? refuse(config) : answer(config);
    },
    { seen }
  );
}

let ended: Mock<() => void>;
let stop: () => void;

beforeEach(() => {
  stubLocalStorage();
  ended = vi.fn<() => void>();
  stop = onSessionEnd(ended);
});

afterEach(() => {
  stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  stubCookies('');
});

describe('a 401 from a route that runs before any session', () => {
  it.each([
    '/auth/login',
    '/auth/mfa/verify',
    '/auth/reset-password',
    '/auth/passkey/reset-password/complete',
  ])('goes back to the page that called %s, and ends no session', async (url) => {
    await expect(api.post(url, {}, { adapter: refuse })).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(ended).not.toHaveBeenCalled();
  });
});

describe('a cookie session', () => {
  it('signs each write with its CSRF token, and never sends a token of its own', async () => {
    stubCookies(SESSION);
    let sent: InternalAxiosRequestConfig | undefined;

    await api.patch(
      '/user/ui-preferences',
      {},
      {
        adapter: (config) => {
          sent = config;
          return answer(config);
        },
      }
    );

    expect(sent?.headers['X-CSRF-TOKEN']).toBe('access-csrf');
    expect(sent?.headers.Authorization).toBeUndefined();
  });

  it('renews itself once refused, then replays the request', async () => {
    stubCookies(SESSION);
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ status: 204 });
    const adapter = expiredOnce();

    await api.get('/user', { adapter });

    expect(refresh).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/refresh$/),
      null,
      expect.objectContaining({ headers: { 'X-CSRF-TOKEN': 'refresh-csrf' } })
    );
    expect(adapter.seen).toHaveLength(2);
    expect(ended).not.toHaveBeenCalled();
  });

  it('ends once its renewal is refused', async () => {
    stubCookies(SESSION);
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('401'));

    await expect(api.get('/user', { adapter: refuse })).rejects.toBeDefined();

    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('is not renewed when the browser holds none', async () => {
    const refresh = vi.spyOn(axios, 'post');

    await expect(api.get('/user', { adapter: refuse })).rejects.toBeDefined();

    expect(refresh).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledTimes(1);
  });
});

describe('a public read', () => {
  it('leaves the session cookies behind', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));

    // Node's Request takes no relative address, where a browser resolves it.
    await publicAxios.get('/orgs/demo/sites', {
      baseURL: 'https://demo.localhost/v1',
      env: { fetch },
    });

    const [request] = fetch.mock.calls[0] as unknown as [Request];
    expect(request.credentials).toBe('omit');
  });
});
