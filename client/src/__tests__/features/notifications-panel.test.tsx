import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  panelScreen,
  shouldOfferOnLaunch,
  type PanelState,
} from '@/pages/public/site/notifications/panel-rules';
import { NotificationsPanel } from '@/pages/public/site/notifications/NotificationsPanel';

vi.mock('@/lib/push', async (actual) => ({
  ...(await actual<typeof import('@/lib/push')>()),
  isPushSupported: () => true,
  getServerPreferences: async () => null,
}));
vi.mock('@/lib/app-install', async (actual) => ({
  ...(await actual<typeof import('@/lib/app-install')>()),
  isPwaInstalled: () => false,
  detectPlatform: () => 'desktop',
}));

const READY: PanelState = {
  platform: 'android',
  installed: false,
  secure: true,
  supported: true,
  permission: 'default',
  subscribed: false,
};

describe('panelScreen', () => {
  it.each<[string, Partial<PanelState>, string]>([
    ['an iPhone, before the app is installed', { platform: 'ios' }, 'install'],
    ['a page served without HTTPS', { secure: false }, 'insecure'],
    ['a browser without push', { supported: false }, 'unsupported'],
    ['notifications refused', { permission: 'denied' }, 'blocked'],
    ['a subscription still being read', { subscribed: null }, 'loading'],
    ['a browser not subscribed', {}, 'subscribe'],
    ['a browser already subscribed', { subscribed: true }, 'subscribed'],
    ['an installed iPhone app', { platform: 'ios', installed: true }, 'subscribe'],
  ])('shows %s its screen', (_, state, expected) => {
    expect(panelScreen({ ...READY, ...state })).toBe(expected);
  });
});

describe('shouldOfferOnLaunch', () => {
  const launch = {
    installed: true,
    supported: true,
    permission: 'default' as NotificationPermission,
    subscribed: false,
    offered: false,
  };

  it('offers the panel once, on the first launch of the installed app', () => {
    expect(shouldOfferOnLaunch(launch)).toBe(true);
    expect(shouldOfferOnLaunch({ ...launch, offered: true })).toBe(false);
  });

  it('stays closed in the browser, for a subscriber, and once notifications are refused', () => {
    expect(shouldOfferOnLaunch({ ...launch, installed: false })).toBe(false);
    expect(shouldOfferOnLaunch({ ...launch, subscribed: true })).toBe(false);
    expect(shouldOfferOnLaunch({ ...launch, permission: 'denied' })).toBe(false);
  });
});

describe('the notifications panel', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width'),
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });

  beforeEach(() => vi.stubGlobal('Notification', { permission: 'default' }));
  afterEach(() => vi.unstubAllGlobals());

  const open = () =>
    render(
      <NotificationsPanel
        site={{ org: 'demo', site: 'sciences' }}
        siteName="Restaurant des Sciences"
        open
        onOpenChange={() => {}}
      />
    );

  it('offers to subscribe, with the preferences to set first', async () => {
    open();

    expect(await screen.findByRole('button', { name: 'Activer les notifications' })).toBeDefined();
    expect(screen.getByText('Restaurant des Sciences')).toBeDefined();
    expect(screen.getByRole('switch', { name: /Menu du jour/ })).toBeDefined();
  });

  it('says how to unblock notifications refused before', async () => {
    vi.stubGlobal('Notification', { permission: 'denied' });
    open();

    expect(await screen.findByText('Notifications bloquées')).toBeDefined();
    expect(screen.getByRole('button', { name: "J'ai réactivé" })).toBeDefined();
  });
});
