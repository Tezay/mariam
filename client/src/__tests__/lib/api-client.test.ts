import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '@/lib/api/client';
import { onTokensChange } from '@/lib/api/tokens';
import { stubLocalStorage } from '../session-fixtures';

function refuse(config: InternalAxiosRequestConfig): Promise<never> {
  return Promise.reject(
    new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, config, null, {
      status: 401,
      statusText: 'UNAUTHORIZED',
      data: { error: 'Code MFA invalide' },
      headers: {},
      config,
    })
  );
}

beforeEach(() => {
  stubLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a 401 from a route that runs before any session', () => {
  it.each([
    '/auth/login',
    '/auth/mfa/verify',
    '/auth/reset-password',
    '/auth/passkey/reset-password/complete',
  ])('goes back to the page that called %s, and ends no session', async (url) => {
    const sessionEnded = vi.fn();
    const unsubscribe = onTokensChange(sessionEnded);

    await expect(api.post(url, {}, { adapter: refuse })).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(sessionEnded).not.toHaveBeenCalled();
    unsubscribe();
  });
});
