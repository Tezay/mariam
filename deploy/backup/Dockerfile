# Postgres backup sidecar: periodic pg_dump pushed to an S3 bucket (Scaleway).
# Based on postgres:15-alpine so pg_dump matches the database major version.
FROM postgres:15-alpine

# MinIO client (mc) — S3-compatible, used to upload dumps to Scaleway.
RUN apk add --no-cache curl \
    && curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc \
    && chmod +x /usr/local/bin/mc

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

ENTRYPOINT ["/usr/local/bin/backup.sh"]
