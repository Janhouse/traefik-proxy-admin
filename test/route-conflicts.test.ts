import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Domain, Service } from "@/lib/db/schema";

/* ── Mocks ─────────────────────────────────────────────────────────────────── */

const h = vi.hoisted(() => {
  const servicesTable = { __table: "services", id: "id", enabled: "enabled", domainId: "domainId" };
  const domainsTable = { __table: "domains", id: "id" };
  const state = {
    joinRows: [] as Array<{ service: unknown; domain: unknown }>,
    allDomains: [] as unknown[],
    httpRouters: [] as unknown[],
    configured: true,
    routersError: false,
  };
  return { servicesTable, domainsTable, state };
});

vi.mock("@/lib/db", () => {
  const makeChain = (table: unknown) => {
    const rows = () =>
      table === h.domainsTable ? h.state.allDomains : h.state.joinRows;
    const chain = {
      leftJoin: () => chain,
      where: () => Promise.resolve(rows()),
      then: (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown
      ) => Promise.resolve(rows()).then(onFulfilled, onRejected),
    };
    return chain;
  };
  return {
    db: { select: () => ({ from: (table: unknown) => makeChain(table) }) },
    services: h.servicesTable,
    domains: h.domainsTable,
  };
});

vi.mock("@/lib/traefik-api", () => ({
  getEntrypoints: vi.fn(async () => []),
  getHttpRouters: vi.fn(async () => {
    if (h.state.routersError) throw new Error("unreachable");
    return h.state.httpRouters;
  }),
  isTraefikApiConfigured: vi.fn(() => h.state.configured),
  providerOf: (obj: { provider?: string; name?: string }) => {
    if (obj.provider) return obj.provider.toLowerCase();
    const at = obj.name?.split("@")[1];
    return (at || "internal").toLowerCase();
  },
}));

vi.mock("@/lib/app-config", () => ({
  getGlobalConfig: vi.fn(async () => ({
    globalMiddlewares: [],
    adminPanelDomain: "admin.local:3000",
  })),
}));

vi.mock("@/lib/services/service-security.service", () => ({
  ServiceSecurityService: { getEnabledSecurityConfigsForService: vi.fn(async () => []) },
}));

vi.mock("@/lib/services/basic-auth.service", () => ({
  BasicAuthService: { getUsersWithHashesByConfigId: vi.fn(async () => []) },
}));

import { getRouteConflicts } from "@/lib/route-conflicts";

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

const SERVICE_ID = "11111111-aaaa-bbbb-cccc-dddddddddddd";

const mkDomain = (over: Partial<Domain> = {}): Domain => ({
  id: "domain-1",
  name: "Example",
  domain: "example.com",
  description: null,
  useWildcardCert: true,
  certResolver: "letsencrypt",
  certificateConfigs: null,
  isDefault: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...over,
});

const mkService = (over: Partial<Service> = {}): Service => ({
  id: SERVICE_ID,
  name: "App",
  subdomain: "app",
  hostnameMode: "subdomain",
  customHostnames: null,
  domainId: "domain-1",
  targetIp: "10.0.0.5",
  targetPort: 8080,
  entrypoint: null,
  entrypoints: '["web","websecure"]',
  matchRules: null,
  isHttps: false,
  insecureSkipVerify: false,
  enabled: true,
  enabledAt: new Date(0),
  enableDurationMinutes: null,
  middlewares: null,
  requestHeaders: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...over,
});

beforeEach(() => {
  h.state.joinRows = [];
  h.state.allDomains = [];
  h.state.httpRouters = [];
  h.state.configured = true;
  h.state.routersError = false;
});

/* ── Tests ─────────────────────────────────────────────────────────────────── */

describe("getRouteConflicts", () => {
  it("reports unconfigured / unreachable states", async () => {
    h.state.configured = false;
    expect(await getRouteConflicts()).toEqual({
      configured: false,
      reachable: false,
      routers: [],
    });

    h.state.configured = true;
    h.state.routersError = true;
    expect(await getRouteConflicts()).toEqual({
      configured: true,
      reachable: false,
      routers: [],
    });
  });

  it("maps all per-entrypoint split router names (and the stale base name) to the service", async () => {
    h.state.joinRows = [{ service: mkService(), domain: mkDomain() }];
    h.state.allDomains = [mkDomain()];
    h.state.httpRouters = [
      { name: "router-app-example-com-web@http", rule: "Host(`app.example.com`)", entryPoints: ["web"] },
      { name: "router-app-example-com-websecure@http", rule: "Host(`app.example.com`)", entryPoints: ["websecure"] },
      // stale runtime still serving the old single-router config
      { name: "router-app-example-com@http", rule: "Host(`app.example.com`)", entryPoints: ["web", "websecure"] },
    ];

    const res = await getRouteConflicts();
    expect(res.configured).toBe(true);
    expect(res.reachable).toBe(true);
    expect(res.routers).toHaveLength(3);
    for (const router of res.routers) {
      expect(router.managedServiceId).toBe(SERVICE_ID);
      expect(router.internal).toBeUndefined();
      expect(router.hosts).toEqual(["app.example.com"]);
    }
  });

  it("flags this tool's cert-trigger routers as internal across ALL domains", async () => {
    const d1 = mkDomain();
    const d2 = mkDomain({
      id: "domain-2",
      domain: "other.net",
      certificateConfigs: JSON.stringify([
        { name: "extra", main: "a.other.net", sans: ["b.other.net"], certResolver: "le" },
      ]),
    });
    // d2 has no services at all — must still be flagged
    h.state.joinRows = [{ service: mkService(), domain: d1 }];
    h.state.allDomains = [d1, d2];
    h.state.httpRouters = [
      {
        name: "wildcard-cert-router-example-com@http",
        rule: "(Host(`example.com`)) && Path(`/.well-known/traefik-cert-trigger`)",
        entryPoints: ["websecure"],
      },
      {
        name: "wildcard-cert-router-other-net@http",
        rule: "(Host(`other.net`)) && Path(`/.well-known/traefik-cert-trigger`)",
        entryPoints: ["websecure"],
      },
      {
        name: "cert-router-extra-a-other-net@http",
        rule: "(Host(`a.other.net`) || Host(`b.other.net`)) && Path(`/.well-known/traefik-cert-trigger`)",
        entryPoints: ["websecure"],
      },
    ];

    const res = await getRouteConflicts();
    expect(res.routers).toHaveLength(3);
    for (const router of res.routers) {
      expect(router.internal).toBe(true);
      expect(router.managedServiceId).toBeNull();
    }
  });

  it("leaves foreign routers unmanaged and not internal", async () => {
    h.state.joinRows = [{ service: mkService(), domain: mkDomain() }];
    h.state.allDomains = [mkDomain()];
    h.state.httpRouters = [
      {
        name: "grafana@file",
        rule: "Host(`grafana.example.com`)",
        entryPoints: ["websecure"],
        provider: "file",
      },
    ];

    const res = await getRouteConflicts();
    expect(res.routers).toHaveLength(1);
    expect(res.routers[0]).toEqual({
      routerName: "grafana@file",
      hosts: ["grafana.example.com"],
      entryPoints: ["websecure"],
      provider: "file",
      managedServiceId: null,
    });
    expect(res.routers[0].internal).toBeUndefined();
  });

  it("maps a stale per-entrypoint router back to the service after the selection changed", async () => {
    // The DB now says one entrypoint (extranet only), so serviceRouterNames no
    // longer contains the suffixed names — but Traefik still serves the router
    // from the OLD multi-entrypoint selection. Prefix matching must attribute
    // it to the service instead of blocking the editor as a foreign conflict.
    h.state.joinRows = [
      { service: mkService({ entrypoints: '["extranet"]' }), domain: mkDomain() },
    ];
    h.state.allDomains = [mkDomain()];
    h.state.httpRouters = [
      {
        name: "router-app-example-com-extranet@http",
        rule: "Host(`app.example.com`)",
        entryPoints: ["extranet"],
      },
      {
        name: "router-app-example-com-websecure@http",
        rule: "Host(`app.example.com`)",
        entryPoints: ["websecure"],
      },
    ];

    const res = await getRouteConflicts();
    for (const router of res.routers) {
      expect(router.managedServiceId).toBe(SERVICE_ID);
    }
  });

  it("flags unmapped http-provider routers as internal (the http provider IS this tool)", async () => {
    // e.g. a router for a deleted/renamed service that Traefik still serves —
    // it cannot be a conflict "outside this tool".
    h.state.joinRows = [];
    h.state.allDomains = [mkDomain()];
    h.state.httpRouters = [
      {
        name: "router-old-deleted-service@http",
        rule: "Host(`old.example.com`)",
        entryPoints: ["websecure"],
      },
    ];

    const res = await getRouteConflicts();
    expect(res.routers[0].managedServiceId).toBeNull();
    expect(res.routers[0].internal).toBe(true);
  });
});
