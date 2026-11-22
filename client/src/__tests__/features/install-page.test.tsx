import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Account } from '@/lib/api/user';

let account: Partial<Account>;
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: account }) }));
vi.mock('@/hooks/useStepUp', () => ({
  useStepUp: () => async () => false,
  useIdentityConfirmed: () => false,
}));

const { InstallPage } = await import('@/pages/admin/InstallPage');

const SUPERVISION = [{ slug: 'crous', name: 'Crous' }];

function open(path: string, organizations: Account['organizations'] = []) {
  account = { mfa_enabled: true, sites: [], organizations };
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/install" element={<InstallPage />} />
        <Route path="/org/install" element={<InstallPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('the install page', () => {
  it('installs the app its address names', () => {
    open('/org/install', SUPERVISION);

    expect(screen.getByRole('heading', { name: 'Installez Mariam - Supervision' })).toBeDefined();
  });

  it('sends an account to the app it holds a place in', () => {
    open('/org/install');

    expect(screen.getByRole('heading', { name: 'Installez Mariam - Gestion' })).toBeDefined();
  });

  it('says when this browser cannot install it', () => {
    open('/admin/install');

    expect(screen.getByText(/ouvrez cette page dans Chrome, Edge ou Safari/)).toBeDefined();
  });
});
