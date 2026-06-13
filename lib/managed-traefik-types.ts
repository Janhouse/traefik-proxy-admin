/* Managed-Traefik static config model — client-safe (no server imports).
 *
 * In fully-managed mode (TRAEFIK_MANAGED=true) the admin panel owns
 * Traefik's STATIC configuration too: entrypoints and ACME certificate
 * resolvers live in the database and are served as a traefik.yml to the
 * bundled Traefik container, whose wrapper script restarts Traefik when the
 * config changes (static config cannot be hot-reloaded). */

export interface ManagedEntrypoint {
  name: string; // "web"
  port: number; // 80 → address ":80"
  /** Default TLS for every router on this entrypoint. */
  tls?: { enabled: boolean; certResolver?: string } | null;
  /** Emit http.redirections.entryPoint.{to,scheme:https} towards this entrypoint. */
  redirectToEntrypoint?: string | null;
}

export type AcmeChallenge = "tlsChallenge" | "httpChallenge" | "dnsChallenge";

export interface ManagedCertResolver {
  name: string; // "letsencrypt"
  email: string;
  challenge: AcmeChallenge;
  /** Required when challenge = httpChallenge — must name a managed entrypoint. */
  httpChallengeEntrypoint?: string;
  /** Required when challenge = dnsChallenge — Traefik DNS provider code
   * (credentials go on the Traefik container as env vars, never in the DB). */
  dnsProvider?: string;
  // ACME storage is fixed per resolver: /data/acme-<name>.json
}

export type ManagedLogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG";

export interface ManagedStaticConfig {
  entrypoints: ManagedEntrypoint[];
  certResolvers: ManagedCertResolver[];
  logLevel?: ManagedLogLevel;
}

export const DEFAULT_MANAGED_STATIC_CONFIG: ManagedStaticConfig = {
  entrypoints: [
    { name: "web", port: 80, redirectToEntrypoint: "websecure" },
    { name: "websecure", port: 443, tls: { enabled: true, certResolver: "letsencrypt" } },
  ],
  certResolvers: [{ name: "letsencrypt", email: "", challenge: "tlsChallenge" }],
  logLevel: "INFO",
};

/* ── API response shapes ──────────────────────────────────────────────────── */

export interface ManagedStaticStatus {
  /** Hash of the YAML built from the current DB config. */
  currentHash: string;
  /** Hash/timestamp of what the Traefik wrapper last fetched. */
  lastFetchedHash: string | null;
  lastFetchedAt: string | null;
  /** True while Traefik runs an older config than the DB holds. */
  pending: boolean;
}

export interface ManagedModeResponse {
  managed: boolean;
  /** ADMIN_PANEL_AUTH parses to at least one htpasswd user. */
  adminAuthConfigured: boolean;
  config: ManagedStaticConfig | null;
  /** Names of stored DNS-provider credentials. Values are write-only — they
   * are NEVER returned through the web; only the in-network wrapper reads them. */
  secretNames: string[];
  status: ManagedStaticStatus | null;
}

/* ── DNS-provider credentials (write-only secrets) ────────────────────────── */

/** A batch of credential changes from the UI. `upsert` sets/replaces values;
 * `remove` deletes by name. The UI never receives existing values, so an
 * untouched credential is simply absent from both lists. */
export interface ManagedSecretEdits {
  upsert: { name: string; value: string }[];
  remove: string[];
}

const ENV_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

/** Traefik/lego read provider credentials from env vars — names must be a
 * valid shell env identifier (e.g. CF_DNS_API_TOKEN). */
export function isValidEnvName(name: string): boolean {
  return ENV_NAME_RE.test(name);
}

/**
 * Apply a credential edit batch to the current secret map (pure). Removals
 * run first, then upserts, so re-adding a removed name in one batch keeps it.
 */
export function applySecretEdits(
  current: Record<string, string>,
  edits: ManagedSecretEdits
):
  | { ok: true; value: Record<string, string> }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const next = { ...current };
  for (const name of edits.remove ?? []) delete next[name];
  for (const { name, value } of edits.upsert ?? []) {
    if (!isValidEnvName(name)) {
      errors.push(
        `Invalid environment variable name "${name}" — use A–Z, 0–9 and underscore, starting with a letter.`
      );
      continue;
    }
    if (typeof value !== "string" || value.length === 0) {
      errors.push(`Credential "${name}" has no value.`);
      continue;
    }
    next[name] = value;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: next };
}

/* ── Validation (pure) ────────────────────────────────────────────────────── */

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const LOG_LEVELS: ManagedLogLevel[] = ["ERROR", "WARN", "INFO", "DEBUG"];
const CHALLENGES: AcmeChallenge[] = ["tlsChallenge", "httpChallenge", "dnsChallenge"];

function validateEntrypoints(
  eps: ManagedEntrypoint[],
  resolverNames: Set<string>,
  errors: string[]
): void {
  if (eps.length === 0) errors.push("At least one entrypoint is required.");
  const names = new Set<string>();
  const ports = new Set<number>();
  for (const ep of eps) {
    const label = ep.name || "(unnamed)";
    if (!NAME_RE.test(ep.name)) {
      errors.push(`Entrypoint "${label}": name must be alphanumeric (dashes/underscores allowed).`);
    }
    if (names.has(ep.name)) errors.push(`Duplicate entrypoint name "${ep.name}".`);
    names.add(ep.name);
    if (!Number.isInteger(ep.port) || ep.port < 1 || ep.port > 65535) {
      errors.push(`Entrypoint "${label}": port must be an integer between 1 and 65535.`);
    } else if (ports.has(ep.port)) {
      errors.push(`Entrypoint "${label}": port ${ep.port} is already used by another entrypoint.`);
    }
    ports.add(ep.port);
    if (ep.tls?.enabled && ep.tls.certResolver && !resolverNames.has(ep.tls.certResolver)) {
      errors.push(`Entrypoint "${label}": certificate resolver "${ep.tls.certResolver}" is not defined.`);
    }
  }
  for (const ep of eps) {
    if (!ep.redirectToEntrypoint) continue;
    if (ep.redirectToEntrypoint === ep.name) {
      errors.push(`Entrypoint "${ep.name}": cannot redirect to itself.`);
    } else if (!names.has(ep.redirectToEntrypoint)) {
      errors.push(`Entrypoint "${ep.name}": redirect target "${ep.redirectToEntrypoint}" is not defined.`);
    }
  }
}

function validateResolvers(
  resolvers: ManagedCertResolver[],
  entrypointNames: Set<string>,
  errors: string[]
): void {
  const names = new Set<string>();
  for (const r of resolvers) {
    const label = r.name || "(unnamed)";
    if (!NAME_RE.test(r.name)) {
      errors.push(`Resolver "${label}": name must be alphanumeric (dashes/underscores allowed).`);
    }
    if (names.has(r.name)) errors.push(`Duplicate resolver name "${r.name}".`);
    names.add(r.name);
    if (!r.email || !r.email.includes("@")) {
      errors.push(`Resolver "${label}": a valid ACME account email is required.`);
    }
    if (!CHALLENGES.includes(r.challenge)) {
      errors.push(`Resolver "${label}": unknown challenge type.`);
    }
    if (r.challenge === "httpChallenge" && !entrypointNames.has(r.httpChallengeEntrypoint || "")) {
      errors.push(`Resolver "${label}": httpChallenge needs an existing entrypoint (usually the :80 one).`);
    }
    if (r.challenge === "dnsChallenge" && !r.dnsProvider?.trim()) {
      errors.push(`Resolver "${label}": dnsChallenge needs a DNS provider code (e.g. cloudflare).`);
    }
  }
}

export function validateManagedStaticConfig(
  cfg: ManagedStaticConfig
): { ok: true; value: ManagedStaticConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(cfg.entrypoints) || !Array.isArray(cfg.certResolvers)) {
    return { ok: false, errors: ["entrypoints and certResolvers must be arrays."] };
  }
  validateEntrypoints(
    cfg.entrypoints,
    new Set(cfg.certResolvers.map((r) => r.name)),
    errors
  );
  validateResolvers(cfg.certResolvers, new Set(cfg.entrypoints.map((e) => e.name)), errors);
  if (cfg.logLevel !== undefined && !LOG_LEVELS.includes(cfg.logLevel)) {
    errors.push("logLevel must be one of ERROR, WARN, INFO, DEBUG.");
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: cfg };
}
