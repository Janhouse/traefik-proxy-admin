import { NextRequest, NextResponse } from "next/server";
import { ServiceService } from "@/lib/services/service.service";
import { DomainService } from "@/lib/services/domain.service";
import type { UpdateServiceData, UpdateServiceRequest } from "@/lib/dto/service.dto";

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
    const body: UpdateServiceRequest = await request.json();

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

    const updateData: UpdateServiceData = {
      name: body.name,
      subdomain: body.subdomain || null,
      hostnameMode: body.hostnameMode,
      customHostnames: body.customHostnames ? JSON.stringify(body.customHostnames) : null,
      domainId: body.domainId,
      targetIp: body.targetIp,
      targetPort: body.targetPort,
      entrypoint: body.entrypoint || null,
      isHttps: body.isHttps ?? false,
      insecureSkipVerify: body.insecureSkipVerify ?? false,
      enabled: body.enabled ?? true,
      middlewares: body.middlewares ? JSON.stringify(body.middlewares) : null,
      requestHeaders: body.requestHeaders ? JSON.stringify(body.requestHeaders) : null,
      enableDurationMinutes: body.enableDurationMinutes ?? null,
    };

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