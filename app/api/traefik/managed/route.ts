import { NextRequest, NextResponse } from "next/server";
import {
  getGlobalConfig,
  getManagedSecretMeta,
  getManagedStaticConfig,
  getManagedStaticState,
  updateManagedStaticConfig,
} from "@/lib/app-config";
import {
  buildStaticConfigObject,
  hashStaticConfig,
  isManagedMode,
  panelInternalUrl,
  parseAdminPanelAuthUsers,
  stringifyStaticConfig,
} from "@/lib/managed-traefik";
import { probeManagedSecrets, secretsEnvStatus } from "@/lib/managed-secrets-store";
import {
  validateManagedStaticConfig,
  type ManagedModeResponse,
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
  const [globalConfig, config, state, secretMeta, secretsProbe, secretsEnv] = await Promise.all([
    getGlobalConfig(),
    getManagedStaticConfig(),
    getManagedStaticState(),
    getManagedSecretMeta(),
    // Cheap: decrypts the small credential file so the UI can offer a reset
    // after a MANAGED_SECRETS_KEY rotation. Values never leave the server.
    probeManagedSecrets().catch((error: unknown) => {
      console.error(
        "Error probing managed credential file:",
        error instanceof Error ? error.message : "unknown error"
      );
      return { undecryptable: false };
    }),
    secretsEnvStatus(),
  ]);
  const currentHash = hashStaticConfig(
    stringifyStaticConfig(
      buildStaticConfigObject(config, {
        providerEndpoint: panelInternalUrl(globalConfig.adminPanelDomain),
      })
    )
  );
  // Secrets aren't in traefik.yml (they're env vars), but changing them still
  // needs a Traefik restart. The panel materialises them into the shared
  // tmpfs env file; the wrapper polls that file and restarts Traefik within
  // its poll interval, so "pending" for secrets means the env file on the
  // mount does not yet match what the store holds (or is missing).
  const secretsStale = secretsEnv.hash !== secretMeta.hash;
  const pending = state.lastFetchedHash !== currentHash || secretsStale;
  return {
    managed: true,
    adminAuthConfigured,
    config,
    secretNames: secretMeta.names,
    secretsUndecryptable: secretsProbe.undecryptable,
    secretsEnv: {
      materialized: secretsEnv.materialized,
      writtenAt: secretsEnv.writtenAt,
      stale: secretsStale,
    },
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
    const body: unknown = await request.json();
    // `result.value` is the canonical copy (known fields only) — persist it,
    // never the raw body.
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
