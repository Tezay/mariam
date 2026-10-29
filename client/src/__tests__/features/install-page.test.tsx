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

function openAs(role: Account['role'], path: string) {
  account = { role, mfa_enabled: true };
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
  it("sends a supervisor to the supervision's own", () => {
    openAs('org_admin', '/admin/install');

    expect(screen.getByRole('heading', { name: 'Installez Mariam - Supervision' })).toBeDefined();
  });

  it("sends a site's admin to the dashboard's own", () => {
    openAs('admin', '/org/install');

    expect(screen.getByRole('heading', { name: 'Installez Mariam - Gestion' })).toBeDefined();
  });

  it('says when this browser cannot install it', () => {
    openAs('editor', '/admin/install');

    expect(screen.getByText(/ouvrez cette page dans Chrome, Edge ou Safari/)).toBeDefined();
  });
});
