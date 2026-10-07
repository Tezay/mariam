import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useIdentityConfirmed } from '@/hooks/useStepUp';
import { setAccessToken } from '@/lib/api/tokens';
import { accessToken, stubLocalStorage } from '../session-fixtures';

const NOW = Date.parse('2026-10-06T10:00:00Z');
const MINUTE = 60 * 1000;

const ISSUED = NOW / 1000;
const CONFIRMED = accessToken({ iat: ISSUED, fresh: ISSUED + 600 });
const UNCONFIRMED = accessToken({ iat: ISSUED, fresh: false });

beforeEach(() => {
  stubLocalStorage();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useIdentityConfirmed', () => {
  it('follows the session', () => {
    const { result } = renderHook(() => useIdentityConfirmed());
    expect(result.current).toBe(false);

    act(() => setAccessToken(CONFIRMED));
    expect(result.current).toBe(true);

    act(() => setAccessToken(UNCONFIRMED));
    expect(result.current).toBe(false);
  });

  it('turns false by itself when the confirmation lapses', () => {
    setAccessToken(CONFIRMED);
    const { result } = renderHook(() => useIdentityConfirmed());

    act(() => vi.advanceTimersByTime(10 * MINUTE - 1));
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it('asks for the time a caller needs ahead', () => {
    setAccessToken(CONFIRMED);
    const { result } = renderHook(() => useIdentityConfirmed(7 * MINUTE));
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(3 * MINUTE));
    expect(result.current).toBe(false);
  });
});
