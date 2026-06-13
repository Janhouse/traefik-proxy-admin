import { NextRequest, NextResponse } from "next/server";
import { getGlobalConfig, recordManagedSecretsFetch } from "@/lib/app-config";
import {
  hashText,
  isManagedMode,
  isPublicDomainRequest,
  serializeSecretsEnv,
} from "@/lib/managed-traefik";
import { readManagedSecrets } from "@/lib/managed-secrets-store";

export const dynamic = "force-dynamic";

/**
 * Serves DNS-provider credentials as a shell-sourceable env file — for the
 * in-network Traefik wrapper ONLY. This is the one place raw secret values
 * leave the database, so it is locked down two ways:
 *   1. managed mode only (404 otherwise);
 *   2. it REFUSES any request that arrived via the public admin domain.
 * The panel is only exposed to the web through Traefik's admin route, which
 * forces Host(adminPanelDomain); the in-network wrapper reaches the panel by
 * its internal service name. So a request whose Host is the public domain
 * came through the web and is refused — credentials are write-only there.
 */
export async function GET(request: NextRequest) {
  if (!isManagedMode()) {
    return NextResponse.json(
      { error: "Managed mode is not enabled" },
      { status: 404 }
    );
  }
  const { adminPanelDomain } = await getGlobalConfig();
  if (isPublicDomainRequest(request.headers, adminPanelDomain)) {
    return NextResponse.json(
      { error: "Credentials are not available through the public domain" },
      { status: 403 }
    );
  }

  const body = serializeSecretsEnv(await readManagedSecrets());
  await recordManagedSecretsFetch(hashText(body));
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
