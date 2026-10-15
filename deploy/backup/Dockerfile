# pg_dump and the scratch server must match the database's major version.
FROM postgres:17-alpine

RUN apk add --no-cache age rclone

COPY --chmod=755 backup.sh /usr/local/bin/mariam-backup

# initdb refuses to run as root.
USER postgres

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

ENTRYPOINT ["mariam-backup"]
CMD ["run"]
