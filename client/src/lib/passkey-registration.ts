import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser';
import { userApi } from '@/lib/api/user';

export async function registerPasskey({
  deviceName,
  thisDevice = false,
}: { deviceName?: string; thisDevice?: boolean } = {}): Promise<void> {
  const { options, challenge_token } = await userApi.passkeyOptions(thisDevice);
  const credential = await startRegistration({
    optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
  });
  await userApi.createPasskey(challenge_token, credential, deviceName);
}
