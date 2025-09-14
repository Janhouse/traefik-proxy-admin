import { NextRequest, NextResponse } from "next/server";
import { ServiceService } from "@/lib/services/service.service";
import { DomainService } from "@/lib/services/domain.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const service = await ServiceService.getServiceByIdWithDomain(id);

    if (!service) {
      return NextResponse.json(
        { error: "Service not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(service);
  } catch (error) {
    console.error("Error fetching service:", error);
    return NextResponse.json(
      { error: "Failed to fetch service" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate domainId if provided
    if (body.domainId) {
      const domainExists = await DomainService.domainExists(body.domainId);
      if (!domainExists) {
        return NextResponse.json(
          { error: "Specified domain does not exist" },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {
      name: body.name,
      subdomain: body.subdomain,
      domainId: body.domainId,
      targetIp: body.targetIp,
      targetPort: body.targetPort,
      isHttps: body.isHttps,
      insecureSkipVerify: body.insecureSkipVerify,
      enabled: body.enabled,
      middlewares: body.middlewares,
      requestHeaders: body.requestHeaders,
      enableDurationMinutes: body.enableDurationMinutes,
    };

    // If enabling the service, set enabledAt
    if (body.enabled) {
      updateData.enabledAt = new Date();
    }

    const service = await ServiceService.updateService(id, updateData);

    if (!service) {
      return NextResponse.json(
        { error: "Service not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(service);
  } catch (error) {
    console.error("Error updating service:", error);
    return NextResponse.json(
      { error: "Failed to update service" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if service exists before deletion
    const existingService = await ServiceService.getServiceById(id);
    if (!existingService) {
      return NextResponse.json(
        { error: "Service not found" },
        { status: 404 }
      );
    }

    await ServiceService.deleteService(id);
    return NextResponse.json({ message: "Service deleted successfully" });
  } catch (error) {
    console.error("Error deleting service:", error);
    return NextResponse.json(
      { error: "Failed to delete service" },
      { status: 500 }
    );
  }
}