import "server-only";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, domains, services, type Service } from "@/lib/db";
import { getGlobalConfig } from "@/lib/app-config";
import { hostsInTree, parseMatchRules, type DomainResolver } from "@/lib/route-rule";
import {
  SCOPE_CUSTOM_HOSTNAME,
  SCOPE_SHARES_READ,
  SCOPE_SHARES_WRITE,
  SHARE_AUTH_MODES,
  SHARE_LABEL_KEYS,
  type ApiTokenScope,
  type ShareAuthMode,
  type ShareLabels,
} from "./constants";
import { HOSTNAME_RE, LABEL_RE, zoneForHostname } from "./settings-schema";
import { getHarnessSettings } from "./settings";
import type { TokenPrincipal } from "./tokens";

/*
 * The ONLY code path through which the token API and the MCP touch services.
 *
 * Security invariant: every read, update and delete here is filtered by
 * `services.owner_tag = principal.ownerTag`. Admin-created services have a
 * null owner tag and are therefore invisible — a token can neither list, read,
 * change nor delete them, and "not yours" is indistinguishable from "does not
 * exist" (both 404).
 */

/* ── Errors ─────────────────────────────────────────────────────────────────── */

type HarnessErrorCode =
  | "invalid_request"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "not_configured";

const STATUS: Record<HarnessErrorCode, number> = {
  invalid_request: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  not_configured: 422,
};

export class HarnessError extends Error {
  readonly status: number;
  constructor(
    readonly code: HarnessErrorCode,
    message: string,
    readonly issues?: Array<{ path: string; message: string }>
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

function invalid(error: z.ZodError): HarnessError {
  return new HarnessError(
    "invalid_request",
    "Invalid request",
    error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
  );
}

function requireScope(principal: TokenPrincipal, scope: ApiTokenScope): void {
  if (!principal.scopes.includes(scope)) {
    throw new HarnessError("forbidden", `Token lacks the ${scope} scope`);
  }
}

/* ── Input schemas (shared by REST and MCP) ─────────────────────────────────── */

const labelValue = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[\x20-\x7e]+$/, "printable ASCII only");

const shareLabelsSchema = z
  .object(Object.fromEntries(SHARE_LABEL_KEYS.map((k) => [k, labelValue.optional()])) as Record<
    (typeof SHARE_LABEL_KEYS)[number],
    z.ZodOptional<typeof labelValue>
  >)
  .strict();

const isoDateTime = z.iso.datetime({ offset: true });

const createShareSchema = z
  .object({
    hostname: z
      .string()
      .trim()
      .toLowerCase()
      .transform((h) => h.replace(/\.$/, ""))
      .pipe(z.string().regex(HOSTNAME_RE, "must be a hostname")),
    targetUrl: z.string().trim().min(1).max(2048),
    authMode: z.enum(SHARE_AUTH_MODES),
    expiresAt: isoDateTime.nullable().optional(),
    insecureSkipVerify: z.boolean().optional(),
    labels: shareLabelsSchema.optional(),
  })
  .strict();

const updateShareSchema = z
  .object({ expiresAt: isoDateTime.nullable() })
  .strict();

const listSharesSchema = shareLabelsSchema;

const shareIdSchema = z.guid();

/* ── View ───────────────────────────────────────────────────────────────────── */

interface ShareView {
  id: string;
  hostname: string;
  url: string;
  targetUrl: string;
  authMode: ShareAuthMode;
  expiresAt: string | null;
  labels: ShareLabels;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function toView(row: Service): ShareView {
  const hostname = row.shareHostname ?? "";
  return {
    id: row.id,
    hostname,
    url: `https://${hostname}`,
    targetUrl: `${row.isHttps ? "https" : "http"}://${row.targetIp}:${row.targetPort}`,
    authMode: (row.shareAuthMode ?? "network") as ShareAuthMode,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    labels: (row.ownerLabels ?? {}) as ShareLabels,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

/** The ownership predicate. Every query below goes through it. */
function owned(principal: TokenPrincipal, ...extra: SQL[]): SQL {
  return and(eq(services.ownerTag, principal.ownerTag), ...extra)!;
}

/** Parse and restrict the upstream URL to scheme://host[:port][/]. */
function parseTargetUrl(raw: string): { host: string; port: number; https: boolean } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HarnessError("invalid_request", "targetUrl is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HarnessError("invalid_request", "targetUrl must be http:// or https://");
  }
  if (url.username || url.password) {
    throw new HarnessError("invalid_request", "targetUrl must not contain credentials");
  }
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    throw new HarnessError(
      "invalid_request",
      "targetUrl must not contain a path, query or fragment (Traefik proxies the request path as-is)"
    );
  }
  if (!url.hostname || url.hostname.length > 255) {
    throw new HarnessError("invalid_request", "targetUrl host is invalid");
  }
  const https = url.protocol === "https:";
  const port = url.port ? Number(url.port) : https ? 443 : 80;
  return { host: url.hostname, port, https };
}

function parseFutureDate(iso: string | null | undefined, now: Date): Date | null {
  if (iso === null || iso === undefined) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new HarnessError("invalid_request", "expiresAt is not a valid date");
  }
  if (date.getTime() <= now.getTime()) {
    throw new HarnessError("invalid_request", "expiresAt must be in the future");
  }
  return date;
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Is `hostname` already claimed by ANY service (admin-created or not)? Only a
 * boolean leaves this function — callers learn nothing about the other entry.
 */
async function hostnameInUse(hostname: string): Promise<boolean> {
  const rows = await db
    .select({ service: services, domain: domains })
    .from(services)
    .leftJoin(domains, eq(services.domainId, domains.id));
  const allDomains = await db.select({ id: domains.id, domain: domains.domain }).from(domains);
  const byId = new Map(allDomains.map((d) => [d.id, d.domain]));
  const resolve: DomainResolver = (id) => byId.get(id) ?? null;

  for (const { service, domain } of rows) {
    const hosts = new Set<string>();
    if (service.shareHostname) hosts.add(service.shareHostname);
    if (domain) {
      if (service.hostnameMode === "subdomain" && service.subdomain) {
        hosts.add(`${service.subdomain}.${domain.domain}`);
      } else if (service.hostnameMode === "apex") {
        hosts.add(domain.domain);
      }
    }
    for (const h of parseJsonArray(service.customHostnames)) hosts.add(h);
    for (const h of hostsInTree(parseMatchRules(service.matchRules), resolve)) hosts.add(h);
    for (const h of hosts) {
      if (h.toLowerCase() === hostname) return true;
    }
  }

  const adminHost = (await getGlobalConfig()).adminPanelDomain.replace(/:\d+$/, "").toLowerCase();
  return adminHost === hostname;
}

function isUniqueViolation(error: unknown): boolean {
  // node-postgres and PGlite both surface SQLSTATE as `code` (possibly on `cause`).
  for (let e: unknown = error, i = 0; e && i < 4; e = (e as { cause?: unknown }).cause, i++) {
    if ((e as { code?: string }).code === "23505") return true;
  }
  return false;
}

/* ── Operations ─────────────────────────────────────────────────────────────── */

export async function createShare(
  principal: TokenPrincipal,
  input: unknown,
  now: Date = new Date()
): Promise<ShareView> {
  requireScope(principal, SCOPE_SHARES_WRITE);
  const parsed = createShareSchema.safeParse(input);
  if (!parsed.success) throw invalid(parsed.error);
  const data = parsed.data;

  const settings = await getHarnessSettings();
  const zone = zoneForHostname(settings, data.hostname);
  if (!zone) {
    throw new HarnessError(
      "invalid_request",
      `hostname must be <label>.<suffix> with suffix one of: ${settings.zones
        .map((z) => z.suffix)
        .join(", ") || "(none configured)"}`
    );
  }

  const labelPart = data.hostname.slice(0, -(zone.suffix.length + 1));
  const labels = labelPart.split(".");
  if (!labels.every((l) => LABEL_RE.test(l))) {
    throw new HarnessError("invalid_request", "hostname contains an invalid label");
  }
  if (labels.length > 1 && !principal.scopes.includes(SCOPE_CUSTOM_HOSTNAME)) {
    throw new HarnessError(
      "forbidden",
      `hostname must be a single label under ${zone.suffix} (multi-label names need the ${SCOPE_CUSTOM_HOSTNAME} scope)`
    );
  }

  if (!zone.authModes.includes(data.authMode)) {
    throw new HarnessError(
      "invalid_request",
      `authMode ${data.authMode} is not allowed under ${zone.suffix} (allowed: ${zone.authModes.join(", ")})`
    );
  }

  const expiresAt = parseFutureDate(data.expiresAt, now);
  if (data.authMode === "public" && !expiresAt) {
    throw new HarnessError("invalid_request", "public shares require expiresAt");
  }

  const middlewares = [...zone.middlewares];
  if (data.authMode === "only-me") {
    if (settings.onlyMeMiddlewares.length === 0) {
      throw new HarnessError(
        "not_configured",
        "only-me is not configured (no only-me middleware set in the panel)"
      );
    }
    middlewares.push(...settings.onlyMeMiddlewares);
  }

  const [domain] = await db.select().from(domains).where(eq(domains.domain, zone.suffix));
  if (!domain) {
    throw new HarnessError(
      "not_configured",
      `suffix ${zone.suffix} has no domain configured in the panel`
    );
  }

  const target = parseTargetUrl(data.targetUrl);

  if (await hostnameInUse(data.hostname)) {
    throw new HarnessError("conflict", "hostname is already in use");
  }

  const single = labels.length === 1;
  try {
    const [row] = await db
      .insert(services)
      .values({
        name: data.hostname,
        hostnameMode: single ? "subdomain" : "custom",
        subdomain: single ? labelPart : null,
        customHostnames: single ? null : JSON.stringify([data.hostname]),
        domainId: domain.id,
        targetIp: target.host,
        targetPort: target.port,
        isHttps: target.https,
        insecureSkipVerify: target.https && (data.insecureSkipVerify ?? false),
        entrypoints: zone.entrypoints.length ? JSON.stringify(zone.entrypoints) : null,
        middlewares: middlewares.length ? JSON.stringify(middlewares) : null,
        enabled: true,
        enabledAt: now,
        enableDurationMinutes: null,
        ownerTag: principal.ownerTag,
        createdByTokenId: principal.tokenId,
        shareHostname: data.hostname,
        shareAuthMode: data.authMode,
        ownerLabels: data.labels ?? {},
        expiresAt,
      })
      .returning();
    return toView(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HarnessError("conflict", "hostname is already in use");
    }
    throw error;
  }
}

export async function listShares(
  principal: TokenPrincipal,
  filter: unknown = {}
): Promise<ShareView[]> {
  requireScope(principal, SCOPE_SHARES_READ);
  const parsed = listSharesSchema.safeParse(filter ?? {});
  if (!parsed.success) throw invalid(parsed.error);
  const conditions = Object.entries(parsed.data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => sql`${services.ownerLabels} ->> ${k} = ${v}`);
  const rows = await db
    .select()
    .from(services)
    .where(owned(principal, ...conditions))
    .orderBy(asc(services.createdAt));
  return rows.map(toView);
}

async function findOwned(principal: TokenPrincipal, id: unknown): Promise<Service> {
  if (!shareIdSchema.safeParse(id).success) {
    throw new HarnessError("not_found", "share not found");
  }
  const [row] = await db
    .select()
    .from(services)
    .where(owned(principal, eq(services.id, id as string)));
  if (!row) throw new HarnessError("not_found", "share not found");
  return row;
}

export async function getShare(principal: TokenPrincipal, id: unknown): Promise<ShareView> {
  requireScope(principal, SCOPE_SHARES_READ);
  return toView(await findOwned(principal, id));
}

/** Extend or shorten a share's expiry (null removes it, except for public). */
export async function updateShareExpiry(
  principal: TokenPrincipal,
  id: unknown,
  input: unknown,
  now: Date = new Date()
): Promise<ShareView> {
  requireScope(principal, SCOPE_SHARES_WRITE);
  const parsed = updateShareSchema.safeParse(input);
  if (!parsed.success) throw invalid(parsed.error);
  const existing = await findOwned(principal, id);
  const expiresAt = parseFutureDate(parsed.data.expiresAt, now);
  if (existing.shareAuthMode === "public" && !expiresAt) {
    throw new HarnessError("invalid_request", "public shares require expiresAt");
  }
  const [row] = await db
    .update(services)
    .set({ expiresAt, updatedAt: now })
    .where(owned(principal, eq(services.id, existing.id)))
    .returning();
  if (!row) throw new HarnessError("not_found", "share not found");
  return toView(row);
}

export async function deleteShare(principal: TokenPrincipal, id: unknown): Promise<void> {
  requireScope(principal, SCOPE_SHARES_WRITE);
  if (!shareIdSchema.safeParse(id).success) {
    throw new HarnessError("not_found", "share not found");
  }
  const removed = await db
    .delete(services)
    .where(owned(principal, eq(services.id, id as string)))
    .returning({ id: services.id });
  if (removed.length === 0) throw new HarnessError("not_found", "share not found");
}

/** What the caller may do: token identity plus the configured zones. */
export async function describeAccess(principal: TokenPrincipal) {
  const settings = await getHarnessSettings();
  return {
    token: { name: principal.name, ownerTag: principal.ownerTag, scopes: principal.scopes },
    zones: settings.zones.map((z) => ({ suffix: z.suffix, authModes: z.authModes })),
    onlyMeConfigured: settings.onlyMeMiddlewares.length > 0,
    publicRequiresExpiry: true,
  };
}
