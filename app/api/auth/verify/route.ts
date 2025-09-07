import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sessionManager } from "@/lib/session-manager";
import { db, services, sharedLinks } from "@/lib/db";
import { eq, and, gt } from "drizzle-orm";
import { TRAEFIK_SESSION_COOKIE, COOKIE_DEFAULTS } from "@/lib/constants";

export async function GET(request: NextRequest) {
  // const headersList = await headers();

  // headersList.forEach((v, k) => {
  //   console.log(`${k}: ${v}`);
  // });

  const searchParams = request.nextUrl.searchParams;
  const serviceId = searchParams.get("serviceId");

  // Get the original request URI from Traefik headers
  const originalUri = request.headers.get("X-Forwarded-Uri") || "";
  const originalUrl = new URL(originalUri, "https://example.com"); // Base URL doesn't matter, we just need query params
  const traefikToken = originalUrl.searchParams.get("traefik-token");

  if (!serviceId) {
    return NextResponse.json({ error: "Service ID required" }, { status: 400 });
  }

  try {
    // Get the service configuration
    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.id, serviceId));

    if (!service || !service.enabled) {
      return NextResponse.json(
        { error: "Service not found or disabled" },
        { status: 404 }
      );
    }

    // If no auth required, allow access
    if (service.authMethod === "none") {
      return NextResponse.json({ status: "authorized" });
    }

    // Check for traefik-token in URL (shared link access)
    if (traefikToken && service.authMethod === "shared_link") {
      const [sharedLink] = await db
        .select()
        .from(sharedLinks)
        .where(
          and(
            eq(sharedLinks.token, traefikToken),
            eq(sharedLinks.serviceId, serviceId),
            gt(sharedLinks.expiresAt, new Date())
          )
        );

      if (sharedLink) {
        const cookieStore = await cookies();

        // Check if there's already a valid session cookie
        const existingSessionToken = cookieStore.get(TRAEFIK_SESSION_COOKIE)?.value;

        if (existingSessionToken) {
          const existingSession = await sessionManager.getSession(
            existingSessionToken
          );

          if (existingSession && existingSession.serviceId === serviceId) {
            // Valid session exists, extend it to match service auto-disable time
            // Calculate the proper session expiration based on service (already have service from above)
            let newExpiresAt: Date;
            let cookieExpiresAt: Date;
            
            if (service.enableDurationMinutes === null || service.enableDurationMinutes === undefined) {
              // Infinite auto duration - session expires in 90 days
              newExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
              cookieExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
              console.log("🔧 [DEBUG] verify route extend - infinite auto duration, session and cookie expire in 90 days:", newExpiresAt.toISOString());
            } else {
              // Finite auto duration - session expires when service auto-disables
              const serviceAutoDisableAt = new Date(
                service.enabledAt!.getTime() + service.enableDurationMinutes * 60 * 1000
              );
              newExpiresAt = serviceAutoDisableAt;
              cookieExpiresAt = serviceAutoDisableAt;
              console.log("🔧 [DEBUG] verify route extend - finite auto duration, session and cookie expire when service disables:", newExpiresAt.toISOString());
            }
            
            await sessionManager.extendSession(
              existingSessionToken,
              newExpiresAt
            );

            console.log("🔧 [DEBUG] verify route extended session - cookie expiration:", cookieExpiresAt.toISOString());

            // Set the extended session cookie
            cookieStore.set(TRAEFIK_SESSION_COOKIE, existingSessionToken, {
              ...COOKIE_DEFAULTS,
              expires: cookieExpiresAt,
            });

            // Create clean URL without traefik-token parameter
            const host = request.headers.get("X-Forwarded-Host") || request.headers.get("Host") || "localhost";
            const protocol = request.headers.get("X-Forwarded-Proto") || "https";
            const cleanUrl = new URL(originalUri, `${protocol}://${host}`);
            cleanUrl.searchParams.delete("traefik-token");
            
            return NextResponse.redirect(cleanUrl.toString(), {
              status: 302,
            });
          }
        }

        // No valid session exists, create a new one with optimal duration
        const newSessionToken = crypto.randomUUID().replace(/-/g, "");
        const { session, cookieExpiresAt } = await sessionManager.createSessionWithOptimalCookieExpiry(
          serviceId,
          newSessionToken,
          sharedLink.sessionDurationMinutes, // This will be ignored in favor of service auto-disable time
          sharedLink.id,
          "shared-link-user"
        );

        console.log("🔧 [DEBUG] verify route new session - cookie expiration:", cookieExpiresAt.toISOString());

        // Set the new session cookie
        cookieStore.set(TRAEFIK_SESSION_COOKIE, session.sessionToken, {
          ...COOKIE_DEFAULTS,
          expires: cookieExpiresAt,
        });

        // Create clean URL without traefik-token parameter
        const host = request.headers.get("X-Forwarded-Host") || request.headers.get("Host") || "localhost";
        const protocol = request.headers.get("X-Forwarded-Proto") || "https";
        const cleanUrl = new URL(originalUri, `${protocol}://${host}`);
        cleanUrl.searchParams.delete("traefik-token");
        
        return NextResponse.redirect(cleanUrl.toString(), {
          status: 302,
        });
      }
    }

    // Check for session cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(TRAEFIK_SESSION_COOKIE)?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: "No session found" }, { status: 401 });
    }

    // Validate session
    const session = await sessionManager.getSession(sessionToken);

    if (!session || session.serviceId !== serviceId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // For SSO, check user/group authorization
    if (service.authMethod === "sso" && session.userIdentifier) {
      // This would be extended with actual group/user checking logic
      // For now, we'll assume the session is valid if it exists
    }

    return NextResponse.json({
      status: "authorized",
      user: session.userIdentifier,
    });
  } catch (error) {
    console.error("Auth verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
