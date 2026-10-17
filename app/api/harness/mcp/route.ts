import { NextResponse } from "next/server";
import { handleMcpRequest } from "@/lib/harness/mcp";
import { authenticateRequest, errorResponse, unauthorized } from "@/lib/harness/http";

export const dynamic = "force-dynamic";

/**
 * MCP (Streamable HTTP, stateless, JSON responses) for the harness.
 * Same bearer tokens and the same owner filter as /api/harness/v1.
 */
export async function POST(request: Request): Promise<Response> {
  // DNS-rebinding guard: a browser-originated request must be same-origin.
  const origin = request.headers.get("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === request.headers.get("host");
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
    }
  }
  try {
    const principal = await authenticateRequest(request);
    if (!principal) return unauthorized();
    return await handleMcpRequest(principal, request);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Stateless server: no standalone SSE stream and no sessions to delete. */
function methodNotAllowed(): Response {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
