import { NextRequest, NextResponse } from "next/server";
import { db, services } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getGlobalConfig } from "@/lib/app-config";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { durationMinutes } = body;

    // Get current service state
    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.id, id));

    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    // Toggle enabled status
    const newEnabledState = !service.enabled;
    const updateData: any = {
      enabled: newEnabledState,
      updatedAt: new Date(),
    };

    // If enabling the service, set enabledAt and duration
    if (newEnabledState) {
      updateData.enabledAt = new Date();
      
      // Use provided duration, or keep the service's existing duration (including null for infinite)
      if (durationMinutes !== undefined) {
        updateData.enableDurationMinutes = durationMinutes;
      }
      // Otherwise keep the existing service duration (null = infinite, number = finite)
    }

    // Update the service
    const [updatedService] = await db
      .update(services)
      .set(updateData)
      .where(eq(services.id, id))
      .returning();

    return NextResponse.json(updatedService);
  } catch (error) {
    console.error("Toggle service error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}