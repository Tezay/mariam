import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StepUpRequest } from '@/hooks/useStepUp';

let account = { mfa_enabled: true, passkeys_count: 0 };
let sessionConfirmed = false;
const stepUpWithPassword = vi.fn(async (_password: string, _code: string) => {});

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: account }) }));
vi.mock('@/lib/api/auth', () => ({
  authApi: {
    isConfirmed: () => sessionConfirmed,
    stepUpWithPassword: (password: string, code: string) => stepUpWithPassword(password, code),
  },
}));

import { StepUpProvider } from '@/features/security/StepUpProvider';
import { useStepUp } from '@/hooks/useStepUp';

const answered = vi.fn();

function Probe({ request }: { request: StepUpRequest }) {
  const confirmIdentity = useStepUp();
  return <button onClick={async () => answered(await confirmIdentity(request))}>ouvrir</button>;
}

async function open(request: StepUpRequest = { description: 'Pour exporter le journal.' }) {
  render(
    <StepUpProvider>
      <Probe request={request} />
    </StepUpProvider>
  );
  await userEvent.click(screen.getByText('ouvrir'));
}

const DELETION: StepUpRequest = {
  title: 'Supprimer ce compte',
  description: 'Cette action est irréversible.',
  confirmLabel: 'Supprimer',
  tone: 'destructive',
};

beforeEach(() => {
  vi.clearAllMocks();
  account = { mfa_enabled: true, passkeys_count: 0 };
  sessionConfirmed = false;
});

describe('identity confirmation', () => {
  it('confirms once the password and the code are checked', async () => {
    await open();

    await userEvent.type(screen.getByLabelText('Votre mot de passe'), 'secret');
    await userEvent.type(screen.getByLabelText('Code de votre application'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Continuer' }));

    await waitFor(() => expect(answered).toHaveBeenCalledWith(true));
    expect(stepUpWithPassword).toHaveBeenCalledWith('secret', '123456');
  });

  it('keeps the prompt open and says so when the check fails', async () => {
    stepUpWithPassword.mockRejectedValueOnce(new Error('refused'));
    await open();

    await userEvent.type(screen.getByLabelText('Votre mot de passe'), 'wrong');
    await userEvent.type(screen.getByLabelText('Code de votre application'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Continuer' }));

    expect(await screen.findByText('Vérification impossible')).toBeTruthy();
    expect(answered).not.toHaveBeenCalled();
  });

  it('answers no when the user backs out', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(answered).toHaveBeenCalledWith(false));
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

describe('a session already confirmed', () => {
  beforeEach(() => {
    sessionConfirmed = true;
  });

  it('is asked nothing', async () => {
    await open();

    await waitFor(() => expect(answered).toHaveBeenCalledWith(true));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('still has to agree to a destructive action', async () => {
    await open(DELETION);

    expect(screen.getByText('Cette action est irréversible.')).toBeTruthy();
    expect(screen.queryByLabelText('Votre mot de passe')).toBeNull();
    expect(answered).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(answered).toHaveBeenCalledWith(true));
    expect(stepUpWithPassword).not.toHaveBeenCalled();
  });
});
