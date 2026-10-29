import type { Platform } from '@/lib/app-install';

type PanelScreen =
  | 'loading'
  | 'install'
  | 'insecure'
  | 'unsupported'
  | 'blocked'
  | 'subscribe'
  | 'subscribed';

export interface PanelState {
  platform: Platform;
  installed: boolean;
  secure: boolean;
  supported: boolean;
  permission: NotificationPermission;
  /** Null until the browser and the API have answered. */
  subscribed: boolean | null;
}

export function panelScreen(state: PanelState): PanelScreen {
  // iOS hides push from Safari altogether: installing comes before any other check.
  if (state.platform === 'ios' && !state.installed) return 'install';
  if (!state.secure) return 'insecure';
  if (!state.supported) return 'unsupported';
  if (state.permission === 'denied') return 'blocked';
  if (state.subscribed === null) return 'loading';
  return state.subscribed ? 'subscribed' : 'subscribe';
}

export const OFFERED_KEY = 'mariam-notifications-offered';

export function shouldOfferOnLaunch({
  installed,
  supported,
  permission,
  subscribed,
  offered,
}: {
  installed: boolean;
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  offered: boolean;
}): boolean {
  return installed && supported && permission === 'default' && !subscribed && !offered;
}
