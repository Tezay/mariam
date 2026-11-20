FROM nginx:1.30-alpine@sha256:caf4e1e032a20f9c3c5e28fc7f25ffd768ad8677b4975c54193075997b3a97e3 AS runtime

# The base image lags behind the distribution's security fixes.
RUN apk upgrade --no-cache

# The image's entrypoint renders the template with the container's own DNS
# resolver, read from resolv.conf, and leaves nginx's variables alone.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENVSUBST_FILTER=NGINX_

COPY --chmod=755 40-client-address.sh 50-api-hosts.sh /docker-entrypoint.d/
COPY default.conf.template /etc/nginx/templates/default.conf.template
