/**
 * The anonymous token identifying a device for the menu vote.
 *
 * Deliberate exception to "no localStorage on the public pages": this is a
 * security token, not business cache. It is replicated across three stores
 * because clearing one of them is the cheapest way to vote twice; any surviving
 * copy restores the others.
 */
import { voteApi } from './api';

const KEY = 'mariam-device-id';
const DB_NAME = 'mariam';
const STORE = 'device';
const CACHE_NAME = 'mariam-device';
const CACHE_URL = '/__device-id';

function fromLocalStorage(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function fromIndexedDb(): Promise<string | null> {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as string) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function fromCache(): Promise<string | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(CACHE_URL);
    return response ? await response.text() : null;
  } catch {
    return null;
  }
}

async function attempt(write: () => unknown): Promise<void> {
  try {
    await write();
  } catch {
    /* one blocked store must not stop the others */
  }
}

async function persist(token: string): Promise<void> {
  await attempt(() => localStorage.setItem(KEY, token));
  const db = await openDatabase();
  if (db) {
    await attempt(() => db.transaction(STORE, 'readwrite').objectStore(STORE).put(token, KEY));
  }
  await attempt(async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(CACHE_URL, new Response(token));
  });
}

/** Existing token from any store, or a freshly minted one. Null if the API is down. */
export async function getDeviceId(): Promise<string | null> {
  const existing = fromLocalStorage() ?? (await fromIndexedDb()) ?? (await fromCache());
  if (existing) {
    // Restores whichever copies were cleared.
    await persist(existing);
    return existing;
  }

  try {
    const token = await voteApi.mint();
    if (!token) return null;
    await persist(token);
    return token;
  } catch {
    return null;
  }
}
