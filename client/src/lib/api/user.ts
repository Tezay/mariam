import { api } from './client';
import type { components } from './schema.gen';
import { storeTokens } from './tokens';

type Schemas = components['schemas'];

export type Account = Schemas['Account'];
export type Role = Account['role'];
export type UiPreferences = Required<Schemas['UiPreferences']>;
export type NotifPreferences = Required<Schemas['NotificationPreferences']>;
export type Alert = Schemas['Alert'];
export type Passkey = Schemas['Passkey'];
export type TotpEnrolment = Schemas['TotpEnrolment'];
export type WebAuthnOptions = Schemas['WebAuthnOptions'];

export const userApi = {
  get: async (): Promise<Account> => (await api.get('/user')).data,

  /** A changed address comes back with the session that replaces the caller's. */
  update: async (changes: { username?: string; email?: string }): Promise<Account> => {
    const { user, access_token, refresh_token } = (await api.patch('/user', changes)).data;
    if (access_token && refresh_token) storeTokens(access_token, refresh_token);
    return user;
  },

  getUiPreferences: async (): Promise<UiPreferences> =>
    (await api.get('/user/ui-preferences')).data,

  updateUiPreferences: async (changes: Partial<UiPreferences>): Promise<UiPreferences> =>
    (await api.patch('/user/ui-preferences', changes)).data,

  getNotifPreferences: async (): Promise<NotifPreferences> =>
    (await api.get('/user/notification-preferences')).data,

  updateNotifPreferences: async (changes: Partial<NotifPreferences>): Promise<NotifPreferences> =>
    (await api.patch('/user/notification-preferences', changes)).data,

  listAlerts: async (): Promise<Alert[]> => (await api.get('/user/alerts')).data.items,

  listPasskeys: async (): Promise<Passkey[]> => (await api.get('/user/passkeys')).data.items,

  passkeyOptions: async (): Promise<WebAuthnOptions> =>
    (await api.post('/user/passkeys/options')).data,

  createPasskey: async (
    challengeToken: string,
    credential: unknown,
    deviceName?: string
  ): Promise<Passkey> =>
    (
      await api.post('/user/passkeys', {
        challenge_token: challengeToken,
        credential,
        device_name: deviceName,
      })
    ).data,

  renamePasskey: async (id: number, deviceName: string): Promise<Passkey> =>
    (await api.patch(`/user/passkeys/${id}`, { device_name: deviceName })).data,

  deletePasskey: async (id: number): Promise<void> => {
    await api.delete(`/user/passkeys/${id}`);
  },

  /** Nothing is stored until `putTotp` checks a first code. */
  enrolTotp: async (): Promise<TotpEnrolment> => (await api.post('/user/totp/enrolment')).data,

  putTotp: async (enrolmentToken: string, code: string): Promise<Account> =>
    (await api.put('/user/totp', { enrolment_token: enrolmentToken, code })).data,

  /** Refused by the server unless a passkey remains. */
  deleteTotp: async (): Promise<void> => {
    await api.delete('/user/totp');
  },

  /** Ends every session, this one included. `code` when the account has TOTP. */
  changePassword: async (currentPassword: string, newPassword: string, code?: string) => {
    await api.put('/user/password', {
      current_password: currentPassword,
      new_password: newPassword,
      code,
    });
  },

  /** For an account that proves itself with a passkey rather than a code. */
  passwordOptions: async (currentPassword: string): Promise<WebAuthnOptions> =>
    (await api.post('/user/password/options', { current_password: currentPassword })).data,

  changePasswordWithPasskey: async (
    newPassword: string,
    challengeToken: string,
    credential: unknown
  ) => {
    await api.put('/user/password', {
      new_password: newPassword,
      challenge_token: challengeToken,
      credential,
    });
  },
};
