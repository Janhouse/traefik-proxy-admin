#!/usr/bin/env bash
# Generate the self-signed dev certificates referenced by
# docker/traefik-dynamic-dev/certs.yml when they don't exist yet.
#
# The keys/certs are throwaway *.localhost material for the local manual-test
# stack (docker-compose.test.yml) so Traefik's /api/certificates store is
# non-empty. They are gitignored (*.key / *.crt) — never commit them.
#   dev-ok:     long-lived, healthy certificate
#   dev-legacy: short-lived, exercises the "expiring soon" UI states
set -euo pipefail

dir="$(cd "$(dirname "$0")/.." && pwd)/docker/traefik-dynamic-dev"
mkdir -p "$dir"

gen() {
  local name="$1" cn="$2" days="$3" org="$4"
  if [[ -f "$dir/$name.key" && -f "$dir/$name.crt" ]]; then
    echo "skip: $name.key/.crt already exist"
    return
  fi
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$dir/$name.key" -out "$dir/$name.crt" \
    -days "$days" -subj "/O=$org/CN=$cn" 2>/dev/null
  echo "generated: $name ($cn, valid ${days}d)"
}

gen dev-ok ok.localhost 400 "Dev Co"
gen dev-legacy legacy.localhost 14 "Legacy Ltd"
