import "server-only";
import { db, appConfig } from "@/lib/db";
import { eq } from "drizzle-orm";

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
  const configValue = JSON.stringify(normalizeGlobalConfig(config));
  
  await db
    .insert(appConfig)
    .values({
      key: "traefik_global_config",
      value: configValue,
      description: "Global Traefik configuration settings",
    })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: {
        value: configValue,
        updatedAt: new Date(),
      },
    });
}