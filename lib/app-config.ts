import "server-only";
import { db, appConfig } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  DEFAULT_MANAGED_STATIC_CONFIG,
  type ManagedStaticConfig,
} from "@/lib/managed-traefik-types";
import { hashText } from "@/lib/managed-traefik";

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

async function deleteConfigValue(key: string): Promise<void> {
  await db.delete(appConfig).where(eq(appConfig.key, key));
}

/* ── Managed-Traefik static config store ──────────────────────────────────── */

const MANAGED_STATIC_CONFIG_KEY = "managed_static_config";
const MANAGED_STATIC_STATE_KEY = "managed_static_state";
const MANAGED_SECRET_META_KEY = "managed_secret_meta";
/** Older builds stored credential VALUES here; purged on the next write. */
const MANAGED_SECRETS_LEGACY_KEY = "managed_secrets";

export interface ManagedStaticState {
  lastFetchedAt: string | null;
  lastFetchedHash: string | null;
  /** Hash of the secrets env the wrapper last fetched (separate from the
   * static config; either changing requires a Traefik restart). */
  lastFetchedSecretsHash: string | null;
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
      lastFetchedSecretsHash: saved?.lastFetchedSecretsHash ?? null,
    };
  } catch (error) {
    console.error("Error fetching managed static state:", error);
    return { lastFetchedAt: null, lastFetchedHash: null, lastFetchedSecretsHash: null };
  }
}

export async function recordManagedStaticFetch(hash: string): Promise<void> {
  const prev = await getManagedStaticState();
  const state: ManagedStaticState = {
    ...prev,
    lastFetchedAt: new Date().toISOString(),
    lastFetchedHash: hash,
  };
  await upsertConfigValue(
    MANAGED_STATIC_STATE_KEY,
    JSON.stringify(state),
    "Last static config fetch by the managed Traefik wrapper"
  );
}

export async function recordManagedSecretsFetch(hash: string): Promise<void> {
  const prev = await getManagedStaticState();
  const state: ManagedStaticState = { ...prev, lastFetchedSecretsHash: hash };
  await upsertConfigValue(
    MANAGED_STATIC_STATE_KEY,
    JSON.stringify(state),
    "Last static config fetch by the managed Traefik wrapper"
  );
}

/* ── DNS-provider credential metadata ─────────────────────────────────────
 * Only the credential NAMES and a hash live in the database — the VALUES are
 * kept in the encrypted file (see lib/managed-secrets-store.ts). The hash lets
 * the managed status compute "pending" without reading/decrypting the file. */

export interface ManagedSecretMeta {
  names: string[];
  /** hashText(serializeSecretsEnv(values)) — matches the wrapper's fetch hash. */
  hash: string;
}

export async function getManagedSecretMeta(): Promise<ManagedSecretMeta> {
  const empty: ManagedSecretMeta = { names: [], hash: hashText("") };
  try {
    const saved = await readConfigValue<ManagedSecretMeta>(MANAGED_SECRET_META_KEY);
    return {
      names: Array.isArray(saved?.names) ? saved!.names : [],
      hash: typeof saved?.hash === "string" ? saved!.hash : hashText(""),
    };
  } catch (error) {
    console.error("Error fetching managed secret meta:", error);
    return empty;
  }
}

export async function setManagedSecretMeta(meta: ManagedSecretMeta): Promise<void> {
  await upsertConfigValue(
    MANAGED_SECRET_META_KEY,
    JSON.stringify(meta),
    "Managed Traefik credential names + hash (values live in the encrypted file)"
  );
  // Purge any plaintext values written by an older build.
  await deleteConfigValue(MANAGED_SECRETS_LEGACY_KEY);
}