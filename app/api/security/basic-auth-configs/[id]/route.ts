import { NextRequest, NextResponse } from "next/server";
import { BasicAuthService } from "@/lib/services/basic-auth.service";
import {
  validateUpdateBasicAuthConfig,
  validateId,
  type ValidationResult,
} from "@/lib/validators/basic-auth.validator";
import type { UpdateBasicAuthConfigRequest } from "@/lib/dto/basic-auth.dto";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Validate ID
    const idValidation: ValidationResult = validateId(id);
    if (!idValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    const config = await BasicAuthService.getConfigById(id);

    if (!config) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error("Error fetching basic auth config:", error);
    return NextResponse.json(
      { error: "Failed to fetch basic auth configuration" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Validate ID
    const idValidation: ValidationResult = validateId(id);
    if (!idValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate input
    const validation: ValidationResult = validateUpdateBasicAuthConfig(body);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 }
      );
    }

    const requestData = body as UpdateBasicAuthConfigRequest;

    // Update config using service
    const config = await BasicAuthService.updateConfig(id, {
      name: requestData.name.trim(),
      description: requestData.description?.trim() || null,
    });

    return NextResponse.json(config);
  } catch (error) {
    console.error("Error updating basic auth config:", error);

    if (error instanceof Error) {
      if (error.message === "Configuration not found") {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      } else if (error.message === "Configuration name already exists") {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to update basic auth configuration" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Validate ID
    const idValidation: ValidationResult = validateId(id);
    if (!idValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    await BasicAuthService.deleteConfig(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting basic auth config:", error);

    if (error instanceof Error && error.message === "Configuration not found") {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete basic auth configuration" },
      { status: 500 }
    );
  }
}