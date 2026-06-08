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

async function traefikFetch<T>(path: string): Promise<T> {
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
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof TraefikApiError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new TraefikApiError(`Failed to reach Traefik API ${path}: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

/* ── Types (subset of the Traefik v3 API surface) ─────────────────────────── */

export interface TraefikEntryPoint {
  name: string;
  address: string;
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
  traefikFetch<TraefikEntryPoint[]>("/api/entrypoints");
export const getHttpRouters = () =>
  traefikFetch<TraefikHttpRouter[]>("/api/http/routers");
export const getHttpServices = () =>
  traefikFetch<TraefikHttpService[]>("/api/http/services");
export const getHttpMiddlewares = () =>
  traefikFetch<TraefikMiddleware[]>("/api/http/middlewares");
export const getTcpRouters = () =>
  traefikFetch<TraefikTcpRouter[]>("/api/tcp/routers");
export const getTcpServices = () =>
  traefikFetch<TraefikTcpService[]>("/api/tcp/services");
export const getTcpMiddlewares = () =>
  traefikFetch<TraefikMiddleware[]>("/api/tcp/middlewares");
export const getUdpRouters = () =>
  traefikFetch<TraefikUdpRouter[]>("/api/udp/routers");
export const getUdpServices = () =>
  traefikFetch<TraefikUdpService[]>("/api/udp/services");
export const getVersion = () => traefikFetch<TraefikVersion>("/api/version");

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
export async function getCertificates(): Promise<TraefikCertificate[]> {
  const base = getTraefikApiUrl();
  if (!base) throw new TraefikApiError("TRAEFIK_API_URL is not configured");

  const all: TraefikCertificate[] = [];
  let page = 1;
  for (let guard = 0; guard < 100; guard++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${base}/api/certificates?page=${page}&per_page=100`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new TraefikApiError(
        `Failed to reach Traefik API /api/certificates: ${reason}`
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new TraefikApiError(
        `Traefik API /api/certificates responded ${res.status}`,
        res.status
      );
    }
    const items = (await res.json()) as TraefikCertificate[];
    all.push(...items);
    const next = Number(res.headers.get("X-Next-Page") || "0");
    if (!Number.isFinite(next) || next <= page) break;
    page = next;
  }
  return all;
}
