import "server-only";
import { db, appConfig } from "@/lib/db";
import { eq } from "drizzle-orm";
import { DURATION_PRESETS } from "./duration-presets";

export interface GlobalTraefikConfig {
  globalMiddlewares: string[];
  adminPanelDomain: string;
  defaultEntrypoint?: string;
  defaultEnableDurationMinutes?: number; // null/undefined = forever, number = minutes
}

export const DEFAULT_CONFIG: GlobalTraefikConfig = {
  globalMiddlewares: [],
  adminPanelDomain: "localhost:3000",
  defaultEnableDurationMinutes: 720, // Default to 12 hours (720 minutes)
};

// Re-export for server-side use
export { DURATION_PRESETS };

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
    
    // Merge with defaults to ensure all fields are present
    return {
      ...DEFAULT_CONFIG,
      ...savedConfig,
    };
  } catch (error) {
    console.error("Error fetching global config:", error);
    return DEFAULT_CONFIG;
  }
}

export async function updateGlobalConfig(config: GlobalTraefikConfig): Promise<void> {
  const configValue = JSON.stringify(config);
  
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