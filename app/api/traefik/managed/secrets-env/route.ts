import { NextRequest, NextResponse } from "next/server";
import { getGlobalConfig, recordManagedSecretsFetch } from "@/lib/app-config";
import {
  hashText,
  isAuthorizedWrapperRequest,
  isManagedMode,
  isPublicDomainRequest,
  serializeSecretsEnv,
  wrapperToken,
} from "@/lib/managed-traefik";
import { readManagedSecrets } from "@/lib/managed-secrets-store";

export const dynamic = "force-dynamic";

/**
 * Serves DNS-provider credentials as a shell-sourceable env file — for the
 * in-network Traefik wrapper ONLY. This is the one place raw secret values
 * leave the panel, so it is locked down three ways:
 *   1. managed mode only (404 otherwise);
 *   2. the caller must present `Authorization: Bearer <MANAGED_WRAPPER_TOKEN>`
 *      (the shared secret compose hands to both the panel and the wrapper) —
 *      401 otherwise, including when the token isn't configured at all;
 *   3. defense in depth: any request that arrived via the public admin domain
 *      is refused (403) even with a valid token. Traefik's admin router
 *      forces Host(adminPanelDomain) — trailing-dot forms included, see
 *      hostOnly — while the wrapper reaches the panel by its internal name.
 */
export async function GET(request: NextRequest) {
  if (!isManagedMode()) {
    return NextResponse.json(
      { error: "Managed mode is not enabled" },
      { status: 404 }
    );
  }
  if (!wrapperToken()) {
    console.error(
      "MANAGED_WRAPPER_TOKEN is not set — refusing to serve credentials to the wrapper"
    );
  }
  if (!isAuthorizedWrapperRequest(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
