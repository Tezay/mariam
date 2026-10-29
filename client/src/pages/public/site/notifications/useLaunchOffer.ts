import { useEffect } from 'react';
import type { SiteRef } from '@/lib/api/client';
import { isPwaInstalled } from '@/lib/app-install';
import { getServerPreferences, isPushSupported } from '@/lib/push';
import { OFFERED_KEY, shouldOfferOnLaunch } from './panel-rules';
import { currentPermission } from './useNotifications';

// Unreadable storage counts as offered: better never than at every launch.
function readOffered(): boolean {
  try {
    return localStorage.getItem(OFFERED_KEY) !== null;
  } catch {
    return true;
  }
}

export function useLaunchOffer(site: SiteRef, open: () => void) {
  useEffect(() => {
    const ready = shouldOfferOnLaunch({
      installed: isPwaInstalled(),
      supported: isPushSupported(),
      permission: currentPermission(),
      subscribed: false,
      offered: readOffered(),
    });
    if (!ready) return;
    let gone = false;
    getServerPreferences(site).then((server) => {
      if (gone || server) return;
      try {
        localStorage.setItem(OFFERED_KEY, '1');
      } catch {
        return;
      }
      open();
    });
    return () => {
      gone = true;
    };
  }, [site, open]);
}
