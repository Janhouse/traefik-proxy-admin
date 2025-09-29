import { NextRequest, NextResponse } from "next/server";
import { BasicAuthService } from "@/lib/services/basic-auth.service";
import {
  validateUpdateBasicAuthUser,
  validateId,
  type ValidationResult,
} from "@/lib/validators/basic-auth.validator";
import type { UpdateBasicAuthUserRequest } from "@/lib/dto/basic-auth.dto";

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
        { error: "Invalid user ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    const user = await BasicAuthService.getUserById(id);

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error fetching basic auth user:", error);
    return NextResponse.json(
      { error: "Failed to fetch basic auth user" },
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
        { error: "Invalid user ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate input
    const validation: ValidationResult = validateUpdateBasicAuthUser(body);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 }
      );
    }

    const requestData = body as UpdateBasicAuthUserRequest;

    // Prepare update data
    const updateData = {
      username: requestData.username.trim(),
      passwordHash: undefined as string | undefined,
    };

    // Hash new password if provided
    if (requestData.password) {
      updateData.passwordHash = await BasicAuthService.hashPassword(requestData.password);
    }

    // Update user using service
    const user = await BasicAuthService.updateUser(id, updateData);

    // Return user without password hash
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...userResponse } = user;
    return NextResponse.json(userResponse);
  } catch (error) {
    console.error("Error updating basic auth user:", error);

    if (error instanceof Error) {
      if (error.message === "User not found") {
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
      { error: "Failed to update basic auth user" },
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
        { error: "Invalid user ID", details: idValidation.errors },
        { status: 400 }
      );
    }

    await BasicAuthService.deleteUser(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting basic auth user:", error);

    if (error instanceof Error && error.message === "User not found") {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete basic auth user" },
      { status: 500 }
    );
  }
}