# Tests — MARIAM

Architecture de test en deux couches :
- **Backend** : pytest (Python) via Docker
- **Frontend** : Vitest (TypeScript/React) via Bun

---

## Backend — pytest

### Stack

| Outil | Rôle |
|-------|------|
| pytest | Runner de tests |
| pytest-flask | Client HTTP de test pour Flask |
| pytest-cov | Rapport de couverture |
| factory-boy | Factories de données de test |

Dépendances dans `[dependency-groups.dev]` de `server/pyproject.toml`.

### Lancer les tests

```bash
# Tous les tests (dans le container dev)
docker compose exec backend uv run pytest

# Un seul fichier
docker compose exec backend uv run pytest tests/test_auth.py

# Une seule suite (classe ou fonction)
docker compose exec backend uv run pytest tests/test_auth.py::TestLogin

# Verbeux
docker compose exec backend uv run pytest -v
```

### Base de données de test

Les tests utilisent une base PostgreSQL dédiée `mariam_test_db` (créée automatiquement si absente).
Chaque test est isolé : toutes les tables sont vidées après chaque test via `autouse` fixture.

La base de test est créée automatiquement dans `server/conftest.py` au premier lancement.

### Rapport de couverture

```bash
docker compose exec backend uv run pytest
# Le rapport s'affiche dans le terminal (--cov-report=term-missing)
# Lignes non couvertes sont listées dans la colonne "Missing"
```

### Suites de tests

| Fichier | Ce qui est couvert |
|---------|-------------------|
| `tests/test_auth.py` | Login, MFA TOTP, refresh token, protection des routes |
| `tests/test_public_menu.py` | Menu publié visible, brouillon invisible, route `/today` |
| `tests/test_categories.py` | CRUD catégories, hiérarchie parent/enfant, protection |
| `tests/test_menus.py` | Création, publication, dépublication de menu |
| `tests/test_restaurant.py` | Config restaurant, accès JWT, mise à jour |
| `tests/test_users.py` | Invitation, rôles, désactivation |

### Ajouter un test backend

1. Créer (ou ouvrir) le fichier `server/tests/test_<feature>.py`
2. Importer les helpers depuis `conftest` :

```python
from conftest import make_restaurant, make_user, get_token, auth_headers

class TestMaFeature:
    def test_cas_nominal(self, app, client):
        # Arrange
        make_restaurant(app)
        make_user(app)
        token = get_token(client)

        # Act
        res = client.get('/v1/ma-route', headers=auth_headers(token))

        # Assert
        assert res.status_code == 200
        assert 'champ_attendu' in res.get_json()
```

3. Lancer `docker compose exec backend uv run pytest tests/test_<feature>.py -v`

**Règles** :
- Un test = un comportement précis (pas de tests qui testent plusieurs choses)
- Utiliser `pytest.skip('raison')` si une précondition manque, jamais `assert False`
- Les tests ne doivent pas dépendre d'un ordre d'exécution

---

## Frontend — Vitest

### Stack

| Outil | Rôle |
|-------|------|
| vitest | Runner de tests (Vite-native) |
| @testing-library/react | Rendu de composants React en test |
| @testing-library/user-event | Simulation d'interactions utilisateur |
| jsdom | Environnement DOM virtuel |
| @vitest/coverage-v8 | Couverture de code |

Dépendances dans `devDependencies` de `client/package.json`.

### Lancer les tests

```bash
cd client

# Run unique (CI)
bun run test

# Watch mode (développement)
bun run test:watch

# Avec rapport de couverture
bun run test:coverage
```

### Rapport de couverture

```bash
bun run test:coverage
# Affiche un tableau dans le terminal
# Génère un fichier lcov.info dans coverage/ (pour intégration CI future)
```

### Suites de tests

| Fichier | Ce qui est couvert |
|---------|-------------------|
| `__tests__/lib/date-utils.test.ts` | `parisToday()`, `addDays()` — fonctions pures |
| `__tests__/lib/category-colors.test.ts` | `getCategoryColor()`, palette cyclique, clés nommées |

### Ajouter un test frontend

1. Créer `client/src/__tests__/<chemin>/<nom>.test.ts(x)`
2. Pour une fonction pure :

```typescript
import { describe, it, expect } from 'vitest';
import { maFonction } from '@/lib/ma-lib';

describe('maFonction', () => {
    it('retourne X pour l\'entrée Y', () => {
        expect(maFonction('Y')).toBe('X');
    });
});
```

3. Pour un composant React :

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonComposant } from '@/components/MonComposant';

describe('MonComposant', () => {
    it('affiche le titre passé en prop', () => {
        render(<MonComposant title="Mon titre" />);
        expect(screen.getByText('Mon titre')).toBeDefined();
    });
});
```

**Règles** :
- Priorité aux fonctions pures (date-utils, category-colors, validation)
- Les composants : smoke tests (rendu sans crash) + cas d'accessibilité critiques
- Mocker les appels API avec `vi.mock('@/lib/api')`

---

## CI/CD

Les tests sont exécutés automatiquement dans GitHub Actions :
- Sur chaque push vers `feature/**` et `fix/**`
- Sur chaque Pull Request vers `main`

Voir [`.github/workflows/quality.yml`](../.github/workflows/quality.yml).
