import "server-only";
import net from "node:net";

/* ─────────────────────────────────────────────────────────────────────────
 * Traefik API client.
 *
 * Reads the Traefik API base URL from the TRAEFIK_API_URL env var
 * (e.g. http://localhost:8080 in dev, http://traefik:8080 in compose).
 * The Traefik API must be enabled (`--api.insecure=true` exposes it on :8080,
 * or route it through an authenticated entrypoint and point this at it).
 *
 * Everything degrades gracefully: when the env var is unset or Traefik is
 * unreachable, callers get `configured: false` / `reachable: false` and the
 * UI shows clear "not configured / unreachable" states instead of crashing.
 * ───────────────────────────────────────────────────────────────────────── */

const TIMEOUT_MS = 4000;

export function getTraefikApiUrl(): string | null {
  const raw = process.env.TRAEFIK_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function isTraefikApiConfigured(): boolean {
  return getTraefikApiUrl() !== null;
}

class TraefikApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "TraefikApiError";
  }
}

interface TraefikFetchResult<T> {
  body: T;
  headers: Headers;
}

/**
 * One GET against the Traefik API. The abort timeout covers the whole
 * exchange including the body read (`res.json()` runs inside the try).
 */
async function traefikFetchRaw<T>(
  path: string
): Promise<TraefikFetchResult<T>> {
  const base = getTraefikApiUrl();
  if (!base) throw new TraefikApiError("TRAEFIK_API_URL is not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new TraefikApiError(
        `Traefik API ${path} responded ${res.status}`,
        res.status
      );
    }
    return { body: (await res.json()) as T, headers: res.headers };
  } catch (err) {
    if (err instanceof TraefikApiError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new TraefikApiError(`Failed to reach Traefik API ${path}: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

async function traefikFetch<T>(path: string): Promise<T> {
  return (await traefikFetchRaw<T>(path)).body;
}

const LIST_PER_PAGE = 500;
const LIST_MAX_PAGES = 50;

/**
 * Fetch every page of a Traefik list endpoint. Traefik paginates all of its
 * list routes (routers/services/middlewares/entrypoints/certificates) and
 * signals a further page through the `X-Next-Page` header; we stop when it is
 * absent, "1", or not greater than the current page, with a hard page cap so
 * a misbehaving header can never loop forever.
 */
export async function traefikFetchAll<T>(path: string): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  const all: T[] = [];
  let page = 1;
  for (let guard = 0; guard < LIST_MAX_PAGES; guard++) {
    const { body, headers } = await traefikFetchRaw<T[]>(
      `${path}${sep}page=${page}&per_page=${LIST_PER_PAGE}`
    );
    if (Array.isArray(body)) all.push(...body);
    const nextRaw = headers.get("X-Next-Page");
    if (!nextRaw) break;
    const next = Number(nextRaw);
    if (!Number.isFinite(next) || next <= 1 || next <= page) break;
    page = next;
  }
  return all;
}

/* ── Types (subset of the Traefik v3 API surface) ─────────────────────────── */

export interface TraefikEntryPoint {
  name: string;
  address: string;
  /** Static-config `entryPoints.<name>.http.tls` — when set, every router on
   * this entrypoint is TLS by default (used for per-entrypoint TLS detection). */
  http?: { tls?: Record<string, unknown> | null };
}

export interface TraefikHttpRouter {
  name: string;
  rule?: string;
  service?: string;
  status?: string; // "enabled" | "disabled" | "warning"
  entryPoints?: string[];
  middlewares?: string[];
  provider?: string;
  priority?: number;
  tls?: Record<string, unknown> | null;
}

export interface TraefikHttpService {
  name: string;
  type?: string; // loadbalancer | weighted | mirroring | failover | internal …
  status?: string;
  provider?: string;
  loadBalancer?: {
    servers?: Array<{ url?: string; address?: string }>;
    passHostHeader?: boolean;
    /** Present when the service has an active health check configured — only
     * then is Traefik's serverStatus "UP" a real liveness signal. */
    healthCheck?: Record<string, unknown> | null;
  };
  serverStatus?: Record<string, string>; // server url -> "UP" | "DOWN"
  usedBy?: string[];
}

export interface TraefikMiddleware {
  name: string;
  type?: string;
  status?: string;
  provider?: string;
  usedBy?: string[];
  plugin?: Record<string, unknown>;
}

export interface TraefikTcpRouter {
  name: string;
  rule?: string;
  service?: string;
  status?: string;
  entryPoints?: string[];
  provider?: string;
  tls?: { passthrough?: boolean } | null;
}

export interface TraefikTcpService {
  name: string;
  type?: string;
  status?: string;
  provider?: string;
  loadBalancer?: { servers?: Array<{ address?: string }> };
}

export interface TraefikUdpRouter {
  name: string;
  service?: string;
  status?: string;
  entryPoints?: string[];
  provider?: string;
}

export interface TraefikUdpService {
  name: string;
  type?: string;
  status?: string;
  provider?: string;
  loadBalancer?: { servers?: Array<{ address?: string }> };
}

export interface TraefikVersion {
  Version?: string;
  Codename?: string;
  startDate?: string;
}

export interface TraefikOverviewSection {
  total: number;
  warnings: number;
  errors: number;
}

export interface TraefikOverview {
  http?: {
    routers?: TraefikOverviewSection;
    services?: TraefikOverviewSection;
    middlewares?: TraefikOverviewSection;
  };
  tcp?: {
    routers?: TraefikOverviewSection;
    services?: TraefikOverviewSection;
    middlewares?: TraefikOverviewSection;
  };
  udp?: {
    routers?: TraefikOverviewSection;
    services?: TraefikOverviewSection;
  };
  certificates?: TraefikOverviewSection; // Traefik v3.7+
  features?: { tracing?: string; metrics?: string; accessLog?: boolean };
  providers?: string[];
}

/** /api/certificates entry (Traefik v3.7+). */
export interface TraefikCertificate {
  name: string; // SHA-256 fingerprint — also the {certificateID} path param
  sans: string[];
  notAfter: string;
  notBefore: string;
  serialNumber: string;
  commonName: string;
  issuerOrg?: string;
  issuerCN?: string;
  issuerCountry?: string;
  organization?: string;
  country?: string;
  version: string;
  keyType: string;
  keySize?: number;
  signatureAlgorithm: string;
  certFingerprint: string;
  publicKeyFingerprint: string;
  status: string; // "enabled" | "warning" | "expired"
}

/* ── Endpoint wrappers ────────────────────────────────────────────────────── */

export const getEntrypoints = () =>
  traefikFetchAll<TraefikEntryPoint>("/api/entrypoints");
export const getHttpRouters = () =>
  traefikFetchAll<TraefikHttpRouter>("/api/http/routers");
export const getHttpServices = () =>
  traefikFetchAll<TraefikHttpService>("/api/http/services");
export const getHttpMiddlewares = () =>
  traefikFetchAll<TraefikMiddleware>("/api/http/middlewares");
export const getTcpRouters = () =>
  traefikFetchAll<TraefikTcpRouter>("/api/tcp/routers");
export const getTcpServices = () =>
  traefikFetchAll<TraefikTcpService>("/api/tcp/services");
export const getTcpMiddlewares = () =>
  traefikFetchAll<TraefikMiddleware>("/api/tcp/middlewares");
export const getUdpRouters = () =>
  traefikFetchAll<TraefikUdpRouter>("/api/udp/routers");
export const getUdpServices = () =>
  traefikFetchAll<TraefikUdpService>("/api/udp/services");
export const getVersion = () => traefikFetch<TraefikVersion>("/api/version");
export const getOverview = () => traefikFetch<TraefikOverview>("/api/overview");

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Normalize a backend server URL for matching (lowercase, no trailing slash). */
export function normalizeServerUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

/** Provider source for a Traefik object (`@file` → "file", etc.). */
export function providerOf(obj: { provider?: string; name?: string }): string {
  if (obj.provider) return obj.provider.toLowerCase();
  const at = obj.name?.split("@")[1];
  return (at || "internal").toLowerCase();
}

/** Build serverURL -> "UP"/"DOWN" index across all HTTP services. */
export function indexServerStatus(
  services: TraefikHttpService[]
): Map<string, string> {
  const index = new Map<string, string>();
  for (const svc of services) {
    if (!svc.serverStatus) continue;
    for (const [url, status] of Object.entries(svc.serverStatus)) {
      index.set(normalizeServerUrl(url), status.toUpperCase());
    }
  }
  return index;
}

/**
 * Active TCP reachability probe — used as a fallback when Traefik has no
 * serverStatus for a target (i.e. no health check configured on the service).
 */
export function probeTcp(
  host: string,
  port: number,
  timeoutMs = 2500
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    try {
      socket.connect(port, host);
    } catch {
      done(false);
    }
  });
}

/**
 * List Traefik's TLS-store certificates via /api/certificates (Traefik v3.7+),
 * paging through results with the X-Next-Page header. Throws a TraefikApiError
 * with status 404 on older Traefik that lacks the route.
 */
export const getCertificates = () =>
  traefikFetchAll<TraefikCertificate>("/api/certificates");
