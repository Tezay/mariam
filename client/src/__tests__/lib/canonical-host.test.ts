import { describe, it, expect } from 'vitest';
import { canonicalTarget } from '@/lib/canonical-host';

describe('canonicalTarget', () => {
  it('returns the target when the host differs', () => {
    expect(canonicalTarget('old.example.app', 'new.example.app')).toBe('new.example.app');
  });

  it('returns null when already on the canonical host', () => {
    expect(canonicalTarget('new.example.app', 'new.example.app')).toBeNull();
  });

  it('returns null when unconfigured', () => {
    expect(canonicalTarget('old.example.app', undefined)).toBeNull();
    expect(canonicalTarget('old.example.app', '   ')).toBeNull();
  });

  it('returns null when the placeholder was never substituted', () => {
    expect(canonicalTarget('old.example.app', '__CANONICAL_HOST__')).toBeNull();
  });
});
