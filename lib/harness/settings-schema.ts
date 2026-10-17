import { z } from "zod";
import { SHARE_AUTH_MODES, type ShareAuthMode } from "./constants";

/* Harness settings model + validation — shared by the server and the admin
 * UI (no server-only imports). */

/** DNS hostname (at least two labels), lowercase. */
export const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** A single DNS label, lowercase. */
export const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Traefik object reference (middleware/entrypoint name, optionally @provider). */
const TRAEFIK_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,254}$/;

const traefikNameList = z
  .array(z.string().trim().regex(TRAEFIK_NAME_RE, "invalid Traefik name"))
  .max(20);

export interface HarnessZone {
  /** Hostname suffix shares are created under, e.g. "e.example.com". A domain
   * with exactly this name must exist in the panel. */
  suffix: string;
  /** Access modes allowed under this suffix. */
  authModes: ShareAuthMode[];
  /** Entrypoints the share routers bind to (empty = global default). */
  entrypoints: string[];
  /** Extra middlewares on every share in this zone (e.g. "hsts@file"). */
  middlewares: string[];
}

export interface HarnessSettings {
  zones: HarnessZone[];
  /** Forward-auth middleware(s) that implement "only me" (e.g. an
   * Authentik outpost middleware). Empty = only-me shares are refused. */
  onlyMeMiddlewares: string[];
}

export const harnessZoneSchema = z.object({
  suffix: z
    .string()
    .trim()
    .toLowerCase()
    .regex(HOSTNAME_RE, "suffix must be a hostname such as e.example.com"),
  authModes: z.array(z.enum(SHARE_AUTH_MODES)).min(1).max(3),
  entrypoints: traefikNameList,
  middlewares: traefikNameList,
});

export const harnessSettingsSchema = z
  .object({
    zones: z.array(harnessZoneSchema).max(20),
    onlyMeMiddlewares: traefikNameList,
  })
  .superRefine((s, ctx) => {
    const seen = new Set<string>();
    s.zones.forEach((zone, i) => {
      if (seen.has(zone.suffix)) {
        ctx.addIssue({
          code: "custom",
          path: ["zones", i, "suffix"],
          message: `duplicate suffix ${zone.suffix}`,
        });
      }
      seen.add(zone.suffix);
    });
  });

export const DEFAULT_HARNESS_SETTINGS: HarnessSettings = {
  zones: [
    {
      suffix: "i.janhouse.lv",
      authModes: ["only-me", "network"],
      entrypoints: ["websecure"],
      middlewares: [],
    },
    {
      suffix: "e.janhouse.lv",
      authModes: ["public"],
      entrypoints: ["websecure"],
      middlewares: [],
    },
  ],
  onlyMeMiddlewares: ["auth-authentik@file"],
};

/** Longest zone suffix that `hostname` sits strictly under, or null. */
export function zoneForHostname(
  settings: HarnessSettings,
  hostname: string
): HarnessZone | null {
  let best: HarnessZone | null = null;
  for (const zone of settings.zones) {
    if (
      hostname.endsWith(`.${zone.suffix}`) &&
      (!best || zone.suffix.length > best.suffix.length)
    ) {
      best = zone;
    }
  }
  return best;
}
