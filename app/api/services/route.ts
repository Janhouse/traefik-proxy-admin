import { NextRequest, NextResponse } from "next/server";
import { db, services, serviceSecurityConfigs, NewService } from "@/lib/db";
import { checkAndDisableExpiredServices } from "@/lib/service-scheduler";
import { eq } from "drizzle-orm";
import "@/lib/startup"; // Initialize background services

export async function GET() {
  try {
    // Check and disable any expired services before returning the list
    const disabledCount = await checkAndDisableExpiredServices();
    if (disabledCount > 0) {
      console.log(`API: Auto-disabled ${disabledCount} expired service(s) on page load`);
    }

    const allServices = await db.select().from(services);

    // Get security configuration counts for each service
    const servicesWithSecurity = await Promise.all(
      allServices.map(async (service) => {
        // Get security config counts
        const securityConfigs = await db
          .select({
            securityType: serviceSecurityConfigs.securityType
          })
          .from(serviceSecurityConfigs)
          .where(eq(serviceSecurityConfigs.serviceId, service.id));

        const hasSharedLink = securityConfigs.some(config => config.securityType === 'shared_link');
        const hasSso = securityConfigs.some(config => config.securityType === 'sso');
        const hasBasicAuth = securityConfigs.some(config => config.securityType === 'basic_auth');
        const basicAuthCount = securityConfigs.filter(config => config.securityType === 'basic_auth').length;

        return {
          ...service,
          hasSharedLink,
          hasSso,
          hasBasicAuth,
          basicAuthCount,
        };
      })
    );

    return NextResponse.json(servicesWithSecurity);
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
      insecureSkipVerify: body.insecureSkipVerify || false,
      enabled: body.enabled !== undefined ? body.enabled : true,
      enabledAt: (body.enabled !== false) ? new Date() : undefined, // Set enabledAt if service is enabled
      enableDurationMinutes: body.enableDurationMinutes,
      middlewares: body.middlewares,
      requestHeaders: body.requestHeaders,
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