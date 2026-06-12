/* Client-safe response shapes for the Traefik integration endpoints.
 * (No server-only imports — safe to use in client components/hooks.) */

export type BackendHealthState = "up" | "down" | "unknown" | "na";

export interface ServiceHealth {
  state: BackendHealthState;
  up: number;
  total: number;
  source: "traefik" | "probe" | "none";
}

export interface BackendHealthResponse {
  configured: boolean;
  reachable: boolean;
  checkedAt: string;
  services: Record<string, ServiceHealth>;
}

export interface TraefikEntrypointInfo {
  name: string;
  address: string;
}

export interface EntrypointsResponse {
  configured: boolean;
  reachable: boolean;
  entrypoints: TraefikEntrypointInfo[];
}

export interface TraefikMiddlewareInfo {
  name: string;
  type: string;
  provider: string;
  status?: string;
}

export interface MiddlewaresResponse {
  configured: boolean;
  reachable: boolean;
  middlewares: TraefikMiddlewareInfo[];
}

/* ── Certificate resolvers (inferred — Traefik has no resolver API) ───────── */

export interface CertResolverInfo {
  name: string;
  /** Where the name was seen: the managed static config, a router's
   * tls.certResolver, or an entrypoint's default http.tls.certResolver. */
  source: "managed" | "router" | "entrypoint";
}

export interface CertResolversResponse {
  configured: boolean;
  reachable: boolean;
  resolvers: CertResolverInfo[];
}

/* ── Runtime explorer ─────────────────────────────────────────────────────── */

export interface RuntimeRouter {
  name: string;
  rule: string;
  entryPoints: string[];
  service: string;
  middlewares: string[];
  provider: string;
  status: string;
  health: BackendHealthState;
}

export interface RuntimeHttpService {
  name: string;
  type: string;
  servers: string[];
  up: number;
  total: number;
  provider: string;
  health: BackendHealthState;
}

export interface RuntimeMiddleware {
  name: string;
  type: string;
  provider: string;
  usedBy: string[];
}

export interface RuntimeTcpRouter {
  name: string;
  rule: string;
  entryPoints: string[];
  service: string;
  tls: string;
  provider: string;
}

export interface RuntimeTcpService {
  name: string;
  servers: string[];
  provider: string;
}

export interface RuntimeUdpRouter {
  name: string;
  entryPoints: string[];
  service: string;
  provider: string;
  status: string;
}

export interface RuntimeUdpService {
  name: string;
  servers: string[];
  provider: string;
}

export interface RuntimePlugin {
  name: string;
  type: string;
  provider: string;
}

/* ── Request-traffic metrics (self-scraped from Traefik /metrics) ─────────── */

export interface TrafficMetrics {
  /** req/s per bucket, exactly 24 buckets over the last hour. */
  bars: number[];
  /** req/s in the most recent bucket. */
  reqPerSec: number;
  /** 0..1 — (4xx+5xx)/total over the window. */
  errorRate: number;
  avgLatencyMs: number | null;
  total1h: number;
  statusClasses: {
    c2xx: number;
    c3xx: number;
    c4xx: number;
    c5xx: number;
    other: number;
  };
}

export interface MetricsResponse {
  configured: boolean;
  available: boolean;
  window: number; // seconds
  generatedAt: string;
  services: Record<string, TrafficMetrics>; // keyed by admin service id
}

/* ── Route collision detection ────────────────────────────────────────────── */

export interface RouteConflictRouter {
  routerName: string; // e.g. "grafana@file"
  hosts: string[]; // Host() tokens parsed from the rule
  entryPoints: string[];
  provider: string;
  managedServiceId: string | null; // our service id if this router is ours
  internal?: boolean; // true for this tool's own cert-trigger routers
}

export interface RouteConflictsResponse {
  configured: boolean;
  reachable: boolean;
  routers: RouteConflictRouter[];
}

export interface RuntimeResponse {
  configured: boolean;
  reachable: boolean;
  error?: string;
  syncedAt: string;
  version?: { version?: string; codename?: string };
  counts: {
    httpRouters: number;
    httpServices: number;
    middlewares: number;
    tcpRouters: number;
    tcpServices: number;
    tcpMiddlewares: number;
    udpRouters: number;
    udpServices: number;
    plugins: number;
    certificates: number; // from /api/overview (Traefik v3.7+); 0 otherwise
  };
  httpRouters: RuntimeRouter[];
  httpServices: RuntimeHttpService[];
  middlewares: RuntimeMiddleware[];
  tcpRouters: RuntimeTcpRouter[];
  tcpServices: RuntimeTcpService[];
  tcpMiddlewares: RuntimeMiddleware[];
  udpRouters: RuntimeUdpRouter[];
  udpServices: RuntimeUdpService[];
  plugins: RuntimePlugin[];
  entrypoints: TraefikEntrypointInfo[];
}

/* ── TLS certificates (from Traefik's /api/certificates, v3.7+) ────────────── */

export interface RuntimeCertificate {
  name: string; // SHA-256 fingerprint (the {certificateID})
  commonName: string;
  sans: string[];
  issuer: string; // issuerOrg, falling back to issuerCN
  serialNumber: string;
  notBefore: string; // ISO
  notAfter: string; // ISO
  daysRemaining: number;
  keyType: string;
  keySize: number;
  signatureAlgorithm: string;
  status: string; // "enabled" | "warning" | "expired"
}

export interface CertificatesResponse {
  configured: boolean;
  reachable: boolean;
  supported: boolean; // false when Traefik predates /api/certificates (< v3.7)
  error?: string;
  certificates: RuntimeCertificate[];
}
