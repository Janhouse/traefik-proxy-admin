import { NextRequest, NextResponse } from "next/server";
import { getSSOConfig, generateSSOAuthUrl } from "@/lib/sso-config";
import { randomBytes } from "crypto";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const serviceId = searchParams.get("serviceId");
    
    if (!serviceId) {
      return NextResponse.json({ error: "Service ID required" }, { status: 400 });
    }

    const ssoConfig = await getSSOConfig();
    
    if (!ssoConfig.enabled) {
      return NextResponse.json({ error: "SSO not configured" }, { status: 400 });
    }

    // Generate state parameter to prevent CSRF
    const state = randomBytes(32).toString("hex");
    const stateData = {
      serviceId,
      timestamp: Date.now(),
    };

    // Store state temporarily (in production, use Redis or similar)
    const response = NextResponse.redirect(generateSSOAuthUrl(ssoConfig, state));
    response.cookies.set("sso_state", JSON.stringify(stateData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    });
    response.cookies.set("sso_state_token", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
    });

    return response;
  } catch (error) {
    console.error("SSO login error:", error);
    return NextResponse.json({ error: "SSO login failed" }, { status: 500 });
  }
}