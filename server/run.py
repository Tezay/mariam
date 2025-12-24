"""
Point d'entrée de l'application Flask MARIAM.
Utilisé pour le développement local.
En production, Gunicorn charge directement le module app:create_app().
"""
from app import create_app

app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
