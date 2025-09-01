#!/bin/sh

echo "Running migration files"
for f in drizzle/*.sql;
do
    psql $DATABASE_URL -f "$f"
done

echo "Running default entrypoint"
exec /usr/local/bin/docker-entrypoint.sh "$@"
