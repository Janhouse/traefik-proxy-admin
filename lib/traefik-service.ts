import "server-only";
import { db, services } from "@/lib/db";
import {
  getEntrypoints,
  getHttpMiddlewares,
  getHttpRouters,
  getHttpServices,
  getTcpRouters,
  getTcpServices,
  getTcpMiddlewares,
  getUdpRouters,
  getUdpServices,
  getVersion,
  indexServerStatus,
  isTraefikApiConfigured,
  normalizeServerUrl,
  probeTcp,
  providerOf,
  type TraefikHttpService,
} from "@/lib/traefik-api";
import type {
  BackendHealthResponse,
  BackendHealthState,
  RuntimeResponse,
  ServiceHealth,
} from "@/lib/traefik-client-types";

/* ── Backend health for the admin's own services ──────────────────────────── */

/**
 * Resolve per-service backend health. Prefers Traefik's `serverStatus`
 * (populated when the service has a health check); otherwise falls back to an
 * active TCP probe from this server so the signal is meaningful regardless.
 */
export async function getBackendHealthMap(): Promise<BackendHealthResponse> {
  const configured = isTraefikApiConfigured();

  const rows = await db
    .select({
      id: services.id,
      targetIp: services.targetIp,
      targetPort: services.targetPort,
      isHttps: services.isHttps,
      enabled: services.enabled,
    })
    .from(services);

  let index = new Map<string, string>();
  let reachable = false;
  if (configured) {
    try {
      const httpServices = await getHttpServices();
      index = indexServerStatus(httpServices);
      reachable = true;
    } catch {
      reachable = false;
    }
  }

  const result: Record<string, ServiceHealth> = {};
  await Promise.all(
    rows.map(async (s) => {
      if (!s.enabled) {
        result[s.id] = { state: "na", up: 0, total: 0, source: "none" };
        return;
      }
      const url = normalizeServerUrl(
        `${s.isHttps ? "https" : "http"}://${s.targetIp}:${s.targetPort}`
      );
      const st = index.get(url);

      // A Traefik DOWN means an active health check is failing — authoritative.
      if (st === "DOWN") {
        result[s.id] = { state: "down", up: 0, total: 1, source: "traefik" };
        return;
      }

      // Otherwise rely on a live TCP probe for real reachability: Traefik
      // reports servers UP by default even without a health check, so its UP
      // is not a true liveness signal on its own.
      const ok = await probeTcp(s.targetIp, s.targetPort);
      result[s.id] = {
        state: ok ? "up" : "down",
        up: ok ? 1 : 0,
        total: 1,
        source: st === "UP" ? "traefik" : "probe",
      };
    })
  );

  return {
    configured,
    reachable,
    checkedAt: new Date().toISOString(),
    services: result,
  };
}

/* ── Runtime snapshot (read-only mirror of Traefik) ───────────────────────── */

function httpServiceHealth(svc: TraefikHttpService): {
  up: number;
  total: number;
  health: BackendHealthState;
} {
  if (svc.type === "internal" || (svc.name || "").endsWith("@internal")) {
    return { up: 1, total: 1, health: "up" };
  }
  const statuses = svc.serverStatus ? Object.values(svc.serverStatus) : [];
  if (statuses.length === 0) {
    const total = svc.loadBalancer?.servers?.length ?? 0;
    return { up: 0, total, health: "unknown" };
  }
  const up = statuses.filter((s) => s.toUpperCase() === "UP").length;
  const total = statuses.length;
  return { up, total, health: up === 0 ? "down" : up < total ? "unknown" : "up" };
}

function emptyRuntime(
  configured: boolean,
  reachable: boolean,
  error?: string
): RuntimeResponse {
  return {
    configured,
    reachable,
    error,
    syncedAt: new Date().toISOString(),
    counts: {
      httpRouters: 0,
      httpServices: 0,
      middlewares: 0,
      tcpRouters: 0,
      tcpServices: 0,
      tcpMiddlewares: 0,
      udpRouters: 0,
      udpServices: 0,
      plugins: 0,
    },
    httpRouters: [],
    httpServices: [],
    middlewares: [],
    tcpRouters: [],
    tcpServices: [],
    tcpMiddlewares: [],
    udpRouters: [],
    udpServices: [],
    plugins: [],
    entrypoints: [],
  };
}

export async function getRuntimeSnapshot(): Promise<RuntimeResponse> {
  const configured = isTraefikApiConfigured();
  if (!configured) return emptyRuntime(false, false);

  try {
    const [
      entrypoints,
      httpRouters,
      httpServices,
      middlewares,
      tcpRouters,
      tcpServices,
      tcpMiddlewares,
      udpRouters,
      udpServices,
      version,
    ] = await Promise.all([
      getEntrypoints().catch(() => []),
      getHttpRouters().catch(() => []),
      getHttpServices().catch(() => []),
      getHttpMiddlewares().catch(() => []),
      getTcpRouters().catch(() => []),
      getTcpServices().catch(() => []),
      getTcpMiddlewares().catch(() => []),
      getUdpRouters().catch(() => []),
      getUdpServices().catch(() => []),
      getVersion().catch(() => ({}) as Awaited<ReturnType<typeof getVersion>>),
    ]);

    // service name -> health (for router rows). Index by both the fully
    // qualified name ("svc@http") and the bare name, since a router's
    // `service` field is often unqualified for same-provider references.
    const svcHealth = new Map<string, BackendHealthState>();
    for (const s of httpServices) {
      const health = httpServiceHealth(s).health;
      svcHealth.set(s.name, health);
      svcHealth.set(s.name.split("@")[0], health);
    }

    const outHttpRouters = httpRouters.map((r) => ({
      name: (r.name || "").split("@")[0],
      rule: r.rule || "",
      entryPoints: r.entryPoints || [],
      service: r.service || "",
      middlewares: (r.middlewares || []).map((m) => m.split("@")[0]),
      provider: providerOf(r),
      status: r.status || "",
      health:
        r.status === "disabled"
          ? ("unknown" as BackendHealthState)
          : svcHealth.get(r.service || "") ||
            svcHealth.get(`${r.service}`) ||
            ("unknown" as BackendHealthState),
    }));

    const outHttpServices = httpServices.map((s) => {
      const h = httpServiceHealth(s);
      const servers = (s.loadBalancer?.servers || [])
        .map((srv) => srv.url || srv.address || "")
        .filter(Boolean);
      return {
        name: s.name,
        type: s.type || "loadBalancer",
        servers,
        up: h.up,
        total: h.total,
        provider: providerOf(s),
        health: h.health,
      };
    });

    const outMiddlewares = middlewares.map((m) => ({
      name: m.name,
      type: m.type || (m.plugin ? "plugin" : ""),
      provider: providerOf(m),
      usedBy: (m.usedBy || []).map((u) => u.split("@")[0]),
    }));

    const plugins = middlewares
      .filter((m) => m.plugin || m.type === "plugin")
      .map((m) => ({
        name: m.name.split("@")[0],
        type: m.plugin ? Object.keys(m.plugin)[0] || "plugin" : "plugin",
        provider: providerOf(m),
      }));

    const outTcpRouters = tcpRouters.map((r) => ({
      name: (r.name || "").split("@")[0],
      rule: r.rule || "",
      entryPoints: r.entryPoints || [],
      service: r.service || "",
      tls: r.tls?.passthrough ? "passthrough" : r.tls ? "terminate" : "",
      provider: providerOf(r),
    }));

    const outTcpServices = tcpServices.map((s) => ({
      name: s.name,
      servers: (s.loadBalancer?.servers || [])
        .map((srv) => srv.address || "")
        .filter(Boolean),
      provider: providerOf(s),
    }));

    const outTcpMiddlewares = tcpMiddlewares.map((m) => ({
      name: m.name,
      type: m.type || (m.plugin ? "plugin" : ""),
      provider: providerOf(m),
      usedBy: (m.usedBy || []).map((u) => u.split("@")[0]),
    }));

    const outUdpRouters = udpRouters.map((r) => ({
      name: (r.name || "").split("@")[0],
      entryPoints: r.entryPoints || [],
      service: r.service || "",
      provider: providerOf(r),
      status: r.status || "",
    }));

    const outUdpServices = udpServices.map((s) => ({
      name: s.name,
      servers: (s.loadBalancer?.servers || [])
        .map((srv) => srv.address || "")
        .filter(Boolean),
      provider: providerOf(s),
    }));

    return {
      configured: true,
      reachable: true,
      syncedAt: new Date().toISOString(),
      version: { version: version.Version, codename: version.Codename },
      counts: {
        httpRouters: outHttpRouters.length,
        httpServices: outHttpServices.length,
        middlewares: outMiddlewares.length,
        tcpRouters: outTcpRouters.length,
        tcpServices: outTcpServices.length,
        tcpMiddlewares: outTcpMiddlewares.length,
        udpRouters: outUdpRouters.length,
        udpServices: outUdpServices.length,
        plugins: plugins.length,
      },
      httpRouters: outHttpRouters,
      httpServices: outHttpServices,
      middlewares: outMiddlewares,
      tcpRouters: outTcpRouters,
      tcpServices: outTcpServices,
      tcpMiddlewares: outTcpMiddlewares,
      udpRouters: outUdpRouters,
      udpServices: outUdpServices,
      plugins,
      entrypoints: entrypoints.map((e) => ({ name: e.name, address: e.address })),
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return emptyRuntime(true, false, reason);
  }
}
