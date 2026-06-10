import { beforeEach, describe, expect, it, vi } from "vitest";

/* Pins the two metrics changes for per-entrypoint split routers:
 * 1. scrape ticks map EVERY router name of a service (suffixed split names)
 *    back to the owning service id, and
 * 2. the read path counts a scrape tick's wall-clock seconds once per distinct
 *    timestamp per service, so split-router traffic SUMS into the rate instead
 *    of deflating it N-fold. */

const h = vi.hoisted(() => {
  const servicesTable = { __table: "services" };
  const domainsTable = { __table: "domains" };
  const samplesTable = { __table: "router_metric_samples" };
  const state = {
    joinRows: [] as Array<{ service: unknown; domain: unknown }>,
    sampleRows: [] as unknown[],
    promSamples: [] as Array<{ name: string; labels: Record<string, string>; value: number }>,
    inserted: [] as unknown[][],
    routerNames: new Map<string, string[]>(), // serviceId -> router names
  };
  return { servicesTable, domainsTable, samplesTable, state };
});

vi.mock("@/lib/db", () => {
  const makeChain = (table: unknown) => {
    const rows = () =>
      table === h.samplesTable
        ? h.state.sampleRows
        : table === h.servicesTable
          ? h.state.joinRows
          : [];
    const chain = {
      leftJoin: () => chain,
      where: () => Promise.resolve(rows()),
      then: (f?: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
        Promise.resolve(rows()).then(f, r),
    };
    return chain;
  };
  return {
    db: {
      select: () => ({ from: (t: unknown) => makeChain(t) }),
      insert: () => ({
        values: (rows: unknown[]) => {
          h.state.inserted.push(rows);
          return Promise.resolve();
        },
      }),
      delete: () => ({ where: () => Promise.resolve() }),
    },
    services: h.servicesTable,
    domains: h.domainsTable,
    routerMetricSamples: h.samplesTable,
  };
});

vi.mock("@/lib/traefik-api", () => ({
  getTraefikApiUrl: () => "http://traefik:8080",
}));

vi.mock("@/lib/traefik-config", () => ({
  routerServiceMatcher:
    (rows: Array<{ service: { id: string } }>) => (name: string) => {
      for (const { service } of rows) {
        if ((h.state.routerNames.get(service.id) || []).includes(name))
          return service.id;
      }
      return null;
    },
}));

vi.mock("@/lib/prometheus", () => ({
  fetchMetricsText: vi.fn(async () => "prom-text"),
  parseProm: () => h.state.promSamples,
  stripProvider: (s: string) => s.split("@")[0],
}));

import { getMetricsSnapshot, metricsScheduler } from "@/lib/metrics-source";

const tick = () =>
  (metricsScheduler as unknown as { tick(): Promise<void> }).tick();

const REQ = "traefik_router_requests_total";
const reqSample = (router: string, value: number) => ({
  name: REQ,
  labels: { router: `${router}@http`, code: "200" },
  value,
});

beforeEach(() => {
  h.state.joinRows = [];
  h.state.sampleRows = [];
  h.state.promSamples = [];
  h.state.inserted = [];
  h.state.routerNames = new Map();
});

describe("scrape tick — split-router mapping", () => {
  it("attributes every per-entrypoint router to the owning service", async () => {
    const service = { id: "svc-1" };
    h.state.joinRows = [{ service, domain: { id: "d1" } }];
    h.state.routerNames.set("svc-1", [
      "router-app-example-com",
      "router-app-example-com-web",
      "router-app-example-com-websecure",
    ]);

    // first tick seeds the baseline (no inserts) …
    h.state.promSamples = [
      reqSample("router-app-example-com-web", 10),
      reqSample("router-app-example-com-websecure", 5),
      reqSample("router-unrelated", 99),
    ];
    await tick();
    expect(h.state.inserted).toHaveLength(0);

    // … second tick emits deltas for BOTH split routers, same service id
    h.state.promSamples = [
      reqSample("router-app-example-com-web", 30),
      reqSample("router-app-example-com-websecure", 12),
      reqSample("router-unrelated", 199),
    ];
    await tick();
    expect(h.state.inserted).toHaveLength(1);
    const rows = h.state.inserted[0] as Array<{
      serviceId: string;
      router: string;
      req2xx: number;
    }>;
    expect(rows).toHaveLength(2); // unmatched router dropped
    expect(rows.every((r) => r.serviceId === "svc-1")).toBe(true);
    expect(
      Object.fromEntries(rows.map((r) => [r.router, r.req2xx]))
    ).toEqual({
      "router-app-example-com-web": 20,
      "router-app-example-com-websecure": 7,
    });
  });
});

describe("read path — per-tick seconds dedup", () => {
  it("counts a tick's seconds once per service so split-router rates sum", async () => {
    const ts = new Date(Date.now() - 1000); // newest bucket
    const mkRow = (router: string, req2xx: number) => ({
      serviceId: "svc-1",
      router,
      ts,
      req2xx,
      req3xx: 0,
      req4xx: 0,
      req5xx: 0,
      reqOther: 0,
      durSumMs: 0,
      durCount: 0,
    });
    // same scrape tick, two split routers
    h.state.sampleRows = [
      mkRow("router-app-example-com-web", 10),
      mkRow("router-app-example-com-websecure", 5),
    ];

    const snap = await getMetricsSnapshot();
    const svc = snap.services["svc-1"];
    expect(svc).toBeDefined();
    expect(svc.total1h).toBe(15);
    // 15 requests over ONE 60s tick = 0.25 req/s. Without the dedup the
    // denominator doubles (two rows, same ts) and the rate halves to 0.13.
    expect(svc.reqPerSec).toBeCloseTo(15 / 60, 2);
  });
});
