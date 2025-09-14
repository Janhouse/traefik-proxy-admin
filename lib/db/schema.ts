import { pgTable, text, integer, boolean, timestamp, varchar, uuid } from "drizzle-orm/pg-core";

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
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  subdomain: varchar("subdomain", { length: 255 }).notNull(),
  domainId: uuid("domain_id").references(() => domains.id, { onDelete: "restrict" }).notNull(),
  targetIp: varchar("target_ip", { length: 45 }).notNull(),
  targetPort: integer("target_port").notNull(),
  isHttps: boolean("is_https").default(false).notNull(),
  insecureSkipVerify: boolean("insecure_skip_verify").default(false).notNull(), // Skip TLS certificate validation for target service
  enabled: boolean("enabled").default(true).notNull(),
  enabledAt: timestamp("enabled_at").defaultNow(),
  enableDurationMinutes: integer("enable_duration_minutes"), // null = forever, number = minutes until auto-disable
  middlewares: text("middlewares"), // JSON array of additional middlewares for this service
  requestHeaders: text("request_headers"), // JSON object of custom request headers to add/modify
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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