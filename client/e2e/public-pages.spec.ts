import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { parisToday } from '../src/lib/date-utils';

const SCHEME = process.env.E2E_SCHEME ?? 'http';
const PORT = process.env.E2E_PORT ?? '3000';
const API = process.env.E2E_API ?? 'http://localhost:5000';

const at = (org: string, path = '/') => `${SCHEME}://${org}.localhost:${PORT}${path}`;

interface Site {
  slug: string;
  name: string;
}

async function sitesOf(request: APIRequestContext, org: string): Promise<Site[]> {
  const response = await request.get(`${API}/v1/orgs/${org}/sites`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { items: Site[] }).items;
}

interface Category {
  items?: { dish: { name: string } }[];
  subcategories?: Category[];
}

function dishNames(categories: Category[]): string[] {
  return categories.flatMap((category) => [
    ...(category.items ?? []).map((item) => item.dish.name),
    ...dishNames(category.subcategories ?? []),
  ]);
}

async function dishesOfToday(request: APIRequestContext, org: string, slug: string) {
  const response = await request.get(`${API}/v1/orgs/${org}/sites/${slug}/menus/${parisToday()}`);
  if (response.status() === 404) return [];
  return dishNames(((await response.json()) as { categories: Category[] }).categories);
}

// In a deployment the proxy sends /v1 to the API; here the test replays each call.
async function proxyApi(page: Page) {
  await page.route(/\/v1\//, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${API}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
}

// A refresh can still be in flight when a test ends.
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the root of a multi-site organization lists its sites', async ({ page, request }) => {
    const sites = await sitesOf(request, 'demo');
    expect(sites.length).toBeGreaterThan(1);
    await page.goto(at('demo'));
    for (const site of sites) await expect(page.getByText(site.name)).toBeVisible();
  });

  test('a menu shows the dishes of the day the API returns', async ({ page, request }) => {
    const [site] = await sitesOf(request, 'demo');
    const dishes = await dishesOfToday(request, 'demo', site.slug);
    await page.goto(at('demo', `/${site.slug}/menu`));

    await expect(page.getByText(site.name, { exact: true }).first()).toBeVisible();
    for (const dish of dishes) await expect(page.getByText(dish).first()).toBeVisible();
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  });
});

test('the public pages hydrate without an error', async ({ page, request }) => {
  const [site] = await sitesOf(request, 'demo');
  await proxyApi(page);
  const errors = collectErrors(page);
  for (const path of ['/', `/${site.slug}/menu`, '/privacy']) {
    await page.goto(at('demo', path), { waitUntil: 'networkidle' });
  }
  expect(errors).toEqual([]);
});

test('the former TV address opens the TV display', async ({ page, request }) => {
  const [site] = await sitesOf(request, 'demo');
  await proxyApi(page);
  await page.goto(at('demo', `/${site.slug}/menu?mode=tv`));
  await expect(page).toHaveURL(at('demo', `/${site.slug}/tv`));
  await expect(page.getByText(site.name, { exact: true })).toBeVisible();
});

test('the dashboard still opens', async ({ page }) => {
  await proxyApi(page);
  await page.goto(at('demo', '/login'));
  await expect(page.getByRole('heading', { name: /Bienvenue|Connexion/ })).toBeVisible();
});
