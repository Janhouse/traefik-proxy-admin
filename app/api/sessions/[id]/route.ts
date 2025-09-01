import { NextRequest, NextResponse } from "next/server";
import { db, sessions } from "@/lib/db";
import { sessionManager } from "@/lib/session-manager";
import { eq } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the session to find the token
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id));

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Delete from memory cache and database
    await sessionManager.deleteSession(session.sessionToken);

    return NextResponse.json({ message: "Session deleted successfully" });
  } catch (error) {
    console.error("Error deleting session:", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}