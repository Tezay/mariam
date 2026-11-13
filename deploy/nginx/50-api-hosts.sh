#!/bin/sh
# Gives the hosts in API_HOSTS to the API alone: their root answers JSON, not a page.
set -eu

{
    echo "map \$host \$pages {"
    echo "    default \$frontend;"
    for host in $(echo "${API_HOSTS:-}" | tr ',' ' '); do
        case $host in
            *[!a-z0-9.-]* | .* | *.)
                echo "API_HOSTS holds an invalid host name: $host" >&2
                exit 1
                ;;
        esac
        echo "    $host \$backend;"
    done
    echo '}'
} >/etc/nginx/conf.d/api-hosts.conf
