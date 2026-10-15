#!/bin/sh
# Takes the visitor's address from REAL_IP_HEADER, and only on a connection from
# TRUSTED_PROXIES. The defaults trust the private networks a platform's proxy or
# a tunnel connects from.
set -eu

trusted=${TRUSTED_PROXIES:-10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8,fc00::/7,::1/128}
header=${REAL_IP_HEADER:-X-Forwarded-For}

# nginx refuses a range that is not one; a header name could carry more directives.
case $header in
    '' | *[!A-Za-z0-9-]*)
        echo "REAL_IP_HEADER is not a header name: $header" >&2
        exit 1
        ;;
esac

{
    for range in $(echo "$trusted" | tr ',' ' '); do
        echo "set_real_ip_from $range;"
    done
    echo "real_ip_header $header;"
    echo "real_ip_recursive on;"
} >/etc/nginx/conf.d/client-address.conf
