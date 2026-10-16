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
let orgAnswer;
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

function organization(...slugs) {
  return {
    status: 200,
    body: {
      organization: { name: 'Demo', slug: 'demo' },
      sites: slugs.map((slug) => ({ slug, name: slug, logo_url: null })),
    },
  };
}

const HOSTILE_DISH = '</script><script>alert(1)</script>';

function today() {
  const dish = (id, name) => ({
    id,
    dish_id: id,
    dish: { id, name, tags: [], certifications: [] },
  });
  return {
    date: '2026-10-15',
    day_name: 'Jeudi',
    menu: {
      date: '2026-10-15',
      items: [],
      by_category: [
        {
          id: 1,
          label: 'Plats',
          icon: 'utensils',
          is_highlighted: false,
          is_protected: true,
          order: 0,
          items: [dish(1, 'Curry de pois chiches'), dish(2, HOSTILE_DISH)],
          subcategories: [],
        },
      ],
    },
  };
}

const SITE_ANSWERS = {
  today: () => today(),
  tomorrow: () => ({ date: '2026-10-16', day_name: 'Vendredi', menu: null }),
  events: () => ({ today_event: null, upcoming_events: [] }),
  closures: () => ({ current_closure: null, upcoming_closures: [], closures: [] }),
  restaurant: (slug) => ({
    restaurant: { id: 1, name: slug, service_hours: {}, config: { service_days: [0, 1, 2, 3, 4] } },
  }),
};

function answer(url) {
  const { pathname } = new URL(url, 'http://api');
  if (pathname === '/v1/public/org') return orgAnswer;
  const [, slug, resource] = /^\/v1\/public\/([^/]+)\/([^/]+)$/.exec(pathname) ?? [];
  const known = orgAnswer.body?.sites?.some((site) => site.slug === slug);
  if (!known || !SITE_ANSWERS[resource]) return { status: 404 };
  return { status: 200, body: SITE_ANSWERS[resource](slug) };
}

before(async () => {
  api = http.createServer((incoming, outgoing) => {
    apiRequests.push({ url: incoming.url, headers: incoming.headers });
    const { status, body } = answer(incoming.url);
    outgoing.writeHead(status, { 'Content-Type': 'application/json' });
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
  orgAnswer = organization('alpha', 'beta');
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
  assert.ok(sitemap.body.includes(`<loc>${ORIGIN}/alpha/menu</loc>`));
  assert.ok(sitemap.body.includes(`<loc>${ORIGIN}/beta/menu</loc>`));

  assert.equal(apiRequests.length, 1);
  assert.equal(apiRequests[0].url, '/v1/public/org');
  assert.equal(apiRequests[0].headers.origin, ORIGIN);
  assert.equal(apiRequests[0].headers['x-real-ip'], '203.0.113.7');
});

test('/sitemap.xml of a single site is its menu at the root', async () => {
  orgAnswer = organization('solo');
  const sitemap = await request('/sitemap.xml');
  assert.ok(sitemap.body.includes(`<loc>${ORIGIN}/menu</loc>`));
  assert.ok(!sitemap.body.includes('/solo/'));
});

test('/sitemap.xml is empty for an unknown host and unavailable when the API fails', async () => {
  orgAnswer = { status: 404 };
  const unknown = await request('/sitemap.xml');
  assert.equal(unknown.status, 200);
  assert.ok(!unknown.body.includes('<loc>'));

  orgAnswer = { status: 500 };
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

test('a menu is rendered by the server, with its title, its dishes and its JSON-LD', async () => {
  const page = await request('/alpha/menu');
  assert.equal(page.status, 200);
  assert.match(page.body, /<title>Menu alpha — Demo<\/title>/);
  assert.ok(page.body.includes(`<link rel="canonical" href="${ORIGIN}/alpha/menu"/>`));
  assert.ok(page.body.includes('Curry de pois chiches'));
  const jsonld = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(page.body)?.[1];
  assert.ok(jsonld, 'no JSON-LD block');
  assert.equal(JSON.parse(jsonld).hasMenu.hasMenuSection[0].hasMenuItem[1].name, HOSTILE_DISH);
  // Written as data, never as markup: the name cannot close the script it sits in.
  assert.ok(!page.body.includes(HOSTILE_DISH));
});

test('a page asks the API as the visitor the proxy named', async () => {
  await request('/alpha/menu', { headers: { 'X-Real-IP': '203.0.113.7' } });
  assert.ok(apiRequests.length >= 6);
  for (const { headers } of apiRequests) {
    assert.equal(headers.origin, ORIGIN);
    assert.equal(headers['x-real-ip'], '203.0.113.7');
  }
});

test('an unknown site answers 404, an unreachable API 503', async () => {
  const unknown = await request('/nope/menu');
  assert.equal(unknown.status, 404);
  assert.ok(unknown.body.includes('Restaurant introuvable.'));
  orgAnswer = { status: 404 };
  assert.equal((await request('/')).status, 404);
  orgAnswer = { status: 500 };
  assert.equal((await request('/')).status, 503);
});

test('a single site is served at /menu, and the TV mode has its own address', async () => {
  const tv = await request('/alpha/menu?mode=tv');
  assert.equal(tv.status, 301);
  assert.equal(tv.headers.location, '/alpha/tv');

  orgAnswer = organization('solo');
  for (const path of ['/', '/solo/menu']) {
    const moved = await request(path);
    assert.equal(moved.status, 302, path);
    assert.equal(moved.headers.location, '/menu', path);
  }
  assert.equal((await request('/menu')).status, 200);
});
