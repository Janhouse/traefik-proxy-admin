import "server-only";
import {
  getEntrypoints,
  getHttpRouters,
  isTraefikApiConfigured,
} from "@/lib/traefik-api";
import type {
  CertResolverInfo,
  CertResolversResponse,
} from "@/lib/traefik-client-types";

/* ─────────────────────────────────────────────────────────────────────────
 * Certificate-resolver discovery.
 *
 * Traefik has NO API endpoint for certificate resolvers (they are
 * static-config-only), so the names are INFERRED from where they appear:
 *   - routers referencing `tls.certResolver`        → source "router"
 *   - entrypoints with a default `http.tls.certResolver` → source "entrypoint"
 * Inference can't see resolvers nothing references yet, which is why the UI
 * selector always allows free text on top of these suggestions.
 * ───────────────────────────────────────────────────────────────────────── */

/** Pull a non-empty `certResolver` out of a Traefik tls block. */
function resolverOf(tls: unknown): string | null {
  if (!tls || typeof tls !== "object") return null;
  const r = (tls as { certResolver?: unknown }).certResolver;
  return typeof r === "string" && r.length > 0 ? r : null;
}

function sorted(resolvers: CertResolverInfo[]): CertResolverInfo[] {
  return resolvers.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCertResolvers(): Promise<CertResolversResponse> {
  const configured = isTraefikApiConfigured();
  // First-in wins on duplicate names (insertion order = source precedence).
  const found = new Map<string, CertResolverInfo>();

  if (!configured) {
    return { configured, reachable: false, resolvers: sorted([...found.values()]) };
  }

  try {
    const [routers, entrypoints] = await Promise.all([
      getHttpRouters(),
      getEntrypoints(),
    ]);
    for (const router of routers) {
      const name = resolverOf(router.tls);
      if (name && !found.has(name)) found.set(name, { name, source: "router" });
    }
    for (const ep of entrypoints) {
      const name = resolverOf(ep.http?.tls);
      if (name && !found.has(name))
        found.set(name, { name, source: "entrypoint" });
    }
    return { configured, reachable: true, resolvers: sorted([...found.values()]) };
  } catch {
    return { configured, reachable: false, resolvers: sorted([...found.values()]) };
  }
}
