import { NextRequest, NextResponse } from "next/server";
import { db, services } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: any = {
      name: body.name,
      subdomain: body.subdomain,
      targetIp: body.targetIp,
      targetPort: body.targetPort,
      isHttps: body.isHttps,
      enabled: body.enabled,
      middlewares: body.middlewares,
      requestHeaders: body.requestHeaders,
      enableDurationMinutes: body.enableDurationMinutes,
      updatedAt: new Date(),
    };

    // If enabling the service, set enabledAt
    if (body.enabled) {
      updateData.enabledAt = new Date();
    }

    const [service] = await db
      .update(services)
      .set(updateData)
      .where(eq(services.id, id))
      .returning();

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

    const [deletedService] = await db
      .delete(services)
      .where(eq(services.id, id))
      .returning();

    if (!deletedService) {
      return NextResponse.json(
        { error: "Service not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Service deleted successfully" });
  } catch (error) {
    console.error("Error deleting service:", error);
    return NextResponse.json(
      { error: "Failed to delete service" },
      { status: 500 }
    );
  }
}