#!/bin/sh
# Managed-Traefik wrapper: fetches Traefik's STATIC config (traefik.yml) and
# its DNS-provider credentials from the admin panel, and restarts Traefik
# whenever either changes — static config and env vars can't be hot-reloaded.
# Runs as the container entrypoint of the official traefik image (busybox sh
# + wget are available). POSIX sh only.
#
# Rollback: a config Traefik has run for GRACE_SECONDS is snapshotted as
# "last-good" (config + matching credential env). If Traefik dies before a
# freshly fetched config reaches that grace period, the last-good pair is
# restored and Traefik restarted from it; the rejected pair is remembered so
# the poll loop doesn't re-apply it until the panel serves something new.
set -u

PANEL_URL="${PANEL_URL:-http://traefik-configurator:3000}"
CONFIG_FILE="${CONFIG_FILE:-/etc/traefik/traefik.yml}"
ENV_FILE="${ENV_FILE:-/run/traefik-secrets.env}"
# last-good lives on the persistent /data volume so it survives container
# recreation (it holds credentials — created 0600 via umask below).
LAST_GOOD_DIR="${LAST_GOOD_DIR:-/data/wrapper}"
POLL_SECONDS="${POLL_SECONDS:-30}"
STARTUP_TIMEOUT_SECONDS="${STARTUP_TIMEOUT_SECONDS:-120}"
GRACE_SECONDS="${GRACE_SECONDS:-20}"
# Shared secret the panel requires on the credential endpoint (compose passes
# the same MANAGED_WRAPPER_TOKEN to both services).
MANAGED_WRAPPER_TOKEN="${MANAGED_WRAPPER_TOKEN:-}"

STATIC_URL="$PANEL_URL/api/traefik/static-config"
SECRETS_URL="$PANEL_URL/api/traefik/managed/secrets-env"
TMP_FILE="$CONFIG_FILE.next"
TMP_ENV="$ENV_FILE.next"
LAST_GOOD_CONFIG="$LAST_GOOD_DIR/traefik.yml.last-good"
LAST_GOOD_ENV="$LAST_GOOD_DIR/traefik-secrets.env.last-good"
REJECTED_CONFIG="$CONFIG_FILE.rejected"
REJECTED_ENV="$ENV_FILE.rejected"

# Credentials land in $ENV_FILE / last-good — keep them owner-only.
umask 077

CHILD=""
started_at=0
# 1 while the running config/env came from the panel and hasn't survived the
# grace period yet (rollback candidate; snapshot once it has).
unproven=0
token_warned=0
rejected_logged=0

log() { echo "[traefik-wrapper] $1"; }
warn() { echo "[traefik-wrapper] WARNING: $1" >&2; }
now() { date +%s; }

fetch_config() {
    wget -q -T 5 -O "$TMP_FILE" "$STATIC_URL" 2>/dev/null && [ -s "$TMP_FILE" ]
}

# Credentials may legitimately be empty (no DNS resolvers), so success here is
# a clean HTTP fetch — not a non-empty file. Without the token the panel
# answers 401 and we keep whatever env we had.
fetch_secrets() {
    if [ -z "$MANAGED_WRAPPER_TOKEN" ]; then
        if [ "$token_warned" -eq 0 ]; then
            warn "MANAGED_WRAPPER_TOKEN is not set — DNS credentials cannot be fetched from the panel"
            token_warned=1
        fi
        return 1
    fi
    wget -q -T 5 --header "Authorization: Bearer $MANAGED_WRAPPER_TOKEN" \
        -O "$TMP_ENV" "$SECRETS_URL" 2>/dev/null
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

have_last_good() { [ -s "$LAST_GOOD_CONFIG" ]; }

# Both files copied together: a config and the credentials it was proven with.
snapshot_last_good() {
    mkdir -p "$LAST_GOOD_DIR" || return 1
    cp "$CONFIG_FILE" "$LAST_GOOD_CONFIG.tmp" || return 1
    mv "$LAST_GOOD_CONFIG.tmp" "$LAST_GOOD_CONFIG" || return 1
    cp "$ENV_FILE" "$LAST_GOOD_ENV.tmp" || return 1
    mv "$LAST_GOOD_ENV.tmp" "$LAST_GOOD_ENV" || return 1
    log "config proven for ${GRACE_SECONDS}s — saved as last-good"
}

restore_last_good() {
    cp "$LAST_GOOD_CONFIG" "$CONFIG_FILE" || return 1
    if [ -f "$LAST_GOOD_ENV" ]; then
        cp "$LAST_GOOD_ENV" "$ENV_FILE"
    else
        : > "$ENV_FILE"
    fi
}

# Remember the pair that just killed Traefik so the poll loop skips it.
remember_rejected() {
    cp "$CONFIG_FILE" "$REJECTED_CONFIG" 2>/dev/null
    cp "$ENV_FILE" "$REJECTED_ENV" 2>/dev/null
}

# True when the candidate pair ($1 config, $2 env) equals the rejected pair.
is_rejected_pair() {
    [ -f "$REJECTED_CONFIG" ] || return 1
    cmp -s "$1" "$REJECTED_CONFIG" && cmp -s "$2" "$REJECTED_ENV"
}

mkdir -p "$(dirname "$CONFIG_FILE")" "$(dirname "$ENV_FILE")"
# Start from a known-empty env file so the first secrets fetch only restarts
# Traefik when credentials actually exist.
: > "$ENV_FILE"

# ── first boot: wait for the panel; fall back to last-good, then minimal ───
waited=0
until fetch_config; do
    if [ "$waited" -ge "$STARTUP_TIMEOUT_SECONDS" ]; then
        if have_last_good && restore_last_good; then
            log "panel unreachable after ${STARTUP_TIMEOUT_SECONDS}s — starting from last-good config"
        else
            write_fallback_config
        fi
        break
    fi
    log "waiting for $STATIC_URL ($waited/${STARTUP_TIMEOUT_SECONDS}s)"
    sleep 5
    waited=$((waited + 5))
done
if [ -s "$TMP_FILE" ]; then
    mv "$TMP_FILE" "$CONFIG_FILE"
    log "fetched static config from the panel"
    unproven=1
fi
if fetch_secrets; then
    mv "$TMP_ENV" "$ENV_FILE"
    log "fetched DNS credentials from the panel"
    unproven=1
else
    rm -f "$TMP_ENV"
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
    started_at=$(now)
    log "traefik started (pid $CHILD)"
}

shutdown() {
    log "shutting down"
    if [ -n "$CHILD" ]; then
        kill "$CHILD" 2>/dev/null
        wait "$CHILD" 2>/dev/null
    fi
    exit 0
}
trap shutdown TERM INT

# Called when Traefik exits on its own. Rolls back to last-good if the
# running config was unproven and a last-good exists; otherwise exits so
# compose's restart policy recovers.
handle_child_exit() {
    wait "$CHILD"
    code=$?
    CHILD=""
    if [ "$unproven" -eq 1 ] && have_last_good; then
        warn "traefik exited (code $code) within ${GRACE_SECONDS}s of applying a NEW config — the panel's current static config/credentials are being REJECTED"
        warn "rolling back to the last-good config; fix the config in the panel to try again"
        remember_rejected
        if restore_last_good; then
            unproven=0
            start_traefik
            return 0
        fi
        warn "failed to restore last-good config"
    fi
    log "traefik exited unexpectedly (code $code)"
    exit "$code"
}

start_traefik

# ── poll loop: restart on static-config OR credential change; snapshot the
#    config once it has run for the grace period; roll back if it dies ──────
while true; do
    slept=0
    while [ "$slept" -lt "$POLL_SECONDS" ]; do
        sleep 1
        slept=$((slept + 1))
        if ! kill -0 "$CHILD" 2>/dev/null; then
            handle_child_exit
            continue
        fi
        if [ "$unproven" -eq 1 ] && [ $(($(now) - started_at)) -ge "$GRACE_SECONDS" ]; then
            if snapshot_last_good; then
                rm -f "$REJECTED_CONFIG" "$REJECTED_ENV"
            else
                warn "could not save last-good config under $LAST_GOOD_DIR"
            fi
            unproven=0
        fi
    done

    # Fetch both; anything that fails to fetch keeps its current file.
    if ! fetch_config; then
        rm -f "$TMP_FILE"
        cp "$CONFIG_FILE" "$TMP_FILE"
    fi
    if ! fetch_secrets; then
        rm -f "$TMP_ENV"
        cp "$ENV_FILE" "$TMP_ENV"
    fi

    if cmp -s "$TMP_FILE" "$CONFIG_FILE" && cmp -s "$TMP_ENV" "$ENV_FILE"; then
        rm -f "$TMP_FILE" "$TMP_ENV"
        continue
    fi
    if is_rejected_pair "$TMP_FILE" "$TMP_ENV"; then
        # Same config that already crashed Traefik — stay on last-good.
        rm -f "$TMP_FILE" "$TMP_ENV"
        if [ "$rejected_logged" -eq 0 ]; then
            warn "panel still serves the rejected config — staying on last-good until it changes"
            rejected_logged=1
        fi
        continue
    fi
    rejected_logged=0

    if ! cmp -s "$TMP_FILE" "$CONFIG_FILE"; then log "static config changed"; fi
    if ! cmp -s "$TMP_ENV" "$ENV_FILE"; then log "DNS credentials changed"; fi
    mv "$TMP_FILE" "$CONFIG_FILE"
    mv "$TMP_ENV" "$ENV_FILE"

    log "restarting traefik to apply changes"
    kill "$CHILD" 2>/dev/null
    wait "$CHILD" 2>/dev/null
    CHILD=""
    unproven=1
    start_traefik
done
