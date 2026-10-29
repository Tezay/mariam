import { useCallback, useEffect, useState } from 'react';
import type { SiteRef } from '@/lib/api/client';
import {
  DEFAULT_PREFERENCES,
  getServerPreferences,
  isPushSupported,
  sendTestNotification,
  subscribeToPush,
  unsubscribeFromPush,
  updatePreferences,
  type NotificationPreferences,
} from '@/lib/push';

export function currentPermission(): NotificationPermission {
  return 'Notification' in window ? Notification.permission : 'default';
}

const NOTICE_MS = 3000;
const TEST_SENT_MS = 5000;

export function useNotifications(site: SiteRef) {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [permission, setPermission] = useState(currentPermission);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    // A subscription that follows another site reads as none: subscribing here moves it.
    (isPushSupported() ? getServerPreferences(site) : Promise.resolve(null)).then((server) => {
      if (gone) return;
      if (server) {
        setPrefs({
          notify_today_menu: server.notify_today_menu,
          notify_today_menu_time: server.notify_today_menu_time,
          notify_tomorrow_menu: server.notify_tomorrow_menu,
          notify_tomorrow_menu_time: server.notify_tomorrow_menu_time,
          notify_events: server.notify_events,
        });
      }
      setSubscribed(Boolean(server));
    });
    return () => {
      gone = true;
    };
  }, [site]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const subscribe = useCallback(async () => {
    setError(null);
    setSaving(true);
    const result = await subscribeToPush(prefs, site);
    setSaving(false);
    setPermission(currentPermission());
    if (result.success) {
      setSubscribed(true);
      setNotice('Notifications activées !');
      window.umami?.track('notifications-subscribe');
    } else {
      setError(result.error ?? 'Erreur inconnue');
    }
  }, [prefs, site]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    setSaving(true);
    const result = await unsubscribeFromPush(site);
    setSaving(false);
    if (result.success) {
      setSubscribed(false);
      setPrefs(DEFAULT_PREFERENCES);
      setNotice('Notifications désactivées.');
      window.umami?.track('notifications-unsubscribe');
    } else {
      setError(result.error ?? 'Erreur inconnue');
    }
  }, [site]);

  const changePrefs = useCallback(
    async (next: NotificationPreferences) => {
      setPrefs(next);
      if (!subscribed) return;
      setSaving(true);
      const result = await updatePreferences(next, site);
      setSaving(false);
      if (result.success) setNotice('Préférences enregistrées.');
      else setError(result.error ?? 'Erreur de sauvegarde');
    },
    [subscribed, site]
  );

  const sendTest = useCallback(async () => {
    setTesting(true);
    setTestSent(false);
    const result = await sendTestNotification(site);
    setTesting(false);
    if (result.success) {
      setTestSent(true);
      setTimeout(() => setTestSent(false), TEST_SENT_MS);
    } else {
      setError(result.error ?? 'Erreur lors du test');
    }
  }, [site]);

  const recheckPermission = useCallback(() => setPermission(currentPermission()), []);

  return {
    subscribed,
    prefs,
    setPrefs,
    permission,
    saving,
    testing,
    testSent,
    error,
    notice,
    subscribe,
    unsubscribe,
    changePrefs,
    sendTest,
    recheckPermission,
  };
}
