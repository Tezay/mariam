import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const site = { org: 'demo', site: 'sciences' };
const api = vi.hoisted(() => ({
  getOwnLiveStatus: vi.fn(),
  setLiveStatus: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/contexts/SiteContext', () => ({ useSiteRef: () => site }));
vi.mock('@/lib/api/sites', () => ({
  sitesApi: { getOwnLiveStatus: api.getOwnLiveStatus, setLiveStatus: api.setLiveStatus },
}));
vi.mock('@/lib/toast', () => ({ notify: { error: api.error } }));

const { CapacityCard } = await import('@/pages/admin/service/CapacityCard');

async function openCard() {
  render(<CapacityCard capacity={450} />);
  const full = screen.getByRole('radio', { name: 'Capacité atteinte' });
  await waitFor(() => expect(full.hasAttribute('disabled')).toBe(false));
  return full;
}

describe('CapacityCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getOwnLiveStatus.mockResolvedValue({ capacity_reached: false, reached_at: null });
  });

  it("tells the site's page that the service is full", async () => {
    api.setLiveStatus.mockResolvedValue({
      capacity_reached: true,
      reached_at: '2026-10-30T11:50:00Z',
    });
    const full = await openCard();

    await userEvent.click(full);

    expect(api.setLiveStatus).toHaveBeenCalledWith(site, true);
    await waitFor(() => expect(full.getAttribute('aria-checked')).toBe('true'));
  });

  it('puts the choice back, and says so, when the state is not saved', async () => {
    api.setLiveStatus.mockRejectedValue(new Error('offline'));
    const full = await openCard();

    await userEvent.click(full);

    await waitFor(() => expect(full.getAttribute('aria-checked')).toBe('false'));
    expect(
      screen.getByRole('radio', { name: 'Places disponibles' }).getAttribute('aria-checked')
    ).toBe('true');
    expect(api.error).toHaveBeenCalled();
  });
});
