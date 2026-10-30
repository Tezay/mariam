import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

type Challenge = { options: object; challenge_token: string };

const mocks = vi.hoisted(() => ({
  begin: vi.fn<() => Promise<Challenge>>(),
  cancelCeremony: vi.fn(),
  startAuthentication: vi.fn(() => new Promise(() => {})),
}));

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthnAutofill: async () => true,
  startAuthentication: mocks.startAuthentication,
  WebAuthnAbortService: { cancelCeremony: mocks.cancelCeremony },
}));
vi.mock('@/lib/api/auth', () => ({ authApi: { passkeyLoginBegin: mocks.begin } }));

const { usePasskeyAutofill } = await import('@/hooks/usePasskeyAutofill');

function listen() {
  return renderHook(({ active }) => usePasskeyAutofill(active, () => {}), {
    initialProps: { active: true },
  });
}

describe('usePasskeyAutofill', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ends its pending request once the address step goes', async () => {
    mocks.begin.mockResolvedValue({ options: {}, challenge_token: 'challenge' });
    const { rerender } = listen();
    await waitFor(() => expect(mocks.startAuthentication).toHaveBeenCalled());

    rerender({ active: false });

    expect(mocks.cancelCeremony).toHaveBeenCalled();
  });

  it('starts no request once the step went while its challenge loaded', async () => {
    let deliver!: (challenge: Challenge) => void;
    mocks.begin.mockReturnValue(new Promise((resolve) => (deliver = resolve)));
    const { rerender } = listen();
    await waitFor(() => expect(mocks.begin).toHaveBeenCalled());

    rerender({ active: false });
    deliver({ options: {}, challenge_token: 'challenge' });
    await new Promise((resolve) => setTimeout(resolve));

    expect(mocks.startAuthentication).not.toHaveBeenCalled();
  });
});
