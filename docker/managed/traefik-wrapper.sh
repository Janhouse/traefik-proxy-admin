#!/bin/sh
# Managed-Traefik wrapper: fetches Traefik's STATIC config (traefik.yml) and
# its DNS-provider credentials from the admin panel, and restarts Traefik
# whenever either changes — static config and env vars can't be hot-reloaded.
# Runs as the container entrypoint of the official traefik image (busybox sh
# + wget are available).
set -u

PANEL_URL="${PANEL_URL:-http://traefik-configurator:3000}"
CONFIG_FILE="${CONFIG_FILE:-/etc/traefik/traefik.yml}"
ENV_FILE="${ENV_FILE:-/run/traefik-secrets.env}"
POLL_SECONDS="${POLL_SECONDS:-30}"
STARTUP_TIMEOUT_SECONDS="${STARTUP_TIMEOUT_SECONDS:-120}"

STATIC_URL="$PANEL_URL/api/traefik/static-config"
SECRETS_URL="$PANEL_URL/api/traefik/managed/secrets-env"
TMP_FILE="$CONFIG_FILE.next"
TMP_ENV="$ENV_FILE.next"

# Credentials land in $ENV_FILE — keep it owner-only.
umask 077

log() { echo "[traefik-wrapper] $1"; }

fetch_config() {
    wget -q -T 5 -O "$TMP_FILE" "$STATIC_URL" 2>/dev/null && [ -s "$TMP_FILE" ]
}

# Credentials may legitimately be empty (no DNS resolvers), so success here is
# a clean HTTP fetch — not a non-empty file.
fetch_secrets() {
    wget -q -T 5 -O "$TMP_ENV" "$SECRETS_URL" 2>/dev/null
}

# Minimal config so Traefik still serves (and keeps polling the panel's
# DYNAMIC config) if the panel is down at boot. The wrapper keeps retrying
# the static fetch afterwards and restarts into the real config.
write_fallback_config() {
    log "panel unreachable after ${STARTUP_TIMEOUT_SECONDS}s — starting with fallback config"
    cat > "$CONFIG_FILE" <<EOF
log:
  level: INFO
api:
  dashboard: true
  insecure: true
entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"
providers:
  http:
    endpoint: $PANEL_URL/api/traefik/config
    pollInterval: 5s
EOF
}

mkdir -p "$(dirname "$CONFIG_FILE")" "$(dirname "$ENV_FILE")"
# Start from a known-empty env file so the first secrets fetch only restarts
# Traefik when credentials actually exist.
: > "$ENV_FILE"

# ── first boot: wait for the panel, fall back if it never shows up ──────────
waited=0
until fetch_config; do
    if [ "$waited" -ge "$STARTUP_TIMEOUT_SECONDS" ]; then
        write_fallback_config
        break
    fi
    log "waiting for $STATIC_URL ($waited/${STARTUP_TIMEOUT_SECONDS}s)"
    sleep 5
    waited=$((waited + 5))
done
if [ -s "$TMP_FILE" ]; then
    mv "$TMP_FILE" "$CONFIG_FILE"
    log "fetched static config from the panel"
fi
if fetch_secrets; then
    mv "$TMP_ENV" "$ENV_FILE"
    log "fetched DNS credentials from the panel"
fi

# Launch Traefik in a CLEAN subshell that sources the credential env file, so
# the wrapper's own environment never accumulates secrets and a removed
# credential simply isn't present on the next restart.
start_traefik() {
    (
        if [ -s "$ENV_FILE" ]; then
            set -a
            # shellcheck disable=SC1090
            . "$ENV_FILE"
            set +a
        fi
        exec traefik --configfile "$CONFIG_FILE"
    ) &
    CHILD=$!
    log "traefik started (pid $CHILD)"
}

shutdown() {
    log "shutting down"
    [ -n "${CHILD:-}" ] && kill "$CHILD" 2>/dev/null
    wait "${CHILD:-}" 2>/dev/null
    exit 0
}
trap shutdown TERM INT

start_traefik

# ── poll loop: restart on static-config OR credential change; exit if Traefik
#    dies on its own so compose's restart policy recovers ─────────────────────
while true; do
    slept=0
    while [ "$slept" -lt "$POLL_SECONDS" ]; do
        sleep 1
        slept=$((slept + 1))
        if ! kill -0 "$CHILD" 2>/dev/null; then
            wait "$CHILD"
            code=$?
            log "traefik exited unexpectedly (code $code)"
            exit "$code"
        fi
    done

    changed=0
    if fetch_config && ! cmp -s "$TMP_FILE" "$CONFIG_FILE"; then
        mv "$TMP_FILE" "$CONFIG_FILE"
        changed=1
        log "static config changed"
    else
        rm -f "$TMP_FILE"
    fi
    if fetch_secrets && ! cmp -s "$TMP_ENV" "$ENV_FILE"; then
        mv "$TMP_ENV" "$ENV_FILE"
        changed=1
        log "DNS credentials changed"
    else
        rm -f "$TMP_ENV"
    fi

    if [ "$changed" -eq 1 ]; then
        log "restarting traefik to apply changes"
        kill "$CHILD" 2>/dev/null
        wait "$CHILD" 2>/dev/null
        start_traefik
    fi
done
