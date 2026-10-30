import { describe, expect, it } from 'vitest';
import { shouldOfferPasskey } from '@/lib/passkey-offer';

const NOW = Date.parse('2026-10-30T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const SIGN_IN: Parameters<typeof shouldOfferPasskey>[0] = {
  method: 'passkey',
  attachment: 'cross-platform',
  platformAvailable: true,
  answer: {},
  hasSecondFactor: true,
  now: NOW,
};

describe('shouldOfferPasskey', () => {
  it.each<[string, Partial<typeof SIGN_IN>, boolean]>([
    ["the phone's passkey", {}, true],
    ['a password and a code', { method: 'password', attachment: undefined }, true],
    ["this device's own passkey", { attachment: 'platform' }, false],
    ['a browser that does not say which one', { attachment: null }, false],
    ['a device with no authenticator of its own', { platformAvailable: false }, false],
    ['an account still without a second factor', { hasSecondFactor: false }, false],
    ['a passkey created after the offer', { answer: { created: true } }, false],
    ['a refusal 59 days ago', { answer: { declinedAt: NOW - 59 * DAY } }, false],
    ['a refusal 61 days ago', { answer: { declinedAt: NOW - 61 * DAY } }, true],
  ])('after a sign-in with %s: %s', (_, signIn, expected) => {
    expect(shouldOfferPasskey({ ...SIGN_IN, ...signIn })).toBe(expected);
  });
});
