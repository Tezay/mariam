// Starts the built server against a stub API and checks what it answers.
// Run after `bun run build`: node --test scripts/check-server.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { after, before, beforeEach, test } from 'node:test';
import vm from 'node:vm';

const HOST = 'demo.example.test';
const ORIGIN = `https://${HOST}`;

let api;
let tenant;
let apiRequests = [];
let server;
let port;

function listen(target) {
  return new Promise((resolve) => {
    target.listen(0, '127.0.0.1', () => resolve(target.address().port));
  });
}

async function freePort() {
  const probe = http.createServer();
  const found = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  return found;
}

function request(path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request(
      { host: '127.0.0.1', port, path, method, headers: { Host: HOST, ...headers } },
      (incoming) => {
        const chunks = [];
        incoming.on('data', (chunk) => chunks.push(chunk));
        incoming.on('end', () =>
          resolve({
            status: incoming.statusCode,
            headers: incoming.headers,
            body: Buffer.concat(chunks).toString(),
          })
        );
      }
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function organization(...sites) {
  return { status: 200, sites };
}

const HOSTILE_DISH = '</script><script>alert(1)</script>';

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

function addDays(date, days) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

function menu(date) {
  const item = (id, name) => ({
    id,
    category_id: 1,
    order: id,
    is_out_of_stock: false,
    dish: { id, name, tags: [], certifications: [] },
  });
  return {
    date,
    chef_note: null,
    substitutions: {},
    categories: [
      {
        id: 1,
        label: 'Plats',
        is_highlighted: false,
        order: 0,
        items: [item(1, 'Curry de pois chiches'), item(2, HOSTILE_DISH)],
      },
    ],
  };
}

const SITE_ANSWERS = {
  '': (slug) => ({
    slug,
    name: slug,
    tagline: null,
    description: null,
    logo_url: null,
    cover_url: null,
    photos: [],
    address_city: null,
    address_postcode: null,
    access_info: null,
    services: [],
    links: [],
    service_days: [0, 1, 2, 3, 4],
    service_hours: {},
    vote_enabled: false,
    vote_icon_preset: 'thumbs',
    dietary_tags: [],
    certifications: [],
    menu_window: { from: addDays(TODAY, -30), to: addDays(TODAY, 7) },
  }),
  // The page shows the menu dated as the day it asks for.
  menus: (slug, query) => ({ items: [menu(query.get('from'))] }),
  events: () => ({ items: [] }),
  closures: () => ({ items: [] }),
};

function answer(url) {
  const { pathname, searchParams } = new URL(url, 'http://api');
  if (pathname.startsWith('/v1/domains/')) {
    if (tenant.status !== 200) return { status: tenant.status };
    const headers = tenant.maxAge ? { 'Cache-Control': `public, max-age=${tenant.maxAge}` } : {};
    return { status: 200, headers, body: { organization: { name: 'Demo', slug: 'demo' } } };
  }
  if (pathname === '/v1/orgs/demo/sites') {
    return { status: 200, body: { items: tenant.sites.map((slug) => SITE_ANSWERS[''](slug)) } };
  }
  const [, slug, resource = ''] =
    /^\/v1\/orgs\/demo\/sites\/([^/]+)(?:\/([^/]+))?$/.exec(pathname) ?? [];
  if (!tenant.sites?.includes(slug) || !(resource in SITE_ANSWERS)) return { status: 404 };
  // As the API does, which the page must never ask for an impossible day.
  if (resource === 'menus' && addDays(searchParams.get('from'), 0) !== searchParams.get('from')) {
    return { status: 422 };
  }
  return { status: 200, body: SITE_ANSWERS[resource](slug, searchParams) };
}

before(async () => {
  api = http.createServer((incoming, outgoing) => {
    apiRequests.push({ url: incoming.url, headers: incoming.headers });
    const { status, headers, body } = answer(incoming.url);
    outgoing.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    outgoing.end(JSON.stringify(body ?? {}));
  });
  const apiPort = await listen(api);
  port = await freePort();
  server = spawn(process.execPath, ['server.js'], {
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      API_URL: 'https://api.example.test/v1',
      API_INTERNAL_URL: `http://127.0.0.1:${apiPort}/v1`,
      APP_VERSION: '9.9.9',
      UMAMI_SCRIPT_URL: 'https://stats.example.test/script.js',
      UMAMI_WEBSITE_ID: 'site-1',
      SENTRY_DSN: 'https://key@errors.example.test/1',
    },
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const answer = await request('/healthz').catch(() => null);
    if (answer?.status === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The server did not start');
});

after(() => {
  server?.kill();
  api?.close();
});

beforeEach(() => {
  tenant = organization('alpha', 'beta');
  apiRequests = [];
});

test('a page is the loading shell, with the security headers', async () => {
  const page = await request('/admin/users');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /^text\/html/);
  assert.match(page.body, /role="status"/);
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  assert.equal(page.headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(page.headers['strict-transport-security'], /max-age=31536000/);
  assert.ok(page.headers['referrer-policy']);
  assert.ok(page.headers['permissions-policy']);
  assert.equal(page.headers['x-powered-by'], undefined);
});

test('every inline script carries the nonce the policy announces', async () => {
  const page = await request('/');
  const policy = page.headers['content-security-policy-report-only'];
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  assert.ok(nonce, 'no nonce in the policy');

  const inline = page.body.match(/<script(?![^>]*\ssrc=)[^>]*>/g) ?? [];
  assert.ok(inline.length > 0, 'the page has no inline script to check');
  for (const tag of inline) assert.ok(tag.includes(`nonce="${nonce}"`), tag);

  const next = await request('/');
  assert.ok(!next.headers['content-security-policy-report-only'].includes(nonce));
});

test('the policy lists the configured third parties and nothing else', async () => {
  const policy = (await request('/')).headers['content-security-policy-report-only'];
  const directive = (name) => policy.split('; ').find((part) => part.startsWith(`${name} `));
  assert.match(
    directive('script-src'),
    /^script-src 'self' 'nonce-[^']+' https:\/\/stats\.example\.test$/
  );
  assert.equal(
    directive('connect-src'),
    "connect-src 'self' https://api.example.test https://stats.example.test https://errors.example.test"
  );
});

test('a HEAD request gets the headers without a body', async () => {
  const head = await request('/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.ok(head.headers['content-security-policy-report-only']);
});

test('/config.js exposes the public settings only', async () => {
  const script = await request('/config.js');
  assert.match(script.headers['content-type'], /^text\/javascript/);
  assert.equal(script.headers['cache-control'], 'no-store');

  const window = {};
  vm.runInNewContext(script.body, { window });
  // Copied out of the sandbox: its objects have another realm's prototype.
  assert.deepEqual(
    { ...window.__RUNTIME_CONFIG__ },
    {
      API_URL: 'https://api.example.test/v1',
      APP_VERSION: '9.9.9',
      CANONICAL_HOST: '',
      UMAMI_SCRIPT_URL: 'https://stats.example.test/script.js',
      UMAMI_WEBSITE_ID: 'site-1',
      SENTRY_DSN: 'https://key@errors.example.test/1',
      SENTRY_ENVIRONMENT: 'production',
    }
  );
});

test('/robots.txt points at the sitemap of the requested host', async () => {
  const robots = await request('/robots.txt');
  assert.match(robots.headers['content-type'], /^text\/plain/);
  assert.match(robots.body, /^Disallow: \/admin$/m);
  assert.match(robots.body, new RegExp(`^Sitemap: ${ORIGIN}/sitemap\\.xml$`, 'm'));
});

test('/sitemap.xml lists the sites, asking the API as the visitor', async () => {
  const sitemap = await request('/sitemap.xml', {
    headers: { 'X-Real-IP': '203.0.113.7' },
  });

  assert.match(sitemap.headers['content-type'], /^application\/xml/);
  assert.ok(sitemap.body.includes(`<loc>${ORIGIN}/</loc>`));
  assert.ok(sitemap.body.includes(`<loc>${ORIGIN}/alpha</loc>`));
  assert.ok(sitemap.body.includes(`<loc>${ORIGIN}/beta</loc>`));

  assert.deepEqual(
    apiRequests.map((asked) => asked.url),
    [`/v1/domains/${HOST}`, '/v1/orgs/demo/sites']
  );
  for (const asked of apiRequests) assert.equal(asked.headers['x-real-ip'], '203.0.113.7');
});

test('/sitemap.xml of a single site is its page at the root', async () => {
  tenant = organization('solo');
  const sitemap = await request('/sitemap.xml');
  assert.ok(sitemap.body.includes(`<loc>${ORIGIN}/</loc>`));
  assert.ok(!sitemap.body.includes('/solo'));
});

test('/sitemap.xml is empty for an unknown host and unavailable when the API fails', async () => {
  tenant = { status: 404 };
  const unknown = await request('/sitemap.xml');
  assert.equal(unknown.status, 200);
  assert.ok(!unknown.body.includes('<loc>'));

  tenant = { status: 500 };
  const failing = await request('/sitemap.xml');
  assert.equal(failing.status, 503);
  assert.equal(failing.headers['retry-after'], '60');
});

test('static files are cached by how they are named', async () => {
  const page = await request('/');
  const hashed = /\/assets\/[^"]+\.js/.exec(page.body)?.[0];
  assert.ok(hashed, 'no hashed script in the page');

  assert.match((await request(hashed)).headers['cache-control'], /immutable/);
  assert.equal((await request('/sw-push.js')).headers['cache-control'], 'no-cache');
  assert.match((await request('/favicon.svg')).headers['cache-control'], /immutable/);
});

test('a site page is rendered by the server, with its title, its dishes and its JSON-LD', async () => {
  const page = await request('/alpha');
  assert.equal(page.status, 200);
  assert.match(page.body, /<title>alpha – Demo : menu du jour, horaires et accès<\/title>/);
  assert.ok(page.body.includes(`<link rel="canonical" href="${ORIGIN}/alpha"/>`));
  assert.ok(!page.body.includes('noindex'));
  assert.ok(page.body.includes('Curry de pois chiches'));
  const jsonld = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(page.body)?.[1];
  assert.ok(jsonld, 'no JSON-LD block');
  const [restaurant] = JSON.parse(jsonld);
  assert.equal(restaurant.hasMenu.hasMenuSection[0].hasMenuItem[1].name, HOSTILE_DISH);
  // Written as data, never as markup: the name cannot close the script it sits in.
  assert.ok(!page.body.includes(HOSTILE_DISH));
});

test('a page asks the API as the visitor the proxy named', async () => {
  await request('/alpha', { headers: { 'X-Real-IP': '203.0.113.7' } });
  assert.equal(apiRequests.length, 6);
  for (const { headers } of apiRequests) assert.equal(headers['x-real-ip'], '203.0.113.7');
});

test('the organization of a host is asked once while the API lets it be kept', async () => {
  tenant = { ...organization('alpha', 'beta'), maxAge: 300 };
  const headers = { Host: 'kept.example.test' };
  await request('/', { headers });
  await request('/', { headers });
  assert.equal(apiRequests.filter((asked) => asked.url.startsWith('/v1/domains/')).length, 1);
});

test('an unknown site answers 404, an unreachable API 503', async () => {
  const unknown = await request('/nope');
  assert.equal(unknown.status, 404);
  assert.ok(unknown.body.includes('Restaurant introuvable.'));
  tenant = { status: 404 };
  assert.equal((await request('/')).status, 404);
  tenant = { status: 500 };
  assert.equal((await request('/')).status, 503);
});

test('a dated page is the menu of that day, kept out of the index', async () => {
  const tomorrow = addDays(TODAY, 1);
  const page = await request(`/alpha?date=${tomorrow}`);
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('<meta name="robots" content="noindex"/>'));
  assert.ok(page.body.includes(`<link rel="canonical" href="${ORIGIN}/alpha"/>`));
  assert.ok(apiRequests.some((asked) => asked.url.includes(`from=${tomorrow}&to=${tomorrow}`)));

  for (const date of [TODAY, 'demain', `${TODAY.slice(0, 4)}-02-30`, addDays(TODAY, 8)]) {
    const moved = await request(`/alpha?date=${date}`);
    assert.equal(moved.status, 302, date);
    assert.equal(moved.headers.location, '/alpha', date);
  }
});

test('the former addresses lead to the page, and the TV mode to its own', async () => {
  const menu = await request('/alpha/menu?mode=tv');
  assert.equal(menu.status, 301);
  assert.equal(menu.headers.location, '/alpha?mode=tv');
  const tv = await request('/alpha?mode=tv');
  assert.equal(tv.status, 301);
  assert.equal(tv.headers.location, '/alpha/tv');

  const hostile = await request('/%5Cevil.example/menu');
  assert.equal(hostile.headers.location, '/%5Cevil.example');

  tenant = organization('solo');
  for (const [path, status, location] of [
    ['/menu', 301, '/'],
    ['/solo/menu', 301, '/solo'],
    ['/solo?date=x', 302, '/?date=x'],
  ]) {
    const moved = await request(path);
    assert.equal(moved.status, status, path);
    assert.equal(moved.headers.location, location, path);
  }
  assert.equal((await request('/')).status, 200);
});
