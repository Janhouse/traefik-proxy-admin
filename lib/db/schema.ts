import { pgTable, text, integer, boolean, timestamp, varchar, uuid } from "drizzle-orm/pg-core";

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  subdomain: varchar("subdomain", { length: 255 }).notNull().unique(),
  targetIp: varchar("target_ip", { length: 45 }).notNull(),
  targetPort: integer("target_port").notNull(),
  isHttps: boolean("is_https").default(false).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  enabledAt: timestamp("enabled_at").defaultNow(),
  enableDurationMinutes: integer("enable_duration_minutes"), // null = forever, number = minutes until auto-disable
  authMethod: varchar("auth_method", { length: 50 }).notNull(), // 'none', 'shared_link', 'sso'
  ssoGroups: text("sso_groups"), // JSON array of allowed groups for SSO
  ssoUsers: text("sso_users"), // JSON array of allowed users for SSO
  middlewares: text("middlewares"), // JSON array of additional middlewares for this service
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

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type SharedLink = typeof sharedLinks.$inferSelect;
export type NewSharedLink = typeof sharedLinks.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type AppConfig = typeof appConfig.$inferSelect;
export type NewAppConfig = typeof appConfig.$inferInsert;