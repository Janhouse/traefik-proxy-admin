import { NextRequest, NextResponse } from "next/server";
import { NewService } from "@/lib/db";
import { ServiceService } from "@/lib/services/service.service";
import { DomainService } from "@/lib/services/domain.service";
import "@/lib/startup"; // Initialize background services

export async function GET() {
  try {
    const servicesWithSecurity = await ServiceService.getAllServices();
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

    // Validate domainId or get default domain
    let domainId = body.domainId;
    if (!domainId) {
      const defaultDomain = await DomainService.getDefaultDomain();
      if (!defaultDomain) {
        return NextResponse.json(
          { error: "No domain specified and no default domain found" },
          { status: 400 }
        );
      }
      domainId = defaultDomain.id;
    } else {
      // Validate that the specified domain exists
      const domainExists = await DomainService.domainExists(domainId);
      if (!domainExists) {
        return NextResponse.json(
          { error: "Specified domain does not exist" },
          { status: 400 }
        );
      }
    }

    const newService: NewService = {
      name: body.name,
      subdomain: body.subdomain,
      domainId: domainId,
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

    const service = await ServiceService.createService(newService);
    return NextResponse.json(service);
  } catch (error) {
    console.error("Error creating service:", error);
    return NextResponse.json(
      { error: "Failed to create service" },
      { status: 500 }
    );
  }
}