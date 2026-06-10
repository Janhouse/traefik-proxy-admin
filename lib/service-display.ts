import type { Service } from "@/components/service-table";
import { parseEntrypoints } from "@/lib/route-rule";

/** Entrypoints for a service. A non-null `entrypoints` column owns the truth
 * even when it parses empty ("[]" = none selected) — only null rows (pre-array)
 * fall back to the legacy single. Mirrors resolveServiceEntrypoints on the
 * server so the UI never resurrects a deselected entrypoint. */
export function serviceEntrypoints(service: Service): string[] {
  if (service.entrypoints !== null && service.entrypoints !== undefined) {
    return parseEntrypoints(service.entrypoints);
  }
  return service.entrypoint ? [service.entrypoint] : [];
}

/**
 * Parse a stored `middlewares` value into a clean name array.
 * Tolerates every historical shape: JSON array, JSON-encoded comma string,
 * or a plain comma-separated string.
 */
export function parseMiddlewareNames(
  middlewares?: string | null
): string[] {
  if (!middlewares) return [];
  const raw = middlewares.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((m) => String(m).trim()).filter(Boolean);
    }
    if (typeof parsed === "string") {
      return parsed.split(",").map((m) => m.trim()).filter(Boolean);
    }
  } catch {
    /* not JSON — fall through */
  }
  return raw.split(",").map((m) => m.trim()).filter(Boolean);
}

/** First/primary public hostname for a service. */
export function primaryHostname(service: Service): string {
  const domain = service.domain?.domain || "";
  switch (service.hostnameMode) {
    case "apex":
      return domain;
    case "custom":
      try {
        const arr = JSON.parse(service.customHostnames || "[]");
        return Array.isArray(arr) && arr[0] ? String(arr[0]) : "";
      } catch {
        return "";
      }
    case "subdomain":
    default:
      return service.subdomain && domain
        ? `${service.subdomain}.${domain}`
        : domain;
  }
}

/** Public https URL for a service (best effort). */
export function publicUrl(service: Service): string {
  const host = primaryHostname(service);
  return host ? `https://${host}` : "";
}

/** target backend address as `ip:port`. */
export function targetAddress(service: Service): string {
  return `${service.targetIp}:${service.targetPort}`;
}
