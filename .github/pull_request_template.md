## Description

<!-- Décrivez les changements apportés et pourquoi -->

## Type de changement

- [ ] `feat` — Nouvelle fonctionnalité
- [ ] `fix` — Correction de bug
- [ ] `chore` — Maintenance / dépendances / CI
- [ ] `refactor` — Refactoring sans changement de comportement
- [ ] `docs` — Documentation uniquement

## Checklist

- [ ] Tests ajoutés ou mis à jour pour couvrir les changements
- [ ] `ruff check app/` passe sans erreur (backend)
- [ ] `bun run lint` et `bun run format:check` passent (frontend)
- [ ] Migration Alembic créée si un modèle SQLAlchemy a changé
- [ ] `CHANGELOG.md` mis à jour (section `[Unreleased]`)
- [ ] Pas de secret dans le diff (`git diff HEAD | grep -iE "secret|password|token|key"`)

## Captures d'écran / démo

<!-- Si changement UI, joindre une capture avant/après -->
