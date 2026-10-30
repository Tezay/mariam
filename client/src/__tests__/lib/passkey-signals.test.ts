import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PasskeyList } from '@/lib/api/user';

const listPasskeys = vi.fn<() => Promise<PasskeyList>>();
vi.mock('@/lib/api/user', () => ({ userApi: { listPasskeys: () => listPasskeys() } }));

const { signalAcceptedPasskeys } = await import('@/lib/passkey-signals');

const signals = {
  signalAllAcceptedCredentials: vi.fn(async () => {}),
  signalCurrentUserDetails: vi.fn(async () => {}),
};

function listed(id: string | null): PasskeyList {
  return {
    rp_id: 'mariam.test',
    user: { id, name: 'eliot@example.org', display_name: 'Eliot' },
    items: [{ credential_id: 'first' }, { credential_id: 'second' }] as PasskeyList['items'],
  };
}

describe('signalAcceptedPasskeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('PublicKeyCredential', signals);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("hands the device the account's passkeys and details, as the API lists them", async () => {
    listPasskeys.mockResolvedValue(listed('handle'));

    await signalAcceptedPasskeys();

    expect(signals.signalAllAcceptedCredentials).toHaveBeenCalledWith({
      rpId: 'mariam.test',
      userId: 'handle',
      allAcceptedCredentialIds: ['first', 'second'],
    });
    expect(signals.signalCurrentUserDetails).toHaveBeenCalledWith({
      rpId: 'mariam.test',
      userId: 'handle',
      name: 'eliot@example.org',
      displayName: 'Eliot',
    });
  });

  it('asks nothing of a browser without the API', async () => {
    vi.stubGlobal('PublicKeyCredential', class {});

    await signalAcceptedPasskeys();

    expect(listPasskeys).not.toHaveBeenCalled();
  });

  it('signals nothing for an account that never asked for a passkey', async () => {
    listPasskeys.mockResolvedValue(listed(null));

    await signalAcceptedPasskeys();

    expect(signals.signalAllAcceptedCredentials).not.toHaveBeenCalled();
    expect(signals.signalCurrentUserDetails).not.toHaveBeenCalled();
  });

  it('signals nothing, and fails nothing, when the list cannot be read', async () => {
    listPasskeys.mockRejectedValue(new Error('offline'));

    await expect(signalAcceptedPasskeys()).resolves.toBeUndefined();
    expect(signals.signalAllAcceptedCredentials).not.toHaveBeenCalled();
  });
});
