import { NextRequest, NextResponse } from "next/server";
import { consumeSharedLink } from "@/lib/shared-links";
import { sessionManager } from "@/lib/session-manager";
import { randomBytes } from "crypto";
import { TRAEFIK_SESSION_COOKIE, COOKIE_DEFAULTS } from "@/lib/constants";

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

    console.log("🔧 [DEBUG] Shared link consumed:", {
      serviceId: sharedLink.serviceId,
      sessionDurationMinutes: sharedLink.sessionDurationMinutes,
      sharedLinkId: sharedLink.id
    });

    // Create a new session with optimal cookie expiry
    const sessionToken = randomBytes(32).toString("hex");
    console.log("🔧 [DEBUG] Generated session token (first 8 chars):", sessionToken.substring(0, 8) + "...");
    
    const { session, cookieExpiresAt } = await sessionManager.createSessionWithOptimalCookieExpiry(
      sharedLink.serviceId,
      sessionToken,
      sharedLink.sessionDurationMinutes,
      sharedLink.id
    );

    console.log("🔧 [DEBUG] Cookie being set with expiration:", cookieExpiresAt.toISOString());
    console.log("🔧 [DEBUG] Current time:", new Date().toISOString());
    console.log("🔧 [DEBUG] Cookie duration from now (hours):", (cookieExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60));

    // Set session cookie
    const response = NextResponse.json({ 
      success: true,
      message: "Access granted",
      expiresAt: session.expiresAt,
      cookieExpiresAt
    });
    
    response.cookies.set(TRAEFIK_SESSION_COOKIE, sessionToken, {
      ...COOKIE_DEFAULTS,
      expires: cookieExpiresAt,
    });

    console.log("🔧 [DEBUG] Cookie set successfully with expires:", cookieExpiresAt.toISOString());

    return response;
    
  } catch (error) {
    console.error("Shared link auth error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}