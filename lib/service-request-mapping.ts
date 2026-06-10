import type {
  CreateServiceRequest,
  UpdateServiceRequest,
} from "@/lib/dto/service.dto";

/**
 * Map the shared service request-body fields to their DB-row representation.
 * Used by both POST and PUT /api/services so the rules stay identical:
 *
 * - When the editor sends an `entrypoints` array it owns the truth: the legacy
 *   single `entrypoint` column is cleared so a deselected entrypoint can't
 *   resurrect via the generation-time fallback.
 * - Empty `entrypoints` / `matchRules` arrays store null, never "[]".
 */
export function mapServiceRequestBody(
  body: CreateServiceRequest | UpdateServiceRequest
) {
  return {
    name: body.name,
    subdomain: body.subdomain || null,
    hostnameMode: body.hostnameMode,
    customHostnames: body.customHostnames
      ? JSON.stringify(body.customHostnames)
      : null,
    targetIp: body.targetIp,
    targetPort: body.targetPort,
    entrypoint: body.entrypoints !== undefined ? null : body.entrypoint || null,
    entrypoints:
      body.entrypoints && body.entrypoints.length > 0
        ? JSON.stringify(body.entrypoints)
        : null,
    matchRules:
      body.matchRules && body.matchRules.length > 0
        ? JSON.stringify(body.matchRules)
        : null,
    isHttps: body.isHttps ?? false,
    insecureSkipVerify: body.insecureSkipVerify ?? false,
    enabled: body.enabled ?? true,
    enableDurationMinutes: body.enableDurationMinutes ?? null,
    middlewares: body.middlewares ? JSON.stringify(body.middlewares) : null,
    requestHeaders: body.requestHeaders
      ? typeof body.requestHeaders === "string"
        ? body.requestHeaders
        : JSON.stringify(body.requestHeaders)
      : null,
  };
}
