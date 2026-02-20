"""
MARIAM - Configuration de sécurité (Rate Limiting)

Protège l'API contre les scans automatisés et les attaques par force brute.
Utilise Flask-Limiter avec Redis (Upstash) pour un rate limiting centralisé
partagé entre toutes les instances de containers serverless.

En développement (sans REDIS_URL), fallback automatique sur stockage en mémoire.
"""
import os
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address


def get_client_ip():
    """
    Récupère l'adresse IP réelle du client.
    En serverless, le proxy ajoute X-Forwarded-For.
    """
    from flask import request
    forwarded_for = request.headers.get('X-Forwarded-For', '')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.remote_addr or '127.0.0.1'


# Redis URL depuis l'environnement (Upstash ou Redis managé)
# Fallback sur memory:// en développement local
REDIS_URL = os.environ.get('REDIS_URL', 'memory://')

limiter = Limiter(
    key_func=get_client_ip,
    storage_uri=REDIS_URL,
    default_limits=["60 per minute"],
    headers_enabled=True,
    strategy="moving-window",
)