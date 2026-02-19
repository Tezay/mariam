"""
MARIAM - Service de stockage S3-compatible.

Abstraction pour upload/suppression de fichiers sur un stockage S3-compatible.
Fonctionne avec MinIO (développement) et Scaleway Object Storage (production).
Inclut la conversion automatique HEIC/HEIF → JPEG pour les photos iPhone.
"""
import io
import os
import uuid
import json
from datetime import datetime

import boto3
from botocore.exceptions import ClientError
from PIL import Image, ImageOps
import pillow_heif

# Enregistrement du codec HEIC/HEIF dans Pillow
pillow_heif.register_heif_opener()


class StorageService:
    """Service de stockage S3-compatible (MinIO en dev, Scaleway en prod)."""

    # Types de fichiers autorisés pour les images
    ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'}
    HEIC_EXTENSIONS = {'heic', 'heif'}
    MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB par image

    def __init__(self, app=None):
        self.client = None
        self.bucket = None
        self.public_url = None
        if app:
            self.init_app(app)

    def init_app(self, app):
        """Initialise le service avec la configuration Flask."""
        endpoint_url = app.config.get('S3_ENDPOINT_URL')
        access_key = app.config.get('S3_ACCESS_KEY_ID')
        secret_key = app.config.get('S3_SECRET_ACCESS_KEY')
        region = app.config.get('S3_REGION', 'fr-par')
        self.bucket = app.config.get('S3_BUCKET_NAME', 'mariam-uploads')
        self.public_url = app.config.get('S3_PUBLIC_URL', '').rstrip('/')

        if not all([endpoint_url, access_key, secret_key]):
            app.logger.warning(
                "⚠️  S3 storage not configured — image uploads will be disabled. "
                "Set S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY to enable."
            )
            return

        self.client = boto3.client(
            's3',
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )

        # Créer le bucket s'il n'existe pas (utile pour MinIO en dev)
        self._ensure_bucket()

        app.logger.info(f"✅ S3 storage configured (bucket: {self.bucket})")

    # ------------------------------------------------------------------
    # Propriétés
    # ------------------------------------------------------------------

    @property
    def is_configured(self) -> bool:
        """Vérifie si le service S3 est opérationnel."""
        return self.client is not None

    # ------------------------------------------------------------------
    # Méthodes publiques
    # ------------------------------------------------------------------

    def upload_file(self, file_data, filename, prefix='uploads', content_type=None):
        """Upload un fichier vers S3.

        Args:
            file_data: Contenu binaire du fichier (bytes ou file-like object).
            filename: Nom original du fichier (pour déduire l'extension).
            prefix: Préfixe de clé S3 (ex: 'events', 'menus').
            content_type: Type MIME explicite (optionnel).

        Returns:
            dict: {'key': str, 'url': str} en cas de succès, None sinon.
        """
        if not self.is_configured:
            return None

        key = self._generate_key(prefix, filename)

        extra_args = {'ACL': 'public-read'}
        if content_type:
            extra_args['ContentType'] = content_type

        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=file_data,
                **extra_args,
            )
            return {
                'key': key,
                'url': self.get_public_url(key),
            }
        except ClientError as e:
            print(f"S3 upload error: {e}")
            return None

    def delete_file(self, key):
        """Supprime un fichier de S3."""
        if not self.is_configured or not key:
            return False

        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError:
            return False

    def delete_files(self, keys):
        """Supprime plusieurs fichiers de S3 en une seule requête."""
        if not self.is_configured or not keys:
            return False

        try:
            objects = [{'Key': k} for k in keys if k]
            if objects:
                self.client.delete_objects(
                    Bucket=self.bucket,
                    Delete={'Objects': objects},
                )
            return True
        except ClientError:
            return False

    def get_public_url(self, key):
        """Retourne l'URL publique d'un fichier stocké."""
        if self.public_url:
            return f"{self.public_url}/{key}"
        # Fallback : URL directe via l'endpoint S3
        endpoint = self.client._endpoint.host
        return f"{endpoint}/{self.bucket}/{key}"

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    @classmethod
    def validate_image(cls, filename, content_length=None):
        """Valide qu'un fichier est une image autorisée.

        Returns:
            tuple: (is_valid: bool, error_message: str | None)
        """
        if not filename:
            return False, "Nom de fichier manquant"

        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        if ext not in cls.ALLOWED_EXTENSIONS:
            return False, f"Type de fichier non autorisé. Formats acceptés : {', '.join(cls.ALLOWED_EXTENSIONS)}"

        if content_length and content_length > cls.MAX_FILE_SIZE:
            max_mb = cls.MAX_FILE_SIZE // (1024 * 1024)
            return False, f"Fichier trop volumineux (max {max_mb} MB)"

        return True, None

    @classmethod
    def process_image(cls, file_data, filename, content_type):
        """Traite une image uploadée. Convertit HEIC/HEIF en JPEG automatiquement.

        Args:
            file_data: Contenu binaire du fichier (bytes).
            filename: Nom original du fichier.
            content_type: Type MIME du fichier.

        Returns:
            tuple: (file_data, filename, content_type) — convertis si HEIC, inchangés sinon.
        """
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

        if ext not in cls.HEIC_EXTENSIONS:
            return file_data, filename, content_type

        # Conversion HEIC/HEIF -> JPEG via Pillow (plugin pillow-heif)
        img = Image.open(io.BytesIO(file_data))
        img = ImageOps.exif_transpose(img)

        if img.mode != 'RGB':
            img = img.convert('RGB')

        output = io.BytesIO()
        img.save(output, format='JPEG', quality=90)
        converted_data = output.getvalue()

        # Nouveau nom de fichier et type MIME
        base = filename.rsplit('.', 1)[0] if '.' in filename else filename
        converted_filename = f"{base}.jpg"
        converted_content_type = 'image/jpeg'

        return converted_data, converted_filename, converted_content_type

    # ------------------------------------------------------------------
    # Méthodes internes
    # ------------------------------------------------------------------

    def _ensure_bucket(self):
        """Crée le bucket s'il n'existe pas (utile pour MinIO en dev)."""
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            try:
                self.client.create_bucket(Bucket=self.bucket)
                # Politique de lecture publique pour les images
                self.client.put_bucket_policy(
                    Bucket=self.bucket,
                    Policy=json.dumps({
                        "Version": "2012-10-17",
                        "Statement": [{
                            "Sid": "PublicRead",
                            "Effect": "Allow",
                            "Principal": "*",
                            "Action": ["s3:GetObject"],
                            "Resource": [f"arn:aws:s3:::{self.bucket}/*"],
                        }],
                    }),
                )
            except ClientError as e:
                print(f"Warning: Could not create S3 bucket: {e}")

    def _generate_key(self, prefix, filename):
        """Génère une clé S3 unique avec structure date/uuid."""
        ext = os.path.splitext(filename)[1].lower() if filename else '.jpg'
        unique = uuid.uuid4().hex[:12]
        date_prefix = datetime.utcnow().strftime('%Y/%m')
        return f"{prefix}/{date_prefix}/{unique}{ext}"


# Instance globale — initialisée via storage.init_app(app) dans create_app()
storage = StorageService()
