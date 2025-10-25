import { NextRequest, NextResponse } from "next/server";
import { ServiceService } from "@/lib/services/service.service";
import { DomainService } from "@/lib/services/domain.service";
import type { CreateServiceData, CreateServiceRequest } from "@/lib/dto/service.dto";
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
    const body: CreateServiceRequest = await request.json();

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

    const newService: CreateServiceData = {
      name: body.name,
      subdomain: body.subdomain || null,
      hostnameMode: body.hostnameMode,
      customHostnames: body.customHostnames ? JSON.stringify(body.customHostnames) : null,
      domainId: domainId,
      targetIp: body.targetIp,
      targetPort: body.targetPort,
      entrypoint: body.entrypoint || null,
      isHttps: body.isHttps ?? false,
      insecureSkipVerify: body.insecureSkipVerify ?? false,
      enabled: body.enabled ?? true,
      enableDurationMinutes: body.enableDurationMinutes ?? null,
      middlewares: body.middlewares ? JSON.stringify(body.middlewares) : null,
      requestHeaders: body.requestHeaders
        ? (typeof body.requestHeaders === 'string' ? body.requestHeaders : JSON.stringify(body.requestHeaders))
        : null,
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