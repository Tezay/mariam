# MARIAM

> **Plateforme de Gestion des Menus Universitaires**

MARIAM est une solution moderne pour faciliter la communication des menus de restauration universitaire. Elle permet aux gestionnaires de RU de préparer et publier les menus, et aux étudiants de les consulter facilement sur mobile ou sur écrans TV.

## 📋 Fonctionnalités

### Pour les gestionnaires
- **Weekly Planner** - Vue hebdomadaire pour préparer les menus en avance
- **Éditeur simple** - Saisie rapide par catégorie (entrées, plat, VG, desserts)
- **Publication** - Publier un jour ou toute la semaine en un clic
- **Événements** - Annoncer les événements spéciaux
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
└───────────────┬──────────────┘
                │
                │  SQL (TCP)
                ▼
┌──────────────────────────────┐
│          PostgreSQL          │
│           Port 5432          │
└──────────────────────────────┘
```

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
│   │   ├── models/            # User, Restaurant, Menu, Event...
│   │   └── routes/            # auth, admin, menus, events, public
│   └── requirements.txt
└── client/                     # Frontend React
    └── src/
        ├── pages/
        │   ├── Login.tsx
        │   ├── Activate.tsx
        │   ├── admin/WeeklyPlanner.tsx
        │   └── public/MenuDisplay.tsx
        ├── components/
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
| `GET /api/admin/users` | Liste des utilisateurs (admin) |

## 🖥️ Mode TV

Pour afficher le menu sur un écran TV, utilisez :

```
http://localhost:5173/menu?mode=tv
```

Ou laissez la détection automatique fonctionner (> 1920px de large).

## 📦 Technologies

- **Backend** : Flask, SQLAlchemy, Flask-JWT-Extended, PyOTP
- **Frontend** : React, Vite, TailwindCSS, Shadcn/UI
- **Base de données** : PostgreSQL
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
