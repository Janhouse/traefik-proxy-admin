import { NextResponse } from "next/server";
import { generateTraefikConfig } from "@/lib/traefik-config";
import { checkAndDisableExpiredServices } from "@/lib/service-scheduler";

export async function GET() {
  try {
    // Check and disable any expired services before generating config
    // This ensures Traefik gets the most up-to-date service states
    const disabledCount = await checkAndDisableExpiredServices();
    if (disabledCount > 0) {
      console.log(`Traefik: Auto-disabled ${disabledCount} expired service(s)`);
    }
    
    const config = await generateTraefikConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error("Error generating Traefik config:", error);
    return NextResponse.json(
      { error: "Failed to generate configuration" },
      { status: 500 }
    );
  }
}