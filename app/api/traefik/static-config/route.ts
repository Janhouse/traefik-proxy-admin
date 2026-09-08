import { NextResponse } from "next/server";
import {
  getGlobalConfig,
  getManagedStaticConfig,
  recordManagedStaticFetch,
} from "@/lib/app-config";
import {
  buildStaticConfigObject,
  hashStaticConfig,
  isManagedMode,
  panelInternalUrl,
  stringifyStaticConfig,
} from "@/lib/managed-traefik";

export const dynamic = "force-dynamic";

/** A Traefik-config hash is a sha256 hex digest. */
const HASH_RE = /^[0-9a-f]{64}$/;
const asHash = (v: string | null): string | null => (v && HASH_RE.test(v) ? v : null);

/**
 * Serves Traefik's STATIC configuration (traefik.yml) to the managed-bundle
 * wrapper script. The wrapper reports, as query params, the hash it has PROVEN
 * (`applied`, run past its grace period) and any config it is currently
 * refusing to run (`rejected`); only those are recorded — a plain fetch never
 * marks a config "applied", so the status can't claim a rejected config is
 * live. 404s outside managed mode — externally-managed Traefik owns its own
 * static config and must not be tempted by this endpoint.
 */
export async function GET(request: Request) {
  if (!isManagedMode()) {
    return NextResponse.json(
      { error: "Managed mode is not enabled (set TRAEFIK_MANAGED=true)" },
      { status: 404 }
    );
  }
  try {
    const [globalConfig, managed] = await Promise.all([
      getGlobalConfig(),
      getManagedStaticConfig(),
    ]);
    const yamlText = stringifyStaticConfig(
      buildStaticConfigObject(managed, {
        providerEndpoint: panelInternalUrl(globalConfig.adminPanelDomain),
      })
    );
    const hash = hashStaticConfig(yamlText);
    const params = new URL(request.url).searchParams;
    await recordManagedStaticFetch({
      appliedHash: asHash(params.get("applied")),
      rejectedHash: asHash(params.get("rejected")),
    });
    return new NextResponse(yamlText, {
      headers: {
        "Content-Type": "text/yaml; charset=utf-8",
        "X-Config-Hash": hash,
      },
    });
  } catch (error) {
    console.error("Error building managed static config:", error);
    return NextResponse.json(
      { error: "Failed to build static configuration" },
      { status: 500 }
    );
  }
}
