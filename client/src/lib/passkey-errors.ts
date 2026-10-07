import { getApiErrorMessage } from '@/lib/api/errors';

/** Names the browser's own refusals, which carry no message fit to show. */
export function passkeyRegistrationError(error: unknown): string {
  switch ((error as { name?: string } | null)?.name) {
    case 'InvalidStateError':
      return 'Cet appareil possède déjà une passkey pour ce compte.';
    case 'NotAllowedError':
      return 'Enregistrement annulé. Réessayez.';
    case 'SecurityError':
      return 'Les passkeys ne sont pas disponibles sur cette adresse.';
    default:
      return getApiErrorMessage(error, "Impossible d'enregistrer la passkey.");
  }
}
