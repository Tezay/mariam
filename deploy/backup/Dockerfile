# pg_dump and the scratch server must match the database's major version.
FROM postgres:17-alpine@sha256:d3244e8ce3f165ee3c93d9c4a4b1d0fe48b3a89e2287b717fdcbbde92d405065 AS runtime

# The base image lags behind the distribution's security fixes.
RUN apk upgrade --no-cache && apk add --no-cache age rclone

COPY --chmod=755 backup.sh /usr/local/bin/mariam-backup

# initdb refuses to run as root.
USER postgres

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

ENTRYPOINT ["mariam-backup"]
CMD ["run"]
