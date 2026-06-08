import "server-only";
import { db, services, domains, routerMetricSamples } from "@/lib/db";
import type { NewRouterMetricSample } from "@/lib/db/schema";
import { eq, gte, lt } from "drizzle-orm";
import { getTraefikApiUrl } from "@/lib/traefik-api";
import { generateServiceIdentifier } from "@/lib/traefik-config";
import { fetchMetricsText, parseProm, stripProvider } from "@/lib/prometheus";
import type { MetricsResponse, TrafficMetrics } from "@/lib/traefik-client-types";

/* ─────────────────────────────────────────────────────────────────────────
 * Traefik request-traffic metrics: scrape the Prometheus /metrics endpoint on
 * an interval, diff the cumulative counters against the previous scrape, and
 * store the per-router per-tick DELTAS in Postgres as a small rolling window.
 *
 * Single-instance assumption: the previous-cumulative snapshot is kept in
 * memory, so exactly one app process must run this scheduler.
 * ───────────────────────────────────────────────────────────────────────── */

const REQ_TOTAL = "traefik_router_requests_total";
const DUR_COUNT = "traefik_router_request_duration_seconds_count";
const DUR_SUM = "traefik_router_request_duration_seconds_sum";
const WINDOW_SEC = 3600;
const BARS = 24;

type StatusKey = "req2xx" | "req3xx" | "req4xx" | "req5xx" | "reqOther";

function getMetricsUrl(): string | null {
  const explicit = process.env.TRAEFIK_METRICS_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const base = getTraefikApiUrl();
  return base ? `${base}/metrics` : null;
}

function isMetricsConfigured(): boolean {
  return getMetricsUrl() !== null;
}

function intervalSeconds(): number {
  const v = parseInt(process.env.TRAEFIK_METRICS_INTERVAL_SECONDS || "", 10);
  return Number.isFinite(v) && v > 0 ? v : 60;
}
function retentionMinutes(): number {
  const v = parseInt(process.env.TRAEFIK_METRICS_RETENTION_MINUTES || "", 10);
  return Number.isFinite(v) && v > 0 ? v : 180;
}

function statusClass(code: string): StatusKey {
  const n = parseInt(code, 10);
  if (n >= 200 && n < 300) return "req2xx";
  if (n >= 300 && n < 400) return "req3xx";
  if (n >= 400 && n < 500) return "req4xx";
  if (n >= 500 && n < 600) return "req5xx";
  return "reqOther";
}

// In-memory previous cumulative snapshots (module singleton).
const prevReq = new Map<string, Map<string, number>>(); // router -> code -> cumulative
const prevDur = new Map<string, { sum: number; count: number }>(); // router -> {sum,count}
let lastScrapeOk = false;
let lastRouterLinesSeen = 0;

/** Map `router-<identifier>` -> admin service id (all services, all hostname modes). */
async function buildRouterServiceMap(): Promise<Map<string, string>> {
  const rows = await db
    .select({ service: services, domain: domains })
    .from(services)
    .leftJoin(domains, eq(services.domainId, domains.id));
  const map = new Map<string, string>();
  for (const { service, domain } of rows) {
    if (!domain) continue;
    map.set(`router-${generateServiceIdentifier(service, domain)}`, service.id);
  }
  return map;
}

class MetricsScheduler {
  private interval: NodeJS.Timeout | null = null;
  private isRunning = false;

  async start() {
    if (this.isRunning) {
      console.log("Metrics scheduler is already running");
      return;
    }
    if (!isMetricsConfigured()) {
      console.log(
        "Metrics scheduler disabled (set TRAEFIK_METRICS_URL or TRAEFIK_API_URL to enable)"
      );
      return;
    }
    this.isRunning = true;
    const sec = intervalSeconds();
    console.log(`Starting Traefik metrics scraper - every ${sec}s`);
    await this.tick(); // first tick seeds the baseline (no rows emitted)
    this.interval = setInterval(async () => {
      try {
        await this.tick();
      } catch (error) {
        console.error("Error in metrics scheduler:", error);
      }
    }, sec * 1000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
  }

  isActive() {
    return this.isRunning;
  }

  private async tick() {
    const url = getMetricsUrl();
    if (!url) return;

    let text: string;
    try {
      text = await fetchMetricsText(url);
      lastScrapeOk = true;
    } catch {
      lastScrapeOk = false;
      return; // unreachable is non-fatal
    }

    // Aggregate current cumulative values per router.
    const curReq = new Map<string, Map<string, number>>();
    const curDur = new Map<string, { sum: number; count: number }>();
    let routerLines = 0;
    for (const s of parseProm(text)) {
      const router = stripProvider(s.labels.router || "");
      if (!router) continue;
      if (s.name === REQ_TOTAL) {
        routerLines++;
        const code = s.labels.code || "0";
        let m = curReq.get(router);
        if (!m) {
          m = new Map();
          curReq.set(router, m);
        }
        m.set(code, (m.get(code) || 0) + s.value); // sum across method/protocol combos
      } else if (s.name === DUR_COUNT || s.name === DUR_SUM) {
        let d = curDur.get(router);
        if (!d) {
          d = { sum: 0, count: 0 };
          curDur.set(router, d);
        }
        if (s.name === DUR_COUNT) d.count += s.value;
        else d.sum += s.value;
      }
    }
    lastRouterLinesSeen = routerLines;
    if (routerLines === 0) return; // router labels not enabled in Traefik

    const routerMap = await buildRouterServiceMap();
    const now = new Date();
    const inserts: NewRouterMetricSample[] = [];

    const routers = new Set<string>([...curReq.keys(), ...curDur.keys()]);
    for (const router of routers) {
      const serviceId = routerMap.get(router);
      if (!serviceId) continue; // internal / unmatched router

      const cur = curReq.get(router) || new Map<string, number>();
      const curD = curDur.get(router) || { sum: 0, count: 0 };
      const prev = prevReq.get(router);
      const prevD = prevDur.get(router);

      // Update baselines to current before deciding whether to emit.
      prevReq.set(router, new Map(cur));
      prevDur.set(router, { ...curD });

      if (!prev) continue; // first observation — baseline only

      const delta: Record<StatusKey, number> = {
        req2xx: 0,
        req3xx: 0,
        req4xx: 0,
        req5xx: 0,
        reqOther: 0,
      };
      let any = false;
      for (const [code, val] of cur) {
        const d = Math.max(0, val - (prev.get(code) || 0)); // clamp resets
        if (d > 0) {
          delta[statusClass(code)] += d;
          any = true;
        }
      }
      const durCountDelta = prevD ? Math.max(0, curD.count - prevD.count) : 0;
      const durSumDelta = prevD ? Math.max(0, curD.sum - prevD.sum) : 0;
      if (durCountDelta > 0) any = true;
      if (!any) continue;

      inserts.push({
        ts: now,
        serviceId,
        router,
        req2xx: delta.req2xx,
        req3xx: delta.req3xx,
        req4xx: delta.req4xx,
        req5xx: delta.req5xx,
        reqOther: delta.reqOther,
        durSumMs: Math.round(durSumDelta * 1000),
        durCount: durCountDelta,
      });
    }

    if (inserts.length) await db.insert(routerMetricSamples).values(inserts);

    const cutoff = new Date(now.getTime() - retentionMinutes() * 60 * 1000);
    await db.delete(routerMetricSamples).where(lt(routerMetricSamples.ts, cutoff));
  }
}

export const metricsScheduler = new MetricsScheduler();

/* ── Read path (for /api/traefik/metrics) ─────────────────────────────────── */

export async function getMetricsSnapshot(): Promise<MetricsResponse> {
  const generatedAt = new Date().toISOString();
  if (!isMetricsConfigured()) {
    return { configured: false, available: false, window: WINDOW_SEC, generatedAt, services: {} };
  }

  const windowMs = WINDOW_SEC * 1000;
  const startMs = Date.now() - windowMs;
  const windowStart = new Date(startMs);
  const rows = await db
    .select()
    .from(routerMetricSamples)
    .where(gte(routerMetricSamples.ts, windowStart));

  const available = lastScrapeOk && (lastRouterLinesSeen > 0 || rows.length > 0);

  const byService = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.serviceId) continue;
    let arr = byService.get(r.serviceId);
    if (!arr) {
      arr = [];
      byService.set(r.serviceId, arr);
    }
    arr.push(r);
  }

  const interval = intervalSeconds();
  const bucketMs = windowMs / BARS;
  const out: Record<string, TrafficMetrics> = {};

  for (const [serviceId, samples] of byService) {
    const bucketReqs = new Array(BARS).fill(0);
    const bucketSecs = new Array(BARS).fill(0);
    let c2 = 0, c3 = 0, c4 = 0, c5 = 0, co = 0, durSum = 0, durCount = 0;

    for (const s of samples) {
      const total = s.req2xx + s.req3xx + s.req4xx + s.req5xx + s.reqOther;
      c2 += s.req2xx; c3 += s.req3xx; c4 += s.req4xx; c5 += s.req5xx; co += s.reqOther;
      durSum += s.durSumMs; durCount += s.durCount;
      let idx = Math.floor((new Date(s.ts).getTime() - startMs) / bucketMs);
      if (idx < 0) idx = 0;
      if (idx >= BARS) idx = BARS - 1;
      bucketReqs[idx] += total;
      bucketSecs[idx] += interval;
    }

    const bars = bucketReqs.map((reqs, i) =>
      bucketSecs[i] > 0 ? +(reqs / bucketSecs[i]).toFixed(2) : 0
    );
    const totalAll = c2 + c3 + c4 + c5 + co;
    out[serviceId] = {
      bars,
      reqPerSec: bars[BARS - 1],
      errorRate: totalAll > 0 ? (c4 + c5) / totalAll : 0,
      avgLatencyMs: durCount > 0 ? Math.round(durSum / durCount) : null,
      total1h: totalAll,
      statusClasses: { c2xx: c2, c3xx: c3, c4xx: c4, c5xx: c5, other: co },
    };
  }

  return { configured: true, available, window: WINDOW_SEC, generatedAt, services: out };
}
