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
  getOverview,
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

/** Normalized server URLs belonging to services that have a Traefik health
 * check configured (only those have a trustworthy serverStatus "UP"). */
function indexHealthChecked(httpServices: TraefikHttpService[]): Set<string> {
  const out = new Set<string>();
  for (const svc of httpServices) {
    if (!svc.loadBalancer?.healthCheck) continue;
    for (const srv of svc.loadBalancer.servers || []) {
      const u = srv.url || srv.address;
      if (u) out.add(normalizeServerUrl(u));
    }
  }
  return out;
}

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
  let checked = new Set<string>();
  let reachable = false;
  if (configured) {
    try {
      const httpServices = await getHttpServices();
      index = indexServerStatus(httpServices);
      checked = indexHealthChecked(httpServices);
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

      // An UP from a service that actually has a health check configured is
      // equally authoritative — don't second-guess it with a TCP probe.
      if (st === "UP" && checked.has(url)) {
        result[s.id] = { state: "up", up: 1, total: 1, source: "traefik" };
        return;
      }

      // Otherwise rely on a live TCP probe for real reachability: Traefik
      // reports servers UP by default even without a health check, so its UP
      // is not a true liveness signal on its own. The probe decided here, so
      // the result is attributed to it.
      const ok = await probeTcp(s.targetIp, s.targetPort);
      result[s.id] = {
        state: ok ? "up" : "down",
        up: ok ? 1 : 0,
        total: 1,
        source: "probe",
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
      certificates: 0,
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

/** Unwrap a settled result: value on success, fallback + recorded reason on
 * rejection. */
function settled<T>(
  r: PromiseSettledResult<T>,
  fallback: T,
  label: string,
  failures: Array<{ label: string; reason: string }>
): T {
  if (r.status === "fulfilled") return r.value;
  const reason =
    r.reason instanceof Error ? r.reason.message : String(r.reason);
  failures.push({ label, reason });
  return fallback;
}

function firstRejection(results: readonly PromiseSettledResult<unknown>[]): string {
  const r = results.find(
    (x): x is PromiseRejectedResult => x.status === "rejected"
  );
  return r?.reason instanceof Error ? r.reason.message : String(r?.reason);
}

export async function getRuntimeSnapshot(): Promise<RuntimeResponse> {
  const configured = isTraefikApiConfigured();
  if (!configured) return emptyRuntime(false, false);

  try {
    const results = await Promise.allSettled([
      getEntrypoints(),
      getHttpRouters(),
      getHttpServices(),
      getHttpMiddlewares(),
      getTcpRouters(),
      getTcpServices(),
      getTcpMiddlewares(),
      getUdpRouters(),
      getUdpServices(),
      getVersion(),
      getOverview(),
    ] as const);

    // The overview and HTTP router list are the core of the snapshot: if
    // either failed, Traefik is effectively unreachable and we say so instead
    // of rendering an empty-but-"reachable" explorer. Every call failing is
    // the same verdict.
    const core: Array<{ label: string; reason: string }> = [];
    const overview = settled(results[10], null, "/api/overview", core);
    const httpRouters = settled(results[1], [], "/api/http/routers", core);
    if (core.length > 0 || results.every((r) => r.status === "rejected")) {
      return emptyRuntime(true, false, core[0]?.reason ?? firstRejection(results));
    }

    // Secondary lists may degrade individually; the failure is surfaced as a
    // warning while the rest of the snapshot is still shown.
    const secondary: Array<{ label: string; reason: string }> = [];
    const entrypoints = settled(results[0], [], "/api/entrypoints", secondary);
    const httpServices = settled(results[2], [], "/api/http/services", secondary);
    const middlewares = settled(results[3], [], "/api/http/middlewares", secondary);
    const tcpRouters = settled(results[4], [], "/api/tcp/routers", secondary);
    const tcpServices = settled(results[5], [], "/api/tcp/services", secondary);
    const tcpMiddlewares = settled(results[6], [], "/api/tcp/middlewares", secondary);
    const udpRouters = settled(results[7], [], "/api/udp/routers", secondary);
    const udpServices = settled(results[8], [], "/api/udp/services", secondary);
    const version = settled(
      results[9],
      {} as Awaited<ReturnType<typeof getVersion>>,
      "/api/version",
      secondary
    );
    const warnings = secondary.map((f) => `${f.label}: ${f.reason}`);

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
      ...(warnings.length > 0 ? { warnings } : {}),
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
        certificates: overview?.certificates?.total ?? 0,
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
