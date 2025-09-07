#!/bin/sh

if [ -f "/app/.next/BUILD_ID" ]; then
    echo "Traefik Configurator version: $(cat /app/.next/BUILD_ID)"
fi

echo "Running migration files"
for f in drizzle/*.sql;
do
    psql $DATABASE_URL -f "$f"
done

echo "Running default entrypoint"
exec /usr/local/bin/docker-entrypoint.sh "$@"
