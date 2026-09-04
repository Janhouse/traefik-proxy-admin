/* Runtime snapshot reachability + backend-health attribution. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const ok = <T,>(v: T) => async () => v;
  const state = {
    dbRows: [] as unknown[],
    probe: vi.fn(async () => true),
    api: {} as Record<string, () => Promise<unknown>>,
  };
  return { ok, state };
});

vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: () => Promise.resolve(h.state.dbRows) }) },
  services: {},
}));

vi.mock("@/lib/traefik-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/traefik-api")>(
    "@/lib/traefik-api"
  );
  const names = [
    "getEntrypoints",
    "getHttpRouters",
    "getHttpServices",
    "getHttpMiddlewares",
    "getTcpRouters",
    "getTcpServices",
    "getTcpMiddlewares",
    "getUdpRouters",
    "getUdpServices",
    "getVersion",
    "getOverview",
  ] as const;
  const mocked: Record<string, unknown> = {
    indexServerStatus: actual.indexServerStatus,
    normalizeServerUrl: actual.normalizeServerUrl,
    providerOf: actual.providerOf,
    isTraefikApiConfigured: () => true,
    probeTcp: (...a: unknown[]) => h.state.probe(...(a as [])),
  };
  for (const n of names) mocked[n] = () => h.state.api[n]();
  return mocked;
});

import { getBackendHealthMap, getRuntimeSnapshot } from "@/lib/traefik-service";

function healthyApi() {
  h.state.api = {
    getEntrypoints: h.ok([{ name: "web", address: ":80" }]),
    getHttpRouters: h.ok([
      { name: "r1@file", rule: "Host(`a`)", service: "s1", status: "enabled" },
    ]),
    getHttpServices: h.ok([
      { name: "s1@file", loadBalancer: { servers: [{ url: "http://10.0.0.1:80" }] } },
    ]),
    getHttpMiddlewares: h.ok([]),
    getTcpRouters: h.ok([]),
    getTcpServices: h.ok([]),
    getTcpMiddlewares: h.ok([]),
    getUdpRouters: h.ok([]),
    getUdpServices: h.ok([]),
    getVersion: h.ok({ Version: "3.7.0" }),
    getOverview: h.ok({ certificates: { total: 4 } }),
  };
}
const failing = (msg: string) => async () => {
  throw new Error(msg);
};

beforeEach(() => {
  healthyApi();
  h.state.dbRows = [];
  h.state.probe = vi.fn(async () => true);
});

describe("getRuntimeSnapshot", () => {
  it("is reachable with no warnings when every call succeeds", async () => {
    const snap = await getRuntimeSnapshot();
    expect(snap.reachable).toBe(true);
    expect(snap.warnings).toBeUndefined();
    expect(snap.counts.httpRouters).toBe(1);
    expect(snap.counts.certificates).toBe(4);
    expect(snap.version?.version).toBe("3.7.0");
  });

  it("reports unreachable when the overview call fails", async () => {
    h.state.api.getOverview = failing("connect ECONNREFUSED");
    const snap = await getRuntimeSnapshot();
    expect(snap.reachable).toBe(false);
    expect(snap.error).toBe("connect ECONNREFUSED");
    expect(snap.httpRouters).toEqual([]);
  });

  it("reports unreachable when the HTTP routers call fails", async () => {
    h.state.api.getHttpRouters = failing("timeout");
    const snap = await getRuntimeSnapshot();
    expect(snap).toMatchObject({ configured: true, reachable: false, error: "timeout" });
  });

  it("reports unreachable when every call fails", async () => {
    for (const k of Object.keys(h.state.api)) h.state.api[k] = failing(`${k} down`);
    const snap = await getRuntimeSnapshot();
    expect(snap.reachable).toBe(false);
    expect(snap.error).toMatch(/down$/);
  });

  it("degrades with warnings when only secondary lists fail", async () => {
    h.state.api.getTcpRouters = failing("tcp boom");
    h.state.api.getVersion = failing("version boom");
    const snap = await getRuntimeSnapshot();
    expect(snap.reachable).toBe(true);
    expect(snap.error).toBeUndefined();
    expect(snap.warnings).toEqual([
      "/api/tcp/routers: tcp boom",
      "/api/version: version boom",
    ]);
    expect(snap.httpRouters).toHaveLength(1);
    expect(snap.tcpRouters).toEqual([]);
    expect(snap.version).toEqual({ version: undefined, codename: undefined });
  });
});

describe("getBackendHealthMap attribution", () => {
  const svc = (id: string, ip: string) => ({
    id,
    targetIp: ip,
    targetPort: 80,
    isHttps: false,
    enabled: true,
  });

  it("attributes a probe-decided result to the probe, even when Traefik says UP", async () => {
    h.state.dbRows = [svc("a", "10.0.0.1")];
    h.state.api.getHttpServices = h.ok([
      {
        name: "s1@file",
        loadBalancer: { servers: [{ url: "http://10.0.0.1:80" }] },
        serverStatus: { "http://10.0.0.1:80": "UP" }, // no healthCheck → not trusted
      },
    ]);
    h.state.probe = vi.fn(async () => false);
    const res = await getBackendHealthMap();
    expect(res.reachable).toBe(true);
    expect(res.services.a).toEqual({ state: "down", up: 0, total: 1, source: "probe" });
    expect(h.state.probe).toHaveBeenCalledTimes(1);
  });

  it("trusts a Traefik UP when the service has a health check (no probe)", async () => {
    h.state.dbRows = [svc("a", "10.0.0.1")];
    h.state.api.getHttpServices = h.ok([
      {
        name: "s1@file",
        loadBalancer: {
          servers: [{ url: "http://10.0.0.1:80" }],
          healthCheck: { path: "/healthz" },
        },
        serverStatus: { "http://10.0.0.1:80": "UP" },
      },
    ]);
    h.state.probe = vi.fn(async () => false);
    const res = await getBackendHealthMap();
    expect(res.services.a).toEqual({ state: "up", up: 1, total: 1, source: "traefik" });
    expect(h.state.probe).not.toHaveBeenCalled();
  });

  it("keeps Traefik DOWN authoritative", async () => {
    h.state.dbRows = [svc("a", "10.0.0.1")];
    h.state.api.getHttpServices = h.ok([
      {
        name: "s1@file",
        loadBalancer: { servers: [{ url: "http://10.0.0.1:80" }] },
        serverStatus: { "http://10.0.0.1:80": "DOWN" },
      },
    ]);
    const res = await getBackendHealthMap();
    expect(res.services.a.source).toBe("traefik");
    expect(res.services.a.state).toBe("down");
    expect(h.state.probe).not.toHaveBeenCalled();
  });
});
