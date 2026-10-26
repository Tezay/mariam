import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { Account } from '@/lib/api/user';

export function needsSecuritySetup(user?: Pick<Account, 'mfa_enabled' | 'passkeys_count'> | null) {
  if (!user) return false;
  return !user.mfa_enabled && user.passkeys_count === 0;
}

/**
 * Sends an account without a second factor to the enrolment page.
 *
 * Unlike the PWA walkthrough this keeps no "seen" flag: the condition is live
 * state, so the only way out is to actually enrol a method.
 */
export function useSecurityOnboarding(
  user: Pick<Account, 'mfa_enabled' | 'passkeys_count'> | null | undefined,
  setupPath: string
) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!needsSecuritySetup(user)) return;
    if (pathname === setupPath) return;
    navigate(setupPath, { replace: true });
  }, [user, pathname, setupPath, navigate]);
}
