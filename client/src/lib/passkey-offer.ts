import type { AuthenticatorAttachment } from '@simplewebauthn/browser';

const ANSWER_KEY = 'mariam-passkey-offer';
const DAY_MS = 24 * 60 * 60 * 1000;
const ASK_AGAIN_AFTER_MS = 60 * DAY_MS;

export interface OfferAnswer {
  declinedAt?: number;
  created?: boolean;
}

export function shouldOfferPasskey({
  method,
  attachment,
  platformAvailable,
  answer,
  hasSecondFactor,
  now,
}: {
  method: 'passkey' | 'password';
  attachment?: AuthenticatorAttachment | null;
  platformAvailable: boolean;
  answer: OfferAnswer;
  hasSecondFactor: boolean;
  now: number;
}): boolean {
  if (!platformAvailable || !hasSecondFactor || answer.created) return false;
  if (answer.declinedAt !== undefined && now - answer.declinedAt < ASK_AGAIN_AFTER_MS) {
    return false;
  }
  return method === 'password' || attachment === 'cross-platform';
}

// Unreadable storage reads as declined just now: better never than at every sign-in.
export function readOfferAnswer(now = Date.now()): OfferAnswer {
  try {
    const stored = localStorage.getItem(ANSWER_KEY);
    return (stored && JSON.parse(stored)) || {};
  } catch {
    return { declinedAt: now };
  }
}

export function saveOfferAnswer(answer: OfferAnswer): void {
  try {
    localStorage.setItem(ANSWER_KEY, JSON.stringify(answer));
  } catch {
    // Read back as declined just now.
  }
}
