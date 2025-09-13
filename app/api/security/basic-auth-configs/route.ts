import { NextRequest, NextResponse } from "next/server";
import { BasicAuthService } from "@/lib/services/basic-auth.service";
import {
  validateCreateBasicAuthConfig,
  type ValidationResult,
} from "@/lib/validators/basic-auth.validator";
import type { CreateBasicAuthConfigRequest } from "@/lib/dto/basic-auth.dto";

export async function GET() {
  try {
    const configs = await BasicAuthService.getAllConfigs();
    return NextResponse.json(configs);
  } catch (error) {
    console.error("Error fetching basic auth configs:", error);
    return NextResponse.json(
      { error: "Failed to fetch basic auth configurations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation: ValidationResult = validateCreateBasicAuthConfig(body);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 }
      );
    }

    const requestData = body as CreateBasicAuthConfigRequest;

    // Create config using service
    const config = await BasicAuthService.createConfig({
      name: requestData.name.trim(),
      description: requestData.description?.trim() || null,
    });

    return NextResponse.json(config);
  } catch (error) {
    console.error("Error creating basic auth config:", error);

    if (error instanceof Error) {
      if (error.message === "Configuration name already exists") {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to create basic auth configuration" },
      { status: 500 }
    );
  }
}