export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(): Platform {
  const ua = navigator.userAgent || '';
  if (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ) {
    return 'ios';
  }
  if (/Android/.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

export function isPwaInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Chrome, Edge and the other browsers of iOS name Safari in their user agent too.
export function isSafari(ua: string = navigator.userAgent): boolean {
  return /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Edg|OPR|Android/.test(ua);
}

export type InstallMethod =
  | 'installed'
  | 'offer'
  | 'home-screen'
  | 'open-in-safari'
  | 'browser-menu'
  | 'dock'
  | 'unsupported';

export function installMethod({
  platform,
  installed,
  offer,
  chromium,
  safari,
}: {
  platform: Platform;
  installed: boolean;
  /** The browser's own install prompt, ready to show. */
  offer: boolean;
  chromium: boolean;
  safari: boolean;
}): InstallMethod {
  if (installed) return 'installed';
  if (offer) return 'offer';
  if (platform === 'ios') return safari ? 'home-screen' : 'open-in-safari';
  if (platform === 'android') return 'browser-menu';
  if (safari) return 'dock';
  return chromium ? 'browser-menu' : 'unsupported';
}
