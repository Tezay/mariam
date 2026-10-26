import axios from 'axios';
import { API_URL } from '../runtime-config';
import { api } from './client';
import type { components } from './schema.gen';
import {
  clearTokens,
  confirmedUntil,
  getAccessToken,
  getRefreshToken,
  onTokensChange,
  setAccessToken,
  storeTokens,
} from './tokens';
import type { Account, WebAuthnOptions } from './user';

type Schemas = components['schemas'];

export type ActivationLink = Schemas['ActivationLink'];
export type ResetLink = Schemas['ResetLink'];
export type Activation = Schemas['Activation'];
type Session = Schemas['Session'];

// In CacheStorage because the service worker, which cannot read localStorage, picks
// the app manifest from this role. Best-effort: without it, the public one is served.
function setManifestRole(role: string | null): void {
  if (!('caches' in window)) return;
  if (role === 'admin' || role === 'editor' || role === 'org_admin') {
    caches
      .open('mariam-config')
      .then((cache) =>
        cache.put(
          '/user-role',
          new Response(role, {
            headers: { 'Content-Type': 'text/plain' },
          })
        )
      )
      .catch(() => {});
  } else {
    caches
      .open('mariam-config')
      .then((cache) => cache.delete('/user-role'))
      .catch(() => {});
  }
}

function openSession({ access_token, refresh_token, user }: Session): Account {
  storeTokens(access_token, refresh_token);
  setManifestRole(user.role);
  return user;
}

export const authApi = {
  /** Opens the session, unless the account asks for its TOTP code first. */
  login: async (
    email: string,
    password: string
  ): Promise<{ user: Account } | { mfaToken: string }> => {
    const body = (await api.post('/auth/login', { email, password })).data;
    if (body.mfa_required) return { mfaToken: body.mfa_token };
    return { user: openSession(body) };
  },

  verifyMfa: async (mfaToken: string, code: string): Promise<Account> =>
    openSession((await api.post('/auth/mfa/verify', { mfa_token: mfaToken, code })).data),

  checkActivationLink: async (token: string): Promise<ActivationLink> =>
    (await api.get(`/auth/check-activation/${token}`)).data,

  activate: async (
    token: string,
    account: { email: string; username: string; password: string }
  ): Promise<Activation> => (await api.post('/auth/activate', { token, ...account })).data,

  verifyMfaSetup: async (setupToken: string, code: string): Promise<Account> =>
    openSession((await api.post('/auth/mfa/verify-setup', { setup_token: setupToken, code })).data),

  logout: () => {
    const refreshToken = getRefreshToken();
    clearTokens();
    setManifestRole(null);
    // Outside the interceptors, with the refresh token as credential: revoking it
    // ends every access token issued from it.
    if (refreshToken) {
      axios
        .post(`${API_URL}/auth/logout`, null, {
          headers: { Authorization: `Bearer ${refreshToken}` },
        })
        .catch(() => {});
    }
  },

  isAuthenticated: () => {
    return !!getAccessToken();
  },

  confirmedUntil,

  /** Whether the routes asking for a confirmed session would take it for `forMs` more. */
  isConfirmed: (forMs = 0) => confirmedUntil() - forMs > Date.now(),

  onSessionChange: onTokensChange,

  stepUpWithPassword: async (password: string, code: string) => {
    const response = await api.post('/auth/step-up/password', { password, code });
    setAccessToken(response.data.access_token);
  },

  stepUpPasskeyBegin: async (): Promise<WebAuthnOptions> =>
    (await api.post('/auth/step-up/passkey/begin')).data,

  stepUpPasskeyComplete: async (challengeToken: string, credential: unknown) => {
    const response = await api.post('/auth/step-up/passkey/complete', {
      challenge_token: challengeToken,
      credential,
    });
    setAccessToken(response.data.access_token);
  },

  checkResetLink: async (token: string): Promise<ResetLink> =>
    (await api.get(`/auth/check-reset/${token}`)).data,

  /** Ends every session of the account. */
  resetPassword: async (token: string, newPassword: string, code: string) => {
    await api.post('/auth/reset-password', { token, new_password: newPassword, code });
  },

  passkeyLoginBegin: async (): Promise<WebAuthnOptions> =>
    (await api.post('/auth/passkey/login/begin')).data,

  passkeyLoginComplete: async (challengeToken: string, credential: unknown): Promise<Account> =>
    openSession(
      (
        await api.post('/auth/passkey/login/complete', {
          challenge_token: challengeToken,
          credential,
        })
      ).data
    ),

  passkeyResetPasswordBegin: async (resetToken: string): Promise<WebAuthnOptions> =>
    (await api.post('/auth/passkey/reset-password/begin', { reset_token: resetToken })).data,

  passkeyResetPasswordComplete: async (
    newPassword: string,
    challengeToken: string,
    credential: unknown,
    resetToken: string
  ) => {
    await api.post('/auth/passkey/reset-password/complete', {
      new_password: newPassword,
      challenge_token: challengeToken,
      credential,
      reset_token: resetToken,
    });
  },

  /** During account activation, before any session exists. */
  passkeySetupBegin: async (setupToken: string): Promise<WebAuthnOptions> =>
    (await api.post('/auth/passkey/setup/begin', { setup_token: setupToken })).data,

  passkeySetupComplete: async (
    challengeToken: string,
    credential: unknown,
    deviceName?: string
  ): Promise<Account> =>
    openSession(
      (
        await api.post('/auth/passkey/setup/complete', {
          challenge_token: challengeToken,
          credential,
          device_name: deviceName,
        })
      ).data
    ),

  generateSessionTransfer: async (): Promise<Schemas['SessionTransfer']> =>
    (await api.post('/auth/session-transfer/generate')).data,

  validateSessionTransfer: async (transferToken: string): Promise<Account> =>
    openSession(
      (await api.post('/auth/session-transfer/validate', { transfer_token: transferToken })).data
    ),
};
