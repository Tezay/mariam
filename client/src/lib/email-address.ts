export const EMAIL_RULE = 'Adresse invalide.';

// Kept in step with server/app/utils/email_address.py: stored addresses are
// lowercase ASCII.
export function canonicalEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return /^[!-~]+@[!-~]+$/.test(email) && email.length <= 120 ? email : null;
}
