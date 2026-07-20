# Architecture MARIAM

Documentation technique de l'infrastructure.

## Stack Technique

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| **Frontend** | React 18 + Vite + Nginx | Interface utilisateur (Port 80) |
| **Backend** | Flask + Gunicorn | API REST + Auth MFA (Port 5000 interne) |
| **Database** | PostgreSQL 15 | Stockage persistant (Port 5432 interne) |
| **Stockage S3** | Scaleway Object Storage / MinIO (dev) | Galerie photos, images événements |
| **Push** | Web Push (VAPID) + APScheduler | Notifications navigateur (menus, événements) |

## Schéma des Flux

```
┌────────────────────────────────────────────────────────────────┐
│                        UTILISATEURS                            │
├──────────────────────────┬─────────────────────────────────────┤
│   📱 Mobile / 💻 Admin   │        📺 TV (Full Screen)          │
└──────────────────────────┴─────────────────────────────────────┘
                           │
                           ▼ HTTP :80
┌────────────────────────────────────────────────────────────────┐
│                     NGINX (Frontend)                           │
│  ┌─────────────────────┐    ┌──────────────────────────────┐   │
│  │  Static Files       │    │  Reverse Proxy /api/*        │   │
│  │  React SPA Build    │    │  → backend:5000              │   │
│  └─────────────────────┘    └──────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
                           │
                           ▼ HTTP :5000
┌────────────────────────────────────────────────────────────────┐
│                   GUNICORN + FLASK (Backend)                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐   │
│  │ Auth (MFA/JWT)  │  │ Menus API       │  │ Admin API     │   │
│  └─────────────────┘  └─────────────────┘  └───────────────┘   │
└────────────────────────────────────────────────────────────────┘
                           │
                           ▼ TCP :5432
┌────────────────────────────────────────────────────────────────┐
│                     POSTGRESQL 15                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────────┐          │
│  │ Users   │ │ Menus   │ │ Events  │ │ Restaurants  │          │
│  └─────────┘ └─────────┘ └─────────┘ └──────────────┘          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐          │
│  │ AuditLog │ │ Gallery  │ │ PushSubs │ │ Taxonomy  │          │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘          │
└────────────────────────────────────────────────────────────────┘
                           │
                           ▼ S3 API (HTTPS)
┌────────────────────────────────────────────────────────────────┐
│              STOCKAGE S3 (Images)                              │
│  ┌───────────────────────┐  ┌──────────────────────────────┐   │
│  │  Dev : MinIO (local)  │  │  Prod : Scaleway Obj Storage │   │
│  │  :9000 API / :9001 UI │  │  s3.fr-par.scw.cloud         │   │
│  └───────────────────────┘  └──────────────────────────────┘   │
│  Bucket : mariam-uploads → galerie photos, événements, logos   │
└────────────────────────────────────────────────────────────────┘
```

## Configuration Nginx

Le fichier `deploy/nginx/nginx.conf` gère :

1. **Reverse Proxy** : `/v1/*` et `/health` → `backend:5000` (évite les CORS)
2. **Routes privées** (`/admin`, `/org`, `/login`, `/activate`, `/reset-password`, `/notifications`) : SPA servie en statique (`try_files $uri /index.html`)
3. **Pages publiques** (`/`, `/menu`, `/<slug>/menu`, `/sitemap.xml`) : proxifiées vers Flask (`@shell`) qui injecte les meta/JSON-LD SEO ; les fichiers réels (assets, manifest, favicons) restent servis en statique
4. **Cache** : assets statiques cachés 1 an · **Compression** : GZIP activé
5. **server_name `_`** : accepte tout sous-domaine `*.mariam.app` (le Host est transmis au backend pour résoudre l'organisation)

## Variables d'Environnement

Fichier : `deploy/.env`

| Variable | Description | Exemple |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL | `random_64_chars` |
| `SECRET_KEY` | Clé secrète Flask | `random_64_chars` |
| `JWT_SECRET_KEY` | Clé signature JWT | `random_64_chars` |
| `JWT_ACCESS_TOKEN_MINUTES` | Durée token (min) | `30` |
| `MFA_ISSUER_NAME` | Nom dans app MFA | `MARIAM` |
| `FRONTEND_URL` | URL du frontend | `https://mariam.univ.fr` |
| `FRONTEND_ORIGIN` | URL interne du frontend (shell SEO) | `http://frontend` |
| `BASE_DOMAIN` | Domaine racine (sous-domaine = organisation) | `mariam.app` |
| `DEFAULT_ORG_SLUG` | Org par défaut si Host non résolu (vide = 404) | `crous-creteil` |
| `PORT` | Port d'écoute | `80` |
| `S3_ENDPOINT_URL` | Endpoint S3 | `https://s3.fr-par.scw.cloud` |
| `S3_ACCESS_KEY_ID` | Clé d'accès S3 | *(secret)* |
| `S3_SECRET_ACCESS_KEY` | Clé secrète S3 | *(secret)* |
| `S3_BUCKET_NAME` | Nom du bucket | `mariam-uploads` |
| `S3_REGION` | Région S3 | `fr-par` |
| `S3_PUBLIC_URL` | URL publique du bucket | `https://mariam-uploads.s3.fr-par.scw.cloud` |
| `VAPID_PUBLIC_KEY` | Clé publique VAPID (Web Push) | *(générée)* |
| `VAPID_PRIVATE_KEY` | Clé privée VAPID (Web Push) | *(secret)* |
| `VAPID_CONTACT_EMAIL` | Email de contact VAPID | `contact@mariam.app` |

## Multi-tenant, URLs & SEO

### Résolution du tenant

- **Organisation = sous-domaine**, **restaurant = chemin** :
  `crous-creteil.mariam.app/efrei/menu`. Une organisation mono-site sert son
  menu à la racine (`jules-ferry.mariam.app/menu`).
- Le backend résout l'organisation depuis le header `Host`
  (`org_slug_from_host`, `deploy` transmet `Host`), puis le restaurant depuis le
  slug du chemin. Host non résolu → `DEFAULT_ORG_SLUG` (ou 404 si vide).

### DNS & Cloudflare (wildcard)

- Enregistrement DNS **wildcard** `*.mariam.app` (A/AAAA ou CNAME) **proxied
  Cloudflare** (nuage orange).
- `server_name _` dans nginx accepte tous les sous-domaines ; le Host est
  transmis au backend.

### SEO (shell serveur)

- Les pages publiques sont proxifiées vers Flask (`routes/seo.py`) qui récupère
  l'`index.html` du frontend (`FRONTEND_ORIGIN`, mis en cache) et injecte
  `<title>`, description, Open Graph/Twitter, canonical et un JSON-LD Schema.org
  `Restaurant` (+ menu du jour). Indispensable pour les aperçus de partage
  (WhatsApp/Discord) et le référencement, car les scrapers n'exécutent pas le JS.
- `sitemap.xml` est généré par host (les sites actifs de l'organisation) ;
  `robots.txt` (nginx) autorise les pages publiques, bloque `/admin`, `/org`,
  l'API, et référence le sitemap.

### Onboarding d'un client

Créer l'organisation puis inviter le directeur via la CLI — voir
`deploy/docs/OPERATIONS.md` (« Provisionner un nouveau client »). Le directeur
crée ensuite ses restaurants (et leurs slugs) depuis le dashboard `/org`.

### Développement local (multi-tenant)

Les navigateurs modernes résolvent `*.localhost` vers `127.0.0.1` sans config :

```
http://crous-creteil.localhost:5173/efrei/menu     # front (Vite)
curl -H "Host: crous-creteil.localhost" http://localhost:5000/sitemap.xml
```

Alternative si besoin : `lvh.me` (résout aussi vers `127.0.0.1`).

## Sécurité

- **MFA obligatoire** : Tous les comptes admin requièrent TOTP
- **Mots de passe forts** : 12+ caractères, majuscule, minuscule, chiffre, symbole
- **Sessions courtes** : 30 min par défaut
- **Audit log** : Traçabilité de toutes les actions sensibles
- **Réinitialisation de mot de passe** : Lien à usage unique (72h) avec MFA obligatoire
- **HTTPS** : Obligatoire en production (requis pour Web Push)

## Taxonomie (Tags & Certifications)

### Architecture

- **Source de vérité** : `server/app/data/taxonomy.py` (registre Python)
- **Tables DB** : 6 tables de référence + 4 tables de jonction N:N
- **Logos SVG** : `client/public/certifications/` (11 fichiers)

```
taxonomy.py (registre)
    ↓ migration Alembic (seed)
┌────────────────────────┐     ┌──────────────────────────┐
│ dietary_tag_categories │     │ certification_categories │
│ dietary_tags           │     │ certifications           │
│ dietary_tag_keywords   │     │ certification_keywords   │
└──────────┬─────────────┘     └──────────┬───────────────┘
           │ N:N                          │ N:N
    ┌──────┴──────┐                ┌──────┴───────┐
    │ restaurant_ │                │ restaurant_  │
    │ dietary_tags│                │certifications│
    ├─────────────┤                ├──────────────┤
    │ menu_item_  │                │ menu_item_   │
    │ dietary_tags│                │certifications│
    └─────────────┘                └──────────────┘
```

### Ajouter un tag ou une certification

1. Modifier `server/app/data/taxonomy.py`
2. Créer une migration Alembic (`INSERT` dans la table concernée)
3. `flask db upgrade`

## Notifications Push

### Architecture

Les notifications push reposent sur le standard **Web Push** (RFC 8030) et l'authentification **VAPID** (RFC 8292).

```
┌──────────────┐        ┌──────────────┐        ┌─────────────────────┐
│  Navigateur  │───(1)─→│   Backend    │───(2)─→│  Push Service       │
│  (SW actif)  │←──(4)──│  (Flask)     │        │  (FCM / APNs / WNS) │
└──────────────┘        └──────┬───────┘        └──────────┬──────────┘
                               │                           │
                          APScheduler                 (3) Livraison
                          (toutes les min)                 │
                               │                           ▼
                               └── check_and_send ──→ Notification
```

1. L'utilisateur s'abonne via la page `/notifications` → le navigateur génère un endpoint push
2. Le scheduler backend vérifie chaque minute si des notifications doivent partir, signe le message avec la clé VAPID privée, et envoie au push service
3. Le push service (FCM pour Chrome/Android, APNs pour Safari/iOS) livre le message au device
4. Le Service Worker reçoit l'événement `push` et affiche la notification

### Service Workers

| Fichier | Usage | Module |
|---------|-------|--------|
| `client/public/sw-push.js` | Développement (enregistré par `push.ts`) | Classic (pas d'import) |
| `client/src/sw-push.js` | Production (construit par VitePWA + Workbox) | ES Modules |

En dev, `devOptions.enabled: false` dans `vite.config.ts` : `push.ts` enregistre directement le SW minimal.
En prod, VitePWA construit le SW Workbox avec précache des assets et handlers push.

### En-têtes Web Push

| En-tête | Valeur | Rôle |
|---------|--------|------|
| `TTL` | `86400` (24h) | Durée de rétention si device hors-ligne |
| `Urgency` | `high` | Livraison immédiate (contourne le mode Doze sur Android) |
| `Topic` | `menu-today-YYYY-MM-DD` | Remplacement de messages en file d'attente (anti-doublon) |

### Types de notifications

| Type | Déclencheur | Tag |
|------|-------------|-----|
| Menu du jour | Scheduler, à l'heure choisie par l'utilisateur | `menu-today-{date}` |
| Menu de demain | Scheduler, à l'heure choisie par l'utilisateur | `menu-tomorrow-{date}` |
| Événement J-7 | Scheduler, 7 jours avant l'événement | `event-{title}-7days` |
| Événement J-1 | Scheduler, la veille de l'événement | `event-{title}-tomorrow` |
