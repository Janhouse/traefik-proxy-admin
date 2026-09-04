import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Domain, Service } from "@/lib/db/schema";

/* ── Mocks ─────────────────────────────────────────────────────────────────── */

const h = vi.hoisted(() => {
  const servicesTable = { __table: "services", id: "id", enabled: "enabled", domainId: "domainId" };
  const domainsTable = { __table: "domains", id: "id" };
  const state = {
    joinRows: [] as Array<{ service: unknown; domain: unknown }>,
    allDomains: [] as unknown[],
    globalConfig: {
      globalMiddlewares: [] as string[],
      adminPanelDomain: "admin.local:3000",
      defaultEntrypoint: undefined as string | undefined,
      defaultEntrypoints: undefined as string[] | undefined,
    },
    securityConfigs: [] as unknown[],
    basicAuthUsers: [] as unknown[],
    entrypoints: [] as unknown[],
    managedConfig: {
      entrypoints: [
        { name: "web", port: 80, redirectToEntrypoint: "websecure" },
        { name: "websecure", port: 443, tls: { enabled: true, certResolver: "letsencrypt" } },
      ],
      certResolvers: [{ name: "letsencrypt", email: "", challenge: "tlsChallenge" }],
    } as unknown,
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

vi.mock("@/lib/app-config", () => ({
  getGlobalConfig: vi.fn(async () => h.state.globalConfig),
  getManagedStaticConfig: vi.fn(async () => h.state.managedConfig),
}));

vi.mock("@/lib/services/service-security.service", () => ({
  ServiceSecurityService: {
    getEnabledSecurityConfigsForService: vi.fn(async () => h.state.securityConfigs),
  },
}));

vi.mock("@/lib/services/basic-auth.service", () => ({
  BasicAuthService: {
    getUsersWithHashesByConfigId: vi.fn(async () => h.state.basicAuthUsers),
  },
}));

vi.mock("@/lib/traefik-api", () => ({
  getEntrypoints: vi.fn(async () => h.state.entrypoints),
  getHttpRouters: vi.fn(async () => []),
  isTraefikApiConfigured: vi.fn(() => true),
  providerOf: vi.fn(() => "http"),
}));

import { __resetEntrypointTlsCacheForTests } from "@/lib/entrypoint-tls";
import {
  ambiguousSubdomains,
  certTriggerRouterNames,
  generateServiceIdentifier,
  generateTraefikConfig,
  routerServiceMatcher,
  serviceRouterNames,
  wildcardCertRouterName,
} from "@/lib/traefik-config";

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

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
  id: "11111111-aaaa-bbbb-cccc-dddddddddddd",
  name: "App",
  subdomain: "app",
  hostnameMode: "subdomain",
  customHostnames: null,
  domainId: "domain-1",
  targetIp: "10.0.0.5",
  targetPort: 8080,
  entrypoint: null,
  entrypoints: null,
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

const TRIGGER_PATH = "/.well-known/traefik-cert-trigger";

beforeEach(() => {
  __resetEntrypointTlsCacheForTests();
  h.state.joinRows = [];
  h.state.allDomains = [];
  h.state.securityConfigs = [];
  h.state.basicAuthUsers = [];
  h.state.globalConfig = {
    globalMiddlewares: [],
    adminPanelDomain: "admin.local:3000",
    defaultEntrypoint: undefined,
    defaultEntrypoints: undefined,
  };
  h.state.entrypoints = [
    { name: "web", address: ":80" },
    { name: "websecure", address: ":443", http: { tls: {} } },
  ];
});

afterEach(() => vi.unstubAllEnvs());

/* ── generateServiceIdentifier / serviceRouterNames ────────────────────────── */

describe("generateServiceIdentifier", () => {
  it("keeps the bare subdomain (the legacy name) when it is unique across domains", () => {
    const domain = mkDomain();
    expect(generateServiceIdentifier(mkService(), domain)).toBe("app");
    expect(generateServiceIdentifier(mkService(), domain, new Set())).toBe("app");
    expect(
      generateServiceIdentifier(mkService(), mkDomain({ domain: "other.net" }), new Set(["other"]))
    ).toBe("app");
  });

  it("appends the domain only for subdomains that exist under two domains", () => {
    const ambiguous = new Set(["app"]);
    expect(generateServiceIdentifier(mkService(), mkDomain(), ambiguous)).toBe("app-example-com");
    expect(
      generateServiceIdentifier(mkService(), mkDomain({ domain: "other.net" }), ambiguous)
    ).toBe("app-other-net");
    // apex/custom never take the suffix
    expect(
      generateServiceIdentifier(mkService({ hostnameMode: "apex" }), mkDomain(), ambiguous)
    ).toBe("example-com");
  });

  it("ambiguousSubdomains reports subdomains spanning more than one domain (any enabled state)", () => {
    const d1 = mkDomain();
    const d2 = mkDomain({ id: "domain-2", domain: "other.net" });
    const set = ambiguousSubdomains([
      { service: mkService(), domain: d1 },
      { service: mkService({ id: "2", enabled: false, domainId: "domain-2" }), domain: d2 },
      { service: mkService({ id: "3", subdomain: "git" }), domain: d1 },
      { service: mkService({ id: "4", subdomain: "git" }), domain: d1 }, // same domain twice: not ambiguous
      { service: mkService({ id: "5", subdomain: "www", hostnameMode: "apex" }), domain: d2 },
      { service: mkService({ id: "6", subdomain: "www" }), domain: null },
    ]);
    expect([...set]).toEqual(["app"]);
  });

  it("falls back to 'default' when the subdomain is missing", () => {
    expect(
      generateServiceIdentifier(mkService({ subdomain: null }), mkDomain())
    ).toBe("default");
  });

  it("keeps apex and custom branches unchanged", () => {
    expect(
      generateServiceIdentifier(mkService({ hostnameMode: "apex" }), mkDomain())
    ).toBe("example-com");
    expect(
      generateServiceIdentifier(
        mkService({ hostnameMode: "custom", customHostnames: '["x.example.org"]' }),
        mkDomain()
      )
    ).toBe("x-example-org");
  });
});

describe("serviceRouterNames", () => {
  it("returns the base name (plus the collision-suffixed variant) for zero or one entrypoint", () => {
    expect(serviceRouterNames(mkService(), mkDomain())).toEqual([
      "router-app",
      "router-app-11111111",
    ]);
    expect(
      serviceRouterNames(mkService({ entrypoints: '["websecure"]' }), mkDomain())
    ).toEqual([
      "router-app",
      "router-app-11111111",
    ]);
    expect(
      serviceRouterNames(mkService({ entrypoint: "web" }), mkDomain())
    ).toEqual([
      "router-app",
      "router-app-11111111",
    ]);
  });

  it("returns base plus per-entrypoint names, including collision-suffixed variants", () => {
    expect(
      serviceRouterNames(
        mkService({ entrypoints: '["web","websecure"]' }),
        mkDomain()
      )
    ).toEqual([
      "router-app",
      "router-app-web",
      "router-app-websecure",
      "router-app-11111111",
      "router-app-11111111-web",
      "router-app-11111111-websecure",
    ]);
  });

  it("covers the routers actually emitted for a collided service", async () => {
    // Two enabled services resolving to the same identifier: the second one's
    // emitted router names must all be covered by its serviceRouterNames().
    const first = mkService();
    const collided = mkService({
      id: "22222222-eeee-ffff-0000-999999999999",
      entrypoints: '["web","websecure"]',
      matchRules: '[{"type":"PathPrefix","conn":"AND","value":"/api"}]',
    });
    h.state.joinRows = [
      { service: first, domain: mkDomain() },
      { service: collided, domain: mkDomain() },
    ];
    const config = await generateTraefikConfig();
    const names = serviceRouterNames(collided, mkDomain());
    const emitted = Object.entries(config.http.routers)
      .filter(([, r]) => r.service === "service-app-22222222")
      .map(([name]) => name);
    expect(emitted.length).toBeGreaterThan(0);
    for (const name of emitted) {
      expect(names).toContain(name);
    }
  });
});

describe("routerServiceMatcher", () => {
  it("matches stale per-entrypoint names by identifier prefix", () => {
    // service now has ONE entrypoint, but the runtime still serves routers
    // from the old multi-entrypoint selection
    const match = routerServiceMatcher([
      { service: mkService({ entrypoints: '["extranet"]' }), domain: mkDomain() },
    ]);
    expect(match("router-app")).toBe(mkService().id);
    expect(match("router-app-extranet")).toBe(mkService().id);
    expect(match("router-app-websecure")).toBe(mkService().id);
    expect(match("router-other-example-com")).toBeNull();
    expect(match("wildcard-cert-router-example-com")).toBeNull();
  });

  it("prefers the longest identifier when one prefixes another", () => {
    const a = mkService({ id: "aaaaaaaa-0000-0000-0000-000000000000" });
    const b = mkService({
      id: "bbbbbbbb-0000-0000-0000-000000000000",
      domainId: "domain-2",
    });
    const match = routerServiceMatcher([
      { service: a, domain: mkDomain() }, // app.example.com
      { service: b, domain: mkDomain({ id: "domain-2", domain: "example.com.mx" }) }, // app.example.com.mx
    ]);
    expect(match("router-app-example-com-web")).toBe(a.id);
    expect(match("router-app-example-com-mx-web")).toBe(b.id);
    expect(match("router-app-example-com-mx")).toBe(b.id);
  });
});

describe("trigger name helpers", () => {
  it("match the generated trigger router names", () => {
    expect(wildcardCertRouterName(mkDomain())).toBe(
      "wildcard-cert-router-example-com"
    );
    const domain = mkDomain({
      certificateConfigs: JSON.stringify([
        { name: "my cert", main: "a.example.com", sans: ["b.example.com"], certResolver: "le" },
      ]),
    });
    expect(certTriggerRouterNames(domain)).toEqual([
      "cert-router-my-cert-a-example-com",
    ]);
  });
});

/* ── generateTraefikConfig ─────────────────────────────────────────────────── */

describe("generateTraefikConfig — per-entrypoint routers", () => {
  it("emits one router per entrypoint with identical middlewares; tls only on TLS entrypoints", async () => {
    const domain = mkDomain();
    const service = mkService({ entrypoints: '["web","websecure"]' });
    h.state.joinRows = [{ service, domain }];
    h.state.globalConfig.globalMiddlewares = ["compress"];

    const config = await generateTraefikConfig();

    const web = config.http.routers["router-app-web"];
    const secure = config.http.routers["router-app-websecure"];
    expect(web).toBeDefined();
    expect(secure).toBeDefined();
    // no un-suffixed base router in the multi-entrypoint case
    expect(config.http.routers["router-app"]).toBeUndefined();

    expect(web.entryPoints).toEqual(["web"]);
    expect(secure.entryPoints).toEqual(["websecure"]);
    expect(web.tls).toBeUndefined(); // plain HTTP keeps serving HTTP
    expect(secure.tls).toEqual({
      certResolver: "letsencrypt",
      domains: [{ main: "example.com", sans: ["*.example.com"] }],
    });

    // identical rule/service and the EXACT same middlewares array
    expect(web.rule).toBe(secure.rule);
    expect(web.service).toBe("service-app");
    expect(secure.service).toBe("service-app");
    expect(web.middlewares).toBe(secure.middlewares);
    expect(web.middlewares).toEqual(["compress"]);
  });

  it("keeps middlewares byte-identical across split routers with security + headers + custom middlewares", async () => {
    const domain = mkDomain();
    const service = mkService({
      entrypoints: '["web","websecure"]',
      requestHeaders: '{"X-Custom":"1"}',
      middlewares: '["rate-limit"]',
    });
    h.state.joinRows = [{ service, domain }];
    h.state.globalConfig.globalMiddlewares = ["compress"];
    h.state.securityConfigs = [
      { id: "sec1sec1-0000", securityType: "shared_link", config: "{}" },
      {
        id: "sec2sec2-0000",
        securityType: "basic_auth",
        config: JSON.stringify({ basicAuthConfigId: "ba-1" }),
      },
    ];
    h.state.basicAuthUsers = [{ username: "u", passwordHash: "$h" }];

    const config = await generateTraefikConfig();
    const web = config.http.routers["router-app-web"];
    const secure = config.http.routers["router-app-websecure"];

    expect(web.middlewares).toBe(secure.middlewares); // same array instance
    expect(web.middlewares).toEqual([
      "compress",
      "auth-shared_link-app",
      "basic-auth-app-sec2sec2",
      "headers-app",
      "rate-limit",
    ]);
    expect(config.http.middlewares!["auth-shared_link-app"]).toBeDefined();
    expect(config.http.middlewares!["basic-auth-app-sec2sec2"]).toBeDefined();
    expect(config.http.middlewares!["headers-app"]).toBeDefined();
  });

  it("uses the un-suffixed name for a single entrypoint (tls iff the entrypoint is TLS)", async () => {
    const domain = mkDomain();
    h.state.joinRows = [
      { service: mkService({ entrypoints: '["websecure"]' }), domain },
    ];

    let config = await generateTraefikConfig();
    let router = config.http.routers["router-app"];
    expect(router).toBeDefined();
    expect(router.entryPoints).toEqual(["websecure"]);
    expect(router.tls).toBeDefined();
    expect(config.http.routers["router-app-websecure"]).toBeUndefined();

    h.state.joinRows = [{ service: mkService({ entrypoints: '["web"]' }), domain }];
    config = await generateTraefikConfig();
    router = config.http.routers["router-app"];
    expect(router.entryPoints).toEqual(["web"]);
    expect(router.tls).toBeUndefined();
  });

  it("falls back to the legacy single entrypoint, then the global default, then none", async () => {
    const domain = mkDomain();

    // legacy single column
    h.state.joinRows = [
      { service: mkService({ entrypoints: null, entrypoint: "web" }), domain },
    ];
    let config = await generateTraefikConfig();
    expect(config.http.routers["router-app"].entryPoints).toEqual(["web"]);
    expect(config.http.routers["router-app"].tls).toBeUndefined();

    // global default
    h.state.joinRows = [
      { service: mkService({ entrypoints: null, entrypoint: null }), domain },
    ];
    h.state.globalConfig.defaultEntrypoint = "websecure";
    config = await generateTraefikConfig();
    expect(config.http.routers["router-app"].entryPoints).toEqual(["websecure"]);
    expect(config.http.routers["router-app"].tls).toBeDefined();

    // nothing anywhere → legacy shape: no entryPoints key, tls always set
    h.state.globalConfig.defaultEntrypoint = undefined;
    config = await generateTraefikConfig();
    const router = config.http.routers["router-app"];
    expect("entryPoints" in router).toBe(false);
    expect(router.tls).toBeDefined();
  });

  it("uses Traefik API entrypoint info over the name heuristic (default-TLS'd plain-named entrypoint)", async () => {
    // "web-internal" on :9000: the name heuristic alone says plain (contains
    // "web"), but the API reports default TLS — the API info must win, pinning
    // the resolveEntrypointTlsInfo → isTlsEntrypoint wiring end-to-end.
    h.state.entrypoints = [
      { name: "web-internal", address: ":9000", http: { tls: {} } },
      { name: "web", address: ":80" },
    ];
    h.state.joinRows = [
      {
        service: mkService({ entrypoints: '["web-internal","web"]' }),
        domain: mkDomain(),
      },
    ];
    const config = await generateTraefikConfig();
    expect(
      config.http.routers["router-app-web-internal"].tls
    ).toBeDefined();
    expect(
      config.http.routers["router-app-web"].tls
    ).toBeUndefined();
  });

  it('treats stored "[]" as EXPLICITLY none — the legacy single must not resurrect', async () => {
    // "[]" was only ever written by the editor (deselect-all); the stale legacy
    // column must not bring a deselected entrypoint back. Falls to the global
    // default instead.
    const domain = mkDomain();
    h.state.joinRows = [
      { service: mkService({ entrypoints: "[]", entrypoint: "websecure" }), domain },
    ];
    h.state.globalConfig.defaultEntrypoint = "web";
    const config = await generateTraefikConfig();
    const router = config.http.routers["router-app"];
    expect(router.entryPoints).toEqual(["web"]);

    // without a global default: bound to all entrypoints, legacy tls shape
    h.state.globalConfig.defaultEntrypoint = undefined;
    const config2 = await generateTraefikConfig();
    const router2 = config2.http.routers["router-app"];
    expect("entryPoints" in router2).toBe(false);
  });
});

describe("generateTraefikConfig — multi default entrypoints", () => {
  it("fans a no-entrypoint service out across all global defaults, TLS only on TLS ones", async () => {
    h.state.joinRows = [
      { service: mkService({ entrypoints: null, entrypoint: null }), domain: mkDomain() },
    ];
    h.state.globalConfig.defaultEntrypoints = ["web", "websecure"];

    const config = await generateTraefikConfig();
    const web = config.http.routers["router-app-web"];
    const secure = config.http.routers["router-app-websecure"];
    expect(web.entryPoints).toEqual(["web"]);
    expect(web.tls).toBeUndefined();
    expect(secure.entryPoints).toEqual(["websecure"]);
    expect(secure.tls).toBeDefined();
    // multi-entrypoint naming contract: no un-suffixed base router
    expect(config.http.routers["router-app"]).toBeUndefined();
  });

  it("prefers defaultEntrypoints over the legacy single value", async () => {
    h.state.joinRows = [
      { service: mkService({ entrypoints: null, entrypoint: null }), domain: mkDomain() },
    ];
    h.state.globalConfig.defaultEntrypoint = "web";
    h.state.globalConfig.defaultEntrypoints = ["websecure"];

    const config = await generateTraefikConfig();
    const router = config.http.routers["router-app"];
    expect(router.entryPoints).toEqual(["websecure"]);
  });

  it("binds cert-trigger routers to only the TLS subset of the defaults", async () => {
    const domain = mkDomain(); // useWildcardCert: true, no services
    h.state.allDomains = [domain];
    h.state.globalConfig.defaultEntrypoints = ["web", "websecure"];

    const config = await generateTraefikConfig();
    const trigger = config.http.routers[wildcardCertRouterName(domain)];
    expect(trigger).toBeDefined();
    // "web" is plain HTTP — a tls router bound to it would serve TLS on :80
    expect(trigger.entryPoints).toEqual(["websecure"]);
  });

  it("omits trigger entryPoints entirely when no default is TLS", async () => {
    const domain = mkDomain();
    h.state.allDomains = [domain];
    h.state.globalConfig.defaultEntrypoints = ["web"];

    const config = await generateTraefikConfig();
    const trigger = config.http.routers[wildcardCertRouterName(domain)];
    expect("entryPoints" in trigger).toBe(false);
  });
});

describe("generateTraefikConfig — managed mode integration", () => {
  const authMw = "auth-shared_link-app";

  it("keeps legacy output identical when the new envs are unset", async () => {
    const domain = mkDomain();
    h.state.joinRows = [{ service: mkService(), domain }];
    h.state.allDomains = [domain];
    h.state.securityConfigs = [
      { id: "sec1sec1-0000", securityType: "shared_link", config: "{}" },
    ];

    const config = await generateTraefikConfig();
    const fa = config.http.middlewares![authMw].forwardAuth as { address: string };
    expect(fa.address).toContain("http://admin.local:3000/api/auth/verify");
    expect(config.http.routers["admin-panel"]).toBeUndefined();
    expect(config.http.services["admin-panel"]).toBeUndefined();
  });

  it("PANEL_INTERNAL_URL rewrites forward-auth and cert-trigger service URLs", async () => {
    vi.stubEnv("PANEL_INTERNAL_URL", "http://panel:3000");
    const domain = mkDomain();
    h.state.joinRows = [{ service: mkService(), domain }];
    // a service-less second domain still gets its wildcard trigger emitted
    h.state.allDomains = [
      domain,
      mkDomain({ id: "domain-2", domain: "other.net", isDefault: false }),
    ];
    h.state.securityConfigs = [
      { id: "sec1sec1-0000", securityType: "shared_link", config: "{}" },
    ];

    const config = await generateTraefikConfig();
    const fa = config.http.middlewares![authMw].forwardAuth as { address: string };
    expect(fa.address).toContain("http://panel:3000/api/auth/verify");
    const trigger = config.http.services["wildcard-cert-trigger-other-net"];
    expect(trigger.loadBalancer.servers[0].url).toBe("http://panel:3000");
  });

  it("managed mode emits the admin panel route with basicAuth from env", async () => {
    vi.stubEnv("TRAEFIK_MANAGED", "true");
    vi.stubEnv("ADMIN_PANEL_AUTH", "admin:$apr1$hash");
    h.state.globalConfig.adminPanelDomain = "admin.example.com";
    h.state.allDomains = [mkDomain()];

    const config = await generateTraefikConfig();
    const router = config.http.routers["admin-panel"];
    expect(router.rule).toBe("Host(`admin.example.com`)");
    expect(router.entryPoints).toEqual(["websecure"]);
    expect(router.middlewares).toEqual(["admin-panel-auth"]);
    // suffix-matched managed domain supplies resolver + wildcard block
    expect(router.tls).toEqual({
      certResolver: "letsencrypt",
      domains: [{ main: "example.com", sans: ["*.example.com"] }],
    });
    expect(config.http.middlewares!["admin-panel-auth"]).toEqual({
      basicAuth: { users: ["admin:$apr1$hash"] },
    });
    expect(config.http.services["admin-panel"].loadBalancer.servers[0].url).toBe(
      "http://admin.example.com"
    );
  });

  it("managed mode without valid ADMIN_PANEL_AUTH refuses to publish the admin route", async () => {
    vi.stubEnv("TRAEFIK_MANAGED", "true");
    h.state.globalConfig.adminPanelDomain = "admin.example.com";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const config = await generateTraefikConfig();
    expect(config.http.routers["admin-panel"]).toBeUndefined();
    expect(config.http.services["admin-panel"]).toBeUndefined();
    expect(config.http.middlewares?.["admin-panel-auth"]).toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("skips the admin route for localhost admin domains", async () => {
    vi.stubEnv("TRAEFIK_MANAGED", "true");
    h.state.globalConfig.adminPanelDomain = "localhost:3000";

    const config = await generateTraefikConfig();
    expect(config.http.routers["admin-panel"]).toBeUndefined();
  });

  it("strips the port and falls back to the first managed resolver when no domain matches", async () => {
    vi.stubEnv("TRAEFIK_MANAGED", "true");
    vi.stubEnv("ADMIN_PANEL_AUTH", "admin:$apr1$hash");
    h.state.globalConfig.adminPanelDomain = "panel.other.net:8443";
    h.state.allDomains = [mkDomain()]; // example.com — no match

    const config = await generateTraefikConfig();
    const router = config.http.routers["admin-panel"];
    expect(router.rule).toBe("Host(`panel.other.net`)");
    expect(router.tls).toEqual({ certResolver: "letsencrypt" });
  });
});

describe("generateTraefikConfig — identifier uniqueness", () => {
  it("keeps the same subdomain on two different domains apart", async () => {
    const d1 = mkDomain({ id: "domain-1", domain: "example.com" });
    const d2 = mkDomain({ id: "domain-2", domain: "other.net" });
    h.state.joinRows = [
      { service: mkService({ id: "11111111-aaaa-bbbb-cccc-dddddddddddd" }), domain: d1 },
      {
        service: mkService({ id: "22222222-aaaa-bbbb-cccc-dddddddddddd", domainId: "domain-2" }),
        domain: d2,
      },
    ];

    const config = await generateTraefikConfig();
    expect(config.http.routers["router-app-example-com"]).toBeDefined();
    expect(config.http.routers["router-app-other-net"]).toBeDefined();
    expect(config.http.services["service-app-example-com"].loadBalancer.servers[0].url)
      .toBe("http://10.0.0.5:8080");
    expect(config.http.services["service-app-other-net"]).toBeDefined();
    expect(config.http.routers["router-app-example-com"].rule).toBe(
      "Host(`app.example.com`)"
    );
    expect(config.http.routers["router-app-other-net"].rule).toBe(
      "Host(`app.other.net`)"
    );
  });

  it("suffixes a colliding identifier with the service id instead of overwriting", async () => {
    const domain = mkDomain();
    h.state.joinRows = [
      { service: mkService({ id: "11111111-aaaa-bbbb-cccc-dddddddddddd" }), domain },
      { service: mkService({ id: "deadbeef-aaaa-bbbb-cccc-dddddddddddd", targetPort: 9090 }), domain },
    ];

    const config = await generateTraefikConfig();
    expect(config.http.routers["router-app"]).toBeDefined();
    expect(config.http.routers["router-app-deadbeef"]).toBeDefined();
    expect(
      config.http.routers["router-app-deadbeef"].service
    ).toBe("service-app-deadbeef");
    expect(
      config.http.services["service-app-deadbeef"].loadBalancer.servers[0].url
    ).toBe("http://10.0.0.5:9090");
  });
});

describe("generateTraefikConfig — match rules", () => {
  it("assembles grouped tree matchRules into the router rule", async () => {
    const domain = mkDomain();
    const matchRules = JSON.stringify([
      {
        kind: "group",
        conn: "AND",
        children: [
          { type: "PathPrefix", conn: "AND", value: "/api" },
          { type: "PathPrefix", conn: "OR", value: "/ws" },
        ],
      },
    ]);
    h.state.joinRows = [{ service: mkService({ matchRules }), domain }];

    const config = await generateTraefikConfig();
    expect(config.http.routers["router-app"].rule).toBe(
      "(Host(`app.example.com`) && (PathPrefix(`/api`) || PathPrefix(`/ws`)))"
    );
  });

  it("keeps the legacy flat MatchRule[] JSON working", async () => {
    const domain = mkDomain();
    const matchRules = JSON.stringify([
      { type: "PathPrefix", conn: "AND", value: "/api" },
    ]);
    h.state.joinRows = [{ service: mkService({ matchRules }), domain }];

    const config = await generateTraefikConfig();
    expect(config.http.routers["router-app"].rule).toBe(
      "(Host(`app.example.com`) && PathPrefix(`/api`))"
    );
  });
});

describe("generateTraefikConfig — self-contained Host trees", () => {
  it("assembles the rule from the tree alone — the legacy columns' host is not duplicated", async () => {
    const domain = mkDomain();
    const matchRules = JSON.stringify([
      { type: "Host", conn: "AND", domainId: "domain-1", sub: "tree" },
      { type: "PathPrefix", conn: "AND", value: "/api" },
    ]);
    // legacy columns deliberately disagree with the tree: they still drive the
    // identifier (router-app) but must NOT leak into the rule
    h.state.joinRows = [{ service: mkService({ matchRules }), domain }];

    const config = await generateTraefikConfig();
    const router = config.http.routers["router-app"];
    expect(router).toBeDefined();
    expect(router.rule).toBe("(Host(`tree.example.com`) && PathPrefix(`/api`))");
    expect(router.rule).not.toContain("app.example.com");
  });

  it("supports per-group hosts — (Host a && /x) || (Host b && /y)", async () => {
    const domain = mkDomain();
    const matchRules = JSON.stringify([
      {
        kind: "group",
        conn: "AND",
        children: [
          { type: "Host", conn: "AND", domainId: "domain-1", sub: "a" },
          { type: "PathPrefix", conn: "AND", value: "/x" },
        ],
      },
      {
        kind: "group",
        conn: "OR",
        children: [
          { type: "Host", conn: "AND", value: "b.example.org" },
          { type: "PathPrefix", conn: "AND", value: "/y" },
        ],
      },
    ]);
    h.state.joinRows = [{ service: mkService({ matchRules }), domain }];

    const config = await generateTraefikConfig();
    expect(config.http.routers["router-app"].rule).toBe(
      "((Host(`a.example.com`) && PathPrefix(`/x`)) || (Host(`b.example.org`) && PathPrefix(`/y`)))"
    );
  });

  it("resolves free-text hosts; the tree's resolved hosts drive cert selection", async () => {
    // wildcard off + a cert config covering the free-text host: the tree's
    // RESOLVED hostnames must drive cert selection
    const domain = mkDomain({
      useWildcardCert: false,
      certificateConfigs: JSON.stringify([
        { name: "ext", main: "ext.example.org", certResolver: "le" },
      ]),
    });
    const matchRules = JSON.stringify([
      { type: "Host", conn: "AND", value: "ext.example.org" },
      { type: "Host", conn: "OR", domainId: "domain-1", sub: "x" },
    ]);
    const service = mkService({
      matchRules,
      // derived columns for a free-text first Host: custom + resolved tree hosts
      hostnameMode: "custom",
      customHostnames: '["ext.example.org"]',
      entrypoints: '["websecure"]',
    });
    h.state.joinRows = [{ service, domain }];

    const config = await generateTraefikConfig();
    const router = config.http.routers["router-ext-example-org"];
    expect(router).toBeDefined();
    expect(router.rule).toBe("(Host(`ext.example.org`) || Host(`x.example.com`))");
    expect(router.tls).toEqual({
      certResolver: "le",
      domains: [{ main: "ext.example.org", sans: undefined }],
    });
  });

  it("skips (with a warning) a service whose rule would carry an empty argument, e.g. a Host on a deleted domain", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const domain = mkDomain();
      const matchRules = JSON.stringify([
        { type: "Host", conn: "AND", value: "ext.example.org" },
        { type: "Host", conn: "OR", domainId: "missing-domain", sub: "x" },
      ]);
      const service = mkService({
        matchRules,
        hostnameMode: "custom",
        customHostnames: '["ext.example.org"]',
      });
      h.state.joinRows = [{ service, domain }];

      const config = await generateTraefikConfig();
      // never emit a router with Host(``) — nothing registered for the service
      expect(Object.keys(config.http.routers).filter((n) => n.startsWith("router-"))).toEqual([]);
      expect(Object.keys(config.http.services).filter((n) => n.startsWith("service-"))).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("empty matcher argument"));

      // same for an empty PathPrefix(``) that slipped into storage
      warn.mockClear();
      h.state.joinRows = [
        { service: mkService({ matchRules: '[{"type":"PathPrefix","conn":"AND","value":""}]' }), domain },
      ];
      const config2 = await generateTraefikConfig();
      expect(config2.http.routers["router-app"]).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("empty matcher argument"));
    } finally {
      warn.mockRestore();
    }
  });

  it("never emits an injected/unknown matcher type into the rule", async () => {
    const domain = mkDomain();
    const matchRules = JSON.stringify([
      { type: "Host(`evil.example.org`) || PathPrefix", conn: "AND", value: "/" },
      { type: "PathPrefix", conn: "AND", value: "/api" },
    ]);
    h.state.joinRows = [{ service: mkService({ matchRules }), domain }];

    const config = await generateTraefikConfig();
    const router = config.http.routers["router-app"];
    expect(router).toBeDefined();
    expect(router.rule).toBe("(Host(`app.example.com`) && PathPrefix(`/api`))");
    expect(router.rule).not.toContain("evil");
  });

  it("skips a service whose only Host references an unknown domain", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const domain = mkDomain();
      const matchRules = JSON.stringify([
        { type: "Host", conn: "AND", domainId: "missing-domain", sub: "x" },
        { type: "PathPrefix", conn: "AND", value: "/api" },
      ]);
      h.state.joinRows = [{ service: mkService({ matchRules }), domain }];

      const config = await generateTraefikConfig();
      expect(
        Object.keys(config.http.routers).filter((n) => n.startsWith("router-"))
      ).toEqual([]);
      expect(
        Object.keys(config.http.services).filter((n) => n.startsWith("service-"))
      ).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("has no valid hostnames")
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("still emits per-entrypoint split routers with identical middlewares and per-EP TLS", async () => {
    const domain = mkDomain();
    const matchRules = JSON.stringify([
      { type: "Host", conn: "AND", domainId: "domain-1", sub: "app" },
      { type: "PathPrefix", conn: "AND", value: "/api" },
    ]);
    const service = mkService({ matchRules, entrypoints: '["web","websecure"]' });
    h.state.joinRows = [{ service, domain }];
    h.state.globalConfig.globalMiddlewares = ["compress"];

    const config = await generateTraefikConfig();
    const web = config.http.routers["router-app-web"];
    const secure = config.http.routers["router-app-websecure"];
    expect(web).toBeDefined();
    expect(secure).toBeDefined();
    expect(web.rule).toBe("(Host(`app.example.com`) && PathPrefix(`/api`))");
    expect(secure.rule).toBe(web.rule);
    expect(web.middlewares).toBe(secure.middlewares); // same array instance
    expect(web.middlewares).toEqual(["compress"]);
    expect(web.tls).toBeUndefined();
    expect(secure.tls).toEqual({
      certResolver: "letsencrypt",
      domains: [{ main: "example.com", sans: ["*.example.com"] }],
    });
  });

  it("a tree service in derived subdomain mode requests the wildcard cert and suppresses the trigger", async () => {
    const domain = mkDomain();
    const matchRules = JSON.stringify([
      { type: "Host", conn: "AND", domainId: "domain-1", sub: "app" },
    ]);
    h.state.joinRows = [
      { service: mkService({ matchRules, entrypoints: '["websecure"]' }), domain },
    ];
    h.state.allDomains = [domain];

    const config = await generateTraefikConfig();
    const router = config.http.routers["router-app"];
    expect(router.tls).toEqual({
      certResolver: "letsencrypt",
      domains: [{ main: "example.com", sans: ["*.example.com"] }],
    });
    expect(config.http.routers["wildcard-cert-router-example-com"]).toBeUndefined();
  });
});

describe("generateTraefikConfig — legacy names survive the upgrade", () => {
  it("a single-domain estate keeps router-<sub> / service-<sub> / auth-sso-<sub> exactly as main named them", async () => {
    const domain = mkDomain();
    h.state.joinRows = [
      { service: mkService(), domain },
      { service: mkService({ id: "22222222-aaaa-bbbb-cccc-dddddddddddd", subdomain: "git" }), domain },
      { service: mkService({ id: "33333333-aaaa-bbbb-cccc-dddddddddddd", hostnameMode: "apex", subdomain: null }), domain },
    ];
    h.state.allDomains = [domain];
    h.state.securityConfigs = [{ id: "sec1sec1-0000", securityType: "sso", config: "{}" }];

    const config = await generateTraefikConfig();
    expect(config.http.routers["router-app"]).toBeDefined();
    expect(config.http.routers["router-app"].service).toBe("service-app");
    expect(config.http.routers["router-app"].middlewares).toEqual(["auth-sso-app"]);
    expect(config.http.middlewares!["auth-sso-app"]).toBeDefined();
    expect(config.http.routers["router-git"].service).toBe("service-git");
    expect(config.http.routers["router-example-com"].service).toBe("service-example-com");
    expect(Object.keys(config.http.routers).some((n) => n.includes("app-example-com"))).toBe(false);
  });

  it("only the subdomain that exists under two domains gets the domain suffix", async () => {
    const d1 = mkDomain();
    const d2 = mkDomain({ id: "domain-2", domain: "other.net" });
    h.state.joinRows = [
      { service: mkService(), domain: d1 },
      { service: mkService({ id: "22222222-aaaa-bbbb-cccc-dddddddddddd", domainId: "domain-2" }), domain: d2 },
      { service: mkService({ id: "33333333-aaaa-bbbb-cccc-dddddddddddd", subdomain: "git" }), domain: d1 },
    ];

    const config = await generateTraefikConfig();
    expect(config.http.routers["router-app-example-com"].service).toBe("service-app-example-com");
    expect(config.http.routers["router-app-other-net"].service).toBe("service-app-other-net");
    expect(config.http.routers["router-app"]).toBeUndefined();
    expect(config.http.routers["router-git"].service).toBe("service-git"); // untouched
  });

  it("a DISABLED twin on another domain still makes the subdomain ambiguous (names don't flip on toggle)", async () => {
    const d1 = mkDomain();
    const d2 = mkDomain({ id: "domain-2", domain: "other.net" });
    h.state.joinRows = [
      { service: mkService(), domain: d1 },
      { service: mkService({ id: "22222222-aaaa-bbbb-cccc-dddddddddddd", domainId: "domain-2", enabled: false }), domain: d2 },
    ];

    const config = await generateTraefikConfig();
    expect(config.http.routers["router-app-example-com"]).toBeDefined();
    expect(config.http.routers["router-app"]).toBeUndefined();
    expect(config.http.routers["router-app-other-net"]).toBeUndefined(); // disabled: not emitted
    // and the matcher agrees with generation
    const match = routerServiceMatcher(h.state.joinRows as Parameters<typeof routerServiceMatcher>[0]);
    expect(match("router-app-example-com")).toBe(mkService().id);
    expect(match("router-app")).toBeNull();
  });
});

describe("generateTraefikConfig — single-entrypoint TLS gating", () => {
  const single = async (ep: string) => {
    h.state.joinRows = [{ service: mkService({ entrypoints: JSON.stringify([ep]) }), domain: mkDomain() }];
    const config = await generateTraefikConfig();
    return config.http.routers["router-app"];
  };
  const multi = async (eps: string[]) => {
    h.state.joinRows = [{ service: mkService({ entrypoints: JSON.stringify(eps) }), domain: mkDomain() }];
    const config = await generateTraefikConfig();
    return Object.fromEntries(eps.map((ep) => [ep, config.http.routers[`router-app-${ep}`]]));
  };

  it("with NO API info a single-entrypoint router keeps legacy tls regardless of its name", async () => {
    h.state.entrypoints = []; // API unreachable/unconfigured → no verdict
    for (const ep of ["websecure", "web", "web-internal", "http-alt", "internal"]) {
      const router = await single(ep);
      expect(router.entryPoints).toEqual([ep]);
      expect(router.tls, ep).toBeDefined();
    }
  });

  it("with NO API info the multi-entrypoint fan-out may use the name heuristic", async () => {
    h.state.entrypoints = [];
    const routers = await multi(["websecure", "web", "web-internal", "http-alt", "internal"]);
    expect(routers["websecure"].tls).toBeDefined();
    expect(routers["web"].tls).toBeUndefined();
    expect(routers["web-internal"].tls).toBeUndefined();
    expect(routers["http-alt"].tls).toBeUndefined();
    expect(routers["internal"].tls).toBeDefined(); // unknown name → legacy default
  });

  it("authoritative API info (port / default TLS) drops or keeps tls on a single-entrypoint router", async () => {
    h.state.entrypoints = [
      { name: "web", address: ":80" },
      { name: "http-alt", address: ":8080" },
      { name: "web-internal", address: ":9000", http: { tls: {} } },
      { name: "custom", address: ":9443" }, // unknown port: no verdict
    ];
    expect((await single("web")).tls).toBeUndefined();
    expect((await single("http-alt")).tls).toBeUndefined();
    expect((await single("web-internal")).tls).toBeDefined();
    expect((await single("custom")).tls).toBeDefined(); // legacy default
    expect((await single("nothing-known")).tls).toBeDefined();
  });

  it("a lost API keeps the last good verdicts (stale-while-error) instead of flipping tls", async () => {
    h.state.entrypoints = [{ name: "web", address: ":80" }];
    expect((await single("web")).tls).toBeUndefined();
    // the cache is warm; make the API fail and expire the success TTL
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(31_000);
      const { getEntrypoints } = await import("@/lib/traefik-api");
      vi.mocked(getEntrypoints).mockRejectedValueOnce(new Error("down"));
      expect((await single("web")).tls).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("generateTraefikConfig — cert triggers", () => {
  it("path-scopes the wildcard trigger rule (parenthesized host)", async () => {
    h.state.allDomains = [mkDomain()];

    const config = await generateTraefikConfig();
    const trigger = config.http.routers["wildcard-cert-router-example-com"];
    expect(trigger).toBeDefined();
    expect(trigger.rule).toBe(
      `(Host(\`example.com\`)) && Path(\`${TRIGGER_PATH}\`)`
    );
    expect(trigger.tls).toEqual({
      certResolver: "letsencrypt",
      domains: [{ main: "example.com", sans: ["*.example.com"] }],
    });
  });

  it("path-scopes cert-config triggers with a parenthesized Host disjunction", async () => {
    h.state.allDomains = [
      mkDomain({
        useWildcardCert: false,
        certificateConfigs: JSON.stringify([
          { name: "extra", main: "a.example.com", sans: ["b.example.com"], certResolver: "le" },
        ]),
      }),
    ];

    const config = await generateTraefikConfig();
    const trigger = config.http.routers["cert-router-extra-a-example-com"];
    expect(trigger).toBeDefined();
    expect(trigger.rule).toBe(
      `(Host(\`a.example.com\`) || Host(\`b.example.com\`)) && Path(\`${TRIGGER_PATH}\`)`
    );
  });

  it("apex service on a wildcard domain requests the wildcard cert and suppresses the trigger", async () => {
    const domain = mkDomain();
    h.state.joinRows = [
      {
        service: mkService({ hostnameMode: "apex", subdomain: null, entrypoints: '["websecure"]' }),
        domain,
      },
    ];
    h.state.allDomains = [domain];

    const config = await generateTraefikConfig();
    const router = config.http.routers["router-example-com"];
    expect(router).toBeDefined();
    expect(router.rule).toBe("Host(`example.com`)");
    expect(router.tls).toEqual({
      certResolver: "letsencrypt",
      domains: [{ main: "example.com", sans: ["*.example.com"] }],
    });
    // the trigger would duplicate the cert request AND used to steal apex traffic
    expect(config.http.routers["wildcard-cert-router-example-com"]).toBeUndefined();
  });

  it("keeps the wildcard trigger when no enabled service requests the wildcard", async () => {
    const domain = mkDomain();
    // plain-HTTP-only service: no TLS router emitted, so no wildcard requested
    h.state.joinRows = [
      { service: mkService({ entrypoints: '["web"]' }), domain },
    ];
    h.state.allDomains = [domain];

    const config = await generateTraefikConfig();
    expect(config.http.routers["wildcard-cert-router-example-com"]).toBeDefined();
  });

  it("subdomain service with a TLS entrypoint also satisfies the wildcard", async () => {
    const domain = mkDomain();
    h.state.joinRows = [
      { service: mkService({ entrypoints: '["web","websecure"]' }), domain },
    ];
    h.state.allDomains = [domain];

    const config = await generateTraefikConfig();
    expect(config.http.routers["wildcard-cert-router-example-com"]).toBeUndefined();
  });
});
