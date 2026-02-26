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

1. **SPA Routing** : `try_files $uri /index.html` permet à React Router de fonctionner
2. **Reverse Proxy** : `/api/*` → `backend:5000` (évite les CORS)
3. **Cache** : Assets statiques cachés 1 an
4. **Compression** : GZIP activé

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

## Sécurité

- **MFA obligatoire** : Tous les comptes admin requièrent TOTP
- **Mots de passe forts** : 12+ caractères, majuscule, minuscule, chiffre, symbole
- **Sessions courtes** : 30 min par défaut
- **Audit log** : Traçabilité de toutes les actions sensibles
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
