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

/**
 * Serves Traefik's STATIC configuration (traefik.yml) to the managed-bundle
 * wrapper script. Each fetch is recorded so the UI can show whether Traefik
 * is already running the current config or still waiting for its restart.
 * 404s outside managed mode — externally-managed Traefik owns its own static
 * config and must not be tempted by this endpoint.
 */
export async function GET() {
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
    await recordManagedStaticFetch(hash);
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
