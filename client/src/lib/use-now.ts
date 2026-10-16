import { useEffect, useState } from 'react';
import { nowInstant } from './date-utils';

/**
 * Starts from the instant the server rendered at, so the markup hydrates
 * unchanged, then follows the clock.
 */
export function useNow(serverNow: number, intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    setNow(nowInstant());
    const timer = setInterval(() => setNow(nowInstant()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
