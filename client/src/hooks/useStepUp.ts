import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { authApi } from '@/lib/api/auth';

export interface StepUpRequest {
  /** « Confirmez votre identité » unless the prompt is named after its action. */
  title?: string;
  description: string;
  /** « Continuer » by default. */
  confirmLabel?: string;
  /** A destructive action is put to a session already confirmed too, which only has to agree. */
  tone?: 'default' | 'destructive';
}

/**
 * Resolves at once when the session stays confirmed for `forMs` more, otherwise
 * once the user has presented a second factor. False when the user backs out.
 */
export type ConfirmIdentity = (request: StepUpRequest, forMs?: number) => Promise<boolean>;

export const StepUpContext = createContext<ConfirmIdentity | null>(null);

export function useStepUp(): ConfirmIdentity {
  const confirmIdentity = useContext(StepUpContext);
  if (!confirmIdentity) {
    throw new Error('useStepUp must be used within a StepUpProvider');
  }
  return confirmIdentity;
}

/** Whether the session stays confirmed for `forMs` more; turns false by itself when that ends. */
export function useIdentityConfirmed(forMs = 0): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const watch = () => {
        clearTimeout(timer);
        const wait = authApi.confirmedUntil() - forMs - Date.now();
        // Armed again when it fires: a timer that runs a moment early would
        // otherwise leave the answer unchanged for good.
        if (wait > 0) timer = setTimeout(changed, wait);
      };
      const changed = () => {
        watch();
        onChange();
      };
      watch();
      const unsubscribe = authApi.onSessionChange(changed);
      // Another tab confirming, or refreshing, the session they share.
      window.addEventListener('storage', changed);
      return () => {
        clearTimeout(timer);
        unsubscribe();
        window.removeEventListener('storage', changed);
      };
    },
    [forMs]
  );
  return useSyncExternalStore(subscribe, () => authApi.isConfirmed(forMs));
}
