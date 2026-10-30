import { userApi } from '@/lib/api/user';

// Not yet in TypeScript's DOM types.
interface SignalApi {
  signalUnknownCredential?: (options: { rpId: string; credentialId: string }) => Promise<void>;
  signalAllAcceptedCredentials?: (options: {
    rpId: string;
    userId: string;
    allAcceptedCredentialIds: string[];
  }) => Promise<void>;
  signalCurrentUserDetails?: (options: {
    rpId: string;
    userId: string;
    name: string;
    displayName: string;
  }) => Promise<void>;
}

function signalApi(): SignalApi {
  return typeof PublicKeyCredential === 'undefined'
    ? {}
    : (PublicKeyCredential as unknown as SignalApi);
}

// The list comes from the API, never from a page's state: a passkey left out vanishes from the device.
export async function signalAcceptedPasskeys(): Promise<void> {
  const api = signalApi();
  if (!api.signalAllAcceptedCredentials && !api.signalCurrentUserDetails) return;
  try {
    const { rp_id: rpId, user, items } = await userApi.listPasskeys();
    if (!user.id) return;
    await api.signalAllAcceptedCredentials?.({
      rpId,
      userId: user.id,
      allAcceptedCredentialIds: items.map((passkey) => passkey.credential_id),
    });
    await api.signalCurrentUserDetails?.({
      rpId,
      userId: user.id,
      name: user.name,
      displayName: user.display_name,
    });
  } catch {
    // The device keeps what it had.
  }
}

export async function signalUnknownPasskey(rpId: string, credentialId: string): Promise<void> {
  try {
    await signalApi().signalUnknownCredential?.({ rpId, credentialId });
  } catch {
    // The device keeps what it had.
  }
}
