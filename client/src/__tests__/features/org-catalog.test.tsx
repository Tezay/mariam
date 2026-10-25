import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'org_admin', organization_slug: 'crous' } }),
}));
vi.mock('@/lib/api/admin', () => ({
  adminApi: { getUiPreferences: async () => ({}), updateUiPreferences: async () => ({}) },
}));
vi.mock('@/lib/api/org', () => ({
  orgApi: {
    getCatalog: async () => ({
      items: [
        {
          normalized_name: 'chili',
          display_name: 'Chili',
          image_url: null,
          site_count: 2,
          photo_count: 0,
          usage_count: 3,
          votes: 0,
          score: null,
          sites: [],
        },
      ],
      total_count: 1,
    }),
  },
}));

import { CatalogView } from '@/features/catalog/CatalogView';
import { stubLocalStorage } from '../session-fixtures';

beforeAll(() => {
  stubLocalStorage();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  window.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
});

describe("the organization's catalogue", () => {
  it('renders outside any site', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <CatalogView scope="org" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Chili')).toBeTruthy();
  });
});
