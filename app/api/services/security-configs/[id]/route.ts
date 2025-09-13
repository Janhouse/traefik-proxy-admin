import { NextRequest, NextResponse } from "next/server";
import { ServiceSecurityService } from "@/lib/services/service-security.service";
import {
  validateUpdateServiceSecurityConfig,
  validateConfigId,
  type ValidationResult,
} from "@/lib/validators/service-security.validator";
import type { UpdateServiceSecurityConfigRequest } from "@/lib/dto/service-security.dto";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Validate config ID
    const idValidation: ValidationResult = validateConfigId(id);
    if (!idValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid config ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    const securityConfig = await ServiceSecurityService.getSecurityConfigById(id);

    if (!securityConfig) {
      return NextResponse.json(
        { error: "Security configuration not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(securityConfig);
  } catch (error) {
    console.error("Error fetching security configuration:", error);
    return NextResponse.json(
      { error: "Failed to fetch security configuration" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Validate config ID
    const idValidation: ValidationResult = validateConfigId(id);
    if (!idValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid config ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate input
    const validation: ValidationResult = validateUpdateServiceSecurityConfig(body);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 }
      );
    }

    const requestData = body as UpdateServiceSecurityConfigRequest;

    // Update security configuration using service
    const securityConfig = await ServiceSecurityService.updateSecurityConfig(id, requestData);

    return NextResponse.json(securityConfig);
  } catch (error) {
    console.error("Error updating security configuration:", error);

    if (error instanceof Error) {
      if (error.message === "Security configuration not found") {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to update security configuration" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Validate config ID
    const idValidation: ValidationResult = validateConfigId(id);
    if (!idValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid config ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    await ServiceSecurityService.deleteSecurityConfig(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting security configuration:", error);

    if (error instanceof Error && error.message === "Security configuration not found") {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete security configuration" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Validate config ID
    const idValidation: ValidationResult = validateConfigId(id);
    if (!idValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid config ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    // Toggle the security configuration
    const securityConfig = await ServiceSecurityService.toggleSecurityConfig(id);

    return NextResponse.json(securityConfig);
  } catch (error) {
    console.error("Error toggling security configuration:", error);

    if (error instanceof Error && error.message === "Security configuration not found") {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to toggle security configuration" },
      { status: 500 }
    );
  }
}