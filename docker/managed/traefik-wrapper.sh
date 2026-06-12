#!/bin/sh
# Managed-Traefik wrapper: fetches Traefik's STATIC config (traefik.yml)
# from the admin panel and restarts Traefik whenever it changes — static
# config cannot be hot-reloaded. Runs as the container entrypoint of the
# official traefik image (busybox sh + wget are available).
set -u

PANEL_URL="${PANEL_URL:-http://traefik-configurator:3000}"
CONFIG_FILE="${CONFIG_FILE:-/etc/traefik/traefik.yml}"
POLL_SECONDS="${POLL_SECONDS:-30}"
STARTUP_TIMEOUT_SECONDS="${STARTUP_TIMEOUT_SECONDS:-120}"

STATIC_URL="$PANEL_URL/api/traefik/static-config"
TMP_FILE="$CONFIG_FILE.next"

log() { echo "[traefik-wrapper] $1"; }

fetch_config() {
    wget -q -T 5 -O "$TMP_FILE" "$STATIC_URL" 2>/dev/null && [ -s "$TMP_FILE" ]
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

mkdir -p "$(dirname "$CONFIG_FILE")"

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

start_traefik() {
    traefik --configfile "$CONFIG_FILE" &
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

# ── poll loop: on config change restart traefik; exit if it dies on its own ─
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

    if fetch_config && ! cmp -s "$TMP_FILE" "$CONFIG_FILE"; then
        log "static config changed — restarting traefik"
        mv "$TMP_FILE" "$CONFIG_FILE"
        kill "$CHILD" 2>/dev/null
        wait "$CHILD" 2>/dev/null
        start_traefik
    else
        rm -f "$TMP_FILE"
    fi
done
