import { NextRequest, NextResponse } from "next/server";
import { getManagedSecretMeta, setManagedSecretMeta } from "@/lib/app-config";
import { hashText, isManagedMode, serializeSecretsEnv } from "@/lib/managed-traefik";
import { updateManagedSecrets } from "@/lib/managed-secrets-store";
import {
  applySecretEdits,
  type ManagedSecretEdits,
} from "@/lib/managed-traefik-types";

export const dynamic = "force-dynamic";

function isEditsBody(body: unknown): body is ManagedSecretEdits {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  const b = body as Record<string, unknown>;
  return (
    (b.upsert === undefined || Array.isArray(b.upsert)) &&
    (b.remove === undefined || Array.isArray(b.remove)) &&
    (b.reset === undefined || typeof b.reset === "boolean")
  );
}

/**
 * Apply a batch of DNS-credential edits. Writes are allowed through the web
 * (this is how an admin sets them), but the response only ever returns the
 * resulting NAMES — values are write-only and never echoed back. Values go to
 * the encrypted file; only the names + hash are recorded in the database.
 *
 * Key rotation: when the file can't be decrypted with the current
 * MANAGED_SECRETS_KEY the stored values are gone for good. The edit is then
 * applied to an EMPTY map only if the client opts in — `reset: true`, or a
 * `remove` list covering every known name — otherwise 409 with
 * `{ undecryptable: true }` so the UI can offer the reset.
 */
export async function PUT(request: NextRequest) {
  if (!isManagedMode()) {
    return NextResponse.json(
      { error: "Managed mode is not enabled (set TRAEFIK_MANAGED=true)" },
      { status: 409 }
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    // Never log the error object: a malformed body may carry credential text.
    console.warn(
      "Rejected managed secrets update: unparseable JSON body",
      error instanceof Error ? error.name : "unknown"
    );
    return NextResponse.json({ errors: ["Request body must be JSON."] }, { status: 400 });
  }
  if (!isEditsBody(body)) {
    return NextResponse.json(
      { errors: ["Request body must be { upsert: [], remove: [], reset?: boolean }."] },
      { status: 400 }
    );
  }
  const edits = body;

  try {
    // Outcome flags live on an object: TS doesn't track `let` assignments
    // made inside the mutate callback.
    const outcome: { errors?: string[]; refused?: boolean } = {};
    const next = await updateManagedSecrets(async (current) => {
      let base = current;
      if (base === null) {
        const known = (await getManagedSecretMeta()).names;
        const removesEverything =
          known.length > 0 &&
          known.every((n) => (edits.remove ?? []).includes(n));
        if (!(edits.reset === true || removesEverything)) {
          outcome.refused = true;
          return null;
        }
        console.warn(
          "Managed credential file is undecryptable — resetting it on admin request"
        );
        base = {};
      }
      const result = applySecretEdits(base, edits);
      if (!result.ok) {
        outcome.errors = result.errors;
        return null;
      }
      return result.value;
    });

    if (outcome.refused) {
      return NextResponse.json(
        {
          error:
            "Stored credentials cannot be decrypted with the current MANAGED_SECRETS_KEY. Reset them (all stored values will be discarded) and re-enter.",
          undecryptable: true,
        },
        { status: 409 }
      );
    }
    if (outcome.errors) {
      return NextResponse.json({ errors: outcome.errors }, { status: 400 });
    }
    const values = next ?? {};
    const names = Object.keys(values).sort();
    await setManagedSecretMeta({
      names,
      hash: hashText(serializeSecretsEnv(values)),
    });
    return NextResponse.json({ secretNames: names });
  } catch (error) {
    console.error(
      "Error updating managed secrets:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json(
      { error: "Failed to update credentials" },
      { status: 500 }
    );
  }
}
