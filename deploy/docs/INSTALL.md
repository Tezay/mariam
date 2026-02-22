# Guide d'Installation MARIAM

Ce guide explique comment installer **MARIAM** sur un serveur ou en local.

## Prérequis

- **Docker** et **Docker Compose V2**
- **Git** pour cloner le projet

## Installation

### 1. Cloner le projet

```bash
git clone https://github.com/Tezay/mariam.git
cd mariam
```

### 2. Exécuter le script d'installation

```bash
./deploy/scripts/install.sh
```

Ce script :
- Vérifie les prérequis (Docker, Docker Compose)
- Crée le fichier `.env` depuis le template
- Configure les permissions des scripts

### 3. Configurer les secrets

⚠️ **CRITIQUE** : Éditez le fichier `.env` avec des valeurs sécurisées.

Générez des clés aléatoires :
```bash
openssl rand -hex 32
```

Variables à modifier **obligatoirement** :
| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL |
| `SECRET_KEY` | Clé secrète Flask |
| `JWT_SECRET_KEY` | Clé de signature JWT |
| `S3_ENDPOINT_URL` | Endpoint S3 (Scaleway : `https://s3.fr-par.scw.cloud`) |
| `S3_ACCESS_KEY_ID` | Clé d'accès S3 |
| `S3_SECRET_ACCESS_KEY` | Clé secrète S3 |
| `S3_BUCKET_NAME` | Nom du bucket (ex : `mariam-uploads`) |
| `S3_PUBLIC_URL` | URL publique du bucket |
| `VAPID_PUBLIC_KEY` | Clé publique VAPID (notifications push) |
| `VAPID_PRIVATE_KEY` | Clé privée VAPID (notifications push) |
| `VAPID_CONTACT_EMAIL` | Email de contact pour les push services |

### Configuration Scaleway Object Storage

1. Créez un bucket sur [console.scaleway.com](https://console.scaleway.com) → Object Storage
2. Nommez-le `mariam-uploads` (ou un nom de votre choix)
3. Réglez la **visibilité du bucket** sur « Public » (les images doivent être accessibles)
4. Générez une paire de clés API → API Keys → Créer une clé
5. Renseignez les variables S3 dans votre fichier `.env`

### Configuration VAPID (Notifications Push)

Les notifications push nécessitent une paire de clés VAPID. Générez-les :

```bash
npx web-push generate-vapid-keys
```

Résultat :
```
Public Key:  xxxx
Private Key: xxxx
```

Copiez les deux clés dans `.env` et renseignez `VAPID_CONTACT_EMAIL` (requis par les push services).

> **Important** : la paire de clés est liée aux souscriptions navigateur. Si vous changez les clés, tous les utilisateurs devront se réabonner.

### 4. Démarrer l'application

```bash
./deploy/scripts/run.sh
```

L'application démarre sur le port **80**.

### 5. Initialiser le premier administrateur

```bash
./deploy/scripts/init.sh
```

Ce script :
1. Crée le restaurant par défaut
2. Génère un lien d'activation pour le premier admin

Suivez les instructions affichées pour créer votre compte.

### Accès à l'application

- **Application** : http://localhost
- **Santé API** : http://localhost/api/health
