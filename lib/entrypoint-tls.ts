import "server-only";
import { getEntrypoints } from "@/lib/traefik-api";

/* ─────────────────────────────────────────────────────────────────────────
 * Per-entrypoint TLS detection.
 *
 * Routers with a `tls` block are HTTPS-only on EVERY entrypoint they bind, so
 * when a service spans both plain-HTTP (web:80) and TLS (websecure:443)
 * entrypoints we must decide per entrypoint whether to attach `tls`.
 *
 * Detection order (first hit wins):
 *   1. The entrypoint declares default TLS in Traefik's static config
 *      (`entryPoints.<name>.http.tls`) — authoritative, from the Traefik API.
 *   2. The listen-address port: 443/8443 → TLS, 80/8080 → plain.
 *   3. Name contains "secure" | "ssl" | "tls" | "https" | "443" → TLS.
 *      ("websecure" / "web-tls" must hit this before the "web" check below.)
 *   4. Name contains "web" | "http" | "80" → plain.
 *   5. Default → TLS (legacy behavior: routers always carried `tls`).
 * ───────────────────────────────────────────────────────────────────────── */

export interface EntrypointTlsInfo {
  address?: string;
  hasDefaultTls?: boolean;
}

const TLS_PORTS = new Set([443, 8443]);
const PLAIN_PORTS = new Set([80, 8080]);

/** Parse the port out of an entrypoint address (":443", "0.0.0.0:443", ":80/tcp"). */
function portOfAddress(address?: string): number | null {
  if (!address) return null;
  // Strip a trailing "/tcp" | "/udp" protocol suffix.
  const noProto = address.replace(/\/(tcp|udp)$/i, "");
  const idx = noProto.lastIndexOf(":");
  if (idx === -1) return null;
  const port = parseInt(noProto.slice(idx + 1), 10);
  return Number.isFinite(port) ? port : null;
}

/** Pure heuristic: should routers bound to this entrypoint carry `tls`? */
export function isTlsEntrypoint(
  name: string,
  info?: EntrypointTlsInfo
): boolean {
  // 1. Authoritative: the entrypoint has default TLS configured in Traefik.
  if (info?.hasDefaultTls === true) return true;

  // 2. Well-known ports from the listen address.
  const port = portOfAddress(info?.address);
  if (port !== null) {
    if (TLS_PORTS.has(port)) return true;
    if (PLAIN_PORTS.has(port)) return false;
  }

  // 3 + 4. Name heuristics — TLS-ish tokens checked first so "websecure" /
  // "web-tls" match before the plain "web" check.
  const lower = name.toLowerCase();
  if (
    lower.includes("secure") ||
    lower.includes("ssl") ||
    lower.includes("tls") ||
    lower.includes("https") ||
    lower.includes("443")
  ) {
    return true;
  }
  if (lower.includes("web") || lower.includes("http") || lower.includes("80")) {
    return false;
  }

  // 5. Unknown — keep the legacy behavior (routers always had TLS).
  return true;
}

/* ── Cached lookup of entrypoint info from the Traefik API ─────────────────
 * The Traefik config endpoint is polled every ~10s, so a short TTL keeps us
 * fresh without hammering the API. Failures (unconfigured/unreachable) are
 * cached briefly too, so a down Traefik doesn't add a timeout per poll. */

const SUCCESS_TTL_MS = 30_000;
const FAILURE_TTL_MS = 5_000;

let cachedMap: Map<string, EntrypointTlsInfo> | null = null;
let cacheExpiresAt = 0;

export async function resolveEntrypointTlsInfo(): Promise<
  Map<string, EntrypointTlsInfo>
> {
  const now = Date.now();
  if (cachedMap && now < cacheExpiresAt) return cachedMap;

  try {
    const entrypoints = await getEntrypoints();
    const map = new Map<string, EntrypointTlsInfo>();
    for (const ep of entrypoints) {
      if (!ep?.name) continue;
      map.set(ep.name, {
        address: ep.address,
        hasDefaultTls: ep.http?.tls != null ? true : undefined,
      });
    }
    cachedMap = map;
    cacheExpiresAt = now + SUCCESS_TTL_MS;
    return map;
  } catch {
    // Unconfigured or unreachable — degrade to name/port heuristics only.
    cachedMap = new Map();
    cacheExpiresAt = now + FAILURE_TTL_MS;
    return cachedMap;
  }
}

/** Test hook: clear the module-level cache between cases. */
export function __resetEntrypointTlsCacheForTests(): void {
  cachedMap = null;
  cacheExpiresAt = 0;
}
