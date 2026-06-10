import "server-only";
import { db, services, domains } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  getHttpRouters,
  isTraefikApiConfigured,
  providerOf,
} from "@/lib/traefik-api";
import {
  certTriggerRouterNames,
  serviceRouterNames,
  wildcardCertRouterName,
} from "@/lib/traefik-config";
import { hostTokensOfRule } from "@/lib/route-rule";
import type {
  RouteConflictRouter,
  RouteConflictsResponse,
} from "@/lib/traefik-client-types";

/**
 * Existing Traefik routers (host + entrypoints) so the editor can warn on a
 * collision. `managedServiceId` is set when the router maps back to one of our
 * services (deep-link to fix the original instead of duplicating);
 * `internal: true` marks this tool's own cert-trigger routers, which share a
 * service's Host() by design and must not count as external conflicts.
 */
export async function getRouteConflicts(): Promise<RouteConflictsResponse> {
  if (!isTraefikApiConfigured()) {
    return { configured: false, reachable: false, routers: [] };
  }

  let routers;
  try {
    routers = await getHttpRouters();
  } catch {
    return { configured: true, reachable: false, routers: [] };
  }

  const rows = await db
    .select({ service: services, domain: domains })
    .from(services)
    .leftJoin(domains, eq(services.domainId, domains.id));
  const managed = new Map<string, string>(); // router name -> serviceId
  for (const { service, domain } of rows) {
    if (!domain) continue;
    // Every name the service may appear under: the base `router-<identifier>`
    // plus the per-entrypoint `router-<identifier>-<ep>` split routers.
    for (const name of serviceRouterNames(service, domain)) {
      managed.set(name, service.id);
    }
  }

  // This tool's own cert-trigger routers, across ALL domains (including
  // domains that currently have no services).
  const internalNames = new Set<string>();
  const allDomains = await db.select().from(domains);
  for (const domain of allDomains) {
    internalNames.add(wildcardCertRouterName(domain));
    for (const name of certTriggerRouterNames(domain)) {
      internalNames.add(name);
    }
  }

  const out: RouteConflictRouter[] = routers.map((r) => {
    const bareName = (r.name || "").split("@")[0];
    return {
      routerName: r.name || "",
      hosts: hostTokensOfRule(r.rule || ""),
      entryPoints: r.entryPoints || [],
      provider: providerOf(r),
      managedServiceId: managed.get(bareName) || null,
      ...(internalNames.has(bareName) && { internal: true }),
    };
  });

  return { configured: true, reachable: true, routers: out };
}
