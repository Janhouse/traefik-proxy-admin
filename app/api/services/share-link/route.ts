import { NextRequest, NextResponse } from "next/server";
import { createSharedLink } from "@/lib/shared-links";
import { db, services } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getGlobalConfig } from "@/lib/app-config";

export async function POST(request: NextRequest) {
  try {
    const { serviceId, expiresInHours = 24, sessionDurationMinutes = 60 } = await request.json();

    if (!serviceId) {
      return NextResponse.json(
        { error: "Service ID is required" },
        { status: 400 }
      );
    }

    // Get service details
    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.id, serviceId));

    if (!service) {
      return NextResponse.json(
        { error: "Service not found" },
        { status: 404 }
      );
    }

    // Get global config for base domain
    const globalConfig = await getGlobalConfig();

    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    
    const sharedLink = await createSharedLink(
      serviceId,
      expiresAt,
      sessionDurationMinutes
    );

    // Create URL pointing to the actual service domain with traefik-token
    const serviceUrl = `https://${service.subdomain}.${globalConfig.baseDomain}`;
    const shareUrl = `${serviceUrl}?traefik-token=${sharedLink.token}`;

    return NextResponse.json({
      shareUrl,
      token: sharedLink.token,
      expiresAt: sharedLink.expiresAt,
      serviceUrl,
    });
  } catch (error) {
    console.error("Error creating shared link:", error);
    return NextResponse.json(
      { error: "Failed to create shared link" },
      { status: 500 }
    );
  }
}