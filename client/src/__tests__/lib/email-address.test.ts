import { describe, it, expect } from 'vitest';
import { canonicalEmail } from '@/lib/email-address';

describe('canonicalEmail', () => {
  it('lowercases and trims', () => {
    expect(canonicalEmail('  Jean.Dupont@Mariam.App ')).toBe('jean.dupont@mariam.app');
  });

  it.each(['', 'jean', 'jéan@mariam.app', 'jean@mariаm.app', `${'a'.repeat(120)}@m.app`])(
    'refuses %j',
    (email) => {
      expect(canonicalEmail(email)).toBeNull();
    }
  );
});
