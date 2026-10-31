import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { parisToday } from '@/lib/date-utils';

const site = { org: 'demo', site: 'sciences' };
const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));

vi.mock('@/contexts/SiteContext', () => ({ useSiteRef: () => site }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'editor' } }) }));
vi.mock('@/lib/toast', () => ({ notify: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api/news', async (actual) => ({
  ...(await actual<typeof import('@/lib/api/news')>()),
  newsApi: { list: api.list, create: api.create },
}));

const { NewsPage } = await import('@/pages/admin/NewsPage');
const { NewsEditPage } = await import('@/pages/admin/NewsEditPage');

const item = {
  id: 7,
  title: 'Repas de Noël',
  date: null,
  pinned: true,
  published_at: null,
  status: 'draft',
  images: [],
};

describe('the news list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue({ items: [item], total_count: 30 });
  });

  it('asks each tab for its list, and the next page on demand', async () => {
    render(
      <MemoryRouter>
        <NewsPage />
      </MemoryRouter>
    );
    await screen.findByText('Repas de Noël');

    await userEvent.click(screen.getByRole('button', { name: /Suivant/ }));
    await userEvent.click(screen.getByRole('tab', { name: 'À venir' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Brouillons' }));

    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(4));
    expect(api.list.mock.calls.map(([, query]) => query)).toEqual([
      { page: 1, per_page: 12 },
      { page: 2, per_page: 12 },
      { sort: 'date', from: parisToday(), page: 1, per_page: 12 },
      { status: 'draft', page: 1, per_page: 12 },
    ]);
  });
});

describe('the news editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.create.mockResolvedValue({ ...item, id: 8 });
  });

  it('saves an undated item, pinned', async () => {
    render(
      <MemoryRouter>
        <NewsEditPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByPlaceholderText("Titre de l'actualité"), 'Repas de Noël');
    await userEvent.click(screen.getByRole('switch', { name: /À la une/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));

    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][1]).toMatchObject({
      title: 'Repas de Noël',
      date: null,
      pinned: true,
    });
  });
});
