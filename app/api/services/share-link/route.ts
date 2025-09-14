import { NextRequest, NextResponse } from "next/server";
import { createSharedLink } from "@/lib/shared-links";
import { db, services, domains } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { serviceId, expiresInHours = 24, sessionDurationMinutes = 60 } = await request.json();

    if (!serviceId) {
      return NextResponse.json(
        { error: "Service ID is required" },
        { status: 400 }
      );
    }

    // Get service details with domain information
    const result = await db
      .select({
        service: services,
        domain: domains,
      })
      .from(services)
      .leftJoin(domains, eq(services.domainId, domains.id))
      .where(eq(services.id, serviceId));

    if (result.length === 0 || !result[0].service) {
      return NextResponse.json(
        { error: "Service not found" },
        { status: 404 }
      );
    }

    const { service, domain } = result[0];

    if (!domain) {
      return NextResponse.json(
        { error: "Service domain not found" },
        { status: 404 }
      );
    }

    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const sharedLink = await createSharedLink(
      serviceId,
      expiresAt,
      sessionDurationMinutes
    );

    // Create URL pointing to the actual service domain with traefik-token
    const serviceUrl = `https://${service.subdomain}.${domain.domain}`;
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