import { NextRequest, NextResponse } from "next/server";
import { db, services, NewService } from "@/lib/db";
import { checkAndDisableExpiredServices } from "@/lib/service-scheduler";
import "@/lib/startup"; // Initialize background services

export async function GET() {
  try {
    // Check and disable any expired services before returning the list
    const disabledCount = await checkAndDisableExpiredServices();
    if (disabledCount > 0) {
      console.log(`API: Auto-disabled ${disabledCount} expired service(s) on page load`);
    }
    
    const allServices = await db.select().from(services);
    return NextResponse.json(allServices);
  } catch (error) {
    console.error("Error fetching services:", error);
    return NextResponse.json(
      { error: "Failed to fetch services" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const newService: NewService = {
      name: body.name,
      subdomain: body.subdomain,
      targetIp: body.targetIp,
      targetPort: body.targetPort,
      isHttps: body.isHttps || false,
      enabled: body.enabled !== undefined ? body.enabled : true,
      enabledAt: (body.enabled !== false) ? new Date() : undefined, // Set enabledAt if service is enabled
      enableDurationMinutes: body.enableDurationMinutes,
      authMethod: body.authMethod || "none",
      ssoGroups: body.ssoGroups,
      ssoUsers: body.ssoUsers,
      middlewares: body.middlewares,
      updatedAt: new Date(),
    };

    const [service] = await db.insert(services).values(newService).returning();
    return NextResponse.json(service);
  } catch (error) {
    console.error("Error creating service:", error);
    return NextResponse.json(
      { error: "Failed to create service" },
      { status: 500 }
    );
  }
}