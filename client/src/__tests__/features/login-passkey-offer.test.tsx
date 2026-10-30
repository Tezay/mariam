import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter } from 'react-router';
import type { Account } from '@/lib/api/user';
import { stubLocalStorage } from '../session-fixtures';

const account = {
  role: 'admin',
  mfa_enabled: true,
  passkeys_count: 1,
  username: 'Eliot',
} as Account;
const signIn = vi.fn();
const registerPasskey = vi.fn();
const login = vi.fn();
const passkeyLoginComplete = vi.fn();
const signalUnknownPasskey = vi.fn();
let attachment: string;
let platform: 'desktop' | 'ios';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ signIn }) }));
vi.mock('@/lib/app-install', async (actual) => ({
  ...(await actual<typeof import('@/lib/app-install')>()),
  detectPlatform: () => platform,
}));
vi.mock('@/lib/passkey-registration', () => ({
  registerPasskey: (options: unknown) => registerPasskey(options),
}));
vi.mock('@/lib/api/auth', () => ({
  authApi: {
    login: (email: string, password: string) => login(email, password),
    passkeyLoginBegin: async () => ({ options: { rpId: 'mariam.test' }, challenge_token: 'c' }),
    passkeyLoginComplete: () => passkeyLoginComplete(),
  },
}));
vi.mock('@/lib/passkey-signals', () => ({
  signalUnknownPasskey: (rpId: string, credentialId: string) =>
    signalUnknownPasskey(rpId, credentialId),
}));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthnAutofill: async () => false,
  platformAuthenticatorIsAvailable: async () => true,
  startAuthentication: async () => ({ id: 'credential-id', authenticatorAttachment: attachment }),
  WebAuthnAbortService: { cancelCeremony: () => {} },
}));

const { Login } = await import('@/pages/Login');

function openLogin() {
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

async function signInWithPasskey() {
  openLogin();
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter avec cet appareil' }));
}

function problem(status: number, code: string) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
    data: { title: 'Refused', status, detail: '', code },
    status,
    statusText: 'Refused',
    headers: {},
    config,
  });
}

async function continueWith(address: string) {
  await userEvent.type(screen.getByLabelText('Adresse e-mail'), address);
  await userEvent.click(screen.getByRole('button', { name: 'Continuer' }));
}

beforeEach(() => {
  stubLocalStorage();
  vi.stubGlobal('PublicKeyCredential', class {});
  signIn.mockClear();
  registerPasskey.mockReset();
  login.mockReset();
  passkeyLoginComplete.mockReset().mockResolvedValue(account);
  signalUnknownPasskey.mockClear();
  attachment = 'cross-platform';
  platform = 'desktop';
});

afterEach(() => vi.unstubAllGlobals());

describe("after a sign-in with the phone's passkey", () => {
  it('says the sign-in succeeded, then offers a passkey of this device', async () => {
    await signInWithPasskey();

    expect(await screen.findByText('Connexion réussie')).toBeDefined();
    expect(screen.getByText("Connectez-vous d'un geste sur cet appareil")).toBeDefined();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('goes on to the dashboard, and remembers when, after « Pas maintenant »', async () => {
    await signInWithPasskey();
    await userEvent.click(await screen.findByRole('button', { name: 'Pas maintenant' }));

    expect(signIn).toHaveBeenCalledWith(account);
    expect(JSON.parse(localStorage.getItem('mariam-passkey-offer') ?? '{}').declinedAt).toEqual(
      expect.any(Number)
    );
  });

  it('creates it on this device, confirms it, then goes on', async () => {
    await signInWithPasskey();
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une passkey' }));

    expect(registerPasskey).toHaveBeenCalledWith({ thisDevice: true });
    expect(await screen.findByText('Passkey créée')).toBeDefined();
    expect(signIn).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(signIn).toHaveBeenCalledWith(account);
  });
});

describe('with a passkey the account no longer has', () => {
  it('tells the device to forget it', async () => {
    passkeyLoginComplete.mockRejectedValue(problem(401, 'passkey_unknown'));

    await signInWithPasskey();

    expect(await screen.findByText(/ne correspond à aucun compte/)).toBeDefined();
    expect(signalUnknownPasskey).toHaveBeenCalledWith('mariam.test', 'credential-id');
  });
});

describe("after a sign-in with this device's own passkey", () => {
  it('goes straight to the dashboard', async () => {
    attachment = 'platform';

    await signInWithPasskey();

    expect(signIn).toHaveBeenCalledWith(account);
    expect(screen.queryByText('Connexion réussie')).toBeNull();
  });
});

describe('signing in with an address', () => {
  it('asks for the address alone first, and tells the server nothing of it', async () => {
    openLogin();
    expect(screen.queryByLabelText('Mot de passe')).toBeNull();

    await continueWith('eliot@example.org');

    expect(screen.getByLabelText('Mot de passe')).toBeDefined();
    expect(screen.getByText('eliot@example.org')).toBeDefined();
    expect(login).not.toHaveBeenCalled();
  });

  it('keeps the address in the form of the password, as a plain username', async () => {
    openLogin();
    await continueWith('eliot@example.org');

    const address = screen.getByLabelText('Adresse e-mail') as HTMLInputElement;
    expect(address.value).toBe('eliot@example.org');
    expect(address.getAttribute('autocomplete')).toBe('username');
    expect(address.form).not.toBeNull();
    expect(address.form).toBe((screen.getByLabelText('Mot de passe') as HTMLInputElement).form);
  });

  it('goes back to the address with « Modifier »', async () => {
    openLogin();
    await continueWith('eliot@example.org');
    await userEvent.click(screen.getByRole('button', { name: 'Modifier' }));

    expect((screen.getByLabelText('Adresse e-mail') as HTMLInputElement).value).toBe(
      'eliot@example.org'
    );
    expect(screen.queryByLabelText('Mot de passe')).toBeNull();
  });

  it('offers the passkey in place of the password to an account that has only passkeys', async () => {
    login.mockRejectedValue(problem(403, 'passkey_only'));
    openLogin();
    await continueWith('eliot@example.org');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText(/pas avec un mot de passe/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Se connecter avec cet appareil' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Se connecter' })).toBeNull();
  });
});

describe('the sign-in page', () => {
  it('lets the browser offer passkeys in the email field', () => {
    openLogin();

    expect(screen.getByLabelText('Adresse e-mail').getAttribute('autocomplete')).toBe(
      'username webauthn'
    );
  });

  it("tells a computer how to use the phone's passkey", () => {
    openLogin();

    expect(screen.getByText('Votre passkey est sur votre téléphone ?')).toBeDefined();
  });

  it('says nothing of it on a phone', () => {
    platform = 'ios';
    openLogin();

    expect(screen.queryByText('Votre passkey est sur votre téléphone ?')).toBeNull();
  });
});
