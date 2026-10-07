import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let account = { mfa_enabled: true, passkeys_count: 0 };
const stepUpWithPassword = vi.fn(async (_password: string, _code: string) => 'proof-123');

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: account }) }));
vi.mock('@/lib/api/auth', () => ({
  authApi: {
    stepUpWithPassword: (password: string, code: string) => stepUpWithPassword(password, code),
  },
}));

import { StepUpProvider } from '@/features/security/StepUpProvider';
import { useStepUp } from '@/hooks/useStepUp';

const answered = vi.fn();

function Probe() {
  const confirmIdentity = useStepUp();
  const ask = async () =>
    answered(
      await confirmIdentity({
        title: 'Supprimer ce compte',
        description: 'Confirmez votre identité.',
        confirmLabel: 'Supprimer',
      })
    );
  return <button onClick={ask}>ouvrir</button>;
}

async function open() {
  render(
    <StepUpProvider>
      <Probe />
    </StepUpProvider>
  );
  await userEvent.click(screen.getByText('ouvrir'));
}

beforeEach(() => {
  vi.clearAllMocks();
  account = { mfa_enabled: true, passkeys_count: 0 };
});

describe('identity confirmation', () => {
  it('hands back the proof once the password and the code are checked', async () => {
    await open();

    await userEvent.type(screen.getByLabelText('Votre mot de passe'), 'secret');
    await userEvent.type(screen.getByLabelText('Code de votre application'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(answered).toHaveBeenCalledWith('proof-123'));
    expect(stepUpWithPassword).toHaveBeenCalledWith('secret', '123456');
  });

  it('keeps the prompt open and says so when the check fails', async () => {
    stepUpWithPassword.mockRejectedValueOnce(new Error('refused'));
    await open();

    await userEvent.type(screen.getByLabelText('Votre mot de passe'), 'wrong');
    await userEvent.type(screen.getByLabelText('Code de votre application'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    expect(await screen.findByText('Vérification impossible')).toBeTruthy();
    expect(answered).not.toHaveBeenCalled();
  });

  it('answers with nothing when the user backs out', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(answered).toHaveBeenCalledWith(null));
    expect(stepUpWithPassword).not.toHaveBeenCalled();
  });

  it('offers the passkey alone to an account without a code', async () => {
    account = { mfa_enabled: false, passkeys_count: 1 };
    await open();

    expect(screen.getByRole('button', { name: /Confirmer avec ma passkey/ })).toBeTruthy();
    expect(screen.queryByLabelText('Votre mot de passe')).toBeNull();
  });

  it('offers nothing to an account without a second factor', async () => {
    account = { mfa_enabled: false, passkeys_count: 0 };
    await open();

    expect(screen.getByText(/Configurez-la d'abord/)).toBeTruthy();
    expect(screen.queryByLabelText('Votre mot de passe')).toBeNull();
    expect(screen.queryByRole('button', { name: /passkey/ })).toBeNull();
  });
});
