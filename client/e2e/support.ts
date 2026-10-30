import type { Page } from '@playwright/test';

const SCHEME = process.env.E2E_SCHEME ?? 'http';
const PORT = process.env.E2E_PORT ?? '3000';
export const API = process.env.E2E_API ?? 'http://localhost:5000';

export const at = (org: string, path = '/') => `${SCHEME}://${org}.localhost:${PORT}${path}`;

// In a deployment the proxy sends /v1 to the API; here the test replays each call.
export async function proxyApi(page: Page) {
  await page.route(/\/v1\//, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${API}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
