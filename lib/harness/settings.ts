import "server-only";
import { eq } from "drizzle-orm";
import { appConfig, db } from "@/lib/db";
import {
  DEFAULT_HARNESS_SETTINGS,
  harnessSettingsSchema,
  type HarnessSettings,
} from "./settings-schema";

const KEY = "harness_settings";

/** Stored settings, or the defaults when nothing (valid) is stored. */
export async function getHarnessSettings(): Promise<HarnessSettings> {
  const rows = await db.select().from(appConfig).where(eq(appConfig.key, KEY));
  if (rows.length === 0) return DEFAULT_HARNESS_SETTINGS;
  try {
    const parsed = harnessSettingsSchema.safeParse(JSON.parse(rows[0].value));
    if (parsed.success) return parsed.data;
    console.error("Stored harness settings are invalid; using defaults", parsed.error.issues);
  } catch (error) {
    console.error("Stored harness settings are not JSON; using defaults", error);
  }
  return DEFAULT_HARNESS_SETTINGS;
}

/** Validate and persist. Throws a ZodError on invalid input. */
export async function updateHarnessSettings(input: unknown): Promise<HarnessSettings> {
  const settings = harnessSettingsSchema.parse(input);
  const value = JSON.stringify(settings);
  await db
    .insert(appConfig)
    .values({ key: KEY, value, description: "Harness integration API settings" })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt: new Date() },
    });
  return settings;
}
