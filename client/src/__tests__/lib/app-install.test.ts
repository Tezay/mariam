import { describe, expect, it } from 'vitest';
import { installMethod, isSafari } from '@/lib/app-install';

const BROWSER: Parameters<typeof installMethod>[0] = {
  platform: 'desktop',
  installed: false,
  offer: false,
  chromium: false,
  safari: false,
};

describe('installMethod', () => {
  it.each<[string, Partial<typeof BROWSER>, string]>([
    ['the installed app itself', { installed: true, offer: true }, 'installed'],
    ["the browser's own offer", { chromium: true, offer: true }, 'offer'],
    ['Safari on an iPhone', { platform: 'ios', safari: true }, 'home-screen'],
    ['another browser on an iPhone', { platform: 'ios' }, 'open-in-safari'],
    ['an Android browser with no offer', { platform: 'android' }, 'browser-menu'],
    ['Safari on a Mac', { safari: true }, 'dock'],
    ['Chrome or Edge with no offer', { chromium: true }, 'browser-menu'],
    ['Firefox on a computer', {}, 'unsupported'],
  ])('installs from %s', (_, browser, expected) => {
    expect(installMethod({ ...BROWSER, ...browser })).toBe(expected);
  });
});

describe('isSafari', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      true,
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
      true,
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1',
      false,
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      false,
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      false,
    ],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0', false],
  ])('reads %s', (ua, expected) => {
    expect(isSafari(ua)).toBe(expected);
  });
});
