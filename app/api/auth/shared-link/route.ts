import { NextRequest, NextResponse } from "next/server";
import { consumeSharedLink } from "@/lib/shared-links";
import { sessionManager } from "@/lib/session-manager";
import { randomBytes } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    
    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Use the shared link
    const sharedLink = await consumeSharedLink(token);
    
    if (!sharedLink) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }

    // Create a new session
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + sharedLink.sessionDurationMinutes * 60 * 1000);
    
    await sessionManager.createSession(
      sharedLink.serviceId,
      sessionToken,
      expiresAt,
      sharedLink.id
    );

    // Set session cookie
    const response = NextResponse.json({ 
      success: true,
      message: "Access granted",
      expiresAt
    });
    
    response.cookies.set("traefik-session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
    });

    return response;
    
  } catch (error) {
    console.error("Shared link auth error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}