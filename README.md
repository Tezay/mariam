# MARIAM

> **Plateforme de Gestion des Menus Universitaires**

MARIAM est une solution moderne pour faciliter la communication des menus de restauration universitaire. Elle permet aux gestionnaires de RU de préparer et publier les menus, et aux étudiants de les consulter facilement sur mobile ou sur écrans TV.

## 📋 Fonctionnalités

### Pour les gestionnaires
- **Weekly Planner** - Vue hebdomadaire pour préparer les menus en avance
- **Éditeur simple** - Saisie rapide par catégorie (entrées, plat, VG, desserts)
- **Publication** - Publier un jour ou toute la semaine en un clic
- **Événements** - Créer et annoncer les événements spéciaux avec images
- **Galerie photos** - Galerie partagée avec tags automatiques et recherche
- **Réutilisation photos** - Sélectionner depuis la galerie existante
- **Mot du chef** - Note personnalisée affichée dans le bandeau TV
- **Gestion des utilisateurs** - Inviter, modifier les rôles, réinitialiser MFA

### Pour les étudiants
- **Mobile-first** - Interface optimisée pour smartphone
- **Mode TV** - Affichage plein écran pour les restaurants
- **Tags alimentaires** - VG, Halal, Sans porc clairement identifiés
- **Accès instantané** - Pas de connexion requise

### Sécurité pour les gestionnaires
- **Authentification MFA** - Double authentification obligatoire
- **Mot de passe fort** - Validation de complexité
- **Audit log** - Traçabilité des actions sensibles
- **Sessions courtes** - Adapté aux postes partagés

## 🏗️ Architecture

```
┌──────────────────────────────┐
│           Frontend           │
│         React / Vite         │
│          Port 5173           │
└───────────────┬──────────────┘
                │
                │  HTTP + JWT
                ▼
┌──────────────────────────────┐
│            Backend           │
│           Flask API          │
│           Port 5000          │
└───────────┬──────────┬───────┘
            │          │
   SQL (TCP)│          │ S3 API
            ▼          ▼
┌──────────────┐ ┌─────────────┐
│  PostgreSQL  │ │  Stockage   │
│  Port 5432   │ │  S3 / MinIO │
│              │ │  Port 9000  │
└──────────────┘ └─────────────┘
```

> **Stockage S3** : MinIO en développement, [Scaleway Object Storage](https://www.scaleway.com/en/object-storage/) en production. Utilisé pour la galerie photos, les images événements et logos.

## 🚀 Mise en Production

Le guide complet pour le démarrage et la configuration en production est détaillé dans le fichier [./deploy/docs/INSTALL.md](./deploy/docs/INSTALL.md).

## 🛠️ Démarrage en Développement

### Prérequis
- Docker & Docker Compose

### 1. Cloner et configurer

```bash
cd Mariam

# Copier la config d'environnement
cp deploy/.env.example deploy/.env
# Éditer deploy/.env avec vos secrets
```

### 2. Lancer en développement

```bash
docker compose up --build
```

L'application sera accessible sur :
- **Frontend** : http://localhost:5173
- **API** : http://localhost:5000/api/health
- **MinIO Console** : http://localhost:9001 (identifiants : `mariam_minio` / `mariam_minio_secret`)

> MinIO démarre automatiquement via Docker Compose et fournit un stockage S3-compatible local. Le bucket `mariam-uploads` est créé automatiquement au premier lancement du backend.

### 3. Créer le premier administrateur

```bash
# Générer le lien d'activation
docker compose exec backend flask create-activation-link

# Initialiser le restaurant par défaut
docker compose exec backend flask init-restaurant
```

Ouvrez le lien affiché pour créer votre compte admin avec MFA.

## 📁 Structure du Projet

```
Mariam/
├── docker-compose.yml          # Orchestration développement
├── deploy/                     # Configuration production
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── nginx/
│   └── scripts/
├── server/                     # Backend Flask
│   ├── app/
│   │   ├── __init__.py        # Factory pattern
│   │   ├── models/            # User, Restaurant, Menu, Event, GalleryImage, MenuItemImage...
│   │   ├── routes/            # auth, admin, menus, events, gallery, public, csv_import
│   │   └── services/
│   │       └── storage.py     # Service S3 (upload, delete, gestion bucket)
│   ├── migrations/            # Alembic (schéma BDD)
│   └── requirements.txt
└── client/                     # Frontend React
    └── src/
        ├── pages/
        │   ├── Login.tsx
        │   ├── Activate.tsx
        │   ├── admin/WeeklyPlanner.tsx
        │   ├── admin/GalleryPage.tsx
        │   └── public/MenuDisplay.tsx
        ├── components/
        │   ├── MenuEditor.tsx    # Éditeur avec images par item
        │   └── GalleryPicker.tsx # Sélecteur galerie partagée
        └── lib/api.ts         # Client API avec interceptors
```

## 🌐 API Développeur (v1)

Une API publique est disponible pour les développeurs souhaitant intégrer les données des menus.

**Documentation interactive** : `/api/v1/docs` (Swagger UI)

| Route | Description |
|-------|-------------|
| `GET /api/v1/menus` | Menu du jour et de demain |
| `GET /api/v1/restaurant` | Informations du restaurant |

### Exemple de réponse

```json
{
  "success": true,
  "data": {
    "today": { "date": "2025-12-26", "day_name": "Jeudi", "items": [...] },
    "tomorrow": { "date": "2025-12-27", "day_name": "Vendredi", "items": [...] }
  },
  "meta": { "generated_at": "2025-12-26T12:00:00Z" }
}
```

---

## 🔧 API Interne (utilisée par l'interface)

Ces routes sont utilisées par l'application web MARIAM.

### Publiques
| Route | Description |
|-------|-------------|
| `GET /api/public/menu/today` | Menu du jour |
| `GET /api/public/menu/tomorrow` | Menu de demain |
| `GET /api/public/events` | Événements à venir |

### Authentification
| Route | Description |
|-------|-------------|
| `POST /api/auth/login` | Connexion |
| `POST /api/auth/verify-mfa` | Vérification MFA |
| `POST /api/auth/activate` | Activation de compte |

### Administration (auth requise)
| Route | Description |
|-------|-------------|
| `GET /api/menus/week` | Menus de la semaine |
| `POST /api/menus` | Créer/modifier un menu |
| `POST /api/menus/:id/publish` | Publier un menu |
| `POST /api/menus/:id/images` | Ajouter une photo au menu (max 6) |
| `DELETE /api/menus/:id/images/:imgId` | Supprimer une photo du menu |
| `PUT /api/menus/:id/images/reorder` | Réordonner les photos du menu |
| `POST /api/menus/:id/item-images` | Synchroniser les images par item (galerie) |
| `DELETE /api/menus/:id/item-images/:linkId` | Dissocier une image d'un item |
| `PUT /api/menus/:id/chef-note` | Mettre à jour le mot du chef |
| `GET /api/gallery` | Liste des photos (pagination, recherche, tri) |
| `GET /api/gallery/:id` | Détail d'une photo (tags, usages) |
| `POST /api/gallery` | Uploader une photo (auto-tags) |
| `DELETE /api/gallery/:id` | Supprimer une photo |
| `PUT /api/gallery/:id/tags` | Remplacer les tags dish/manual |
| `POST /api/gallery/:id/tags` | Ajouter un tag manuel |
| `DELETE /api/gallery/:id/tags/:tagId` | Supprimer un tag |
| `GET /api/events` | Liste des événements |
| `POST /api/events` | Créer un événement |
| `PUT /api/events/:id` | Modifier un événement |
| `DELETE /api/events/:id` | Supprimer un événement |
| `POST /api/events/:id/publish` | Publier un événement |
| `POST /api/events/:id/images` | Ajouter une image (max 10) |
| `DELETE /api/events/:id/images/:imgId` | Supprimer une image |
| `PUT /api/events/:id/images/reorder` | Réordonner les images |
| `GET /api/events/storage-status` | État du stockage S3 |
| `GET /api/admin/users` | Liste des utilisateurs (admin) |

## 🖥️ Mode TV

Pour afficher le menu sur un écran TV, utilisez :

```
http://localhost:5173/menu?mode=tv
```

Ou laissez la détection automatique fonctionner (> 1920px de large).

## Stockage S3 (Images)

MARIAM utilise un stockage **S3-compatible** pour gérer les images uploadées par les gestionnaires.

### Utilisation

| Fonctionnalité | Limite | Préfixe S3 |
|----------------|--------|------------|
| Galerie photos (menus) | 3 par item | `gallery/` |
| Images événements | 10 par événement | `events/` |
| Photos du jour (legacy) | 6 par menu | `menus/` |
| Logos restaurant | 1 par restaurant | `logos/` |

**Contraintes** : 5 Mo max par image, formats acceptés : JPG, PNG, GIF, WebP.

### En développement

MinIO est inclus dans le `docker-compose.yml` et démarre automatiquement :
- **API S3** : `http://localhost:9000`
- **Console web** : `http://localhost:9001`
- **Identifiants** : `mariam_minio` / `mariam_minio_secret`

Le bucket `mariam-uploads` est créé automatiquement par le backend au démarrage.

### En production

En production, configurez un fournisseur S3-compatible (ex : Scaleway Object Storage) via les variables d'environnement :

| Variable | Description | Exemple |
|----------|-------------|---------|
| `S3_ENDPOINT_URL` | URL du service S3 | `https://s3.fr-par.scw.cloud` |
| `S3_ACCESS_KEY_ID` | Clé d'accès | — |
| `S3_SECRET_ACCESS_KEY` | Clé secrète | — |
| `S3_BUCKET_NAME` | Nom du bucket | `mariam-uploads` |
| `S3_REGION` | Région | `fr-par` |
| `S3_PUBLIC_URL` | URL publique du bucket | `https://mariam-uploads.s3.fr-par.scw.cloud` |

> Voir le guide complet dans [deploy/docs/INSTALL.md](./deploy/docs/INSTALL.md#configuration-scaleway-object-storage).

### Architecture du service

Le service `StorageService` (`server/app/services/storage.py`) encapsule toute l'interaction S3 via boto3 :
- Initialisation automatique du client et création du bucket
- Upload avec génération de noms uniques (UUID)
- Suppression par URL publique
- Validation du type MIME et de la taille

## 📦 Technologies

- **Backend** : Flask, SQLAlchemy, Flask-JWT-Extended, PyOTP, boto3
- **Frontend** : React, Vite, TailwindCSS, Shadcn/UI, Lucide React
- **Base de données** : PostgreSQL
- **Stockage** : S3-compatible (MinIO en dev, Scaleway Object Storage en prod)
- **Conteneurisation** : Docker, Docker Compose

## 📄 Licence

Ce projet est distribué sous la **MARIAM Source Available License 1.0.0** (basée sur PolyForm Noncommercial).

### Résumé des droits
- **Usage Personnel** : Gratuit et libre pour un usage domestique ou de test.
- **Usage Commercial & Institutionnel** : Interdit sans licence. Cela inclut l'usage en **Restaurant Universitaire**, cantine, entreprise, ou toute structure administrative.

### Usage Professionnel
Pour utiliser MARIAM dans un cadre professionnel (Restaurant Universitaire, Entreprise, Administration), **vous devez acquérir une licence commerciale**.

👉 [Voir la licence complète](./LICENSE.md)  
👉 [Voir un modèle de contrat commercial](./COMMERCIAL_LICENSE_TEMPLATE.md)

---

**MARIAM** - *Gestion des menus, simplement.*
