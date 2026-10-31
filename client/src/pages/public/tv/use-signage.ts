import { useEffect, useRef, useState } from 'react';
import { nowInstant } from '@/lib/date-utils';
import { MAX_DENSITY, nextReloadDelay } from './tv-layout';

declare global {
  interface Window {
    __mariamTv?: boolean;
  }
}

const RETRY_MS = 10 * 60_000;

export function useSignage() {
  useEffect(() => {
    // /tv-watchdog.js reloads the page for as long as this is missing.
    window.__mariamTv = true;
  }, []);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          lock = sentinel;
        })
        .catch(() => {});
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => {});
    };
  }, []);

  // A nightly reload brings a new release and a fresh memory to players that never stop,
  // and waits for the server: reloading into an error page would blank the screen.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        fetch('/healthz', { cache: 'no-store' })
          .then((response) => (response.ok ? window.location.reload() : schedule(RETRY_MS)))
          .catch(() => schedule(RETRY_MS));
      }, delay);
    };
    schedule(nextReloadDelay(nowInstant()));
    return () => clearTimeout(timer);
  }, []);
}

export function useFitDensity(predicted: number, content: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [density, setDensity] = useState(predicted);

  useEffect(() => setDensity(predicted), [predicted, content]);

  useEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const fit = () => {
      if (box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1) {
        setDensity((level) => Math.min(level + 1, MAX_DENSITY));
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [density, content]);

  return { ref, density };
}
