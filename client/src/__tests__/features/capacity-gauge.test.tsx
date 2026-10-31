import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CapacityGauge } from '@/components/CapacityGauge';

function captionOf(state: 'available' | 'reached' | 'idle', reachedAt: string | null = null) {
  render(<CapacityGauge capacity={1200} state={state} reachedAt={reachedAt} />);
  return screen.getByRole('region', { name: 'Capacité maximale' }).textContent;
}

describe('CapacityGauge', () => {
  it('says there is room, with the capacity', () => {
    expect(captionOf('available')).toBe(
      'Places disponiblesCapacité maximale · 1 200 repas par service'
    );
  });

  it('says since when the service is full', () => {
    expect(captionOf('reached', '2026-01-15T11:05:00Z')).toBe(
      'Capacité atteinteDepuis 12h05 · 1 200 repas par service'
    );
  });

  it('shows the capacity alone outside the service', () => {
    expect(captionOf('idle')).toBe('1 200 repas par serviceCapacité maximale');
  });
});
