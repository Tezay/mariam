import { describe, expect, it } from 'vitest';
import { workerScope } from '@/lib/worker-scope';

describe('workerScope', () => {
  it("keeps a public page's worker within its organization", () => {
    expect(workerScope('/crous/efrei')).toBe('/crous/');
    expect(workerScope('/crous')).toBe('/crous/');
  });

  it('gives the dashboard the whole host', () => {
    expect(workerScope('/admin/crous/efrei/calendar')).toBe('/');
    expect(workerScope('/login')).toBe('/');
  });

  it('registers none on a page of no organization', () => {
    expect(workerScope('/')).toBeNull();
    expect(workerScope('/privacy')).toBeNull();
  });
});
