import { NextRequest, NextResponse } from "next/server";
import { revokeApiToken } from "@/lib/harness/tokens";

export const dynamic = "force-dynamic";

/** Revoke a token (kept for audit; its shares stay with the owner tag). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!(await revokeApiToken(id))) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    return NextResponse.json({ revoked: true });
  } catch (error) {
    console.error("Error revoking API token:", error);
    return NextResponse.json({ error: "Failed to revoke token" }, { status: 500 });
  }
}
