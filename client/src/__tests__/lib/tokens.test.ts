import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearTokens,
  confirmedUntil,
  forgetConfirmation,
  onTokensChange,
  setAccessToken,
  storeTokens,
} from '@/lib/api/tokens';
import { accessToken, stubLocalStorage } from '../session-fixtures';

const NOW = Date.parse('2026-10-06T10:00:00Z');
const TEN_MINUTES = 10 * 60 * 1000;

function confirmedToken(issuedAt: number): string {
  return accessToken({ iat: issuedAt, fresh: issuedAt + 600 });
}

beforeEach(() => {
  stubLocalStorage();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('confirmation deadline', () => {
  it('runs for the time the token grants', () => {
    storeTokens(confirmedToken(NOW / 1000), 'refresh');

    expect(confirmedUntil()).toBe(NOW + TEN_MINUTES);
  });

  it('is counted on this device, whatever the clock of the server', () => {
    const anHourAhead = NOW / 1000 + 3600;

    setAccessToken(confirmedToken(anHourAhead));

    expect(confirmedUntil()).toBe(NOW + TEN_MINUTES);
  });

  it('ends with a token that is not confirmed', () => {
    storeTokens(confirmedToken(NOW / 1000), 'refresh');

    setAccessToken(accessToken({ iat: NOW / 1000, fresh: false }));

    expect(confirmedUntil()).toBe(0);
  });

  it.each(['not-a-token', accessToken({ iat: NOW / 1000 }), accessToken({ fresh: true })])(
    'takes %j for unconfirmed',
    (token) => {
      setAccessToken(token);

      expect(confirmedUntil()).toBe(0);
    }
  );

  it('ends with the session', () => {
    storeTokens(confirmedToken(NOW / 1000), 'refresh');

    clearTokens();

    expect(confirmedUntil()).toBe(0);
  });

  it('can be forgotten while the session goes on', () => {
    storeTokens(confirmedToken(NOW / 1000), 'refresh');
    const changed = vi.fn();
    const unsubscribe = onTokensChange(changed);

    forgetConfirmation();
    unsubscribe();

    expect(confirmedUntil()).toBe(0);
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
