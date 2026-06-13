import { NextRequest, NextResponse } from "next/server";
import {
  getGlobalConfig,
  getManagedSecrets,
  getManagedStaticConfig,
  getManagedStaticState,
  updateManagedStaticConfig,
} from "@/lib/app-config";
import {
  buildStaticConfigObject,
  hashStaticConfig,
  hashText,
  isManagedMode,
  panelInternalUrl,
  parseAdminPanelAuthUsers,
  serializeSecretsEnv,
  stringifyStaticConfig,
} from "@/lib/managed-traefik";
import {
  validateManagedStaticConfig,
  type ManagedModeResponse,
  type ManagedStaticConfig,
} from "@/lib/managed-traefik-types";

export const dynamic = "force-dynamic";

async function buildResponse(): Promise<ManagedModeResponse> {
  const adminAuthConfigured =
    parseAdminPanelAuthUsers(process.env.ADMIN_PANEL_AUTH).length > 0;
  if (!isManagedMode()) {
    return {
      managed: false,
      adminAuthConfigured,
      config: null,
      secretNames: [],
      status: null,
    };
  }
  const [globalConfig, config, state, secrets] = await Promise.all([
    getGlobalConfig(),
    getManagedStaticConfig(),
    getManagedStaticState(),
    getManagedSecrets(),
  ]);
  const currentHash = hashStaticConfig(
    stringifyStaticConfig(
      buildStaticConfigObject(config, {
        providerEndpoint: panelInternalUrl(globalConfig.adminPanelDomain),
      })
    )
  );
  // Secrets aren't in traefik.yml (they're env vars), but changing them still
  // needs a Traefik restart — so a secret change must also flip "pending".
  const currentSecretsHash = hashText(serializeSecretsEnv(secrets));
  const pending =
    state.lastFetchedHash !== currentHash ||
    state.lastFetchedSecretsHash !== currentSecretsHash;
  return {
    managed: true,
    adminAuthConfigured,
    config,
    secretNames: Object.keys(secrets).sort(),
    status: {
      currentHash,
      lastFetchedHash: state.lastFetchedHash,
      lastFetchedAt: state.lastFetchedAt,
      pending,
    },
  };
}

export async function GET() {
  try {
    return NextResponse.json(await buildResponse());
  } catch (error) {
    console.error("Error fetching managed mode state:", error);
    return NextResponse.json(
      { error: "Failed to fetch managed configuration" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!isManagedMode()) {
    return NextResponse.json(
      { error: "Managed mode is not enabled (set TRAEFIK_MANAGED=true)" },
      { status: 409 }
    );
  }
  try {
    const body = (await request.json()) as ManagedStaticConfig;
    const result = validateManagedStaticConfig(body);
    if (!result.ok) {
      return NextResponse.json({ errors: result.errors }, { status: 400 });
    }
    await updateManagedStaticConfig(result.value);
    return NextResponse.json(await buildResponse());
  } catch (error) {
    console.error("Error updating managed static config:", error);
    return NextResponse.json(
      { error: "Failed to update managed configuration" },
      { status: 500 }
    );
  }
}
