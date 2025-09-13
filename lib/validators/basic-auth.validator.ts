import type {
  CreateBasicAuthConfigRequest,
  UpdateBasicAuthConfigRequest,
  CreateBasicAuthUserRequest,
  UpdateBasicAuthUserRequest,
} from "@/lib/dto/basic-auth.dto";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateCreateBasicAuthConfig(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { isValid: false, errors: ["Invalid request body"] };
  }

  const request = data as CreateBasicAuthConfigRequest;

  if (!request.name || typeof request.name !== "string" || !request.name.trim()) {
    errors.push("Name is required and must be a non-empty string");
  } else if (request.name.trim().length > 255) {
    errors.push("Name must be 255 characters or less");
  }

  if (request.description !== undefined) {
    if (typeof request.description !== "string") {
      errors.push("Description must be a string");
    } else if (request.description.length > 1000) {
      errors.push("Description must be 1000 characters or less");
    }
  }

  return { isValid: errors.length === 0, errors };
}

export function validateUpdateBasicAuthConfig(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { isValid: false, errors: ["Invalid request body"] };
  }

  const request = data as UpdateBasicAuthConfigRequest;

  if (!request.name || typeof request.name !== "string" || !request.name.trim()) {
    errors.push("Name is required and must be a non-empty string");
  } else if (request.name.trim().length > 255) {
    errors.push("Name must be 255 characters or less");
  }

  if (request.description !== undefined) {
    if (typeof request.description !== "string") {
      errors.push("Description must be a string");
    } else if (request.description.length > 1000) {
      errors.push("Description must be 1000 characters or less");
    }
  }

  return { isValid: errors.length === 0, errors };
}

export function validateCreateBasicAuthUser(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { isValid: false, errors: ["Invalid request body"] };
  }

  const request = data as CreateBasicAuthUserRequest;

  if (!request.username || typeof request.username !== "string" || !request.username.trim()) {
    errors.push("Username is required and must be a non-empty string");
  } else if (request.username.trim().length > 255) {
    errors.push("Username must be 255 characters or less");
  } else if (!/^[a-zA-Z0-9_-]+$/.test(request.username.trim())) {
    errors.push("Username can only contain alphanumeric characters, hyphens, and underscores");
  }

  if (!request.password || typeof request.password !== "string" || request.password.length < 4) {
    errors.push("Password is required and must be at least 4 characters long");
  } else if (request.password.length > 255) {
    errors.push("Password must be 255 characters or less");
  }

  return { isValid: errors.length === 0, errors };
}

export function validateUpdateBasicAuthUser(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { isValid: false, errors: ["Invalid request body"] };
  }

  const request = data as UpdateBasicAuthUserRequest;

  if (!request.username || typeof request.username !== "string" || !request.username.trim()) {
    errors.push("Username is required and must be a non-empty string");
  } else if (request.username.trim().length > 255) {
    errors.push("Username must be 255 characters or less");
  } else if (!/^[a-zA-Z0-9_-]+$/.test(request.username.trim())) {
    errors.push("Username can only contain alphanumeric characters, hyphens, and underscores");
  }

  if (request.password !== undefined) {
    if (typeof request.password !== "string" || request.password.length < 4) {
      errors.push("Password must be at least 4 characters long");
    } else if (request.password.length > 255) {
      errors.push("Password must be 255 characters or less");
    }
  }

  return { isValid: errors.length === 0, errors };
}

export function validateId(id: string): ValidationResult {
  const errors: string[] = [];

  if (!id || typeof id !== "string" || !id.trim()) {
    errors.push("ID is required");
  } else if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    errors.push("ID must be a valid UUID");
  }

  return { isValid: errors.length === 0, errors };
}