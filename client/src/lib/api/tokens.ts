// Sole owner of the session tokens in storage: nothing else reads or writes them.
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const CONFIRMED_UNTIL_KEY = 'access_token_confirmed_until';

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function confirmationGranted(accessToken: string): number {
  try {
    const payload = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { iat, fresh } = JSON.parse(atob(payload));
    return typeof iat === 'number' && typeof fresh === 'number' ? (fresh - iat) * 1000 : 0;
  } catch {
    return 0;
  }
}

function keepAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  // Counted on this device's clock from the time the token grants: the deadline
  // it carries is on the server's clock, which may disagree.
  const granted = confirmationGranted(token);
  if (granted > 0) {
    localStorage.setItem(CONFIRMED_UNTIL_KEY, String(Date.now() + granted));
  } else {
    localStorage.removeItem(CONFIRMED_UNTIL_KEY);
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  keepAccessToken(token);
  notify();
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  keepAccessToken(accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  notify();
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(CONFIRMED_UNTIL_KEY);
  notify();
}

/** Epoch milliseconds until which the session stands confirmed, 0 when it does not. */
export function confirmedUntil(): number {
  return Number(localStorage.getItem(CONFIRMED_UNTIL_KEY)) || 0;
}

/** For when the server refuses a session this device still took for confirmed. */
export function forgetConfirmation(): void {
  localStorage.removeItem(CONFIRMED_UNTIL_KEY);
  notify();
}

export function onTokensChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
