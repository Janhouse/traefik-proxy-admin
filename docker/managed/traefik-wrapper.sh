#!/bin/sh
# Managed-Traefik wrapper: fetches Traefik's STATIC config (traefik.yml) from
# the admin panel over HTTP, reads the DNS-provider credential env file the
# panel materialises onto a SHARED TMPFS MOUNT (no network endpoint — the
# plaintext never leaves RAM), and restarts Traefik whenever either changes —
# static config and env vars can't be hot-reloaded. Runs as the container
# entrypoint of the official traefik image (busybox sh + wget). POSIX sh only.
#
# Rollback: a config Traefik has run for GRACE_SECONDS is snapshotted as
# "last-good" (config ONLY — credentials are never copied to persistent
# storage). If Traefik dies before a freshly fetched config reaches that grace
# period, last-good is restored and Traefik restarted from it; the rejected
# config is remembered so the poll loop doesn't re-apply it until the panel
# serves something new. Credentials can't crash Traefik (a bad token only
# fails ACME), so they always follow the mount.
set -u

PANEL_URL="${PANEL_URL:-http://traefik-configurator:3000}"
CONFIG_FILE="${CONFIG_FILE:-/etc/traefik/traefik.yml}"
# The panel writes this onto a tmpfs volume mounted read-only here.
SECRETS_ENV_SRC="${SECRETS_ENV_SRC:-/managed-secrets/traefik.env}"
# Working copy (what the running Traefik was started with); /run is a tmpfs.
ENV_FILE="${ENV_FILE:-/run/traefik-secrets.env}"
# last-good config lives on the persistent /data volume so it survives
# container recreation. It never holds credentials.
LAST_GOOD_DIR="${LAST_GOOD_DIR:-/data/wrapper}"
POLL_SECONDS="${POLL_SECONDS:-30}"
STARTUP_TIMEOUT_SECONDS="${STARTUP_TIMEOUT_SECONDS:-120}"
GRACE_SECONDS="${GRACE_SECONDS:-20}"

STATIC_URL="$PANEL_URL/api/traefik/static-config"
TMP_FILE="$CONFIG_FILE.next"
TMP_ENV="$ENV_FILE.next"
LAST_GOOD_CONFIG="$LAST_GOOD_DIR/traefik.yml.last-good"
REJECTED_CONFIG="$CONFIG_FILE.rejected"

# The working credential copy in /run is owner-only.
umask 077

CHILD=""
started_at=0
# 1 while the running config/env came from the panel and hasn't survived the
# grace period yet (rollback candidate; snapshot once it has).
unproven=0
mount_warned=0
rejected_logged=0
# Hash of the config Traefik has PROVEN (survived the grace period). Reported
# back to the panel so its status reflects what Traefik actually runs, not just
# what it last fetched. Empty until something has been proven.
applied_hash=""

log() { echo "[traefik-wrapper] $1"; }
warn() { echo "[traefik-wrapper] WARNING: $1" >&2; }
now() { date +%s; }

# sha256 of a file, or empty if sha256sum is unavailable (degrade to "never
# report a proven hash" — the panel then honestly stays "waiting").
sha256_of() {
    command -v sha256sum >/dev/null 2>&1 || return 1
    sha256sum "$1" 2>/dev/null | cut -d' ' -f1
}

# Fetch the static config, telling the panel which hash we've PROVEN and which
# we're REJECTING so its status is honest. busybox wget sends no
# Accept-Encoding, so the bytes we write (and hash) are identical to what the
# panel served and hashed — the hashes line up on both sides.
fetch_config() {
    _url="$STATIC_URL"
    _sep="?"
    if [ -n "$applied_hash" ]; then
        _url="$_url${_sep}applied=$applied_hash"
        _sep="&"
    fi
    if [ -s "$REJECTED_CONFIG" ]; then
        _rej=$(sha256_of "$REJECTED_CONFIG")
        [ -n "$_rej" ] && _url="$_url${_sep}rejected=$_rej"
    fi
    wget -q -T 5 -O "$TMP_FILE" "$_url" 2>/dev/null && [ -s "$TMP_FILE" ]
}

# Copy the panel's materialised env file into $TMP_ENV. The file may
# legitimately be empty (no DNS resolvers). It is absent until the panel has
# started once after a (re)boot — then we keep whatever env we had.
read_secrets() {
    if [ ! -f "$SECRETS_ENV_SRC" ]; then
        if [ "$mount_warned" -eq 0 ]; then
            log "no credential file at $SECRETS_ENV_SRC yet (the panel writes it on startup)"
            mount_warned=1
        fi
        return 1
    fi
    mount_warned=0
    cp "$SECRETS_ENV_SRC" "$TMP_ENV" 2>/dev/null
}

# Minimal config so Traefik still serves (and keeps polling the panel's
# DYNAMIC config, which keeps the admin route reachable) when the panel is
# down at boot OR its static config is bad and there's no last-good to fall
# back to. The caller logs the reason; the wrapper keeps retrying the static
# fetch afterwards and restarts into the real config once it's fixed.
write_fallback_config() {
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

# Config only — never credentials — goes to persistent storage.
snapshot_last_good() {
    mkdir -p "$LAST_GOOD_DIR" || return 1
    cp "$CONFIG_FILE" "$LAST_GOOD_CONFIG.tmp" || return 1
    mv "$LAST_GOOD_CONFIG.tmp" "$LAST_GOOD_CONFIG" || return 1
    log "config proven for ${GRACE_SECONDS}s — saved as last-good"
}

restore_last_good() {
    cp "$LAST_GOOD_CONFIG" "$CONFIG_FILE" || return 1
    # last-good is proven by definition — report it as applied so the panel's
    # status doesn't get overwritten with null on the next poll (covers both
    # the startup-fallback and the crash-rollback paths).
    applied_hash=$(sha256_of "$CONFIG_FILE") || applied_hash=""
}

# Remember the config that just killed Traefik so the poll loop skips it.
remember_rejected() {
    cp "$CONFIG_FILE" "$REJECTED_CONFIG" 2>/dev/null
}

# True when the candidate config ($1) equals the rejected one.
is_rejected_config() {
    [ -f "$REJECTED_CONFIG" ] || return 1
    cmp -s "$1" "$REJECTED_CONFIG"
}

shutdown() {
    log "shutting down"
    if [ -n "$CHILD" ]; then
        kill "$CHILD" 2>/dev/null
        wait "$CHILD" 2>/dev/null
    fi
    exit 0
}
# Install the trap BEFORE the startup fetch loop so a TERM/INT during first
# boot (up to STARTUP_TIMEOUT_SECONDS) is handled too. CHILD is "" until
# Traefik starts, and shutdown guards on that.
trap shutdown TERM INT

mkdir -p "$(dirname "$CONFIG_FILE")" "$(dirname "$ENV_FILE")"
# Start from a known-empty env file so the first credential read only restarts
# Traefik when credentials actually exist.
: > "$ENV_FILE"

# ── first boot: wait for the panel; fall back to last-good, then minimal ───
waited=0
until fetch_config; do
    if [ "$waited" -ge "$STARTUP_TIMEOUT_SECONDS" ]; then
        if have_last_good && restore_last_good; then
            log "panel unreachable after ${STARTUP_TIMEOUT_SECONDS}s — starting from last-good config"
        else
            log "panel unreachable after ${STARTUP_TIMEOUT_SECONDS}s — starting with the minimal fallback config"
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
if read_secrets; then
    mv "$TMP_ENV" "$ENV_FILE"
    log "loaded DNS credentials from $SECRETS_ENV_SRC"
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

# Called when Traefik exits on its own. If it died on an UNPROVEN config (one
# that hasn't survived the grace period), that config is being rejected: roll
# back to last-good if we have one, otherwise start the minimal fallback so the
# panel stays reachable and the config can be fixed — never leave the bundle in
# a crash-loop with no ingress. Either way the rejected config is remembered so
# the poll loop won't re-apply it until the panel serves something new.
handle_child_exit() {
    wait "$CHILD"
    code=$?
    CHILD=""
    if [ "$unproven" -eq 1 ]; then
        warn "traefik exited (code $code) within ${GRACE_SECONDS}s of applying a NEW static config — the panel's current config is being REJECTED"
        # Remember the bad config BEFORE anything overwrites CONFIG_FILE.
        remember_rejected
        if have_last_good && restore_last_good; then
            warn "rolled back to the last-good config; fix the config in the panel to try again"
        else
            warn "no last-good config yet — starting the minimal fallback so the panel stays reachable; fix the config in the panel to try again"
            write_fallback_config
            # The fallback is not the panel's config — report nothing as applied.
            applied_hash=""
        fi
        unproven=0
        start_traefik
        return 0
    fi
    log "traefik exited unexpectedly (code $code)"
    exit "$code"
}

start_traefik

# ── poll loop: restart on static-config OR credential change (the panel
#    rewrites the env file on the shared mount); snapshot the config once it
#    has run for the grace period; roll back if it dies ─────────────────────
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
            # Proof is survival, not persistence: this config is now what
            # Traefik runs, so report it as applied even if the last-good
            # snapshot below can't be written.
            applied_hash=$(sha256_of "$CONFIG_FILE") || applied_hash=""
            if snapshot_last_good; then
                rm -f "$REJECTED_CONFIG"
            else
                warn "could not save last-good config under $LAST_GOOD_DIR"
            fi
            unproven=0
        fi
    done

    # Fetch/read both; anything unavailable keeps its current file.
    if ! fetch_config; then
        rm -f "$TMP_FILE"
        cp "$CONFIG_FILE" "$TMP_FILE"
    fi
    if ! read_secrets; then
        rm -f "$TMP_ENV"
        cp "$ENV_FILE" "$TMP_ENV"
    fi

    config_changed=0
    env_changed=0
    cmp -s "$TMP_FILE" "$CONFIG_FILE" || config_changed=1
    cmp -s "$TMP_ENV" "$ENV_FILE" || env_changed=1

    if [ "$config_changed" -eq 1 ] && is_rejected_config "$TMP_FILE"; then
        # Same config that already crashed Traefik — stay on last-good.
        rm -f "$TMP_FILE"
        config_changed=0
        if [ "$rejected_logged" -eq 0 ]; then
            warn "panel still serves the rejected config — staying on last-good until it changes"
            rejected_logged=1
        fi
    else
        rejected_logged=0
    fi

    if [ "$config_changed" -eq 0 ] && [ "$env_changed" -eq 0 ]; then
        rm -f "$TMP_FILE" "$TMP_ENV"
        continue
    fi

    if [ "$config_changed" -eq 1 ]; then
        log "static config changed"
        mv "$TMP_FILE" "$CONFIG_FILE"
        # Only a NEW static config is a rollback candidate.
        unproven=1
    fi
    if [ "$env_changed" -eq 1 ]; then
        log "DNS credentials changed"
        mv "$TMP_ENV" "$ENV_FILE"
    fi
    rm -f "$TMP_FILE" "$TMP_ENV"

    log "restarting traefik to apply changes"
    kill "$CHILD" 2>/dev/null
    wait "$CHILD" 2>/dev/null
    CHILD=""
    start_traefik
done
