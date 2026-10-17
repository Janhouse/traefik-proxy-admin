import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { createApiToken, listApiTokens } from "@/lib/harness/tokens";

export const dynamic = "force-dynamic";

/*
 * Admin-only token management. Deliberately NOT under /api/harness so an
 * ingress that exposes the harness prefix without the admin auth can never
 * reach it.
 */

export async function GET() {
  try {
    return NextResponse.json(await listApiTokens());
  } catch (error) {
    console.error("Error listing API tokens:", error);
    return NextResponse.json({ error: "Failed to list tokens" }, { status: 500 });
  }
}

/** Create a token; the plaintext is in this response and never again. */
export async function POST(request: NextRequest) {
  try {
    const created = await createApiToken(await request.json());
    return NextResponse.json(created, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error:
            error instanceof ZodError
              ? error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")
              : "Invalid JSON",
        },
        { status: 400 }
      );
    }
    console.error("Error creating API token:", error);
    return NextResponse.json({ error: "Failed to create token" }, { status: 500 });
  }
}
