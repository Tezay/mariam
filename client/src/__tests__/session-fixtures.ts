import { vi } from 'vitest';

// Recent Node versions define a `localStorage` of their own, unusable without a
// backing file, which hides the one jsdom provides.
export function stubLocalStorage(): void {
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, String(value)),
    removeItem: (key: string) => void items.delete(key),
  });
}

export function stubCookies(cookies: string): void {
  Object.defineProperty(document, 'cookie', { value: cookies, configurable: true });
}
