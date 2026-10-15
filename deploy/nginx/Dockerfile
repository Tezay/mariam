FROM nginx:1.30-alpine

# The image's entrypoint renders the template with the container's own DNS
# resolver, read from resolv.conf, and leaves nginx's variables alone.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENVSUBST_FILTER=NGINX_

COPY --chmod=755 40-client-address.sh /docker-entrypoint.d/
COPY default.conf.template /etc/nginx/templates/default.conf.template
