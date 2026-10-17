import "server-only";
import { and, isNotNull, lte } from "drizzle-orm";
import { db, services } from "@/lib/db";

/**
 * Delete every API-created entry whose hard expiry has passed. Only rows with
 * an owner tag are touched — admin-created services are never deleted here
 * (they use the enable-duration auto-disable instead). Traefik picks the
 * removal up on its next poll of /api/traefik/config; generation already
 * skips expired rows, so this is cleanup, not the enforcement point.
 *
 * Returns the hostnames that were removed.
 */
export async function sweepExpiredShares(now: Date = new Date()): Promise<string[]> {
  const removed = await db
    .delete(services)
    .where(
      and(
        isNotNull(services.ownerTag),
        isNotNull(services.expiresAt),
        lte(services.expiresAt, now)
      )
    )
    .returning({ id: services.id, hostname: services.shareHostname });

  if (removed.length > 0) {
    console.log(
      `Harness: removed ${removed.length} expired share(s): ${removed
        .map((r) => r.hostname ?? r.id)
        .join(", ")}`
    );
  }
  return removed.map((r) => r.hostname ?? r.id);
}
