/**
 * Enrolment page for an account left without any second factor.
 *
 * Reached only by redirect from useSecurityOnboarding, and left only once a
 * method is active: there is deliberately no way to skip it.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser';
import { Logo } from '@/components/Logo';
import {
  SecondFactorSetup,
  type SecondFactorEnrolment,
} from '@/features/security/SecondFactorSetup';
import { useAuth } from '@/contexts/AuthContext';
import { needsSecuritySetup } from '@/hooks/useSecurityOnboarding';
import { authApi } from '@/lib/api/auth';
import { dashboardPathForRole } from '@/lib/dashboard-routes';

export default function SecurityPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  // Refreshing the profile is what ends the enrolment, so this fires on its own.
  useEffect(() => {
    if (user && !needsSecuritySetup(user)) {
      navigate(dashboardPathForRole(user.role), { replace: true });
    }
  }, [user, navigate]);

  const enrolment: SecondFactorEnrolment = {
    registerPasskey: async () => {
      const { options, challenge_token } = await authApi.passkeyRegisterBegin();
      const credential = await startRegistration({
        optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
      });
      await authApi.passkeyRegisterComplete(challenge_token, credential);
      await refreshUser();
    },
    beginTotp: async () => {
      const { qr_code, secret } = await authApi.mfaSetupBegin();
      return { qrCode: qr_code, secret };
    },
    confirmTotp: async (code) => {
      await authApi.mfaSetupConfirm(code);
      await refreshUser();
    },
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-12">
      <Logo className="h-20 w-auto" />

      <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-8 shadow-lg">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              Protégez votre compte avant de continuer
            </h2>
            <p className="text-sm text-muted-foreground">
              Votre compte n'a plus de seconde méthode d'authentification. Enregistrez-en une pour
              retrouver l'accès au tableau de bord.
            </p>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <SecondFactorSetup enrolment={enrolment} />
        </div>
      </div>
    </div>
  );
}
