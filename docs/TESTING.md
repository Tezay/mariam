# Testing

Two layers: pytest for the backend, through Docker, and Vitest for the frontend, through Bun.

## Backend

| Tool | Role |
|---|---|
| pytest | Test runner |
| pytest-flask | Flask test client |
| pytest-cov | Coverage report |
| factory-boy | Test data factories |

Declared under `[dependency-groups.dev]` in `server/pyproject.toml`.

### Running

```bash
docker compose exec backend uv run pytest
docker compose exec backend uv run pytest tests/test_auth.py
docker compose exec backend uv run pytest tests/test_auth.py::TestLogin
docker compose exec backend uv run pytest -v
```

Coverage is printed in the terminal, uncovered lines under the `Missing` column.

### Test database

Tests run against a dedicated `mariam_test_db`, created on first run by `server/conftest.py`.
Every table is truncated after each test by an `autouse` fixture, so tests are isolated and order
independent.

### Suites

One file per domain in `server/tests/`, grouped roughly as:

| Area | Files |
|---|---|
| Authentication and hardening | `test_auth.py`, `test_crypto.py`, `test_hardening.py` |
| Menus and catalogue | `test_menus.py`, `test_categories.py`, `test_catalog.py`, `test_csv_import.py` |
| Public surface | `test_public_menu.py`, `test_public_slugged.py`, `test_seo.py` |
| Analytics | `test_analytics_stats.py`, `test_telemetry.py`, `test_votes.py` |
| Organization | `test_org_catalog.py`, `test_alerts.py`, `test_email_digest.py` |
| Cross-cutting | `test_tenant_isolation.py`, `test_retention.py`, `test_inbox.py`, `test_users.py`, `test_restaurant.py`, `test_storage.py` |

`test_tenant_isolation.py` is the one to extend whenever an endpoint is added: every route that
resolves a scope belongs there.

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

## CI

Both suites run on every push to `main` and every pull request against it, alongside ruff, mypy,
ESLint, Prettier and the frontend build. See
[`.github/workflows/quality.yml`](../.github/workflows/quality.yml).
