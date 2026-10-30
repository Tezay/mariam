import { expect, test, type APIRequestContext } from '@playwright/test';
import { parisToday } from '../src/lib/date-utils';
import { API, at, collectErrors, proxyApi } from './support';

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

async function dishesOf(request: APIRequestContext, org: string, slug: string, day = parisToday()) {
  const response = await request.get(`${API}/v1/orgs/${org}/sites/${slug}/menus/${day}`);
  if (response.status() === 404) return [];
  return dishNames(((await response.json()) as { categories: Category[] }).categories);
}

// A refresh can still be in flight when a test ends.
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the root of a multi-site organization lists its sites', async ({ page, request }) => {
    const sites = await sitesOf(request, 'demo');
    expect(sites.length).toBeGreaterThan(1);
    await page.goto(at('demo'));
    for (const site of sites) await expect(page.getByText(site.name)).toBeVisible();
  });

  test('a site page shows the dishes of the day the API returns', async ({ page, request }) => {
    const [site] = await sitesOf(request, 'demo');
    const dishes = await dishesOf(request, 'demo', site.slug);
    await page.goto(at('demo', `/${site.slug}`));

    await expect(page.getByRole('heading', { level: 1, name: site.name })).toBeVisible();
    for (const dish of dishes) await expect(page.getByText(dish).first()).toBeVisible();
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  });

  test('a day of the strip leads to the menu of that day', async ({ page, request }) => {
    const [site] = await sitesOf(request, 'demo');
    await page.goto(at('demo', `/${site.slug}`));

    const days = page.getByRole('navigation', { name: 'Jour du menu' });
    await days.locator('a:not([aria-current]):not([aria-label])').first().click();

    const day = new URL(page.url()).searchParams.get('date');
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const dish of await dishesOf(request, 'demo', site.slug, day!)) {
      await expect(page.getByText(dish).first()).toBeVisible();
    }
  });

  test('the former address of a menu leads to its page', async ({ page, request }) => {
    const [site] = await sitesOf(request, 'demo');
    await page.goto(at('demo', `/${site.slug}/menu`));
    await expect(page).toHaveURL(at('demo', `/${site.slug}`));
  });
});

test('the public pages hydrate without an error', async ({ page, request }) => {
  const [site] = await sitesOf(request, 'demo');
  await proxyApi(page);
  const errors = collectErrors(page);
  for (const path of ['/', `/${site.slug}`, '/privacy']) {
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

test.describe('the notifications panel', () => {
  test('opens from the bell on a phone', async ({ page, request }) => {
    const [site] = await sitesOf(request, 'demo');
    await page.setViewportSize({ width: 390, height: 844 });
    await proxyApi(page);
    const errors = collectErrors(page);
    await page.goto(at('demo', `/${site.slug}`), { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Recevoir les notifications' }).click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel.getByText(site.name)).toBeVisible();
    await expect(panel).toHaveCSS('bottom', '0px');
    expect(errors).toEqual([]);
  });

  test('opens beside the page on a wide screen', async ({ page, request }) => {
    const [site] = await sitesOf(request, 'demo');
    await page.setViewportSize({ width: 1440, height: 900 });
    await proxyApi(page);
    await page.goto(at('demo', `/${site.slug}`), { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Recevoir le menu chaque jour' }).first().click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel.getByText(site.name)).toBeVisible();
    await expect(panel).toHaveCSS('right', '0px');
    await expect(panel).toHaveCSS('top', '0px');
  });
});

test.describe('under a dark system theme', () => {
  test.use({ colorScheme: 'dark' });

  test('the site page turns dark, the TV stays light', async ({ page, request }) => {
    const [site] = await sitesOf(request, 'demo');
    await proxyApi(page);
    await page.goto(at('demo', `/${site.slug}`));
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.goto(at('demo', `/${site.slug}/tv`));
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });
});

test('the dashboard still opens', async ({ page }) => {
  await proxyApi(page);
  await page.goto(at('demo', '/login'));
  await expect(page.getByRole('heading', { name: /Bienvenue|Connexion/ })).toBeVisible();
});
