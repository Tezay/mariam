# Opérations & Maintenance MARIAM

Commandes usuelles pour gérer l'application en production.

## Commandes de base

Les scripts se trouvent dans `deploy/scripts/`.

### Démarrer l'application
```bash
./deploy/scripts/run.sh
# ou
./deploy/scripts/run.sh up
```

### Arrêter l'application
```bash
./deploy/scripts/run.sh down
```

### Redémarrer
```bash
./deploy/scripts/run.sh restart
```

### Voir les logs
```bash
./deploy/scripts/run.sh logs
```

### État des services
```bash
./deploy/scripts/run.sh status
```

---

## Administration

### Initialiser (premier démarrage)
```bash
./deploy/scripts/init.sh
```

### Créer un nouveau lien d'activation admin
```bash
docker compose -f deploy/docker-compose.yml exec backend flask create-activation-link
```

### Ajouter un restaurant
```bash
docker compose -f deploy/docker-compose.yml exec backend flask init-restaurant
```

---

## Base de données

### Sauvegarde (Backup)
```bash
docker exec -t mariam_db_prod pg_dump -U mariam mariam_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restauration
⚠️ Attention : écrase les données existantes !
```bash
cat backup_file.sql | docker exec -i mariam_db_prod psql -U mariam -d mariam_db
```

### Accès console PostgreSQL
```bash
docker exec -it mariam_db_prod psql -U mariam -d mariam_db
```

---

## Mise à jour

```bash
# 1. Récupérer les modifications
git pull origin main

# 2. Reconstruire et relancer
./deploy/scripts/run.sh restart
```

---

## Dépannage

### L'application ne démarre pas
1. Vérifiez les logs : `./deploy/scripts/run.sh logs`
2. Vérifiez le fichier `.env` : toutes les variables requises sont-elles définies ?
3. Vérifiez que les ports ne sont pas occupés : `lsof -i :80`

### Erreur de connexion à la base
1. Vérifiez que le container db est en bonne santé : `./deploy/scripts/run.sh status`
2. Vérifiez les credentials dans `.env`

### Réinitialisation complète
⚠️ Supprime toutes les données !
```bash
./deploy/scripts/run.sh down
docker volume rm deploy_postgres_data_prod
./deploy/scripts/run.sh
./deploy/scripts/init.sh
```
