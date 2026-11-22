import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';

const signIn = vi.fn();
const acceptInvitation = vi.fn(async () => ({ sites: [], organizations: [] }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'eliot@mariam.app', sites: [], organizations: [] },
    isLoading: false,
    signIn,
    logout: vi.fn(),
  }),
}));
vi.mock('@/lib/api/auth', () => ({
  authApi: {
    checkActivationLink: async () => ({
      link_type: 'invite',
      email: null,
      role: 'editor',
      site: { slug: 'nord', name: 'RU Nord' },
      organization: { slug: 'crous', name: 'Crous' },
    }),
  },
}));
vi.mock('@/lib/api/user', () => ({ userApi: { acceptInvitation } }));

const { Activate } = await import('@/pages/Activate');

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

describe('an invitation opened by a signed-in account', () => {
  it('joins the site with that account, then opens it', async () => {
    render(
      <MemoryRouter initialEntries={['/activate/tok']}>
        <Routes>
          <Route path="/activate/:token" element={<Activate />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('eliot@mariam.app')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Rejoindre' }));

    expect(acceptInvitation).toHaveBeenCalledWith('tok');
    expect(signIn).toHaveBeenCalled();
    expect((await screen.findByTestId('where')).textContent).toBe('/admin/crous/nord');
  });
});
