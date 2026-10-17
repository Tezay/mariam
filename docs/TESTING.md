# Testing

Two layers: pytest for the backend, through Docker, and Vitest for the frontend, through Bun.

## Backend

| Tool | Role |
|---|---|
| pytest | Test runner |
| pytest-flask | Flask test client |
| pytest-cov | Coverage report |
| pytest-xdist | Parallel runs |
| factory-boy | Test data factories |

Declared under `[dependency-groups.dev]` in `server/pyproject.toml`.

### Running

```bash
docker compose exec backend uv run pytest
docker compose exec backend uv run pytest tests/test_auth.py
docker compose exec backend uv run pytest tests/test_auth.py::TestLogin
docker compose exec backend uv run pytest -v
docker compose exec backend uv run pytest -n 4
```

`-n` spreads the tests over that many processes. CI runs `-n auto`, one process per core; a
plain `pytest` stays sequential.

Coverage is printed in the terminal, uncovered lines under the `Missing` column.

### Test database

Tests run against a dedicated `mariam_test_db`, created on first run by `server/conftest.py`.
A parallel run gives each process its own, `mariam_test_db_gw0` and so on. Every table is
truncated before each test by an `autouse` fixture, so tests are isolated and order independent.

### Suites

One file per domain in `server/tests/`, grouped roughly as:

| Area | Files |
|---|---|
| Authentication and hardening | `test_auth.py`, `test_auth_<module>.py` (one per module of `routes/auth/`), `test_crypto.py`, `test_hardening.py` |
| Menus and catalogue | `test_menus.py`, `test_categories.py`, `test_catalog.py`, `test_csv_import.py` |
| Public surface | `test_public_resources.py`, `test_domains.py`, `test_public_menu.py` |
| Analytics | `test_analytics_stats.py`, `test_telemetry.py`, `test_votes.py` |
| Organization | `test_org_catalog.py`, `test_alerts.py`, `test_email_digest.py` |
| Cross-cutting | `test_tenant_isolation.py`, `test_retention.py`, `test_inbox.py`, `test_users.py`, `test_restaurant.py`, `test_storage.py` |

`test_tenant_isolation.py` is the one to extend whenever an endpoint is added: every route that
resolves a scope belongs there.

Passkey flows run against `tests/webauthn_authenticator.py`, a software authenticator that
answers the routes' options with genuine attestations and signed assertions, so the real
WebAuthn verification runs. `tests/auth_support.py` puts an account in the states the routes
branch on (TOTP enabled, passkey enrolled, reset link, confirmed session). A test that relies
on a revoked or single-use token takes the `revocations` fixture, which keeps the blacklist in
memory. A test that expects an email takes `smtp`, which records the messages instead of
sending them.

### Writing one

```python
from conftest import make_restaurant, make_user, get_token, auth_headers

class TestMyFeature:
    def test_nominal_case(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)

        res = client.get('/v1/my-route', headers=auth_headers(token))

        assert res.status_code == 200
        assert 'expected_field' in res.get_json()
```

One test covers one behaviour. Use `pytest.skip('reason')` when a precondition is missing, never
`assert False`. Never depend on execution order.

## Frontend

| Tool | Role |
|---|---|
| vitest | Test runner |
| @testing-library/react | Component rendering |
| @testing-library/user-event | Interaction simulation |
| jsdom | Virtual DOM |
| @vitest/coverage-v8 | Coverage |

Declared under `devDependencies` in `client/package.json`.

### Running

```bash
cd client
bun run test            # single run, used by CI
bun run test:watch      # development
bun run test:coverage   # terminal table plus coverage/lcov.info
```

### Suites

| File | Covers |
|---|---|
| `__tests__/lib/date-utils.test.ts` | `parisToday()`, `addDays()` |
| `__tests__/lib/category-colors.test.ts` | `getCategoryColor()`, cyclic palette, named keys |
| `__tests__/features/catalog-rules.test.ts` | Catalogue rules |
| `__tests__/features/fuzzy.test.ts` | Typo-tolerant matching, mirroring the backend thresholds |

### Writing one

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '@/lib/my-lib';

describe('myFunction', () => {
  it('returns X for input Y', () => {
    expect(myFunction('Y')).toBe('X');
  });
});
```

For a component:

```typescript
import { render, screen } from '@testing-library/react';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  it('renders the title it is given', () => {
    render(<MyComponent title="My title" />);
    expect(screen.getByText('My title')).toBeDefined();
  });
});
```

Pure functions first: dates, colours, validation, matching. Components get smoke tests and the
accessibility cases that matter. Mock API calls on the module the code imports, such as
`vi.mock('@/lib/api/admin')`.

### The built server

`bun run test:server` starts the built server against a stub API and checks what it answers:
security headers and policy, the public pages rendered with their title, dishes and JSON-LD,
redirections, 404 and 503. Run it after `bun run build`.

## End-to-end

Playwright drives Chromium against the built server and a real API, seeded with the demo
organization. The scenarios, in `client/e2e/`, read the public pages with and without JavaScript,
check that they hydrate without an error, and open the display screen and the dashboard.

```bash
cd server && uv run flask db upgrade
uv run flask seed-demo
uv run flask run --port 5000

cd client && bun run build
API_INTERNAL_URL=http://localhost:5000/v1 node server.js
bunx playwright install chromium   # once
bunx playwright test
```

`E2E_PORT`, `E2E_SCHEME` and `E2E_API` point the tests at another server or API.

## API contract

`server/openapi.json` is the API's specification, and `client/src/lib/api/schema.gen.ts` the
types generated from it. After changing a route or a schema, write both again and commit them:

```bash
cd server && uv run flask openapi write openapi.json
cd client && bun run api:types
```

`tests/test_api_contract.py` fails on an operation that does not document what it answers.

## CI

Two workflows guard `main`. Each ends with a job that sums up the others, and that job is the
check a pull request needs to merge.

| Workflow | Required check | What it runs |
|---|---|---|
| [`quality.yml`](../.github/workflows/quality.yml) | `CI result` | ruff, mypy and pytest for `server/`; ESLint, Prettier, Vitest, the build and Playwright for `client/`; the API contract; the production images, built without being published; ShellCheck, then the backup and proxy images against throwaway services |
| [`security.yml`](../.github/workflows/security.yml) | `Security result` | `uv audit` and `bun audit` |

What runs depends on the event and on the paths a change touches:

| Event | Quality | Security |
|---|---|---|
| Pull request | the jobs whose paths changed | an audit when its manifest or lockfile changed |
| Push to `main` | the jobs whose paths changed since the previous commit | none |
| Version tag, the release gate | everything except the image builds, which the publish workflow does | none |
| Manual run from the Actions tab | everything | everything |
| Weekly, Monday at 06:17 UTC | none | everything |

- **Backend jobs** follow `server/`.
- **Frontend jobs** follow `client/` and `.editorconfig`, which Prettier reads.
- **The end-to-end and API contract jobs** follow `server/` and `client/`.
- **Image builds** follow the packaging files: `Dockerfile.prod`, the backend's entrypoint, the frontend's `server.js`, `.dockerignore`, the manifest and the lockfile.
- **Backup and proxy jobs** follow `deploy/backup/` with `deploy/scripts/restore.sh`, and `deploy/nginx/`.
- A change to a workflow runs everything that workflow holds.
- `docs/`, the rest of `deploy/` and the other root files run nothing.

**A green check can mean skipped.** A skipped job was not needed; it did not pass. The summary of
each workflow's *Detect changes* job lists what ran, what was skipped, and which paths decide it.

The required checks are not strict: a pull request does not have to catch up with `main` before
merging, so its checks may have run against an older `main`. Two layers catch what two merges
break together:

- the run on `main` after each merge reports it;
- the release gate runs everything before an image is published.
