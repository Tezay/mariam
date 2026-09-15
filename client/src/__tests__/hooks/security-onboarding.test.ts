import { describe, it, expect } from 'vitest';
import { needsSecuritySetup } from '@/hooks/useSecurityOnboarding';

describe('needsSecuritySetup', () => {
  it('is true when the account has neither factor', () => {
    expect(needsSecuritySetup({ mfa_enabled: false, passkeys_count: 0 })).toBe(true);
  });

  it('is false with a TOTP', () => {
    expect(needsSecuritySetup({ mfa_enabled: true, passkeys_count: 0 })).toBe(false);
  });

  it('is false with a passkey', () => {
    expect(needsSecuritySetup({ mfa_enabled: false, passkeys_count: 2 })).toBe(false);
  });

  it('treats a missing count as none', () => {
    expect(needsSecuritySetup({ mfa_enabled: false })).toBe(true);
  });

  it('is false while the user is unknown', () => {
    expect(needsSecuritySetup(null)).toBe(false);
    expect(needsSecuritySetup(undefined)).toBe(false);
  });
});
