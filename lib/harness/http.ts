import "server-only";
import { NextResponse } from "next/server";
import { HarnessError } from "./shares";
import { authenticateToken, bearerFromHeader, type TokenPrincipal } from "./tokens";

/** Request bodies larger than this are refused before parsing. */
const MAX_BODY_BYTES = 64 * 1024;

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "unauthorized", message: "A valid bearer token is required" },
    {
      status: 401,
      headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="harness"' },
    }
  );
}

/** Bearer-token authentication shared by the REST API and the MCP endpoint. */
export async function authenticateRequest(request: Request): Promise<TokenPrincipal | null> {
  return authenticateToken(bearerFromHeader(request.headers.get("authorization")));
}

/** Map an error to the API's JSON error shape; unknown errors become 500. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HarnessError) {
    return json(
      { error: error.code, message: error.message, ...(error.issues && { issues: error.issues }) },
      error.status
    );
  }
  console.error("Harness API error:", error);
  return json({ error: "internal_error", message: "Internal error" }, 500);
}

/** Parse a bounded JSON body; malformed or oversized bodies are a 400. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new HarnessError("invalid_request", "Request body too large");
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HarnessError("invalid_request", "Request body is not valid JSON");
  }
}

/**
 * Wrap a route handler: authenticate first (401 on failure), then run the
 * handler with the principal and map thrown errors.
 */
export function withPrincipal<Ctx>(
  handler: (principal: TokenPrincipal, request: Request, ctx: Ctx) => Promise<Response>
) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    try {
      const principal = await authenticateRequest(request);
      if (!principal) return unauthorized();
      return await handler(principal, request, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
