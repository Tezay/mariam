import axios from 'axios';
import { API_URL } from '../runtime-config';
import { api } from './client';
import { clearTokens, getAccessToken, getRefreshToken, storeTokens } from './tokens';

export interface User {
  id: number;
  email: string;
  username?: string;
  role: 'org_admin' | 'admin' | 'editor' | 'reader';
  mfa_enabled: boolean;
  is_active: boolean;
  restaurant_id?: number;
  organization_id?: number | null;
  created_at: string;
  last_login?: string;
  passkeys_count?: number;
  /** Resolved only on the authenticated user's own profile. */
  restaurant_name?: string | null;
  organization_name?: string | null;
}

export interface PasskeyInfo {
  id: number;
  device_name: string;
  transports: string[];
  created_at: string | null;
  last_used_at: string | null;
}

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

export const authApi = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });

    if (response.data.mfa_required) {
      return {
        mfaRequired: true,
        mfaToken: response.data.mfa_token,
      };
    }

    const { access_token, refresh_token, user } = response.data;
    storeTokens(access_token, refresh_token);
    setManifestRole(user.role);
    return { user, mfaRequired: false };
  },

  verifyMfa: async (mfaToken: string, code: string) => {
    const response = await api.post('/auth/mfa/verify', { mfa_token: mfaToken, code });
    const { access_token, refresh_token, user } = response.data;
    storeTokens(access_token, refresh_token);
    setManifestRole(user.role);
    return user;
  },

  checkActivationLink: async (token: string) => {
    const response = await api.get(`/auth/check-activation/${token}`);
    return response.data;
  },

  activate: async (token: string, password: string, email?: string, username?: string) => {
    const response = await api.post('/auth/activate', { token, password, email, username });
    return response.data;
  },

  verifyMfaSetup: async (userId: number, code: string, setupToken: string) => {
    const response = await api.post('/auth/mfa/verify-setup', {
      user_id: userId,
      code,
      setup_token: setupToken,
    });
    const { access_token, refresh_token, user } = response.data;
    storeTokens(access_token, refresh_token);
    setManifestRole(user.role);
    return user;
  },

  logout: () => {
    const refreshToken = getRefreshToken();
    const accessToken = getAccessToken();
    clearTokens();
    setManifestRole(null);
    // Outside the interceptors, with the refresh token as credential; the access
    // token rides along so the server revokes both.
    if (refreshToken) {
      axios
        .post(
          `${API_URL}/auth/logout`,
          { access_token: accessToken },
          {
            headers: { Authorization: `Bearer ${refreshToken}` },
          }
        )
        .catch(() => {});
    }
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data.user;
  },

  isAuthenticated: () => {
    return !!getAccessToken();
  },

  stepUpWithPassword: async (password: string, mfaCode?: string) => {
    const response = await api.post('/auth/step-up/password', {
      password,
      mfa_code: mfaCode,
    });
    return response.data.step_up_token as string;
  },

  stepUpPasskeyBegin: async () => {
    const response = await api.post('/auth/step-up/passkey/begin');
    return response.data as { options: Record<string, unknown>; challenge_token: string };
  },

  stepUpPasskeyComplete: async (challengeToken: string, credential: unknown) => {
    const response = await api.post('/auth/step-up/passkey/complete', {
      challenge_token: challengeToken,
      credential,
    });
    return response.data.step_up_token as string;
  },

  changePassword: async (currentPassword: string, newPassword: string, mfaCode: string) => {
    const response = await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
      mfa_code: mfaCode,
    });
    return response.data;
  },

  checkResetLink: async (token: string) => {
    const response = await api.get(`/auth/check-reset/${token}`);
    return response.data;
  },

  resetPassword: async (token: string, newPassword: string, mfaCode: string) => {
    const response = await api.post('/auth/reset-password', {
      token,
      new_password: newPassword,
      mfa_code: mfaCode,
    });
    return response.data;
  },

  /** A signed-in user adding a passkey; account activation goes through passkeySetup*. */
  passkeyRegisterBegin: async () => {
    const response = await api.post('/auth/passkey/register/begin');
    return response.data as { options: Record<string, unknown>; challenge_token: string };
  },

  passkeyRegisterComplete: async (
    challengeToken: string,
    credential: unknown,
    deviceName?: string
  ) => {
    const response = await api.post('/auth/passkey/register/complete', {
      challenge_token: challengeToken,
      credential,
      device_name: deviceName,
    });
    return response.data;
  },

  listPasskeys: async (): Promise<PasskeyInfo[]> => {
    const response = await api.get('/auth/passkey');
    return response.data.passkeys as PasskeyInfo[];
  },

  deletePasskey: async (id: number) => {
    await api.delete(`/auth/passkey/${id}`);
  },

  mfaSetupBegin: async (): Promise<{ qr_code: string; secret: string }> => {
    const response = await api.post('/auth/mfa/setup');
    return response.data;
  },

  mfaSetupConfirm: async (code: string): Promise<User> => {
    const response = await api.post('/auth/mfa/setup/confirm', { code });
    return response.data.user as User;
  },

  /** Refused by the server unless a passkey remains. */
  disableMfa: async (): Promise<User> => {
    const response = await api.delete('/auth/mfa');
    return response.data.user as User;
  },

  passkeyChangePasswordBegin: async (currentPassword: string) => {
    const response = await api.post('/auth/passkey/change-password/begin', {
      current_password: currentPassword,
    });
    return response.data as { options: Record<string, unknown>; challenge_token: string };
  },

  passkeyChangePasswordComplete: async (
    newPassword: string,
    challengeToken: string,
    credential: unknown
  ) => {
    const response = await api.post('/auth/passkey/change-password/complete', {
      new_password: newPassword,
      challenge_token: challengeToken,
      credential,
    });
    return response.data;
  },

  passkeyLoginBegin: async () => {
    const response = await api.post('/auth/passkey/login/begin');
    return response.data as { options: Record<string, unknown>; challenge_token: string };
  },

  passkeyLoginComplete: async (challengeToken: string, credential: unknown) => {
    const response = await api.post('/auth/passkey/login/complete', {
      challenge_token: challengeToken,
      credential,
    });
    const { access_token, refresh_token, user } = response.data;
    storeTokens(access_token, refresh_token);
    setManifestRole(user.role);
    return user;
  },

  renamePasskey: async (id: number, deviceName: string) => {
    const response = await api.patch(`/auth/passkey/${id}`, { device_name: deviceName });
    return response.data as { message: string; device_name: string };
  },

  passkeyResetPasswordBegin: async (resetToken: string) => {
    const response = await api.post('/auth/passkey/reset-password/begin', {
      reset_token: resetToken,
    });
    return response.data as { options: Record<string, unknown>; challenge_token: string };
  },

  passkeyResetPasswordComplete: async (
    newPassword: string,
    challengeToken: string,
    credential: unknown,
    resetToken: string
  ) => {
    const response = await api.post('/auth/passkey/reset-password/complete', {
      new_password: newPassword,
      challenge_token: challengeToken,
      credential,
      reset_token: resetToken,
    });
    return response.data;
  },

  /** During account activation, before any session exists. */
  passkeySetupBegin: async (userId: number, setupToken: string) => {
    const response = await api.post('/auth/passkey/setup/begin', {
      user_id: userId,
      setup_token: setupToken,
    });
    return response.data as { options: Record<string, unknown>; challenge_token: string };
  },

  passkeySetupComplete: async (
    userId: number,
    challengeToken: string,
    credential: unknown,
    deviceName?: string
  ) => {
    const response = await api.post('/auth/passkey/setup/complete', {
      user_id: userId,
      challenge_token: challengeToken,
      credential,
      device_name: deviceName,
    });
    const { access_token, refresh_token, user } = response.data;
    storeTokens(access_token, refresh_token);
    setManifestRole(user.role);
    return user;
  },

  generateSessionTransfer: async () => {
    const response = await api.post('/auth/session-transfer/generate');
    return response.data as { transfer_token: string; expires_in: number };
  },

  validateSessionTransfer: async (transferToken: string) => {
    const response = await api.post('/auth/session-transfer/validate', {
      transfer_token: transferToken,
    });
    const { access_token, refresh_token, user } = response.data;
    storeTokens(access_token, refresh_token);
    setManifestRole(user.role);
    return user;
  },
};
