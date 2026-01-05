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
