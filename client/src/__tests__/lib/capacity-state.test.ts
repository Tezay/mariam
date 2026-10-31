import { describe, expect, it } from 'vitest';
import { capacityState } from '@/lib/capacity-state';

describe('capacityState', () => {
  it('rests outside the service, reached or not', () => {
    expect(capacityState(false, false)).toBe('idle');
    expect(capacityState(true, false)).toBe('idle');
  });

  it('says whether the service has room while it runs', () => {
    expect(capacityState(false, true)).toBe('available');
    expect(capacityState(true, true)).toBe('reached');
  });

  it('claims nothing when the state could not be read', () => {
    expect(capacityState(null, true)).toBe('idle');
  });
});
