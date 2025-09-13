import { NextRequest, NextResponse } from "next/server";
import { ServiceSecurityService } from "@/lib/services/service-security.service";
import {
  validateCreateServiceSecurityConfig,
  validateServiceId,
  type ValidationResult,
} from "@/lib/validators/service-security.validator";
import type { CreateServiceSecurityConfigRequest } from "@/lib/dto/service-security.dto";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Validate service ID
    const idValidation: ValidationResult = validateServiceId(id);
    if (!idValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid service ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    const securityConfigs = await ServiceSecurityService.getServiceSecurityConfigsWithIds(id);
    return NextResponse.json(securityConfigs);
  } catch (error) {
    console.error("Error fetching service security configurations:", error);
    return NextResponse.json(
      { error: "Failed to fetch security configurations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Validate service ID
    const idValidation: ValidationResult = validateServiceId(id);
    if (!idValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid service ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Add serviceId to the request body
    const requestData = { ...body, serviceId: id };

    // Validate input
    const validation: ValidationResult = validateCreateServiceSecurityConfig(requestData);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 }
      );
    }

    const securityConfigRequest = requestData as CreateServiceSecurityConfigRequest;

    // Create security configuration using service
    const securityConfig = await ServiceSecurityService.createSecurityConfig(securityConfigRequest);

    return NextResponse.json(securityConfig);
  } catch (error) {
    console.error("Error creating service security configuration:", error);

    if (error instanceof Error) {
      if (error.message === "Service not found") {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to create security configuration" },
      { status: 500 }
    );
  }
}