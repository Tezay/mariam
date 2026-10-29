// Sole owner of what the page knows of its session. The tokens live in HttpOnly
// cookies no script reads: the page sees only their CSRF values, and the time
// until which the server said the session stays confirmed.
const CONFIRMED_UNTIL_KEY = 'mariam-confirmed-until';
const CSRF_COOKIES = { access: '__Host-csrf-access', refresh: '__Host-csrf-refresh' } as const;

const changeListeners = new Set<() => void>();
const endListeners = new Set<() => void>();

function notify(listeners: Set<() => void>): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listeners: Set<() => void>, listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const cookie = document.cookie.split('; ').find((entry) => entry.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

export function csrfToken(kind: keyof typeof CSRF_COOKIES): string | null {
  return readCookie(CSRF_COOKIES[kind]);
}

/** Its CSRF cookie lives as long as the refresh token. */
export function hasSession(): boolean {
  return csrfToken('refresh') !== null;
}

export function setConfirmation(seconds: number): void {
  // Counted on this device's clock: the server's may disagree.
  if (seconds > 0) {
    localStorage.setItem(CONFIRMED_UNTIL_KEY, String(Date.now() + seconds * 1000));
  } else {
    localStorage.removeItem(CONFIRMED_UNTIL_KEY);
  }
  notify(changeListeners);
}

/** Epoch milliseconds until which the session stands confirmed, 0 when it does not. */
export function confirmedUntil(): number {
  return Number(localStorage.getItem(CONFIRMED_UNTIL_KEY)) || 0;
}

/** For when the server refuses a session this device still took for confirmed. */
export function forgetConfirmation(): void {
  setConfirmation(0);
}

export function endSession(): void {
  localStorage.removeItem(CONFIRMED_UNTIL_KEY);
  notify(changeListeners);
  notify(endListeners);
}

export function onSessionChange(listener: () => void): () => void {
  return subscribe(changeListeners, listener);
}

export function onSessionEnd(listener: () => void): () => void {
  return subscribe(endListeners, listener);
}

// What the release before the session cookies kept in storage. It can go with
// the release after.
export function dropStoredTokens(): void {
  for (const key of ['access_token', 'refresh_token', 'access_token_confirmed_until']) {
    localStorage.removeItem(key);
  }
}
