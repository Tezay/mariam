import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  confirmedUntil,
  csrfToken,
  dropStoredTokens,
  endSession,
  forgetConfirmation,
  hasSession,
  onSessionChange,
  onSessionEnd,
  setConfirmation,
} from '@/lib/api/session';
import { stubCookies, stubLocalStorage } from '../session-fixtures';

const NOW = Date.parse('2026-10-06T10:00:00Z');
const TEN_MINUTES = 10 * 60 * 1000;

beforeEach(() => {
  stubLocalStorage();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  stubCookies('');
});

describe('the session cookies', () => {
  it('give the page their CSRF values only', () => {
    stubCookies('mariam-theme=dark; __Host-csrf-access=a%2Bb; __Host-csrf-refresh=r');

    expect([csrfToken('access'), csrfToken('refresh')]).toEqual(['a+b', 'r']);
    expect(hasSession()).toBe(true);
  });

  it('say there is no session without the refresh one', () => {
    stubCookies('__Host-csrf-access=a');

    expect(hasSession()).toBe(false);
  });
});

describe('confirmation deadline', () => {
  it('runs on this device for the seconds the server grants', () => {
    setConfirmation(600);

    expect(confirmedUntil()).toBe(NOW + TEN_MINUTES);
  });

  it('ends with an unconfirmed session', () => {
    setConfirmation(600);

    setConfirmation(0);

    expect(confirmedUntil()).toBe(0);
  });

  it('can be forgotten while the session goes on', () => {
    setConfirmation(600);
    const changed = vi.fn();
    const ended = vi.fn();
    const stops = [onSessionChange(changed), onSessionEnd(ended)];

    forgetConfirmation();
    stops.forEach((stop) => stop());

    expect(confirmedUntil()).toBe(0);
    expect([changed.mock.calls.length, ended.mock.calls.length]).toEqual([1, 0]);
  });

  it('ends with the session', () => {
    setConfirmation(600);
    const ended = vi.fn();
    const stop = onSessionEnd(ended);

    endSession();
    stop();

    expect(confirmedUntil()).toBe(0);
    expect(ended).toHaveBeenCalledTimes(1);
  });
});

describe('the tokens of the release before', () => {
  it('leave the storage', () => {
    localStorage.setItem('access_token', 'a');
    localStorage.setItem('refresh_token', 'r');
    localStorage.setItem('mariam-theme', 'dark');

    dropStoredTokens();

    expect([localStorage.getItem('access_token'), localStorage.getItem('refresh_token')]).toEqual([
      null,
      null,
    ]);
    expect(localStorage.getItem('mariam-theme')).toBe('dark');
  });
});
