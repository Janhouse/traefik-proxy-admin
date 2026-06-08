import "server-only";
import { db, services, domains } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  getHttpRouters,
  isTraefikApiConfigured,
  providerOf,
} from "@/lib/traefik-api";
import { generateServiceIdentifier } from "@/lib/traefik-config";
import { hostTokensOfRule } from "@/lib/route-rule";
import type {
  RouteConflictRouter,
  RouteConflictsResponse,
} from "@/lib/traefik-client-types";

/**
 * Existing Traefik routers (host + entrypoints) so the editor can warn on a
 * collision. `managedServiceId` is set when the router maps back to one of our
 * services (deep-link to fix the original instead of duplicating).
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
  const managed = new Map<string, string>(); // `router-<id>` -> serviceId
  for (const { service, domain } of rows) {
    if (!domain) continue;
    managed.set(`router-${generateServiceIdentifier(service, domain)}`, service.id);
  }

  const out: RouteConflictRouter[] = routers.map((r) => ({
    routerName: r.name || "",
    hosts: hostTokensOfRule(r.rule || ""),
    entryPoints: r.entryPoints || [],
    provider: providerOf(r),
    managedServiceId: managed.get((r.name || "").split("@")[0]) || null,
  }));

  return { configured: true, reachable: true, routers: out };
}
