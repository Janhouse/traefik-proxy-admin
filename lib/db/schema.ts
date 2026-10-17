import { pgTable, text, integer, boolean, timestamp, varchar, uuid, index, uniqueIndex, jsonb, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const basicAuthConfigs = pgTable("basic_auth_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const basicAuthUsers = pgTable("basic_auth_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  configId: uuid("config_id").references(() => basicAuthConfigs.id, { onDelete: "cascade" }).notNull(),
  username: varchar("username", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  description: text("description"),
  useWildcardCert: boolean("use_wildcard_cert").default(true).notNull(),
  certResolver: varchar("cert_resolver", { length: 255 }).notNull().default("letsencrypt"),
  certificateConfigs: text("certificate_configs"), // JSON array of certificate configurations
  isDefault: boolean("is_default").default(false).notNull(),
  // Which Traefik instance serves this domain. null = the default edge (the
  // instance polling /api/traefik/config without ?edge=). A named edge is
  // served ONLY by /api/traefik/config?edge=<name>, so e.g. intranet-only
  // hostnames never reach the public Traefik.
  edge: varchar("edge", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Bearer tokens for the harness integration API / MCP. Only a SHA-256 of the
 * token is stored; the plaintext is shown once at creation. Every entry a
 * token creates is tagged with the token's `ownerTag`, and the API can only
 * ever see or touch entries carrying that tag (tokens sharing a tag share
 * ownership, so a token can be rotated without orphaning its entries).
 */
export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  tokenPrefix: varchar("token_prefix", { length: 16 }).notNull(),
  ownerTag: varchar("owner_tag", { length: 64 }).notNull().default("harness"),
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  subdomain: varchar("subdomain", { length: 255 }), // Now optional, only used when hostname_mode is 'subdomain'
  hostnameMode: varchar("hostname_mode", { length: 20 }).default("subdomain").notNull(), // 'subdomain', 'apex', 'custom'
  customHostnames: text("custom_hostnames"), // JSON array of hostnames when hostname_mode is 'custom'
  domainId: uuid("domain_id").references(() => domains.id, { onDelete: "restrict" }).notNull(),
  targetIp: varchar("target_ip", { length: 255 }).notNull(), // IP or hostname
  targetPort: integer("target_port").notNull(),
  entrypoint: varchar("entrypoint", { length: 255 }), // legacy single entrypoint (kept for back-compat)
  entrypoints: text("entrypoints"), // JSON array of entrypoint names (preferred)
  matchRules: text("match_rules"), // JSON array of structured Traefik v3 match rules
  isHttps: boolean("is_https").default(false).notNull(),
  insecureSkipVerify: boolean("insecure_skip_verify").default(false).notNull(), // Skip TLS certificate validation for target service
  enabled: boolean("enabled").default(true).notNull(),
  enabledAt: timestamp("enabled_at").defaultNow(),
  enableDurationMinutes: integer("enable_duration_minutes"), // null = forever, number = minutes until auto-disable
  middlewares: text("middlewares"), // JSON array of additional middlewares for this service
  requestHeaders: text("request_headers"), // JSON object of custom request headers to add/modify
  // ── Ownership (harness integration API) ──────────────────────────────────
  // null = created in the admin panel. Non-null = created through the token
  // API by a token with this owner tag; the API can only see/modify rows with
  // its own tag, never admin-created ones.
  ownerTag: varchar("owner_tag", { length: 64 }),
  createdByTokenId: uuid("created_by_token_id").references((): AnyPgColumn => apiTokens.id, { onDelete: "set null" }),
  /** FQDN of an API-created share (unique among API-created entries). */
  shareHostname: varchar("share_hostname", { length: 255 }),
  /** only-me | network | public — the share's access mode. */
  shareAuthMode: varchar("share_auth_mode", { length: 20 }),
  /** Free-form labels (workspace, resource, job) set by the API caller. */
  ownerLabels: jsonb("owner_labels").$type<Record<string, string>>(),
  /** Hard expiry: never routed at/after this instant, then deleted by the sweeper. */
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_services_owner_tag").on(t.ownerTag),
  index("idx_services_expires_at").on(t.expiresAt),
  uniqueIndex("uq_services_share_hostname").on(t.shareHostname).where(sql`${t.shareHostname} IS NOT NULL`),
]);

export const serviceSecurityConfigs = pgTable("service_security_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceId: uuid("service_id").references(() => services.id, { onDelete: "cascade" }).notNull(),
  securityType: varchar("security_type", { length: 50 }).notNull(), // 'shared_link', 'sso', 'basic_auth'
  isEnabled: boolean("is_enabled").default(true).notNull(),
  priority: integer("priority").default(0).notNull(), // Lower numbers = higher priority
  config: text("config").notNull(), // JSON configuration specific to the security type
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sharedLinks = pgTable("shared_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceId: uuid("service_id").references(() => services.id, { onDelete: "cascade" }).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: boolean("is_used").default(false).notNull(),
  usedAt: timestamp("used_at"),
  sessionDurationMinutes: integer("session_duration_minutes").default(60).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceId: uuid("service_id").references(() => services.id, { onDelete: "cascade" }).notNull(),
  sharedLinkId: uuid("shared_link_id").references(() => sharedLinks.id, { onDelete: "cascade" }),
  sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
  userIdentifier: varchar("user_identifier", { length: 255 }), // For SSO users
  expiresAt: timestamp("expires_at").notNull(),
  lastAccessedAt: timestamp("last_accessed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appConfig = pgTable("app_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Rolling per-router request-traffic samples scraped from Traefik's Prometheus
// /metrics endpoint. Each row is the DELTA for one router over one scrape tick
// (counters diffed against the previous scrape), so reads are pure sums and
// counter resets can't produce negative values. Old rows are pruned by the
// metrics scheduler (TRAEFIK_METRICS_RETENTION_MINUTES).
export const routerMetricSamples = pgTable(
  "router_metric_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ts: timestamp("ts").defaultNow().notNull(),
    // The matched admin service (null only transiently; unmatched routers are skipped).
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "cascade" }),
    router: varchar("router", { length: 512 }).notNull(), // router label, @provider stripped
    req2xx: integer("req_2xx").default(0).notNull(),
    req3xx: integer("req_3xx").default(0).notNull(),
    req4xx: integer("req_4xx").default(0).notNull(),
    req5xx: integer("req_5xx").default(0).notNull(),
    reqOther: integer("req_other").default(0).notNull(),
    durSumMs: integer("dur_sum_ms").default(0).notNull(), // delta of duration _sum, in ms
    durCount: integer("dur_count").default(0).notNull(), // delta of duration _count
  },
  (t) => [
    index("idx_router_metric_samples_ts").on(t.ts),
    index("idx_router_metric_samples_service_ts").on(t.serviceId, t.ts),
  ]
);

export type BasicAuthConfig = typeof basicAuthConfigs.$inferSelect;
export type NewBasicAuthConfig = typeof basicAuthConfigs.$inferInsert;
export type BasicAuthUser = typeof basicAuthUsers.$inferSelect;
export type NewBasicAuthUser = typeof basicAuthUsers.$inferInsert;
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type ServiceSecurityConfig = typeof serviceSecurityConfigs.$inferSelect;
export type NewServiceSecurityConfig = typeof serviceSecurityConfigs.$inferInsert;
export type SharedLink = typeof sharedLinks.$inferSelect;
export type NewSharedLink = typeof sharedLinks.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type AppConfig = typeof appConfig.$inferSelect;
export type NewAppConfig = typeof appConfig.$inferInsert;
export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;
export type RouterMetricSample = typeof routerMetricSamples.$inferSelect;
export type NewRouterMetricSample = typeof routerMetricSamples.$inferInsert;