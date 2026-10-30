import { useEffect, useRef } from 'react';
import {
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  WebAuthnAbortService,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { authApi } from '@/lib/api/auth';

// A challenge serves two minutes: the request is renewed before it lapses.
const RENEWAL_MS = 100_000;

export function usePasskeyAutofill(
  active: boolean,
  onCredential: (challengeToken: string, credential: AuthenticationResponseJSON) => void
) {
  const latest = useRef(onCredential);
  useEffect(() => {
    latest.current = onCredential;
  });

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let renewal: ReturnType<typeof setTimeout> | undefined;

    const listen = async () => {
      clearTimeout(renewal);
      if (stopped || !(await browserSupportsWebAuthnAutofill())) return;
      renewal = setTimeout(listen, RENEWAL_MS);
      try {
        const { options, challenge_token } = await authApi.passkeyLoginBegin();
        if (stopped) return;
        const credential = await startAuthentication({
          optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
          useBrowserAutofill: true,
        });
        clearTimeout(renewal);
        if (!stopped) latest.current(challenge_token, credential);
      } catch {
        // Aborted by a renewal, the passkey button or leaving the step.
      }
    };

    listen();
    return () => {
      stopped = true;
      clearTimeout(renewal);
      // The library ends a pending request only when another ceremony starts.
      WebAuthnAbortService.cancelCeremony();
    };
  }, [active]);
}
