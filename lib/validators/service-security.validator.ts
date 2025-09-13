import type {
  CreateServiceSecurityConfigRequest,
  UpdateServiceSecurityConfigRequest,
  SecurityType,
} from "@/lib/dto/service-security.dto";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateCreateServiceSecurityConfig(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { isValid: false, errors: ["Invalid request body"] };
  }

  const request = data as CreateServiceSecurityConfigRequest;

  // Validate serviceId
  if (!request.serviceId || typeof request.serviceId !== "string") {
    errors.push("Service ID is required and must be a string");
  } else if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(request.serviceId)) {
    errors.push("Service ID must be a valid UUID");
  }

  // Validate securityType
  const validSecurityTypes: SecurityType[] = ['shared_link', 'sso', 'basic_auth'];
  if (!request.securityType || !validSecurityTypes.includes(request.securityType)) {
    errors.push("Security type must be one of: shared_link, sso, basic_auth");
  }

  // Validate priority
  if (request.priority !== undefined && (typeof request.priority !== "number" || request.priority < 0 || request.priority > 100)) {
    errors.push("Priority must be a number between 0 and 100");
  }

  // Validate config based on security type
  if (!request.config || typeof request.config !== "object") {
    errors.push("Config is required and must be an object");
  } else {
    const configErrors = validateSecurityTypeConfig(request.securityType, request.config);
    errors.push(...configErrors);
  }

  return { isValid: errors.length === 0, errors };
}

export function validateUpdateServiceSecurityConfig(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { isValid: false, errors: ["Invalid request body"] };
  }

  const request = data as UpdateServiceSecurityConfigRequest;

  // Validate priority if provided
  if (request.priority !== undefined && (typeof request.priority !== "number" || request.priority < 0 || request.priority > 100)) {
    errors.push("Priority must be a number between 0 and 100");
  }

  // Validate isEnabled if provided
  if (request.isEnabled !== undefined && typeof request.isEnabled !== "boolean") {
    errors.push("isEnabled must be a boolean");
  }

  return { isValid: errors.length === 0, errors };
}

function validateSecurityTypeConfig(securityType: SecurityType, config: Record<string, any>): string[] {
  const errors: string[] = [];

  switch (securityType) {
    case 'shared_link':
      if (config.expiresInHours !== undefined) {
        if (typeof config.expiresInHours !== "number" || config.expiresInHours <= 0 || config.expiresInHours > 8760) {
          errors.push("expiresInHours must be a positive number up to 8760 (1 year)");
        }
      }
      if (config.sessionDurationMinutes !== undefined) {
        if (typeof config.sessionDurationMinutes !== "number" || config.sessionDurationMinutes <= 0 || config.sessionDurationMinutes > 43200) {
          errors.push("sessionDurationMinutes must be a positive number up to 43200 (30 days)");
        }
      }
      break;

    case 'sso':
      if (config.groups !== undefined) {
        if (!Array.isArray(config.groups)) {
          errors.push("groups must be an array");
        } else if (!config.groups.every((group: any) => typeof group === "string")) {
          errors.push("all groups must be strings");
        }
      }
      if (config.users !== undefined) {
        if (!Array.isArray(config.users)) {
          errors.push("users must be an array");
        } else if (!config.users.every((user: any) => typeof user === "string")) {
          errors.push("all users must be strings");
        }
      }
      break;

    case 'basic_auth':
      if (!config.basicAuthConfigId || typeof config.basicAuthConfigId !== "string") {
        errors.push("basicAuthConfigId is required and must be a string");
      } else if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(config.basicAuthConfigId)) {
        errors.push("basicAuthConfigId must be a valid UUID");
      }
      break;

    default:
      errors.push(`Unknown security type: ${securityType}`);
  }

  return errors;
}

export function validateServiceId(id: string): ValidationResult {
  const errors: string[] = [];

  if (!id || typeof id !== "string" || !id.trim()) {
    errors.push("Service ID is required");
  } else if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    errors.push("Service ID must be a valid UUID");
  }

  return { isValid: errors.length === 0, errors };
}

export function validateConfigId(id: string): ValidationResult {
  const errors: string[] = [];

  if (!id || typeof id !== "string" || !id.trim()) {
    errors.push("Config ID is required");
  } else if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    errors.push("Config ID must be a valid UUID");
  }

  return { isValid: errors.length === 0, errors };
}