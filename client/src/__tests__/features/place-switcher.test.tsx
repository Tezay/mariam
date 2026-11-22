import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { Account } from '@/lib/api/user';
import { PlaceProvider } from '@/contexts/PlaceContext';

const crous = { slug: 'crous', name: 'Crous' };
let account: Account;
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: account }) }));

const { PlaceSwitcher } = await import('@/components/layout/PlaceSwitcher');

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderOn(sites: Account['sites'], organizations: Account['organizations'] = []) {
  account = { sites, organizations } as Account;
  render(
    <MemoryRouter initialEntries={['/admin/crous/nord']}>
      <PlaceProvider value={{ place: { kind: 'site', org: 'crous', site: 'nord' }, role: 'admin' }}>
        <PlaceSwitcher />
      </PlaceProvider>
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('the place switcher', () => {
  it('names the only place, with nothing to choose', () => {
    renderOn([{ slug: 'nord', name: 'Nord', role: 'admin', organization: crous }]);

    expect(screen.getByText('Nord')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens another place of the account', async () => {
    renderOn(
      [
        { slug: 'nord', name: 'Nord', role: 'admin', organization: crous },
        { slug: 'sud', name: 'Sud', role: 'editor', organization: crous },
      ],
      [crous]
    );

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Supervision')).toBeDefined();
    await userEvent.click(screen.getByText('Sud'));

    expect(screen.getByTestId('where').textContent).toBe('/admin/crous/sud');
  });
});
