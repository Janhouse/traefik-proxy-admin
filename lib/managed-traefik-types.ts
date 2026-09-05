/* Managed-Traefik static config model — client-safe (no server imports).
 *
 * In fully-managed mode (TRAEFIK_MANAGED=true) the admin panel owns
 * Traefik's STATIC configuration too: entrypoints and ACME certificate
 * resolvers live in the database and are served as a traefik.yml to the
 * bundled Traefik container, whose wrapper script restarts Traefik when the
 * config changes (static config cannot be hot-reloaded). */

import { findDnsProvider } from "@/lib/dns-providers";

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
   * are NEVER returned through the web. The panel materialises them into an
   * env file on a tmpfs mount shared with the Traefik container. */
  secretNames: string[];
  /** State of that materialised env file (managed mode only). */
  secretsEnv?: {
    materialized: boolean;
    writtenAt: string | null;
    /** The file on the mount does not match the stored credentials (or is
     * missing) — the wrapper has nothing new to pick up yet. */
    stale: boolean;
  };
  /** True when the encrypted credential file exists but cannot be decrypted
   * with the current MANAGED_SECRETS_KEY (key rotated / file corrupt). The
   * stored values are lost; PUT /secrets with `reset: true` starts over. */
  secretsUndecryptable?: boolean;
  status: ManagedStaticStatus | null;
}

/* ── DNS-provider credentials (write-only secrets) ────────────────────────── */

/** A batch of credential changes from the UI. `upsert` sets/replaces values;
 * `remove` deletes by name. The UI never receives existing values, so an
 * untouched credential is simply absent from both lists. */
export interface ManagedSecretEdits {
  upsert: { name: string; value: string }[];
  remove: string[];
  /** Discard an undecryptable credential file (after a MANAGED_SECRETS_KEY
   * rotation) and apply the edits to an empty map. Ignored when the file is
   * readable. */
  reset?: boolean;
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
  const remove = Array.isArray(edits.remove) ? edits.remove : [];
  const upsert = Array.isArray(edits.upsert) ? edits.upsert : [];
  for (const name of remove) {
    if (typeof name === "string") delete next[name];
  }
  for (const entry of upsert) {
    if (!isRecord(entry)) {
      errors.push("Each credential must be an object with name and value.");
      continue;
    }
    const { name, value } = entry as { name: unknown; value: unknown };
    if (typeof name !== "string" || !isValidEnvName(name)) {
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
/** Pragmatic ACME account email check: one "@", no whitespace, dotted host. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** lego DNS provider codes are lowercase alphanumerics ("cloudflare",
 * "route53", "gandiv5") — the shape accepted for the "Other (custom)" path. */
const DNS_PROVIDER_CODE_RE = /^[a-z][a-z0-9]*$/;
const LOG_LEVELS: ManagedLogLevel[] = ["ERROR", "WARN", "INFO", "DEBUG"];
const CHALLENGES: AcmeChallenge[] = ["tlsChallenge", "httpChallenge", "dnsChallenge"];

const TOP_LEVEL_KEYS = new Set(["entrypoints", "certResolvers", "logLevel"]);
const ENTRYPOINT_KEYS = new Set(["name", "port", "tls", "redirectToEntrypoint"]);
const TLS_KEYS = new Set(["enabled", "certResolver"]);
const RESOLVER_KEYS = new Set([
  "name",
  "email",
  "challenge",
  "httpChallengeEntrypoint",
  "dnsProvider",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Unknown keys are rejected (never persisted verbatim) rather than dropped,
 * so a client/server schema mismatch is loud instead of silently lossy. */
function rejectUnknownKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
  errors: string[]
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) errors.push(`${label}: unknown field "${key}".`);
  }
}

function optionalString(v: unknown): string | undefined {
  // "" from a cleared UI field means "unset"
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Type-check + canonicalise one entrypoint; pushes errors, returns the
 * cleaned shape (only known fields) or null when unusable. */
function parseEntrypoint(
  raw: unknown,
  index: number,
  errors: string[]
): ManagedEntrypoint | null {
  const label = `Entrypoint #${index + 1}`;
  if (!isRecord(raw)) {
    errors.push(`${label}: must be an object.`);
    return null;
  }
  rejectUnknownKeys(raw, ENTRYPOINT_KEYS, label, errors);
  const name = typeof raw.name === "string" ? raw.name : "";
  if (typeof raw.name !== "string") errors.push(`${label}: name must be a string.`);
  const port = typeof raw.port === "number" ? raw.port : NaN;
  if (typeof raw.port !== "number") errors.push(`${label}: port must be a number.`);

  const ep: ManagedEntrypoint = { name, port };

  if (raw.redirectToEntrypoint !== undefined && raw.redirectToEntrypoint !== null) {
    if (typeof raw.redirectToEntrypoint !== "string") {
      errors.push(`${label}: redirectToEntrypoint must be a string.`);
    } else if (raw.redirectToEntrypoint) {
      ep.redirectToEntrypoint = raw.redirectToEntrypoint;
    }
  }

  if (raw.tls !== undefined && raw.tls !== null) {
    if (!isRecord(raw.tls)) {
      errors.push(`${label}: tls must be an object.`);
    } else {
      rejectUnknownKeys(raw.tls, TLS_KEYS, `${label} tls`, errors);
      if (typeof raw.tls.enabled !== "boolean") {
        errors.push(`${label}: tls.enabled must be a boolean.`);
      }
      if (raw.tls.certResolver !== undefined && typeof raw.tls.certResolver !== "string") {
        errors.push(`${label}: tls.certResolver must be a string.`);
      }
      if (raw.tls.enabled === true) {
        const certResolver = optionalString(raw.tls.certResolver);
        ep.tls = certResolver ? { enabled: true, certResolver } : { enabled: true };
      }
    }
  }
  return ep;
}

function parseResolver(
  raw: unknown,
  index: number,
  errors: string[]
): ManagedCertResolver | null {
  const label = `Resolver #${index + 1}`;
  if (!isRecord(raw)) {
    errors.push(`${label}: must be an object.`);
    return null;
  }
  rejectUnknownKeys(raw, RESOLVER_KEYS, label, errors);
  for (const key of ["name", "email", "challenge"] as const) {
    if (typeof raw[key] !== "string") errors.push(`${label}: ${key} must be a string.`);
  }
  for (const key of ["httpChallengeEntrypoint", "dnsProvider"] as const) {
    if (raw[key] !== undefined && raw[key] !== null && typeof raw[key] !== "string") {
      errors.push(`${label}: ${key} must be a string.`);
    }
  }
  const r: ManagedCertResolver = {
    name: typeof raw.name === "string" ? raw.name : "",
    email: typeof raw.email === "string" ? raw.email.trim() : "",
    challenge: raw.challenge as AcmeChallenge,
  };
  if (r.challenge === "httpChallenge") {
    const ep = optionalString(raw.httpChallengeEntrypoint);
    if (ep) r.httpChallengeEntrypoint = ep;
  }
  if (r.challenge === "dnsChallenge") {
    // Keep "" (UI's "Other" picked, code not typed yet) so the error is specific.
    if (typeof raw.dnsProvider === "string") r.dnsProvider = raw.dnsProvider.trim();
  }
  return r;
}

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
    if (typeof ep.name !== "string" || !NAME_RE.test(ep.name)) {
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
    if (typeof r.name !== "string" || !NAME_RE.test(r.name)) {
      errors.push(`Resolver "${label}": name must be alphanumeric (dashes/underscores allowed).`);
    }
    if (names.has(r.name)) errors.push(`Duplicate resolver name "${r.name}".`);
    names.add(r.name);
    if (!r.email || !EMAIL_RE.test(r.email)) {
      errors.push(`Resolver "${label}": a valid ACME account email is required.`);
    }
    if (!CHALLENGES.includes(r.challenge)) {
      errors.push(`Resolver "${label}": unknown challenge type.`);
    }
    if (r.challenge === "httpChallenge" && !entrypointNames.has(r.httpChallengeEntrypoint || "")) {
      errors.push(`Resolver "${label}": httpChallenge needs an existing entrypoint (usually the :80 one).`);
    }
    if (r.challenge === "dnsChallenge") {
      const code = r.dnsProvider ?? "";
      if (!code) {
        errors.push(`Resolver "${label}": dnsChallenge needs a DNS provider code (e.g. cloudflare).`);
      } else if (!findDnsProvider(code) && !DNS_PROVIDER_CODE_RE.test(code)) {
        errors.push(
          `Resolver "${label}": "${code}" is not a valid DNS provider code — pick one from the list or enter a lego provider code (lowercase letters and digits).`
        );
      }
    }
  }
}

/**
 * Validate an untrusted (request-body) static config. Type-checks every
 * field, rejects unknown fields, and on success returns a CANONICAL copy
 * containing only known fields — the caller must persist `value`, never the
 * input.
 */
export function validateManagedStaticConfig(
  cfg: unknown
): { ok: true; value: ManagedStaticConfig } | { ok: false; errors: string[] } {
  if (!isRecord(cfg)) return { ok: false, errors: ["Config must be an object."] };
  if (!Array.isArray(cfg.entrypoints) || !Array.isArray(cfg.certResolvers)) {
    return { ok: false, errors: ["entrypoints and certResolvers must be arrays."] };
  }
  const errors: string[] = [];
  rejectUnknownKeys(cfg, TOP_LEVEL_KEYS, "Config", errors);

  const entrypoints = cfg.entrypoints
    .map((raw, i) => parseEntrypoint(raw, i, errors))
    .filter((e): e is ManagedEntrypoint => e !== null);
  const certResolvers = cfg.certResolvers
    .map((raw, i) => parseResolver(raw, i, errors))
    .filter((r): r is ManagedCertResolver => r !== null);
  if (errors.length) return { ok: false, errors };

  validateEntrypoints(entrypoints, new Set(certResolvers.map((r) => r.name)), errors);
  validateResolvers(certResolvers, new Set(entrypoints.map((e) => e.name)), errors);
  if (certResolvers.length > 0 && !entrypoints.some((e) => e.tls?.enabled)) {
    errors.push(
      "A certificate resolver is defined but no entrypoint has TLS enabled — enable TLS on an entrypoint (usually :443) or remove the resolver."
    );
  }

  const value: ManagedStaticConfig = { entrypoints, certResolvers };
  if (cfg.logLevel !== undefined) {
    if (!LOG_LEVELS.includes(cfg.logLevel as ManagedLogLevel)) {
      errors.push("logLevel must be one of ERROR, WARN, INFO, DEBUG.");
    } else {
      value.logLevel = cfg.logLevel as ManagedLogLevel;
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
