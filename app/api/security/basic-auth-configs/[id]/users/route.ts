import { NextRequest, NextResponse } from "next/server";
import { BasicAuthService } from "@/lib/services/basic-auth.service";
import {
  validateCreateBasicAuthUser,
  validateId,
  type ValidationResult,
} from "@/lib/validators/basic-auth.validator";
import type { CreateBasicAuthUserRequest } from "@/lib/dto/basic-auth.dto";

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
        { error: "Invalid config ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    // Check if config exists
    const configExists = await BasicAuthService.configExists(id);
    if (!configExists) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 }
      );
    }

    const users = await BasicAuthService.getUsersByConfigId(id);
    return NextResponse.json(users);
  } catch (error) {
    console.error("Error fetching basic auth users:", error);
    return NextResponse.json(
      { error: "Failed to fetch basic auth users" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Validate ID
    const idValidation: ValidationResult = validateId(id);
    if (!idValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid config ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate input
    const validation: ValidationResult = validateCreateBasicAuthUser(body);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 }
      );
    }

    const requestData = body as CreateBasicAuthUserRequest;

    // Hash password
    const passwordHash = await BasicAuthService.hashPassword(requestData.password);

    // Create user using service
    const user = await BasicAuthService.createUser({
      configId: id,
      username: requestData.username.trim(),
      passwordHash,
    });

    // Return user without password hash
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...userResponse } = user;
    return NextResponse.json(userResponse);
  } catch (error) {
    console.error("Error creating basic auth user:", error);

    if (error instanceof Error) {
      if (error.message === "Configuration not found") {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      } else if (error.message === "Username already exists in this configuration") {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to create basic auth user" },
      { status: 500 }
    );
  }
}