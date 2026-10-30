import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/lib/api/auth', () => ({
  authApi: {
    checkResetLink: async () => ({
      email: 'eliot@example.org',
      mfa_enabled: true,
      has_passkeys: false,
    }),
  },
}));

const { ResetPassword } = await import('@/pages/ResetPassword');

describe('the password reset', () => {
  it('sends the new password in the form of its code, for password managers', async () => {
    render(
      <MemoryRouter initialEntries={['/reset-password/token']}>
        <Routes>
          <Route path="/reset-password/:token" element={<ResetPassword />} />
        </Routes>
      </MemoryRouter>
    );

    const form = (
      (await screen.findByLabelText("Code d'authentification (A2F)")) as HTMLInputElement
    ).form;
    expect(form).not.toBeNull();
    expect((screen.getByLabelText('Adresse email') as HTMLInputElement).form).toBe(form);
    expect((screen.getByLabelText('Nouveau mot de passe') as HTMLInputElement).form).toBe(form);
  });
});
