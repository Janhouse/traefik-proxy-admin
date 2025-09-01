import { NextRequest, NextResponse } from "next/server";
import { getSSOConfig, exchangeCodeForToken, getUserInfo } from "@/lib/sso-config";
import { sessionManager } from "@/lib/session-manager";
import { db, services } from "@/lib/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
    }

    // Verify state parameter
    const storedStateData = request.cookies.get("sso_state")?.value;
    const storedStateToken = request.cookies.get("sso_state_token")?.value;

    if (!storedStateData || !storedStateToken || storedStateToken !== state) {
      return NextResponse.json({ error: "Invalid state parameter" }, { status: 400 });
    }

    const stateData = JSON.parse(storedStateData);
    const { serviceId } = stateData;

    // Check if state is expired (10 minutes)
    if (Date.now() - stateData.timestamp > 600000) {
      return NextResponse.json({ error: "State expired" }, { status: 400 });
    }

    const ssoConfig = await getSSOConfig();
    
    // Exchange code for tokens
    const tokens = await exchangeCodeForToken(ssoConfig, code);
    
    // Get user information
    const userInfo = await getUserInfo(ssoConfig, tokens.access_token);

    // Get service configuration
    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.id, serviceId));

    if (!service || !service.enabled) {
      return NextResponse.json({ error: "Service not found or disabled" }, { status: 404 });
    }

    // Check authorization
    const authorized = checkUserAuthorization(service, userInfo);
    
    if (!authorized) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Create session
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    await sessionManager.createSession(
      serviceId,
      sessionToken,
      expiresAt,
      undefined,
      userInfo.sub
    );

    // Set session cookie and redirect
    const response = NextResponse.redirect(`${request.nextUrl.origin}/auth/success`);
    
    response.cookies.set("traefik-session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
    });

    // Clear SSO state cookies
    response.cookies.delete("sso_state");
    response.cookies.delete("sso_state_token");

    return response;
  } catch (error) {
    console.error("SSO callback error:", error);
    return NextResponse.json({ error: "SSO authentication failed" }, { status: 500 });
  }
}

function checkUserAuthorization(
  service: { ssoGroups?: string | null; ssoUsers?: string | null },
  userInfo: { sub: string; name: string; groups?: string[] }
): boolean {
  // If no specific authorization is configured, allow access
  if (!service.ssoGroups && !service.ssoUsers) {
    return true;
  }

  // Check user authorization
  if (service.ssoUsers) {
    try {
      const allowedUsers = JSON.parse(service.ssoUsers);
      if (allowedUsers.includes(userInfo.sub) || allowedUsers.includes(userInfo.name)) {
        return true;
      }
    } catch (e) {
      console.error("Error parsing SSO users:", e);
    }
  }

  // Check group authorization
  if (service.ssoGroups && userInfo.groups) {
    try {
      const allowedGroups = JSON.parse(service.ssoGroups);
      for (const group of userInfo.groups) {
        if (allowedGroups.includes(group)) {
          return true;
        }
      }
    } catch (e) {
      console.error("Error parsing SSO groups:", e);
    }
  }

  return false;
}