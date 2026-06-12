import "server-only";
import { db, appConfig } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  DEFAULT_MANAGED_STATIC_CONFIG,
  type ManagedStaticConfig,
} from "@/lib/managed-traefik-types";

export interface GlobalTraefikConfig {
  globalMiddlewares: string[];
  adminPanelDomain: string;
  /** @deprecated legacy single default — migrated into `defaultEntrypoints` on read */
  defaultEntrypoint?: string;
  defaultEntrypoints?: string[];
  defaultEnableDurationMinutes?: number; // null/undefined = forever, number = minutes
}

const DEFAULT_CONFIG: GlobalTraefikConfig = {
  globalMiddlewares: [],
  adminPanelDomain: "localhost:3000",
  defaultEntrypoints: [],
  defaultEnableDurationMinutes: 720, // Default to 12 hours (720 minutes)
};

/**
 * Merge a saved payload with defaults and migrate the legacy single
 * `defaultEntrypoint` into `defaultEntrypoints`. Pure — exported for tests.
 * An explicit `defaultEntrypoints` array always wins over the legacy value.
 */
export function normalizeGlobalConfig(
  saved: Partial<GlobalTraefikConfig>
): GlobalTraefikConfig {
  const { defaultEntrypoint: legacy, ...rest } = saved;
  const merged: GlobalTraefikConfig = { ...DEFAULT_CONFIG, ...rest };
  merged.defaultEntrypoints = Array.isArray(saved.defaultEntrypoints)
    ? saved.defaultEntrypoints.filter(
        (e): e is string => typeof e === "string" && e.length > 0
      )
    : legacy
      ? [legacy]
      : [];
  return merged;
}

export async function getGlobalConfig(): Promise<GlobalTraefikConfig> {
  try {
    const configs = await db
      .select()
      .from(appConfig)
      .where(eq(appConfig.key, "traefik_global_config"));

    if (configs.length === 0) {
      return DEFAULT_CONFIG;
    }

    const savedConfig = JSON.parse(configs[0].value) as Partial<GlobalTraefikConfig>;
    return normalizeGlobalConfig(savedConfig);
  } catch (error) {
    console.error("Error fetching global config:", error);
    return DEFAULT_CONFIG;
  }
}

export async function updateGlobalConfig(config: GlobalTraefikConfig): Promise<void> {
  // Normalizing on write canonicalizes the stored shape and drops the legacy
  // single-entrypoint key for good.
  await upsertConfigValue(
    "traefik_global_config",
    JSON.stringify(normalizeGlobalConfig(config)),
    "Global Traefik configuration settings"
  );
}

async function upsertConfigValue(
  key: string,
  value: string,
  description: string
): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value, description })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt: new Date() },
    });
}

async function readConfigValue<T>(key: string): Promise<T | null> {
  const rows = await db.select().from(appConfig).where(eq(appConfig.key, key));
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].value) as T;
  } catch {
    return null;
  }
}

/* ── Managed-Traefik static config store ──────────────────────────────────── */

export const MANAGED_STATIC_CONFIG_KEY = "managed_static_config";
const MANAGED_STATIC_STATE_KEY = "managed_static_state";

export interface ManagedStaticState {
  lastFetchedAt: string | null;
  lastFetchedHash: string | null;
}

export async function getManagedStaticConfig(): Promise<ManagedStaticConfig> {
  try {
    const saved = await readConfigValue<Partial<ManagedStaticConfig>>(
      MANAGED_STATIC_CONFIG_KEY
    );
    if (!saved || !Array.isArray(saved.entrypoints) || !Array.isArray(saved.certResolvers)) {
      return DEFAULT_MANAGED_STATIC_CONFIG;
    }
    return { ...DEFAULT_MANAGED_STATIC_CONFIG, ...saved } as ManagedStaticConfig;
  } catch (error) {
    console.error("Error fetching managed static config:", error);
    return DEFAULT_MANAGED_STATIC_CONFIG;
  }
}

export async function updateManagedStaticConfig(
  config: ManagedStaticConfig
): Promise<void> {
  await upsertConfigValue(
    MANAGED_STATIC_CONFIG_KEY,
    JSON.stringify(config),
    "Managed Traefik static configuration (entrypoints, cert resolvers)"
  );
}

/** What the Traefik wrapper last fetched — DB-persisted so a panel restart
 * doesn't fake a "waiting for restart" status. */
export async function getManagedStaticState(): Promise<ManagedStaticState> {
  try {
    const saved = await readConfigValue<ManagedStaticState>(MANAGED_STATIC_STATE_KEY);
    return {
      lastFetchedAt: saved?.lastFetchedAt ?? null,
      lastFetchedHash: saved?.lastFetchedHash ?? null,
    };
  } catch (error) {
    console.error("Error fetching managed static state:", error);
    return { lastFetchedAt: null, lastFetchedHash: null };
  }
}

export async function recordManagedStaticFetch(hash: string): Promise<void> {
  const state: ManagedStaticState = {
    lastFetchedAt: new Date().toISOString(),
    lastFetchedHash: hash,
  };
  await upsertConfigValue(
    MANAGED_STATIC_STATE_KEY,
    JSON.stringify(state),
    "Last static config fetch by the managed Traefik wrapper"
  );
}