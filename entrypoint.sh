#!/bin/sh

if [ -f "/app/.next/BUILD_ID" ]; then
    echo "Traefik Configurator version: $(cat /app/.next/BUILD_ID)"
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
