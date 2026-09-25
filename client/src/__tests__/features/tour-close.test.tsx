import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const stored: Record<string, boolean> = {
  tour_done: false,
  tour_catalog_done: false,
  tour_stats_done: false,
};
let writeFails = false;

const getUiPreferences = vi.fn(async () => ({ ...stored }));
const updateUiPreferences = vi.fn(async (prefs: Record<string, boolean>) => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (writeFails) throw new Error('offline');
  Object.assign(stored, prefs);
  return { ...stored };
});

vi.mock('@/lib/api/admin', () => ({
  adminApi: {
    getUiPreferences: () => getUiPreferences(),
    updateUiPreferences: (prefs: Record<string, boolean>) => updateUiPreferences(prefs),
  },
}));

import { TourHost } from '@/features/tour/TourHost';

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  // Joyride only shows a step whose target has a box; jsdom gives none.
  const rect = { x: 0, y: 0, width: 120, height: 40, top: 10, left: 10, right: 130, bottom: 50 };
  HTMLElement.prototype.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
  HTMLElement.prototype.getClientRects = (() =>
    [
      { ...rect, toJSON: () => rect },
    ] as unknown as DOMRectList) as unknown as typeof HTMLElement.prototype.getClientRects;
  window.scrollTo = () => {};
});

let queryClient: QueryClient;

beforeEach(() => {
  Object.assign(stored, {
    tour_done: false,
    tour_catalog_done: false,
    tour_stats_done: false,
  });
  writeFails = false;
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});

function Calendar({ visited }: { visited: boolean }) {
  return (
    <QueryClientProvider client={queryClient}>
      <div data-tour="nav">
        <a href="/admin/service">Service</a>
        <a href="/admin/catalogue">Catalogue</a>
        <a href="/admin/stats">Statistiques</a>
      </div>
      <div data-tour="calendar-new">Nouveau menu</div>
      <div data-tour="calendar-publish">Publier</div>
      <TourHost tour="orientation" enabled={visited} />
    </QueryClientProvider>
  );
}

const cross = () => screen.queryByLabelText('Fermer');
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

describe('dismissing a tour with the cross', () => {
  it('records it and does not replay it on the next visit', async () => {
    const view = render(<Calendar visited />);

    await userEvent.click(await screen.findByLabelText('Fermer'));

    await waitFor(() => expect(updateUiPreferences).toHaveBeenCalledWith({ tour_done: true }));
    await waitFor(() => expect(stored.tour_done).toBe(true));

    view.rerender(<Calendar visited={false} />);
    view.rerender(<Calendar visited />);
    await settle();

    expect(cross()).toBeNull();
  });

  it('does not replay it when the write never lands', async () => {
    writeFails = true;
    const view = render(<Calendar visited />);

    await userEvent.click(await screen.findByLabelText('Fermer'));
    await waitFor(() => expect(updateUiPreferences).toHaveBeenCalled());

    view.rerender(<Calendar visited={false} />);
    view.rerender(<Calendar visited />);
    await settle();

    expect(cross()).toBeNull();
  });
});
