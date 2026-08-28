import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SEEN_KEY = 'mariam-pwa-install-done';

/**
 * Sends a dashboard user to the install walkthrough once, on their first visit
 * from a browser. Uses a full reload so the page mounts outside the shell.
 */
export function usePwaOnboarding(installPath: string, enabled: boolean) {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!enabled) return;
    if (localStorage.getItem(SEEN_KEY)) return;

    const isPwa =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isPwa) return;

    if (pathname === installPath || pathname === '/admin/setup') return;

    window.location.replace(installPath);
  }, [enabled, installPath, pathname]);
}
