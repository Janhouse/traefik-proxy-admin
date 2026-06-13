import { NextRequest, NextResponse } from "next/server";
import { setManagedSecretMeta } from "@/lib/app-config";
import { hashText, isManagedMode, serializeSecretsEnv } from "@/lib/managed-traefik";
import { readManagedSecrets, writeManagedSecrets } from "@/lib/managed-secrets-store";
import {
  applySecretEdits,
  type ManagedSecretEdits,
} from "@/lib/managed-traefik-types";

export const dynamic = "force-dynamic";

/**
 * Apply a batch of DNS-credential edits. Writes are allowed through the web
 * (this is how an admin sets them), but the response only ever returns the
 * resulting NAMES — values are write-only and never echoed back. Values go to
 * the encrypted file; only the names + hash are recorded in the database.
 */
export async function PUT(request: NextRequest) {
  if (!isManagedMode()) {
    return NextResponse.json(
      { error: "Managed mode is not enabled (set TRAEFIK_MANAGED=true)" },
      { status: 409 }
    );
  }
  try {
    const edits = (await request.json()) as ManagedSecretEdits;
    const result = applySecretEdits(await readManagedSecrets(), edits);
    if (!result.ok) {
      return NextResponse.json({ errors: result.errors }, { status: 400 });
    }
    await writeManagedSecrets(result.value);
    const names = Object.keys(result.value).sort();
    await setManagedSecretMeta({
      names,
      hash: hashText(serializeSecretsEnv(result.value)),
    });
    return NextResponse.json({ secretNames: names });
  } catch (error) {
    console.error("Error updating managed secrets:", error);
    return NextResponse.json(
      { error: "Failed to update credentials" },
      { status: 500 }
    );
  }
}
