import { NextResponse } from "next/server";
import { asc, eq, isNotNull } from "drizzle-orm";
import { apiTokens, db, services } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Every API-created entry, for the admin overview (admins see all owners). */
export async function GET() {
  try {
    const rows = await db
      .select({ service: services, tokenName: apiTokens.name })
      .from(services)
      .leftJoin(apiTokens, eq(services.createdByTokenId, apiTokens.id))
      .where(isNotNull(services.ownerTag))
      .orderBy(asc(services.createdAt));
    return NextResponse.json(
      rows.map(({ service, tokenName }) => ({
        id: service.id,
        hostname: service.shareHostname,
        ownerTag: service.ownerTag,
        tokenName,
        authMode: service.shareAuthMode,
        labels: service.ownerLabels ?? {},
        target: `${service.isHttps ? "https" : "http"}://${service.targetIp}:${service.targetPort}`,
        enabled: service.enabled,
        expiresAt: service.expiresAt?.toISOString() ?? null,
        createdAt: service.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error("Error listing harness shares:", error);
    return NextResponse.json({ error: "Failed to list shares" }, { status: 500 });
  }
}
