import { NextRequest, NextResponse } from "next/server";
import "@/lib/startup"; // ensure the background schedulers are running
import { generateTraefikConfig } from "@/lib/traefik-config";
import { EDGE_NAME_RE, normalizeEdge } from "@/lib/edge";
import { checkAndDisableExpiredServices } from "@/lib/service-scheduler";
import { sweepExpiredShares } from "@/lib/harness/sweeper";

/**
 * Traefik HTTP-provider endpoint. `?edge=<name>` serves only the domains
 * assigned to that edge (a second Traefik instance); without it, every
 * domain that has no edge (the original single-instance behaviour).
 */
export async function GET(request: NextRequest) {
  const edge = normalizeEdge(request.nextUrl.searchParams.get("edge"));
  if (edge !== null && !EDGE_NAME_RE.test(edge)) {
    return NextResponse.json({ error: "Invalid edge name" }, { status: 400 });
  }
  try {
    // Check and disable any expired services before generating config
    // This ensures Traefik gets the most up-to-date service states
    const disabledCount = await checkAndDisableExpiredServices();
    if (disabledCount > 0) {
      console.log(`Traefik: Auto-disabled ${disabledCount} expired service(s)`);
    }
    // Expired API-created shares are removed outright (generation also skips
    // them, so a failed sweep never keeps one routed).
    await sweepExpiredShares().catch((error) =>
      console.error("Error sweeping expired shares:", error)
    );

    const config = await generateTraefikConfig({ edge });
    return NextResponse.json(config);
  } catch (error) {
    console.error("Error generating Traefik config:", error);
    return NextResponse.json(
      { error: "Failed to generate configuration" },
      { status: 500 }
    );
  }
}
