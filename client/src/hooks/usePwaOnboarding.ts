import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { isPwaInstalled } from '@/lib/app-install';

const SEEN_KEY = 'mariam-pwa-install-done';

export function markInstallSeen() {
  localStorage.setItem(SEEN_KEY, '1');
}

export function usePwaOnboarding(installPath: string, enabled: boolean) {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!enabled) return;
    if (localStorage.getItem(SEEN_KEY)) return;

    if (isPwaInstalled()) return;

    if (pathname === installPath || pathname === '/admin/setup') return;

    window.location.replace(installPath);
  }, [enabled, installPath, pathname]);
}
