/* Cert-resolver inference: Traefik has no resolver API, so names come from
 * the managed static config (managed mode), router tls.certResolver and
 * entrypoint http.tls.certResolver blocks. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  state: {
    configured: true,
    routers: [] as unknown[],
    entrypoints: [] as unknown[],
    fail: false,
    managedResolvers: [] as Array<{ name: string }>,
  },
}));

vi.mock("@/lib/traefik-api", () => ({
  isTraefikApiConfigured: vi.fn(() => h.state.configured),
  getHttpRouters: vi.fn(async () => {
    if (h.state.fail) throw new Error("unreachable");
    return h.state.routers;
  }),
  getEntrypoints: vi.fn(async () => {
    if (h.state.fail) throw new Error("unreachable");
    return h.state.entrypoints;
  }),
}));

vi.mock("@/lib/app-config", () => ({
  getManagedStaticConfig: vi.fn(async () => ({
    entrypoints: [],
    certResolvers: h.state.managedResolvers,
  })),
}));

import { getCertResolvers } from "@/lib/cert-resolvers";

beforeEach(() => {
  h.state.configured = true;
  h.state.routers = [];
  h.state.entrypoints = [];
  h.state.fail = false;
  h.state.managedResolvers = [];
});

afterEach(() => vi.unstubAllEnvs());

describe("getCertResolvers", () => {
  it("collects distinct resolvers from routers and entrypoints, sorted", async () => {
    h.state.routers = [
      { name: "a@http", tls: { certResolver: "letsencrypt" } },
      { name: "b@file", tls: { certResolver: "zerossl" } },
      { name: "c@file", tls: { certResolver: "letsencrypt" } }, // dup
      { name: "d@file", tls: {} }, // tls without resolver — ignored
      { name: "e@file" }, // no tls — ignored
    ];
    h.state.entrypoints = [
      { name: "websecure", http: { tls: { certResolver: "dns-cloudflare" } } },
      { name: "web", http: {} },
    ];

    const res = await getCertResolvers();
    expect(res).toEqual({
      configured: true,
      reachable: true,
      resolvers: [
        { name: "dns-cloudflare", source: "entrypoint" },
        { name: "letsencrypt", source: "router" },
        { name: "zerossl", source: "router" },
      ],
    });
  });

  it("router source wins over entrypoint for the same name", async () => {
    h.state.routers = [{ name: "a@http", tls: { certResolver: "letsencrypt" } }];
    h.state.entrypoints = [
      { name: "websecure", http: { tls: { certResolver: "letsencrypt" } } },
    ];
    const res = await getCertResolvers();
    expect(res.resolvers).toEqual([{ name: "letsencrypt", source: "router" }]);
  });

  it("reports unconfigured cleanly", async () => {
    h.state.configured = false;
    const res = await getCertResolvers();
    expect(res).toEqual({ configured: false, reachable: false, resolvers: [] });
  });

  it("degrades to reachable:false when the Traefik API errors", async () => {
    h.state.fail = true;
    const res = await getCertResolvers();
    expect(res.configured).toBe(true);
    expect(res.reachable).toBe(false);
    expect(res.resolvers).toEqual([]);
  });

  it("managed mode: managed names come first and survive an unreachable Traefik", async () => {
    vi.stubEnv("TRAEFIK_MANAGED", "true");
    h.state.managedResolvers = [{ name: "letsencrypt" }];
    h.state.fail = true;

    const res = await getCertResolvers();
    expect(res.reachable).toBe(false);
    expect(res.resolvers).toEqual([{ name: "letsencrypt", source: "managed" }]);
  });

  it("managed source outranks router/entrypoint for the same name", async () => {
    vi.stubEnv("TRAEFIK_MANAGED", "true");
    h.state.managedResolvers = [{ name: "letsencrypt" }];
    h.state.routers = [{ name: "a@http", tls: { certResolver: "letsencrypt" } }];

    const res = await getCertResolvers();
    expect(res.resolvers).toEqual([{ name: "letsencrypt", source: "managed" }]);
  });

  it("outside managed mode the store is not consulted", async () => {
    h.state.managedResolvers = [{ name: "ghost" }];
    const res = await getCertResolvers();
    expect(res.resolvers).toEqual([]);
  });
});
